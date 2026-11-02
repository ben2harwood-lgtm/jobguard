import {beforeEach,describe,expect,it,vi} from "vitest";
const {get,cookie,failure,oldFailure,intake}=vi.hoisted(()=>({get:vi.fn(),cookie:vi.fn(),failure:vi.fn(),oldFailure:vi.fn(),intake:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:cookie})}));
vi.mock("../../../../lib/workspace-server",()=>({workspaceApplication:async()=>({jobSources:{messages:get,intake}})}));
vi.mock("../../../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value,practiceFailure:oldFailure}));
vi.mock("@jobguard/api/workspace",()=>({jobSourceFailure:failure}));
import * as route from "./route";
beforeEach(()=>{get.mockReset();failure.mockReset();oldFailure.mockReset();failure.mockReturnValue({status:404,body:{version:"job-source-error.v1",code:"NOT_FOUND",environment:"synthetic_demo",realExternalActions:0}});cookie.mockReturnValue({value:"t".repeat(43)});vi.stubEnv("JOBGUARD_ENV","synthetic_demo")});
describe("SV-7A Next read adapter",()=>{
 it("SV7A-02 SV7A-18 SV7A-23 shared persisted reads retain identical bodies/headers ",async()=>{
  const result={notice:"constant",messages:[{fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},actualTesterMembershipId:crypto.randomUUID()}]};get.mockResolvedValue(result);
  for(let n=0;n<2;n++){const response=await route.GET(new Request("https://fictional.invalid/api/jobs/id/customer-messages"),{params:Promise.resolve({id:"job"})});expect(await response.json()).toEqual(result);expect(response.headers.get("cache-control")).toBe("no-store")}
  expect(get.mock.calls).toEqual([["job",{}],["job",{}]]);
 });
 it("SV7A-07 SV7A-23 unauthenticated callers get the same refusal before composition",async()=>{
  cookie.mockReturnValue(undefined);failure.mockReturnValue({status:401,body:{version:"job-source-error.v1",code:"UNAUTHENTICATED",environment:"synthetic_demo",realExternalActions:0}});const response=await route.GET(new Request("https://fictional.invalid/"),{params:Promise.resolve({id:"unknown"})});expect(response.status).toBe(401);expect(await response.json()).toEqual({version:"job-source-error.v1",code:"UNAUTHENTICATED",environment:"synthetic_demo",realExternalActions:0});expect(failure).toHaveBeenCalledWith(expect.objectContaining({code:"UNAUTHENTICATED"}));expect(get).not.toHaveBeenCalled();
 });
 it("SV7A-23 read failures use the same shared typed mapping as Nest",async()=>{
  const error=new Error("invalid authority");get.mockRejectedValue(error);oldFailure.mockReturnValue(new Response(JSON.stringify({code:"different"}),{status:403}));
  const response=await route.GET(new Request("https://fictional.invalid/"),{params:Promise.resolve({id:"job"})});expect(response.status).toBe(404);expect(await response.json()).toEqual({version:"job-source-error.v1",code:"NOT_FOUND",environment:"synthetic_demo",realExternalActions:0});expect(failure).toHaveBeenCalledWith(error);expect(oldFailure).not.toHaveBeenCalled();
 });
 it("SV7A-21 real mode is refused before source reads",async()=>{
  vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");failure.mockReturnValue({status:403,body:{version:"job-source-error.v1",code:"SYNTHETIC_MODE_REQUIRED",environment:"synthetic_demo",realExternalActions:0}});const response=await route.GET(new Request("https://fictional.invalid/"),{params:Promise.resolve({id:"job"})});expect(response.status).toBe(403);expect(await response.json()).toEqual({version:"job-source-error.v1",code:"SYNTHETIC_MODE_REQUIRED",environment:"synthetic_demo",realExternalActions:0});expect(failure).toHaveBeenCalledWith(expect.objectContaining({code:"SYNTHETIC_MODE_REQUIRED"}));expect(get).not.toHaveBeenCalled();
 });
 it("POST records through the shared checked intake with 201 and no-store",async()=>{
  intake.mockResolvedValue({version:"job-source-intake-receipt.v1"});
  const response=await route.POST(new Request("https://fictional.invalid/api/jobs/id/customer-messages",{method:"POST",body:'{"text":"x"}'}),{params:Promise.resolve({id:"job"})});
  expect(response.status).toBe(201);expect(response.headers.get("cache-control")).toBe("no-store");expect(intake).toHaveBeenCalledWith("job","customer_message",{text:"x"});
 });
 it("POST without a session or with malformed JSON records nothing",async()=>{
  intake.mockReset();cookie.mockReturnValue(undefined);failure.mockReturnValue({status:401,body:{code:"UNAUTHENTICATED"}});
  expect((await route.POST(new Request("https://fictional.invalid",{method:"POST",body:"{}"}),{params:Promise.resolve({id:"job"})})).status).toBe(401);
  cookie.mockReturnValue({value:"t".repeat(43)});failure.mockReturnValue({status:400,body:{code:"INVALID_JOB_SOURCE_INPUT"}});
  expect((await route.POST(new Request("https://fictional.invalid",{method:"POST",body:"{"}),{params:Promise.resolve({id:"job"})})).status).toBe(400);
  expect(intake).not.toHaveBeenCalled();
 });
});
