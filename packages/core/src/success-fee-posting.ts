import { z } from "zod";
import { calculateCumulativeFee, exactPenceV1 } from "./cumulative-fee.js";
import { MAX_MONEY_PENCE } from "./money.js";

const id=z.string().uuid();
const revision=z.number().int().safe().nonnegative();
const command={version:z.literal("success-fee-command.v1"),commandId:id,expectedPostingRevision:revision};
/** Intents only. Neither a client hash nor schema validity constitutes approval. */
export const successFeeCommandV1=z.discriminatedUnion("action",[
 z.object({...command,action:z.literal("review")}).strict(),
 z.object({...command,action:z.literal("approve"),reviewId:id,statementHash:z.string().regex(/^[a-f0-9]{64}$/u)}).strict(),
]);
export type SuccessFeeCommand=z.infer<typeof successFeeCommandV1>;
export type SuccessFeeErrorCode="INVALID_SUCCESS_FEE_COMMAND"|"SUCCESS_FEE_DEPENDENCY_BOUND"|"SUCCESS_FEE_FORBIDDEN"|"SUCCESS_FEE_REVIEW_REQUIRED"|"SUCCESS_FEE_SOURCE_CHANGED"|"SUCCESS_FEE_STALE"|"SUCCESS_FEE_IDEMPOTENCY_CONFLICT";
export class SuccessFeeError extends Error {
 constructor(readonly code:SuccessFeeErrorCode="INVALID_SUCCESS_FEE_COMMAND"){super(code);this.name="SuccessFeeError";}
}
export function parseSuccessFeeCommand(raw:unknown):SuccessFeeCommand {
 const parsed=successFeeCommandV1.safeParse(raw);
 if(!parsed.success)throw new SuccessFeeError();
 return parsed.data;
}
/** Reference arithmetic only; these inputs never cross the HTTP command boundary. */
export const successFeeProposalInputV1=z.object({
 version:z.literal("success-fee-proposal.v1"),environment:z.literal("synthetic_reference"),
 qualifyingPrincipal:exactPenceV1,priorPostedPrincipalPence:z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE),
 compensatesDerivationId:id.nullable(),
}).strict();
export function calculateSuccessFeeProposal(raw:unknown){
 const parsed=successFeeProposalInputV1.safeParse(raw);
 if(!parsed.success)throw new SuccessFeeError();
 const input=parsed.data;
 const result=calculateCumulativeFee({version:"cumulative-fee.v1",
  rate:{version:"fee-rate.v1",policyVersion:"reference_fee_policy_v3",numerator:"1",denominator:"10"},
  cumulativeQualifyingPrincipal:input.qualifyingPrincipal,priorNetPostedPence:input.priorPostedPrincipalPence,
  priorPolicyVersion:"reference_fee_policy_v3",compensatesDerivationId:input.compensatesDerivationId});
 return Object.freeze({version:"success-fee-proposal.v1" as const,environment:input.environment,
  policyVersion:"reference_fee_policy_v3" as const,roundingPolicy:result.roundingPolicy,
  qualifyingPrincipal:Object.freeze({...input.qualifyingPrincipal}),successFeePrincipal:result.cumulativeFee,
  priorPostedPrincipalPence:input.priorPostedPrincipalPence,postingDelta:result.postingDelta,
  compensatesDerivationId:result.compensatesDerivationId,proposed:true as const,productionEnabled:false as const,realExternalActions:0 as const});
}
/** Availability discloses no source counts, money or qualification before review. */
const availability={
 version:z.literal("success-fee-availability.v1"),jobId:id,environment:z.literal("synthetic_demo"),
 productionEnabled:z.literal(false),realExternalActions:z.literal(0),
};
export const successFeeAvailabilityV1=z.discriminatedUnion("state",[
 z.object({...availability,state:z.literal("dependency_bound"),dependency:z.literal("accepted_attribution_source_adapter")}).strict(),
 z.object({...availability,state:z.literal("catch_review_available")}).strict(),
]);
export type SuccessFeeAvailability=z.infer<typeof successFeeAvailabilityV1>;
const pence=z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
export const successFeeStatementV1=z.object({
 version:z.literal("success-fee-statement.v1"),jobId:id,policyVersion:z.literal("reference_fee_policy_v3"),
 roundingPolicy:z.literal("commercial_half_even.v1"),qualifyingPrincipal:exactPenceV1,
 feePence:pence,priorPence:pence,deltaPence:pence,expectedPostingRevision:revision,
 sources:z.array(z.object({assessmentId:id,sourceHash:z.string().regex(/^[a-f0-9]{64}$/u),
  reviewAuthorizationId:id,allocationIds:z.array(id).min(1).max(10000)}).strict()).min(1).max(10000),
 environment:z.literal("synthetic_demo"),productionEnabled:z.literal(false),realExternalActions:z.literal(0),
}).strict().superRefine((value,ctx)=>{
 try {
 const proposal=calculateSuccessFeeProposal({version:"success-fee-proposal.v1",environment:"synthetic_reference",
  qualifyingPrincipal:value.qualifyingPrincipal,priorPostedPrincipalPence:value.priorPence,compensatesDerivationId:null});
 if(proposal.successFeePrincipal.pence!==value.feePence || proposal.postingDelta.pence!==value.deltaPence)
  ctx.addIssue({code:"custom",message:"inconsistent fee arithmetic"});
 } catch { ctx.addIssue({code:"custom",message:"invalid fee arithmetic"}); }
});
export const successFeeResultV1=z.object({
 version:z.literal("success-fee-result.v1"),jobId:id,commandId:id,action:z.enum(["review","approve"]),
 reviewId:id,statementHash:z.string().regex(/^[a-f0-9]{64}$/u),statement:successFeeStatementV1,
 derivationId:id.nullable(),journalId:id.nullable(),postingRevision:revision,replayed:z.boolean(),
 environment:z.literal("synthetic_demo"),productionEnabled:z.literal(false),realExternalActions:z.literal(0),
}).strict().superRefine((value,ctx)=>{
 if(value.statement.jobId!==value.jobId || (value.action==="approve")!==(value.derivationId!==null)
  || (value.action==="approve" && value.statement.deltaPence>0)!==(value.journalId!==null)
  || value.postingRevision!==value.statement.expectedPostingRevision+(value.action==="approve"?1:0))
  ctx.addIssue({code:"custom",message:"inconsistent fee result"});
});
export type SuccessFeeResult=z.infer<typeof successFeeResultV1>;
