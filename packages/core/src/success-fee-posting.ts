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
export type SuccessFeeErrorCode="INVALID_SUCCESS_FEE_COMMAND"|"SUCCESS_FEE_DEPENDENCY_BOUND"|"SUCCESS_FEE_FORBIDDEN";
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
/** No amounts or history are represented as current qualification while the proof adapter is absent. */
export const successFeeAvailabilityV1=z.object({
 version:z.literal("success-fee-availability.v1"),jobId:id,environment:z.literal("synthetic_demo"),
 state:z.literal("dependency_bound"),dependency:z.literal("accepted_attribution_source_adapter"),
 productionEnabled:z.literal(false),realExternalActions:z.literal(0),
}).strict();
export type SuccessFeeAvailability=z.infer<typeof successFeeAvailabilityV1>;
