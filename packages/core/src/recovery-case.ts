import { z } from "zod";
import { money } from "./money.js";

export const recoveryCaseTypeV1 = z.enum(["merchant_overcharge", "withheld_customer_payment", "prevention"]);
export const recoveryCaseStateFullV1 = z.enum([
  "identified", "evidence_assembled", "pursuing", "negotiating", "partially_landed", "landed",
  "closed_recovered", "closed_no_recovery", "prevented",
]);
export const recoveryEventTypeV1 = z.enum([
  "assemble_evidence", "start_pursuit", "start_negotiation", "resume_pursuit", "record_landing",
  "close_recovered", "close_no_recovery", "prevent", "write_off", "dispute", "reverse_landing",
]);
export type RecoveryCaseState = z.infer<typeof recoveryCaseStateFullV1>;
export type RecoveryEventType = z.infer<typeof recoveryEventTypeV1>;

const allowed: Readonly<Record<RecoveryCaseState, readonly RecoveryEventType[]>> = {
  identified: ["assemble_evidence", "prevent", "close_no_recovery"],
  evidence_assembled: ["start_pursuit", "start_negotiation", "record_landing", "close_no_recovery", "dispute"],
  pursuing: ["start_negotiation", "record_landing", "close_no_recovery", "write_off", "dispute"],
  negotiating: ["resume_pursuit", "record_landing", "close_no_recovery", "write_off", "dispute"],
  partially_landed: ["record_landing", "write_off", "dispute", "reverse_landing"],
  landed: ["close_recovered", "dispute", "reverse_landing"],
  closed_recovered: ["dispute", "reverse_landing"],
  closed_no_recovery: ["dispute", "reverse_landing"],
  prevented: [],
};

export class RecoveryTransitionError extends Error {
  readonly code = "RECOVERY_TRANSITION_FORBIDDEN";
  constructor(state: RecoveryCaseState, event: RecoveryEventType) { super(`${event} is not allowed from ${state}`); }
}

export function transitionRecoveryCase(input: Readonly<{
  state: RecoveryCaseState; event: RecoveryEventType; claimedPence: number; landedPence: number;
  amountPence?: number;
}>): { state: RecoveryCaseState; landedPence: number; writtenOffPence: number } {
  if (!allowed[input.state].includes(input.event)) throw new RecoveryTransitionError(input.state, input.event);
  const claimed: number = money(input.claimedPence).pence;
  let landed: number = money(input.landedPence).pence;
  let writtenOffPence = 0;
  if (input.event === "record_landing") {
    const amount = money(input.amountPence ?? Number.NaN).pence;
    if (amount <= 0 || landed + amount > claimed) throw new RecoveryTransitionError(input.state, input.event);
    landed += amount;
    return { state: landed === claimed ? "landed" : "partially_landed", landedPence: landed, writtenOffPence };
  }
  if (input.event === "reverse_landing") {
    const amount = money(input.amountPence ?? Number.NaN).pence;
    if (amount <= 0 || amount > landed) throw new RecoveryTransitionError(input.state, input.event);
    landed -= amount;
    return { state: landed ? "partially_landed" : "evidence_assembled", landedPence: landed, writtenOffPence };
  }
  const state: RecoveryCaseState = input.event === "assemble_evidence" ? "evidence_assembled"
    : input.event === "start_pursuit" || input.event === "resume_pursuit" ? "pursuing"
    : input.event === "start_negotiation" || input.event === "dispute" ? "negotiating"
    : input.event === "prevent" ? "prevented"
    : input.event === "close_recovered" ? "closed_recovered"
    : "closed_no_recovery";
  if (input.event === "write_off") writtenOffPence = claimed - landed;
  return { state, landedPence: landed, writtenOffPence };
}

export const recoveryCaseCommandV1 = z.discriminatedUnion("action", [
  z.object({ version:z.literal("recovery-case-command.v1"), action:z.literal("open"), commandId:z.string().uuid(),
    caseType:recoveryCaseTypeV1, claimedNetPence:z.number().int().positive().max(1_000_000_000_000),
    counterparty:z.string().trim().min(1).max(120), book:z.enum(["supplier_cost", "builder_customer"]),
    sourceType:z.enum(["supplier_documents", "customer_invoice"]), sourceRefs:z.array(z.string().trim().min(1).max(160)).min(1).max(6),
    reviewerRef:z.string().trim().min(1).max(200), expectedRevision:z.literal(0) }).strict(),
  z.object({ version:z.literal("recovery-case-command.v1"), action:z.literal("amend_claim"), commandId:z.string().uuid(),
    caseId:z.string().uuid(), claimedNetPence:z.number().int().positive().max(1_000_000_000_000), reviewerRef:z.string().trim().min(1).max(200), expectedRevision:z.number().int().positive() }).strict(),
  z.object({ version:z.literal("recovery-case-command.v1"), action:z.literal("transition"), commandId:z.string().uuid(),
    caseId:z.string().uuid(), eventType:recoveryEventTypeV1, amountPence:z.number().int().positive().max(1_000_000_000_000).optional(),
    reviewerRef:z.string().trim().min(1).max(200), expectedRevision:z.number().int().positive() }).strict(),
]);
export type RecoveryCaseCommand = z.infer<typeof recoveryCaseCommandV1>;
