import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
const id=z.string().uuid(), hash=z.string().regex(/^[a-f0-9]{64}$/u);
const pence=z.number().int().safe().min(0).max(MAX_MONEY_PENCE);
const common={version:z.literal("simulation-fee-collection-command.v1"),commandId:id};
export const simulationFeeCollectionCommandV1=z.discriminatedUnion("action",[
 z.object({...common,action:z.enum(["collect","refund"]),statementId:id,statementHash:hash,amountPence:pence.refine(p=>p>0)}).strict(),
 z.object({...common,action:z.enum(["redirect","unknown","settle","fail"]),attemptId:id}).strict(),
]);
export const simulationFeeCollectionViewV1=z.object({
 version:z.literal("simulation-fee-collection-view.v1"),jobId:id,
 attempts:z.array(z.object({id,statementId:id,kind:z.enum(["collection","refund"]),amountPence:pence.refine(p=>p>0),state:z.enum(["pending","outcome_unknown","settled","definite_failure"])}).strict()).max(10000),
 settledPrincipal:pence,refundedPrincipal:pence,retainedPrincipal:pence,outstandingPrincipal:pence,refundDue:pence,
 collectionReserved:pence,refundReserved:pence,unknownOutcome:z.boolean(),
}).strict();
export type SimulationFeeCollectionView=z.infer<typeof simulationFeeCollectionViewV1>;
export const simulationFeeCollectionResultV1=z.object({version:z.literal("simulation-fee-collection-result.v1"),commandId:id,attemptId:id,replayed:z.boolean()}).strict();
