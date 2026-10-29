import {fileURLToPath} from "node:url";
import {expect,it,vi} from "vitest";
import type {IdentityApplication} from "./identity.application.js";
import {CustomerMessageApplication,customerMessageHttp,customerMessageFailure} from "./customer-message.js";
import {CustomerRefused} from "./customer-signin.js";
import {BadRequestException,type ArgumentsHost} from "@nestjs/common";
import {OidcParseExceptionFilter} from "./sso/oidc.controller.js";
import {CustomerAuthGuard} from "./customer-auth.guard.js";
import {CustomerMessageController} from "./customer-message.controller.js";
import type {ExecutionContext} from "@nestjs/common";
const routeIdentity=vi.hoisted(()=>({current:undefined as unknown}));
vi.mock("../../../web/app/lib/identity-server",()=>({identityApplication:()=>routeIdentity.current}));
const tenant="10000000-0000-4000-8000-000000000001",job="20000000-0000-4000-8000-000000000002",customer="30000000-0000-4000-8000-000000000003",commandId="40000000-0000-4000-8000-000000000004",origin="https://fixture.invalid";
const token=`${tenant}.${job}.${customer}.${"a".repeat(43)}`,headers={origin,cookie:`jobguard_customer=${token}`};
const body={version:"customer-portal-message.v1",jobId:job,commandId,text:"I agree, perhaps £500?"};
const receipt={version:"job-source-intake-receipt.v1",jobId:job,sourceKind:"customer_message",environment:"synthetic_demo",realExternalActions:0,
 record:{id:commandId,commandId,text:body.text,actualTesterMembershipId:commandId,fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional customer"},evidence:{id:commandId,objectVersionId:"fixture-version",sha256:"a".repeat(64),serverReceivedAt:"2026-10-29T10:00:00.000Z"}}};
function fixture(mode="synthetic_demo"){
 const query=vi.fn<(sql:string,values:unknown[])=>Promise<{rows:{result:unknown}[]}>>().mockImplementation(async sql=>({rows:[{result:sql.includes("customer_portal_message")?receipt:{version:"customer-session.v1",jobId:job}}]}));
 const identity={allowedOrigin:origin,provider:{digest:()=>"a".repeat(64),repository:{pool:{query}}}} as unknown as IdentityApplication;
 return {identity,query,app:new CustomerMessageApplication(identity,mode)};
}
const req=(raw:unknown,h=headers)=>new Request(`${origin}/api/customer-portal/messages`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify(raw)});
it("uses the bound session, exact text and checked SQL only; no price/approval/signal",async()=>{
 const f=fixture();expect(await f.app.post(body,{headers})).toEqual(receipt);expect(f.query).toHaveBeenCalledTimes(2);
 expect(f.query.mock.calls[1]).toEqual([expect.stringContaining("identity.customer_portal_message"),[tenant,job,customer,"a".repeat(64),JSON.stringify(body)]]);
});
it.each(["production","pilot_no_charge"])("refuses %s before queries",async mode=>{const f=fixture(mode);await expect(f.app.post(body,{headers})).rejects.toBeInstanceOf(CustomerRefused);expect(f.query).not.toHaveBeenCalled();});
it("rejects foreign scope, injected authority, invalid text, builder cookies and foreign Origin",async()=>{
 for(const [raw,h] of [
  [{...body,jobId:customer},headers],[{...body,tenantId:tenant},headers],[{...body,amountPence:50000},headers],[{...body,approved:true},headers],
  [{...body,fictionalCustomer:{name:"spoof"}},headers],[{...body,text:"\u0000"},headers],[{...body,text:"\ud800"},headers],
  [body,{...headers,origin:"https://foreign.invalid"}],[body,{...headers,"x-tenant-id":tenant}],[body,{origin,cookie:"jg_session=builder"}],
 ] as const){const f=fixture();await expect(f.app.post(raw,{headers:h})).rejects.toBeInstanceOf(CustomerRefused);expect(f.query).not.toHaveBeenCalled();}
});
it("Nest and Next return identical failures for revoked authority, locked job and conflicting replay",async()=>{
 for(const error of [Object.assign(new Error("CUSTOMER_REFUSED"),{code:"42501"}),new Error("POST_LOCK_WORK_REQUIRES_LINKED_JOB"),new Error("IDEMPOTENCY_CONFLICT")]){
  const f=fixture();f.query.mockImplementation(async sql=>{if(sql.includes("customer_portal_message"))throw error;return {rows:[{result:receipt}]};});
  const next=await customerMessageHttp(()=>f.app,req(body)),failure=customerMessageFailure("code" in error?new CustomerRefused():error);
  expect(next.status).toBe(failure.status);expect(await next.json()).toEqual(failure.body);expect(next.headers.get("Cache-Control")).toBe("no-store");
  await expect(new CustomerMessageController(()=>f.app).post(body,{headers})).rejects.toMatchObject({status:failure.status,response:failure.body});
 }
});
it("real Next route rejects foreign job before looking it up",async()=>{
 const f=fixture();routeIdentity.current=f.identity;vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 try{const {POST}=await import(fileURLToPath(new URL("../../../web/app/api/customer-portal/messages/route.ts",import.meta.url)));expect((await POST(req({...body,jobId:customer}))).status).toBe(401);expect(f.query).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}
});
it("customer guard uses the existing sign-in read boundary for message requests",async()=>{
 const run=vi.fn().mockResolvedValue({body:{jobId:job}}),q={path:"/customer-portal/messages",body,headers},setHeader=vi.fn();
 const context={switchToHttp:()=>({getRequest:()=>q,getResponse:()=>({setHeader})})} as ExecutionContext;
 expect(await new CustomerAuthGuard(()=>({run}) as never).canActivate(context)).toBe(true);expect(run).toHaveBeenCalledWith("read",{version:"customer-read.v1",jobId:job},q);
});

it("malformed JSON has the same private 401 on Nest and Next",async()=>{
 const f=fixture(),next=await customerMessageHttp(()=>f.app,new Request(origin,{method:"POST",headers,body:"{"}));
 const json=vi.fn(),status=vi.fn(()=>({json})),setHeader=vi.fn();
 const host={switchToHttp:()=>({getRequest:()=>({path:"/customer-portal/messages"}),getResponse:()=>({status,setHeader})})} as unknown as ArgumentsHost;
 await new OidcParseExceptionFilter(()=>({}) as never,{} as never).catch(new BadRequestException(),host);
 expect(status).toHaveBeenCalledWith(next.status);expect(json).toHaveBeenCalledWith(await next.json());expect(f.query).not.toHaveBeenCalled();
});
