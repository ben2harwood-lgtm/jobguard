import { z } from "zod";
import { recoveryCaseCommandV1, recoveryEligibilityCommandV1, recoveryCaseStateFullV1, recoveryCaseTypeV1, money } from "@jobguard/core";
export { recoveryCaseCommandV1, recoveryEligibilityCommandV1 };
// Use core's public money validator for safe integer pence and its shared magnitude limit.
// Principal and posting magnitudes cannot be negative; net job ledger liability is signed.
const signedPence = z.number().refine(value => { try { money(value); return true; } catch { return false; } }, "Invalid bounded integer pence");
const nonnegativePence = signedPence.refine(value => value >= 0, "Principal/posting magnitude must be non-negative");
const eligibilityViewV1=z.object({revision:z.number().int(),caseRevision:z.number().int(),evidenceRevision:z.number().int(),policyVersion:z.literal("reference-d03.v1"),policyRevision:z.number().int(),classification:z.string(),eligibleNetPence:nonnegativePence.nullable(),reason:z.string(),citations:z.array(z.string()),status:z.enum(["reviewed","approved","superseded"]),reviewerRef:z.string()});
export const recoveryCaseViewV1=z.object({id:z.string().uuid(),jobId:z.string().uuid(),caseType:recoveryCaseTypeV1,state:recoveryCaseStateFullV1,claimedNetPence:nonnegativePence,landedNetPence:nonnegativePence,outstandingNetPence:nonnegativePence,writtenOffPence:nonnegativePence,currency:z.literal("GBP"),counterparty:z.string(),book:z.string(),sourceType:z.string(),sourceRefs:z.array(z.string()),sources:z.array(z.object({ref:z.string(),kind:z.string(),label:z.string(),recorded:z.boolean()})),feeJobLiabilityPence:signedPence,feeObligationsPostedPence:nonnegativePence,feeCompensationsPostedPence:nonnegativePence,approvedLandedNetPence:nonnegativePence,revision:z.number().int(),reviewerRef:z.string(),createdDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),eligibility:eligibilityViewV1.nullable()});
const workbenchEnvelope={version:z.literal("recovery-case-workbench.v1"),environment:z.literal("synthetic_demo"),realExternalActions:z.literal(0),cases:z.array(recoveryCaseViewV1)};
/** A plain read of the workbench: the job's cases. It names no affected case because no command produced it. */
export const recoveryCaseListResponseV1=z.object(workbenchEnvelope);
/**
 * The answer to a command that creates or changes a case (open, amend, transition, eligibility review or approval).
 *
 * M4-1-S-R repair 13 (Sol P3-4): `affectedCaseId` is REQUIRED, and must be one of the listed cases. The list is read after the command and can already hold cases another browser
 * opened, so a client may only select the case a command touched by this id. An answer without it, or naming a case that is not in the list, is not a valid answer: the client treats it
 * as unreadable (the command may or may not have been saved) and never picks a case from the list order.
 */
export const recoveryCaseCommandResponseV1=z.object({...workbenchEnvelope,affectedCaseId:z.string().uuid()}).refine(response=>response.cases.some(item=>item.id===response.affectedCaseId),{message:"affectedCaseId must be one of the listed cases",path:["affectedCaseId"]});
export type RecoveryCaseResponse=z.infer<typeof recoveryCaseListResponseV1>;
export type RecoveryCaseCommandResponse=z.infer<typeof recoveryCaseCommandResponseV1>;
