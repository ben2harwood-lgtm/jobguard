import { describe, expect, it, vi } from "vitest";
import { BadRequestException, HttpException, type ExecutionContext } from "@nestjs/common";
import { customerVariationApprovalCommandV1 } from "@jobguard/core";
import { variationCommandV1 } from "../variation/contracts.js";
import type { IdentityApplication } from "./identity.application.js";
import { CustomerRefused } from "./customer-signin.js";
import { CustomerVariationApplication, customerVariationHttp } from "./customer-variation.js";
import { CustomerVariationController } from "./customer-variation.controller.js";
import { OidcParseExceptionFilter } from "./sso/oidc.controller.js";
import type { ArgumentsHost } from "@nestjs/common";
import type { HttpAdapterHost } from "@nestjs/core";
import { ApplicationAuthGuard } from "./application-auth.guard.js";
const routeIdentity = vi.hoisted(() => ({current: undefined as unknown}));
vi.mock("../../../web/app/lib/identity-server", () => ({identityApplication: () => routeIdentity.current}));
const job = "20000000-0000-4000-8000-000000000002", tenant = "10000000-0000-4000-8000-000000000001", customer = "30000000-0000-4000-8000-000000000003";
const origin = "https://fixture.invalid", token = `${tenant}.${job}.${customer}.${"a".repeat(43)}`;
const headers = { origin, cookie: `jobguard_customer=${token}` };
const command = {version:"customer-portal-approval.v1",commandId:customer,jobId:job,expectedJobRevision:1,target:{kind:"variation",id:tenant,revision:2,hash:"a".repeat(64),amount:{pence:-5000,currency:"GBP"}}};
function fixture(environment = "synthetic_demo") {
 const query = vi.fn().mockResolvedValue({rows:[{result:{version:"customer-session.v1",jobId:job}}]});
 const identity = {allowedOrigin:origin,provider:{digest:(x:string)=>`hmac:${x}`,repository:{pool:{query}}}} as unknown as IdentityApplication;
 return {query,identity,app:new CustomerVariationApplication(identity,environment)};
}
describe("MON-5 exact customer extra approval", () => {
 it("reuses customer resolution then sends only its HMAC and exact signed envelope to SQL",async()=>{
  const f=fixture();await f.app.run("variation-approvals",command,{headers});
  expect(f.query.mock.calls[0]![0]).toContain("customer_portal_use");
  expect(f.query.mock.calls[1]![1]).toEqual([tenant,job,customer,`hmac:customer-session:${token}`,JSON.stringify(command)]);
 });
 it.each(["production","pilot_no_charge"])("refuses %s",async env=>{
  const f=fixture(env);await expect(f.app.run("variation-approvals",command,{headers})).rejects.toBeInstanceOf(CustomerRefused);expect(f.query).not.toHaveBeenCalled();
 });
 it("rejects builder cookies, foreign Origin, job and tenant overrides before any lookup",async()=>{
  for(const [raw,h] of [[command,{origin,cookie:"jobguard_session=builder; jg_session=builder"}],[command,{...headers,origin:"https://foreign.invalid"}],[{...command,jobId:customer},headers],[{...command,tenantId:tenant},headers],[command,{...headers,"x-tenant-id":tenant}]] as const){
   const f=fixture();await expect(f.app.run("variation-approvals",raw,{headers:h})).rejects.toBeInstanceOf(CustomerRefused);expect(f.query).not.toHaveBeenCalled();
  }
 });
 it("does not allow a builder to select the customer method or an approval to inject actor or authority",()=>{
  expect(variationCommandV1.safeParse({version:"variation-command.v1",action:"approve",variationId:tenant,revisionId:job,approvalId:customer,method:"customer_authenticated"}).success).toBe(false);
  for(const raw of [{...command,actorMembershipId:tenant},{...command,method:"customer_authenticated"},{...command,target:{...command.target,amount:{pence:1.5,currency:"GBP"}}},{...command,target:{...command.target,amount:{pence:5000,currency:"USD"}}}])expect(customerVariationApprovalCommandV1.safeParse(raw).success).toBe(false);
 });
 it.each(["variations/read","variation-approvals"] as const)("Next and direct Nest refuse %s identically without leaking SQL diagnostics",async action=>{
  const f=fixture();f.query.mockRejectedValue({code:"42501",message:"PRIVATE_SOURCE"});
  const raw=action==="variations/read"?{version:"customer-variations-read.v1",jobId:job}:command;
  const response=await customerVariationHttp(()=>f.app,action,new Request(`${origin}/api/customer-portal/${action}`,{method:"POST",headers,body:JSON.stringify(raw)}));
  expect(response.status).toBe(401);expect(await response.json()).toEqual({code:"CUSTOMER_REFUSED"});expect(response.headers.get("cache-control")).toBe("no-store");
  const controller=new CustomerVariationController(()=>f.app),reply={setHeader:vi.fn()};
  try {await (action==="variations/read"?controller.read(raw,{headers},reply):controller.approve(raw,{headers},reply));throw new Error("Expected refusal");}
  catch(error){expect(error).toBeInstanceOf(HttpException);expect((error as HttpException).getStatus()).toBe(401);expect((error as HttpException).getResponse()).toEqual({code:"CUSTOMER_REFUSED"});}
 });
 it("routes customer mutations before the legacy cookie shortcut and refuses other builder paths",async()=>{
  const guard=new ApplicationAuthGuard(()=>{throw new Error("no member authority");});
  const ctx=(path:string)=>({switchToHttp:()=>({getRequest:()=>({path,method:"POST",headers})})}) as ExecutionContext;
  expect(await guard.canActivate(ctx("/customer-portal/variation-approvals"))).toBe(true);
  await expect(guard.canActivate(ctx("/jobs/whatever/variations"))).rejects.toBeInstanceOf(HttpException);
 });

 it.each(["variations/read","variation-approvals"] as const)("malformed JSON on %s has the customer refusal", async action=>{
  const response={status:vi.fn().mockReturnThis(),json:vi.fn(),setHeader:vi.fn()};
  const exception=new BadRequestException("private body");
  await new OidcParseExceptionFilter(()=>{throw new Error("unexpected OIDC access");},{} as HttpAdapterHost).catch(exception,{switchToHttp:()=>({getRequest:()=>({path:`/customer-portal/${action}`}),getResponse:()=>response})} as unknown as ArgumentsHost);
  expect(response.status).toHaveBeenCalledWith(401);expect(response.json).toHaveBeenCalledWith({code:"CUSTOMER_REFUSED"});
 });

 it.each(["variations/read","variation-approvals"] as const)("actual Next %s adapter and middleware use the same refusal boundary",async action=>{
  const f=fixture();f.query.mockRejectedValue({code:"42501"});routeIdentity.current=f.identity;
  const previous=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
  try {
   const {fileURLToPath}=await import("node:url");
   const route=await import(fileURLToPath(new URL(`../../../web/app/api/customer-portal/${action}/route.ts`,import.meta.url)));
   const {middleware}=await import(fileURLToPath(new URL("../../../web/middleware.ts",import.meta.url)));
   const url=`${origin}/api/customer-portal/${action}`;
   const raw=action==="variations/read"?{version:"customer-variations-read.v1",jobId:job}:command;
   const response=await route.POST(new Request(url,{method:"POST",headers,body:JSON.stringify(raw)}));
   expect(response.status).toBe(401);expect(await response.json()).toEqual({code:"CUSTOMER_REFUSED"});expect(f.query).toHaveBeenCalledOnce();
   expect(middleware({cookies:{has:()=>true},nextUrl:new URL(url)}).headers.get("x-middleware-next")).toBe("1");
  }finally{if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;}
 });
 it("a revocation between read and approval is refused by the SQL writer",async()=>{
  const f=fixture();f.query.mockResolvedValueOnce({rows:[{result:{jobId:job}}]}).mockRejectedValueOnce({code:"42501"});
  await expect(f.app.run("variation-approvals",command,{headers})).rejects.toBeInstanceOf(CustomerRefused);expect(f.query).toHaveBeenCalledTimes(2);
 });
});
