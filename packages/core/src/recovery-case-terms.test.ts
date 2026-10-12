// Written first; pure unit coverage, executed separately from PostgreSQL proofs.
const randomUUID=()=>crypto.randomUUID();
import { describe, expect, it } from "vitest";
import { recoveryCaseTermsCommandV1, recoveryCaseTermsText, recoveryCaseTermsHash, recoveryCaseTermsV1 } from "./recovery-case-terms.js";
const body = () => { const caseId=randomUUID(); return {version:"recovery-case-terms-command.v1",action:"approve",commandId:randomUUID(),caseId,termsVersion:"synthetic_recovery_fee_terms.v1",feePolicyVersion:"reference_fee_policy_v3",eligibilityPolicyVersion:"reference_recovery_eligibility_policy_v3",termsHash:recoveryCaseTermsHash(caseId)}; };
describe("case terms",()=>{
 it("[T1] binds four closed identifiers and the canonical case to SHA-256",()=>{
  const input=body();expect(recoveryCaseTermsCommandV1.parse(input)).toEqual(input);
  expect(recoveryCaseTermsText(input.caseId)).toBe(`recovery-case-terms.v1\ncaseId=${input.caseId}\ntermsVersion=synthetic_recovery_fee_terms.v1\nfeePolicyVersion=reference_fee_policy_v3\neligibilityPolicyVersion=reference_recovery_eligibility_policy_v3\npolicyStatus=proposed`);
  expect(recoveryCaseTermsHash(input.caseId.toUpperCase())).toBe(input.termsHash);
  expect(recoveryCaseTermsHash(randomUUID())).not.toBe(input.termsHash);
 });
 it.each(["termsVersion","feePolicyVersion","eligibilityPolicyVersion","termsHash"])("[T3] refuses another %s",key=>{expect(recoveryCaseTermsCommandV1.safeParse({...body(),[key]:"other"}).success).toBe(false);});
 it.each(["tenantId","actorMembershipId","role","policyStatus","environment","approvedAt","amountPence","rate","recipient"])("[T3] refuses client-selected %s",key=>{expect(recoveryCaseTermsCommandV1.safeParse({...body(),[key]:"invented"}).success).toBe(false);});
 it("[T3] refuses a valid-looking hash for another case",()=>{expect(recoveryCaseTermsCommandV1.safeParse({...body(),termsHash:recoveryCaseTermsHash(randomUUID())}).success).toBe(false);});
 it("[T1] validates the closed response without terms copy or rates",()=>{
  const input=body(),view={version:"recovery-case-terms.v1",id:randomUUID(),tenantId:randomUUID(),jobId:randomUUID(),caseId:input.caseId,termsVersion:input.termsVersion,feePolicyVersion:input.feePolicyVersion,eligibilityPolicyVersion:input.eligibilityPolicyVersion,termsHash:input.termsHash,policyStatus:"proposed",environment:"synthetic_demo",actorMembershipId:randomUUID(),commandId:input.commandId,authorizationId:randomUUID(),approvedAt:new Date().toISOString(),realExternalActions:0};
  expect(recoveryCaseTermsV1.parse(view)).toEqual(view);
  for(const over of [{policyStatus:"approved"},{environment:"production_billing"},{rate:10},{realExternalActions:1}])expect(recoveryCaseTermsV1.safeParse({...view,...over}).success).toBe(false);
 });
});
