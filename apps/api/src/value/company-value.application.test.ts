import { expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import type { ValueBusinessReader } from "@jobguard/db";
import { mapValueReceipt } from "@jobguard/core";
import { CompanyValueApplication } from "./value-business.application.js";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture(){
 const credentials={sessionToken:"s".repeat(32),requestedTenantId:id,csrfToken:"c".repeat(24),origin:"https://jobguard.invalid"};
 const provider={authenticate:vi.fn().mockResolvedValue({identityUserId:id,sessionId:id,csrfToken:credentials.csrfToken,sessionCredential:"a".repeat(64)}),findMembership:vi.fn().mockResolvedValue({id,identityUserId:id,tenantId:id,role:"owner",email:"owner@example.invalid"})};
 const authority={provider,allowedOrigin:credentials.origin,environment:()=>"synthetic_demo",resolve:vi.fn().mockResolvedValue({credentials,digest:"a".repeat(64)})};
 const readBusiness=vi.fn().mockResolvedValue({version:"business-value-result.v1",state:"mapped",tenantId:id,label:"mapped, inspectable",environment:"synthetic_demo",jobs:[],subscription:[]});
 const readJob=vi.fn<ValueBusinessReader["readJob"]>().mockResolvedValue(null);
 return {authority,readBusiness,readJob,app:new CompanyValueApplication(authority as never,{readBusiness,readJob})};
}
it("reauthenticates company membership on every aggregate and binds its persisted digest",async()=>{
 const f=fixture();await f.app.readBusiness("session",{});await f.app.readBusiness("session",{});
 expect(f.authority.provider.authenticate).toHaveBeenCalledTimes(2);expect(f.readBusiness).toHaveBeenCalledWith(expect.objectContaining({tenantId:id}),"a".repeat(64),undefined,null);
 f.authority.resolve.mockRejectedValue(new Error("revoked"));await expect(f.app.readBusiness("session",{})).rejects.toThrow();expect(f.readBusiness).toHaveBeenCalledTimes(2);
});
it.each([{tenantId:id},{price:0},{from:"2026-10-01T00:00:00Z"},{from:"2026-11-01T00:00:00Z",toExclusive:"2026-10-01T00:00:00Z"}])("forged or invalid selections never reach source reads: %j",async query=>{
 const f=fixture();expect(await f.app.readBusiness("session",query)).toMatchObject({code:"INVALID_BUSINESS_VALUE_SELECTION"});expect(f.readBusiness).not.toHaveBeenCalled();
});
it("passes a half-open window separately from the subscription period",async()=>{
 const f=fixture(),window={from:"2026-10-01T00:00:00Z",toExclusive:"2026-11-01T00:00:00Z"};
 await f.app.readBusiness("session",{...window,periodId:id});expect(f.readBusiness).toHaveBeenCalledWith(expect.anything(),"a".repeat(64),id,window);
});
it("foreign company data and invented totals are refused",async()=>{
 const f=fixture();f.readBusiness.mockResolvedValue({version:"business-value-result.v1",state:"mapped",tenantId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",label:"mapped, inspectable",environment:"synthetic_demo",jobs:[],subscription:[]});
 await expect(f.app.readBusiness("session",{})).rejects.toThrow("VALUE_SCOPE_MISMATCH");
 f.readBusiness.mockResolvedValue({version:"business-value-result.v1",state:"mapped",tenantId:id,label:"mapped, inspectable",environment:"synthetic_demo",jobs:[],subscription:[],fee:100});
 await expect(f.app.readBusiness("session",{})).rejects.toThrow();
});
it("GET /value checks a company credential before a simultaneous practice cookie",async()=>{
 const context=vi.fn().mockRejectedValue(new Error("revoked"));
 const guard=new ApplicationAuthGuard(()=>({context,allowedOrigin:"https://jobguard.invalid"}) as never);
 const request={method:"GET",path:"/value",headers:{cookie:`jobguard_session=revoked; jg_session=${id}`}};
 await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>request})} as ExecutionContext)).rejects.toMatchObject({status:401});
 expect(context).toHaveBeenCalledWith(expect.objectContaining({sessionToken:"revoked",origin:"https://jobguard.invalid"}));
});

it("a company job link uses the same current company authority and refuses another job/tenant receipt",async()=>{
 const f=fixture(),jobId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",revisionId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 expect(await f.app.readJob("session",jobId,{})).toMatchObject({jobId,status:"incomplete"});
 expect(f.readJob).toHaveBeenCalledWith(expect.objectContaining({tenantId:id}),"a".repeat(64),jobId,null);
 const receipt=mapValueReceipt({tenantId:id,jobId,lockId:id,lockedRevisionId:revisionId,lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id,checkedAt:"2026-10-02T00:00:00Z",checked:[],tracked:[],assessments:[]});
 f.readJob.mockResolvedValue(receipt);expect(await f.app.readJob("session",jobId,{})).toMatchObject({jobId,status:"mapped"});
 f.readJob.mockResolvedValue(mapValueReceipt({...receipt.sources,tenantId:revisionId}));
 await expect(f.app.readJob("session",jobId,{})).rejects.toMatchObject({code:"VALUE_V3_SOURCE_REJECTED"});
 f.authority.resolve.mockRejectedValue(new Error("revoked"));await expect(f.app.readJob("session",jobId,{})).rejects.toThrow("revoked");
});
it("company read admission is exact to GET value endpoints",async()=>{
 const context=vi.fn().mockResolvedValue({});const guard=new ApplicationAuthGuard(()=>({context,allowedOrigin:"https://jobguard.invalid"}) as never);
 const request={method:"GET",path:`/jobs/${id}/value/v3`,headers:{cookie:"jobguard_session=company"}};
 expect(await guard.canActivate({switchToHttp:()=>({getRequest:()=>request})} as ExecutionContext)).toBe(true);
 request.method="POST";await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>request})} as ExecutionContext)).rejects.toMatchObject({status:403});
});

it("v2 business totals reproduce job sources and reject an altered recovery subtotal",async()=>{
 const {mapValueReceiptV2,mapCurrentBusinessValueSummary,mappedBusinessSummaryV2}=await import("@jobguard/core");
 const f=fixture(),jobId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",money=(pence:number)=>({pence,currency:"GBP" as const});
 const receipt=mapValueReceiptV2({base:{tenantId:id,jobId,lockId:id,lockedRevisionId:id,lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id,checkedAt:"2026-10-02T00:00:00Z",checked:[],tracked:[],assessments:[]},supplier:{reason:"No supplier derivation",balances:[]},withheld:{reason:null,balances:[{tenantId:id,jobId,derivationId:id,revision:1,at:"2026-10-03T00:00:00Z",recovered:money(282000),fee:money(28200),allocationIds:[id],statementHash:"a".repeat(64)}]}});
 const summary=mappedBusinessSummaryV2.parse(mapCurrentBusinessValueSummary([receipt]));
 const value={version:"business-value-result.v1",state:"mapped",tenantId:id,label:"mapped, inspectable",environment:"synthetic_demo",jobs:[{version:"job-value.v3",environment:"synthetic_demo",jobId,status:"mapped",receipt}],summary,subscription:[]};
 f.readBusiness.mockResolvedValue(value);expect(await f.app.readBusiness("session",{})).toMatchObject({summary:{withheld:{fee:money(28200)}}});
 f.readBusiness.mockResolvedValue({...value,summary:{...summary,withheld:{...summary.withheld,fee:money(1)}}});
 await expect(f.app.readBusiness("session",{})).rejects.toThrow("VALUE_SUMMARY_SOURCE_MISMATCH");
});
