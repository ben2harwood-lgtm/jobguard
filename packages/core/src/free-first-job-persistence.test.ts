import { describe, expect, it } from "vitest";
import { admissionPrerequisites, persistedTrialFactsV1 } from "./free-first-job-persistence.js";
const facts = {version:"free-first-job-persisted-facts.v1", environment:"synthetic_demo", verifiedIdentity:true, sufficientIdentity:true, completedSameBusinessCard:false, distinctPriorActivation:false, targetAlreadyActive:false} as const;
describe("MON3 B persisted prerequisites (never admission authority)",()=>{
 it("IDENTITY-01 no unresolved identity skip",()=>{
  expect(admissionPrerequisites({...facts,verifiedIdentity:false})).toBe("identity_required");
  expect(admissionPrerequisites({...facts,sufficientIdentity:false})).toBe("identity_required");
  expect(admissionPrerequisites(facts)).toBe("awaiting_c");
 });
 it("CARD-01 every distinct second activation needs a completed same-business card",()=>{
  expect(admissionPrerequisites({...facts,distinctPriorActivation:true})).toBe("card_required");
  expect(admissionPrerequisites({...facts,distinctPriorActivation:true,completedSameBusinessCard:true})).toBe("awaiting_c");
 });
 it("LIVE-01 already active is not another trial",()=>expect(admissionPrerequisites({...facts,targetAlreadyActive:true})).toBe("existing_job"));
 it("strict synthetic schema rejects browser facts and policy switches",()=>{
  for(const value of [{...facts,environment:"production"},{...facts,enabled:true},{...facts,verifiedIdentity:"true"}]) expect(persistedTrialFactsV1.safeParse(value).success).toBe(false);
 });
});
