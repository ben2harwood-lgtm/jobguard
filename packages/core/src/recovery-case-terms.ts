import { utcDatetimeV1 } from "./datetime.js";
import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
export const RECOVERY_CASE_TERMS_VERSION="synthetic_recovery_fee_terms.v1" as const;
export const RECOVERY_CASE_TERMS_FEE_POLICY="reference_fee_policy_v3" as const;
export const RECOVERY_CASE_TERMS_ELIGIBILITY_POLICY="reference_recovery_eligibility_policy_v3" as const;
export const RECOVERY_CASE_TERMS_POLICY_STATUS="proposed" as const;
/** Canonical ASCII identifiers only; UUID spelling is normalised before hashing. */
export function recoveryCaseTermsText(caseId:string):string {
 const id=z.guid({ error: "Invalid uuid" }).parse(caseId).toLowerCase();
 return `recovery-case-terms.v1\ncaseId=${id}\ntermsVersion=${RECOVERY_CASE_TERMS_VERSION}\nfeePolicyVersion=${RECOVERY_CASE_TERMS_FEE_POLICY}\neligibilityPolicyVersion=${RECOVERY_CASE_TERMS_ELIGIBILITY_POLICY}\npolicyStatus=${RECOVERY_CASE_TERMS_POLICY_STATUS}`;
}
export const recoveryCaseTermsHash=(caseId:string)=>sha256(recoveryCaseTermsText(caseId));
const identifiers={termsVersion:z.literal(RECOVERY_CASE_TERMS_VERSION),feePolicyVersion:z.literal(RECOVERY_CASE_TERMS_FEE_POLICY),eligibilityPolicyVersion:z.literal(RECOVERY_CASE_TERMS_ELIGIBILITY_POLICY),termsHash:z.string().regex(/^[a-f0-9]{64}$/u)};
export const recoveryCaseTermsCommandV1=z.object({version:z.literal("recovery-case-terms-command.v1"),action:z.literal("approve"),commandId:z.guid({ error: "Invalid uuid" }),caseId:z.guid({ error: "Invalid uuid" }),...identifiers}).strict().refine(v=>v.termsHash===recoveryCaseTermsHash(v.caseId),{message:"Canonical case terms hash required",path:["termsHash"]});
export const recoveryCaseTermsV1=z.object({version:z.literal("recovery-case-terms.v1"),id:z.guid({ error: "Invalid uuid" }),tenantId:z.guid({ error: "Invalid uuid" }),jobId:z.guid({ error: "Invalid uuid" }),caseId:z.guid({ error: "Invalid uuid" }),...identifiers,policyStatus:z.literal(RECOVERY_CASE_TERMS_POLICY_STATUS),environment:z.literal("synthetic_demo"),actorMembershipId:z.guid({ error: "Invalid uuid" }),commandId:z.guid({ error: "Invalid uuid" }),authorizationId:z.guid({ error: "Invalid uuid" }),approvedAt:utcDatetimeV1,realExternalActions:z.literal(0)}).strict().refine(v=>v.termsHash===recoveryCaseTermsHash(v.caseId),{message:"Canonical case terms hash required",path:["termsHash"]});
export type RecoveryCaseTerms=z.infer<typeof recoveryCaseTermsV1>;
