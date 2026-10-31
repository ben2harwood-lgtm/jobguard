import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { exactPenceV1 } from "./cumulative-fee.js";
const id=z.string().uuid();
const hash=z.string().regex(/^[a-f0-9]{64}$/u);
const common={version:z.literal("payment-fee-command.v1"),commandId:id};
export const paymentFeeCommandV1=z.discriminatedUnion("action",[
 z.object({...common,action:z.literal("prepare"),paymentId:id}).strict(),
 z.object({...common,action:z.literal("approve"),statementId:id,statementHash:hash}).strict(),
 z.object({...common,action:z.literal("dispute"),statementId:id}).strict(),
]);
export type PaymentFeeCommand=z.infer<typeof paymentFeeCommandV1>;
export const paymentFeeStatementV1=z.object({
 version:z.literal("payment-fee-statement.v1"),statementId:id,jobId:id,paymentId:id,
 statementHash:hash,sourceHash:hash,revision:z.literal(1),
 qualifyingNet:exactPenceV1,priorQualifyingNet:exactPenceV1,
 paymentReceivedPence:z.number().int().nonnegative().max(MAX_MONEY_PENCE),
 feePence:z.number().int().nonnegative().max(MAX_MONEY_PENCE),
 priorFeePence:z.number().int().nonnegative().max(MAX_MONEY_PENCE),
 cumulativeFeePence:z.number().int().nonnegative().max(MAX_MONEY_PENCE),
 policyVersion:z.literal("reference_fee_policy_v3"),environment:z.literal("synthetic_demo"),
 productionEnabled:z.literal(false),realExternalActions:z.literal(0),
}).strict();
export type PaymentFeeStatement=z.infer<typeof paymentFeeStatementV1>;
export const paymentFeeViewV1=z.object({
 version:z.literal("payment-fee-view.v1"),jobId:id,
 receipts:z.array(id),statements:z.array(z.object({statement:paymentFeeStatementV1,
 state:z.enum(["awaiting_approval","approved","disputed","source_changed","approval_expired","approval_revoked"])}).strict()),
 standingAuthority:z.null(),productionEnabled:z.literal(false),realExternalActions:z.literal(0),
}).strict();
export class PaymentFeeStatementError extends Error {
 readonly code="INVALID_PAYMENT_FEE_COMMAND";
 constructor(){super("INVALID_PAYMENT_FEE_COMMAND");}
}
export function parsePaymentFeeCommand(raw:unknown):PaymentFeeCommand {
 const result=paymentFeeCommandV1.safeParse(raw);
 if(!result.success)throw new PaymentFeeStatementError();
 return result.data;
}
