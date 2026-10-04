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
  pursuing: ["start_negotiation", "record_landing", "close_no_recovery", "write_off", "dispute", "reverse_landing"],
  negotiating: ["resume_pursuit", "record_landing", "close_no_recovery", "write_off", "dispute", "reverse_landing"],
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

export class RecoveryClaimAmendmentOnClosedCaseError extends Error {
  readonly code = "RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE";
  constructor() { super("RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE"); }
}

/**
 * A claim amendment must cover the principal already received or written off (RECOVERY_CLAIM_BELOW_SETTLED), and it may not RAISE the
 * claim of a case that is fully received or closed (landed, closed_recovered, closed_no_recovery): that would hide new outstanding
 * principal inside a closed case and let it close as "recovered" without the full claim. The explicit reopen already in the transition
 * table is a dispute; once the case is reopened (negotiating) the claim may rise, the rest must be received, and only then may it close.
 */
export function assertClaimAmendable(input: Readonly<{ state: RecoveryCaseState; currentClaimedPence: number; claimedPence: number; landedPence: number; writtenOffPence: number }>): void {
  assertClaimCoversSettled(input);
  const closedOrFullyReceived = input.state === "landed" || input.state === "closed_recovered" || input.state === "closed_no_recovery";
  if (closedOrFullyReceived && money(input.claimedPence).pence > money(input.currentClaimedPence).pence) throw new RecoveryClaimAmendmentOnClosedCaseError();
}

export class RecoveryClaimBelowSettledError extends Error {
  readonly code = "RECOVERY_CLAIM_BELOW_SETTLED";
  constructor() { super("RECOVERY_CLAIM_BELOW_SETTLED"); }
}

/**
 * A claim can never be amended to less than the money already landed plus the money already
 * written off: outstanding = claimed - landed - writtenOff must stay >= 0 without clamping.
 */
export function assertClaimCoversSettled(input: Readonly<{ claimedPence: number; landedPence: number; writtenOffPence: number }>): void {
  const claimed: number = money(input.claimedPence).pence;
  const settled: number = money(input.landedPence).pence + money(input.writtenOffPence).pence;
  if (claimed < settled) throw new RecoveryClaimBelowSettledError();
}

/**
 * `writtenOffPence` is the cumulative amount already written off by earlier events. The returned
 * `writtenOffPence` is the amount written off by THIS event only (never a running total), so event
 * amounts can be summed. Landing is bounded by claimed - writtenOff - landed, so a later landing
 * after a write-off and a reversal can never re-claim written-off value.
 */
export function transitionRecoveryCase(input: Readonly<{
  state: RecoveryCaseState; event: RecoveryEventType; claimedPence: number; landedPence: number;
  writtenOffPence?: number; amountPence?: number;
}>): { state: RecoveryCaseState; landedPence: number; writtenOffPence: number } {
  if (!allowed[input.state].includes(input.event)) throw new RecoveryTransitionError(input.state, input.event);
  const claimed: number = money(input.claimedPence).pence;
  let landed: number = money(input.landedPence).pence;
  const priorWrittenOff: number = money(input.writtenOffPence ?? 0).pence;
  if (landed + priorWrittenOff > claimed) throw new RecoveryTransitionError(input.state, input.event);
  // Prevention means the money was never paid. Received principal (manual or approved) can never be relabelled "prevented".
  if (input.event === "prevent" && landed > 0) throw new RecoveryTransitionError(input.state, input.event);
  // "Closed — recovered" means the whole CURRENT claim was received (BUILD_PLAN section 5.5); anything less closes by write-off or as no recovery.
  if (input.event === "close_recovered" && landed !== claimed) throw new RecoveryTransitionError(input.state, input.event);
  let writtenOffPence = 0;
  if (input.event === "record_landing") {
    const amount = money(input.amountPence ?? Number.NaN).pence;
    if (amount <= 0 || landed + priorWrittenOff + amount > claimed) throw new RecoveryTransitionError(input.state, input.event);
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
  if (input.event === "write_off") {
    writtenOffPence = claimed - landed - priorWrittenOff;
    if (writtenOffPence <= 0) throw new RecoveryTransitionError(input.state, input.event);
  }
  return { state, landedPence: landed, writtenOffPence };
}

/**
 * A case cites its sources in one of two server-checked ways: a label from this closed catalogue of
 * fictional practice sources, or the id of a RECORDED source (customer invoice, supplier agreement
 * rate, ready supplier document). Ids are only shape-checked here; the database layer resolves each
 * one to a stored row of the right kind for the same tenant and job. Free text is never accepted.
 */
export const recoverySourceCatalogueV1 = {
  supplier_documents: [
    { ref: "Supplier agreement AG-320", kind: "Supplier agreement" },
    { ref: "Delivery note DN-320", kind: "Delivery note" },
    { ref: "Supplier invoice INV-320", kind: "Supplier invoice" },
  ],
  customer_invoice: [{ ref: "Generated customer invoice INV-18800", kind: "Customer invoice" }],
} as const;

export class RecoverySourceError extends Error {
  readonly code = "RECOVERY_SOURCE_NOT_RECOGNISED";
  constructor() { super("RECOVERY_SOURCE_NOT_RECOGNISED"); }
}

const recordedSourceId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isRecordedSourceId = (ref: string): boolean => recordedSourceId.test(ref);

export function describeRecoverySource(ref: string): { ref: string; kind: string; sourceType: "supplier_documents" | "customer_invoice" } | undefined {
  for (const sourceType of ["supplier_documents", "customer_invoice"] as const) {
    const found = recoverySourceCatalogueV1[sourceType].find(entry => entry.ref === ref);
    if (found) return { ref: found.ref, kind: found.kind, sourceType };
  }
  return undefined;
}

/** Shape and split checks only (no database): book, source type and case type must agree, refs are unique, and each is a catalogue label of the right source type or a recorded-id shape. */
export function assertRecoverySources(input: Readonly<{
  caseType: z.infer<typeof recoveryCaseTypeV1>; book: "supplier_cost" | "builder_customer";
  sourceType: "supplier_documents" | "customer_invoice"; sourceRefs: readonly string[];
}>): void {
  const bookMatches = input.book === (input.sourceType === "supplier_documents" ? "supplier_cost" : "builder_customer");
  const caseMatches = input.caseType === "prevention"
    || input.caseType === (input.sourceType === "supplier_documents" ? "merchant_overcharge" : "withheld_customer_payment");
  const unique = new Set(input.sourceRefs);
  const shaped = input.sourceRefs.every(ref => describeRecoverySource(ref)?.sourceType === input.sourceType || isRecordedSourceId(ref));
  if (!bookMatches || !caseMatches || unique.size !== input.sourceRefs.length || !shaped) throw new RecoverySourceError();
}

export const recoveryCaseCommandV1 = z.discriminatedUnion("action", [
  z.object({ version:z.literal("recovery-case-command.v1"), action:z.literal("open"), commandId:z.string().uuid(),
    caseType:recoveryCaseTypeV1, claimedNetPence:z.number().int().positive().max(1_000_000_000_000),
    counterparty:z.string().trim().min(1).max(120), book:z.enum(["supplier_cost", "builder_customer"]),
    sourceType:z.enum(["supplier_documents", "customer_invoice"]), sourceRefs:z.array(z.string().trim().min(1).max(160)).min(1).max(6),
    reviewerRef:z.string().trim().min(1).max(200).optional(), expectedRevision:z.literal(0) }).strict(),
  z.object({ version:z.literal("recovery-case-command.v1"), action:z.literal("amend_claim"), commandId:z.string().uuid(),
    caseId:z.string().uuid(), claimedNetPence:z.number().int().positive().max(1_000_000_000_000), reviewerRef:z.string().trim().min(1).max(200).optional(), expectedRevision:z.number().int().positive() }).strict(),
  z.object({ version:z.literal("recovery-case-command.v1"), action:z.literal("transition"), commandId:z.string().uuid(),
    caseId:z.string().uuid(), eventType:recoveryEventTypeV1, amountPence:z.number().int().positive().max(1_000_000_000_000).optional(),
    reviewerRef:z.string().trim().min(1).max(200).optional(), expectedRevision:z.number().int().positive() }).strict(),
]);
export type RecoveryCaseCommand = z.infer<typeof recoveryCaseCommandV1>;
