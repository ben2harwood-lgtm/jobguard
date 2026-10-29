import { OidcParseExceptionFilter } from "./sso/oidc.controller.js";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { BadRequestException, HttpException, type ArgumentsHost, type ExecutionContext } from "@nestjs/common";
import { CustomerStagesApplication, customerStagesHttp } from "./customer-stages.js";
import { CustomerStagesController } from "./customer-stages.controller.js";
import { CustomerStagesGuard } from "./customer-stages.guard.js";
import { CustomerSigninApplication } from "./customer-signin.js";
import type { IdentityApplication } from "./identity.application.js";
const routeIdentity = vi.hoisted(() => ({current:undefined as unknown}));
vi.mock("../../../web/app/lib/identity-server",()=>({identityApplication:()=>routeIdentity.current}));
const tenant="10000000-0000-4000-8000-000000000001",job="20000000-0000-4000-8000-000000000002",customer="30000000-0000-4000-8000-000000000003";
const origin="https://fictional.invalid",token=`${tenant}.${job}.${customer}.${"a".repeat(43)}`;
const headers={origin,cookie:`jobguard_customer=${token}`};
const read={version:"customer-stages-read.v1",jobId:job};
const ack={version:"customer-stage-acknowledge.v1",jobId:job,completionId:tenant,commandId:customer,snapshotHash:"b".repeat(64)};
function fixture(environment="synthetic_demo") {
 const query=vi.fn().mockResolvedValue({rows:[{result:{version:"customer-session.v1",jobId:job}}]});
 const identity={allowedOrigin:origin,provider:{digest:(v:string)=>`digest:${v}`,repository:{pool:{query}}}} as unknown as IdentityApplication;
 return {query,identity,app:new CustomerStagesApplication(identity,environment)};
}
describe("M5-STAGE transport boundary",()=>{
 it.each(["production","pilot_no_charge"])("refuses %s without SQL",async mode=>{
  const f=fixture(mode);await expect(f.app.run("stages",read,{headers})).rejects.toMatchObject({code:"CUSTOMER_REFUSED"});expect(f.query).not.toHaveBeenCalled();
 });
 it("strict envelopes refuse foreign job, tenant injection, amounts and forged credential",async()=>{
  for(const [body,h] of [[{...ack,jobId:tenant},headers],[{...ack,tenantId:tenant},headers],[{...ack,amount:0},headers],[ack,{origin,cookie:"jg_session=builder"}],[ack,{...headers,origin:"https://other.invalid"}]] as const){
   const f=fixture();await expect(f.app.run("stage-acknowledge",body,{headers:h})).rejects.toMatchObject({code:"CUSTOMER_REFUSED"});expect(f.query).not.toHaveBeenCalled();
  }
 });
 it("passes the customer HMAC and exact target only after session verification",async()=>{
  const f=fixture();await f.app.run("stage-acknowledge",ack,{headers});
  expect(f.query).toHaveBeenCalledTimes(2);expect(f.query.mock.calls[0]![0]).toContain("customer_portal_use");
  expect(f.query.mock.calls[1]![1]).toEqual([tenant,job,customer,`digest:customer-session:${token}`,tenant,customer,ack.snapshotHash]);
 });
 it("reuses the existing customer guard without changing its envelope or session contract",async()=>{
  const f=fixture(),response={setHeader:vi.fn()},request={headers,body:ack};
  expect(await new CustomerStagesGuard(()=>new CustomerSigninApplication(f.identity,"synthetic_demo")).canActivate({switchToHttp:()=>({getRequest:()=>request,getResponse:()=>response})} as ExecutionContext)).toBe(true);
  expect(request.body).toBe(ack);expect(f.query.mock.calls[0]![0]).toContain("customer_portal_use");
 });
 it.each(["stages","stage-acknowledge"] as const)("malformed JSON has the same %s refusal before either application",async action=>{
  const f=fixture();
  const response=await customerStagesHttp(()=>f.app,action,new Request(`${origin}/api/customer-portal/${action}`,{method:"POST",headers,body:"{"}));
  expect(response.status).toBe(401);expect(await response.json()).toEqual({code:"CUSTOMER_REFUSED"});expect(f.query).not.toHaveBeenCalled();
  const reply={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
  await new OidcParseExceptionFilter(()=>{throw new Error("unrelated provider");},{} as never).catch(new BadRequestException(),{switchToHttp:()=>({getRequest:()=>({path:`/customer-portal/${action}`}),getResponse:()=>reply})} as ArgumentsHost);
  expect(reply.status).toHaveBeenCalledWith(401);expect(reply.json).toHaveBeenCalledWith({code:"CUSTOMER_REFUSED"});
 });
 it.each(["stages","stage-acknowledge"] as const)("actual Next %s route preserves SQL refusal",async action=>{
  const f=fixture();f.query.mockRejectedValue({code:"42501"});routeIdentity.current=f.identity;
  const previous=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
  try {
   const route=await import(fileURLToPath(new URL(`../../../web/app/api/customer-portal/${action}/route.ts`,import.meta.url)));
   const response=await route.POST(new Request(`${origin}/api/customer-portal/${action}`,{method:"POST",headers,body:JSON.stringify(action==="stages"?read:ack)}));
   expect(response.status).toBe(401);expect(await response.json()).toEqual({code:"CUSTOMER_REFUSED"});
  }finally{if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;}
 });
 it.each(["stages","stage-acknowledge"] as const)("Next and Nest refuse %s identically",async action=>{
  process.env.JOBGUARD_ENV="synthetic_demo";
  const f=fixture();f.query.mockRejectedValue({code:"42501",message:"private source"});
  const body=action==="stages"?read:ack;
  const response=await customerStagesHttp(()=>f.app,action,new Request(`${origin}/api/customer-portal/${action}`,{method:"POST",headers,body:JSON.stringify(body)}));
  expect(response.status).toBe(401);expect(await response.json()).toEqual({code:"CUSTOMER_REFUSED"});expect(response.headers.get("cache-control")).toBe("no-store");
  const controller=new CustomerStagesController(()=>f.identity),reply={setHeader:vi.fn()};
  const error=await (action==="stages"?controller.stages(body,{headers},reply):controller.acknowledge(body,{headers},reply)).catch(e=>e) as HttpException;
  expect(error.getStatus()).toBe(401);expect(error.getResponse()).toEqual({code:"CUSTOMER_REFUSED"});
 });
});
