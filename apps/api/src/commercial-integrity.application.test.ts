import { afterEach, describe, expect, it, vi } from "vitest";
import { CommercialIntegrityApplication } from "./commercial-integrity.application.js";
import { PracticeAccess } from "./practice-access.js";
afterEach(()=>vi.restoreAllMocks());
describe("commercial integrity API boundary",()=>{
 it("refuses the pending D11 production path",async()=>{
  await expect(new CommercialIntegrityApplication({} as never,undefined,"production").view("job")).rejects.toThrow("D11_PRODUCTION_PATH_REFUSED_PROPOSED");
 });
 it("only appends feedback and exposes the frozen accepted cap",async()=>{
  // Projection test with the ownership bridge stubbed; real denials have separate regressions.
  vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({} as never);
  const app=new CommercialIntegrityApplication({} as never,undefined,"synthetic_demo"),before=await app.view("job");
  expect(before.acceptedCapPence).toBe(1200);
  const after=await app.review("job",{version:"commercial-integrity-review.v1",commandId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",findingKey:"accepted_value_variance:1",explanation:"The acceptance source needs correcting",outcome:"dismissed_false_positive"});
  expect(after.acceptedCapPence).toBe(1200);expect(after.feedback).toHaveLength(1);expect(JSON.stringify(after)).not.toMatch(/charge|suspend|penalis|eligibility/i);
  expect((await app.view("other-job")).feedback).toEqual([]);
 });
});
