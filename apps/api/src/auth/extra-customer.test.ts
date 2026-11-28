import { describe, expect, it, vi } from "vitest";
import type { IdentityApplication } from "./identity.application.js";
import { ExtraCustomerApplication, extraCustomerHttp } from "./extra-customer.js";
const tenant="10000000-0000-4000-8000-000000000001", job="20000000-0000-4000-8000-000000000002", client="30000000-0000-4000-8000-000000000003", requestId="40000000-0000-4000-8000-000000000004";
const origin="https://fixture.invalid", headers={origin,cookie:`jobguard_customer=${tenant}.${job}.${client}.${"a".repeat(43)}`};
const input={version:"extra-customer.v1",action:"decide",jobId:job,requestId,commandId:tenant,revisionHash:"b".repeat(64),netPence:150000,decision:"approve"};
function fixture() {
 const query=vi.fn().mockResolvedValueOnce({rows:[{result:{extraApprover:true}}]}).mockResolvedValue({rows:[{result:{state:"approved"}}]});
 const identity={allowedOrigin:origin,provider:{digest:(s:string)=>s.includes("customer-session:")?"c".repeat(64):"d".repeat(64),repository:{pool:{query}}}} as unknown as IdentityApplication;
 return {query,app:new ExtraCustomerApplication(identity,"synthetic_demo")};
}
describe("ENT-5 customer session transport boundary",()=>{
 it("derives the actual named actor and tenant from the existing cookie, never the body",async()=>{
  const f=fixture();expect(await f.app.run(input,{headers})).toEqual({state:"approved"});
  expect(f.query.mock.calls[1]![1].slice(0,4)).toEqual([tenant,job,client,"c".repeat(64)]);
  expect(JSON.parse(f.query.mock.calls[1]![1][4])).toEqual(input);
 });
 it.each([{...input,actorMembershipId:tenant},{...input,tenantId:tenant},{...input,netPence:150000.5},{...input,revisionHash:"forged"}])("refuses forged fields and malformed exact binding",async raw=>{
  const f=fixture();await expect(f.app.run(raw,{headers})).rejects.toMatchObject({code:"CUSTOMER_REFUSED"});expect(f.query).not.toHaveBeenCalled();
 });
 it.each([{origin},{...headers,cookie:"jobguard_session=owner"},{...headers,"x-tenant-id":tenant},{...headers,origin:"https://foreign.invalid"}])("requires current customer session and origin",async h=>{
  const f=fixture();await expect(f.app.run(input,{headers:h})).rejects.toMatchObject({code:"CUSTOMER_REFUSED"});expect(f.query).not.toHaveBeenCalled();
 });
 it("refuses a different job before querying",async()=>{
  const f=fixture();await expect(f.app.run({...input,jobId:requestId},{headers})).rejects.toMatchObject({code:"CUSTOMER_REFUSED"});expect(f.query).not.toHaveBeenCalled();
 });
 it("returns a typed stale conflict with no cache",async()=>{
  const f=fixture();f.query.mockRejectedValueOnce(Object.assign(new Error("STALE_REVISION"),{code:"40001"}));
  const response=await extraCustomerHttp(()=>f.app,new Request(`${origin}/api/customer-portal/extra-approvals`,{method:"POST",headers,body:JSON.stringify(input)}));
  expect(response.status).toBe(409);expect(await response.json()).toEqual({code:"STALE_REVISION"});expect(response.headers.get("cache-control")).toBe("no-store");
 });
});

// LATER-SAFETY-60: the customer transport must retain the server's proceed facts.
it.each(["view", "queue"])("projects proceed breaches through the customer %s", async action => {
 const f=fixture();
 const item={requestId,timingInputs:{visit:null,requests:[{id:requestId,preapproval_required:true,superseded_us:null}],facts:[],workStatus:null,proceedIds:[requestId]}};
 f.query.mockReset().mockResolvedValueOnce({rows:[{result:{extraApprover:true}}]})
  .mockResolvedValueOnce({rows:[{result:action==="queue"?{items:[item]}:item}]});
 const result=await f.app.run({version:"extra-customer.v1",action,jobId:job,...(action==="view"?{requestId}:{})},{headers});
 const expected={requestId,doneWithoutRequiredPreapproval:true,workTiming:null,approvalTimings:[]};
 expect(result).toEqual(action==="queue"?{items:[expected]}:expected);
});
it("keeps the previous result when customer timing has no proceed IDs", async () => {
 const f=fixture();
 f.query.mockReset().mockResolvedValueOnce({rows:[{result:{extraApprover:true}}]})
  .mockResolvedValueOnce({rows:[{result:{requestId,timingInputs:{visit:null,requests:[{id:requestId,preapproval_required:true,superseded_us:null}],facts:[],workStatus:null}}}]});
 expect(await f.app.run({version:"extra-customer.v1",action:"view",jobId:job,requestId},{headers}))
  .toMatchObject({doneWithoutRequiredPreapproval:"not_derived"});
});

// EP-CC-R1: the client entitlement projection is routed to its own identity function and parsed against the narrow v1 schema.
describe("EP-CC-R1 client entitlement projection", () => {
 const projection = { version: "extra-client-entitlement.v1", requestId, requestRevision: 1,
  orderLines: [{ position: 0, clientLineReference: null, rateCode: "R1", unit: "each", quantity: "1" }],
  claimed: { status: "not_recorded", source: "CC-S1" }, rateItem: { status: "not_recorded", source: "CC-S1" },
  inclusionRule: { status: "not_recorded", source: "CC-S2" }, decision: { status: "not_recorded", source: "CC-S2" }, ownDecisions: [] };
 const ask = { version: "extra-customer.v1", action: "entitlement", jobId: job, requestId };
 it("calls identity.extra_customer_entitlement with the cookie-derived binding and returns only the parsed projection", async () => {
  const f = fixture(); f.query.mockReset().mockResolvedValueOnce({ rows: [{ result: { extraApprover: true } }] }).mockResolvedValueOnce({ rows: [{ result: projection }] });
  expect(await f.app.run(ask, { headers })).toEqual(projection);
  expect(f.query.mock.calls[1]![0]).toContain("identity.extra_customer_entitlement(");
  expect(f.query.mock.calls[1]![1].slice(0, 4)).toEqual([tenant, job, client, "c".repeat(64)]);
  expect(JSON.parse(f.query.mock.calls[1]![1][4])).toEqual(ask);
 });
 it.each([{ ...projection, fees: [] }, { ...projection, internalRationale: "x" }, { ...projection, basisNote: "x" }, { ...projection, version: "extra-client-entitlement.v0" }])(
  "refuses a projection carrying anything beyond the narrow schema", async result => {
   const f = fixture(); f.query.mockReset().mockResolvedValueOnce({ rows: [{ result: { extraApprover: true } }] }).mockResolvedValueOnce({ rows: [{ result }] });
   await expect(f.app.run(ask, { headers })).rejects.toMatchObject({ code: "CUSTOMER_REFUSED" });
  });
 it.each([{ ...ask, requestId: undefined }, { ...ask, tenantId: tenant }, { ...ask, clientContractId: tenant }])("refuses malformed or forged entitlement input before querying", async raw => {
  const f = fixture(); await expect(f.app.run(raw, { headers })).rejects.toMatchObject({ code: "CUSTOMER_REFUSED" }); expect(f.query).not.toHaveBeenCalled();
 });
});
