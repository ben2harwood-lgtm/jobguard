import "reflect-metadata";
import { expect, it, vi } from "vitest";
import { HttpException, type ExecutionContext } from "@nestjs/common";
import { CustomerQuoteApplication, customerQuoteHttp } from "./customer-quote.js";
import { CustomerQuoteAuthGuard, CustomerQuoteController } from "./customer-quote.controller.js";
import { CustomerSigninApplication, CustomerRefused } from "./customer-signin.js";
import type { CustomerRequest } from "./customer-auth.guard.js";
import type { IdentityApplication } from "./identity.application.js";
const routeIdentity=vi.hoisted(()=>({current:undefined as unknown}));
vi.mock("../../../web/app/lib/identity-server",()=>({identityApplication:()=>routeIdentity.current}));
const job="10000000-0000-4000-8000-000000000001", tenant="20000000-0000-4000-8000-000000000002", customer="30000000-0000-4000-8000-000000000003";
const origin="https://fixture.invalid",headers={origin,cookie:`jobguard_customer=${tenant}.${job}.${customer}.${"a".repeat(43)}`};
const read={version:"customer-quote-read.v1",jobId:job};
const command={version:"customer-quote-acceptance.v1",commandId:job,jobId:job,expectedJobRevision:1,target:{kind:"quote",id:job,revision:1,hash:"a".repeat(64)}};
function fixture(environment="synthetic_demo") {
 const query=vi.fn().mockResolvedValue({rows:[{result:{version:"customer-session.v1",jobId:job}}]});
 const identity={allowedOrigin:origin,provider:{digest:(x:string)=>`hmac:${x}`,repository:{pool:{query}}}} as unknown as IdentityApplication;
 return {query,identity,app:new CustomerQuoteApplication(identity,environment)};
}
const req=(body:unknown,h:Record<string,string>=headers)=>new Request(`${origin}/api/customer-portal/quote`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify(body)});
it.each(["quote","quote-accept"] as const)("%s reuses the session resolver and passes only its scoped HMAC and strict command to SQL",async action=>{
 const f=fixture(),body=action==="quote"?read:command;await f.app.run(action,body,{headers});
 expect(f.query).toHaveBeenCalledTimes(2);
 expect(f.query.mock.calls[0]![0]).toContain("customer_portal_use");
 expect(f.query.mock.calls[1]![1]).toEqual([tenant,job,customer,`hmac:customer-session:${headers.cookie.split("=")[1]}`,JSON.stringify(body)]);
});
it.each(["quote","quote-accept"] as const)("%s refuses schema, foreign job, missing cookie, production and origin overrides before quote access",async action=>{
 const body=action==="quote"?read:command;
 for(const [b,h,mode] of [[{...body,tenantId:tenant},headers,"synthetic_demo"],[{...body,jobId:customer},headers,"synthetic_demo"],[body,{origin,cookie:"jobguard_session=builder"},"synthetic_demo"],[body,headers,"production"],[body,{...headers,origin:"https://foreign.invalid"},"synthetic_demo"],[body,{...headers,"x-tenant-id":tenant},"synthetic_demo"]] as const){
 const f=fixture(mode);await expect(f.app.run(action,b,{headers:h})).rejects.toBeInstanceOf(CustomerRefused);expect(f.query).not.toHaveBeenCalled();
 }
});
it.each(["quote","quote-accept"] as const)("Nest guard and Next %s expose identical closed/expired-session and changed-target refusals",async action=>{
 for(const failAt of [1,2]){
  const f=fixture();f.query.mockImplementation(async()=>{if(f.query.mock.calls.length===failAt)throw {code:"42501",message:"private session or target state"};return {rows:[{result:{jobId:job}}]};});
  const body=action==="quote"?read:command;
  const next=await customerQuoteHttp(()=>f.app,action,req(body));expect(next.status).toBe(401);expect(await next.json()).toEqual({code:"CUSTOMER_REFUSED"});expect(next.headers.get("cache-control")).toBe("no-store");
  f.query.mockClear();
  const q={headers,path:`/customer-portal/${action}`,body} as unknown as CustomerRequest,reply={setHeader:vi.fn()};
  const error=await (async()=>{
   await new CustomerQuoteAuthGuard(()=>new CustomerSigninApplication(f.identity,"synthetic_demo")).canActivate({switchToHttp:()=>({getRequest:()=>q,getResponse:()=>reply})} as ExecutionContext);
   // The application rechecks authority at the command boundary; force that check or target check to fail.
   f.query.mockClear();
   return new CustomerQuoteController(()=>f.app)[action==="quote"?"quote":"accept"](body,q,reply);
  })().catch(e=>e);
  expect(q.body).toEqual(body);expect(error).toBeInstanceOf(HttpException);expect((error as HttpException).getStatus()).toBe(401);expect((error as HttpException).getResponse()).toEqual({code:"CUSTOMER_REFUSED"});
 }
});
it("outages and malformed JSON are redacted without credentials",async()=>{
 const unavailable=()=>{throw new Error("private database configuration");};
 const result=await customerQuoteHttp(unavailable,"quote",req(read));expect(result.status).toBe(503);expect(await result.json()).toEqual({code:"CUSTOMER_UNAVAILABLE"});
 const f=fixture();const bad=await customerQuoteHttp(()=>f.app,"quote-accept",new Request(`${origin}/api/customer-portal/quote-accept`,{method:"POST",headers,body:"{"}));expect(bad.status).toBe(401);expect(f.query).not.toHaveBeenCalled();
});

it.each(["quote","quote-accept"] as const)("production Next %s route uses the shared refusal boundary",async action=>{
 const f=fixture();f.query.mockRejectedValue({code:"42501"});routeIdentity.current=f.identity;
 const previous=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
 try {
  const {fileURLToPath}=await import("node:url");
  const route=await import(fileURLToPath(new URL(`../../../web/app/api/customer-portal/${action}/route.ts`,import.meta.url)));
  const response=await route.POST(req(action==="quote"?read:command));
  expect(response.status).toBe(401);expect(await response.json()).toEqual({code:"CUSTOMER_REFUSED"});expect(response.headers.get("cache-control")).toBe("no-store");
 }finally{if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;}
});

it("the quote adapter reuses the unchanged guard, restores the command body and stamps only verified scope",async()=>{
 const f=fixture(),q={headers,body:command};
 await new CustomerQuoteAuthGuard(()=>new CustomerSigninApplication(f.identity,"synthetic_demo")).canActivate({switchToHttp:()=>({getRequest:()=>q,getResponse:()=>({setHeader:vi.fn()})})} as ExecutionContext);
 expect(q.body).toBe(command);expect(Object.getOwnPropertyDescriptor(q,"customerScope")).toMatchObject({writable:false,configurable:false});
 expect(f.query).toHaveBeenCalledOnce();
});
