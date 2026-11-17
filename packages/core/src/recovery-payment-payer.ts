import { z } from "zod";

const identifiers = { version: z.literal("recovery-payment-payer-command.v1"), commandId: z.string().uuid(), caseId: z.string().uuid(), sourceEventId: z.string().uuid(), expectedMarkRevision: z.number().int().nonnegative().max(2_147_483_646) };
/** One explicit owner command for one original customer payment; authority comes from the session. */
export const recoveryPaymentPayerCommandV1 = z.discriminatedUnion("action", [
 z.object({ ...identifiers, action: z.literal("mark_customer_own"), evidenceId: z.string().uuid() }).strict(),
 z.object({ ...identifiers, action: z.literal("withdraw_mark") }).strict(),
]);
export const recoveryPaymentPayerMarkResultV1 = z.object({ id: z.string().uuid(), revision: z.number().int().positive(), sourceEventId: z.string().uuid(), state: z.enum(["customer_own", "withdrawn"]), evidenceId: z.string().uuid().nullable() }).strict()
 .refine(row => (row.state === "customer_own") === (row.evidenceId !== null), { message: "Evidence must match mark state", path: ["evidenceId"] });
export type RecoveryPaymentPayerMarkResult = z.infer<typeof recoveryPaymentPayerMarkResultV1>;
export const RECOVERY_PAYMENT_PAYER_REFUSALS = ["PAYER_MARK_FORBIDDEN", "PAYER_MARK_SOURCE_REQUIRED", "PAYER_MARK_NOT_CUSTOMER_PAYMENT", "PAYER_MARK_NOT_INSURER_JOB", "PAYER_MARK_STALE_REVISION", "PAYER_MARK_STATE_CONFLICT", "PAYER_MARK_EVIDENCE_REQUIRED"] as const;
export class RecoveryPaymentPayerError extends Error {
 constructor(readonly code: typeof RECOVERY_PAYMENT_PAYER_REFUSALS[number] | "INVALID_COMMAND") { super(code); }
}
