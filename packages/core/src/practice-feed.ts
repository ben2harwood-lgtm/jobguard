import { z } from "zod";

/**
 * M4-7-S: synthetic settled movement facts.
 *
 * Everything here is deterministic and provider-neutral. The browser may only name a movement from the
 * fixed catalogue and a generated step; it can never supply an amount, a settlement state, an event
 * identity, an account, a tenant or an environment. A settled movement is a fact about simulated money
 * only: it is never an allocation, a landing, a fee or a qualifying recovery.
 */

const MOVEMENT_KEYS = [
  "receipt-384", "receipt-3000", "receipt-41280", "receipt-24000", "receipt-17280", "receipt-960", "supplier-refund-540",
] as const;
export const practiceMovementKeyV1 = z.enum(MOVEMENT_KEYS);
export type PracticeMovementKey = z.infer<typeof practiceMovementKeyV1>;
/** Only customer-receipt movements can verify a builder-attested customer receipt; a supplier refund never can. */
export const practiceReceiptMovementKeyV1 = z.enum(["receipt-384", "receipt-3000", "receipt-41280", "receipt-24000", "receipt-17280", "receipt-960"]);

export type PracticeMovementKind = "customer_receipt" | "supplier_refund";
export type PracticeMovementFixture = "recovery-18800" | "shadow-30000" | "test-m" | "test-n" | "supplier-refund";
export type PracticeMovementDefinition = Readonly<{
  movement: PracticeMovementKey; grossPence: number; kind: PracticeMovementKind; fixture: PracticeMovementFixture; label: string;
}>;

/** The plan's fixed generated movements, in exact pence (BUILD_PLAN M4-7-S). */
export const practiceMovementCatalogueV1: readonly PracticeMovementDefinition[] = Object.freeze([
  { movement: "receipt-384", grossPence: 38_400, kind: "customer_receipt", fixture: "recovery-18800", label: "£384.00 customer receipt (recovery-18800)" },
  { movement: "receipt-3000", grossPence: 300_000, kind: "customer_receipt", fixture: "recovery-18800", label: "£3,000.00 customer receipt (recovery-18800)" },
  { movement: "receipt-41280", grossPence: 4_128_000, kind: "customer_receipt", fixture: "shadow-30000", label: "£41,280.00 customer receipt (shadow-30000)" },
  { movement: "receipt-24000", grossPence: 2_400_000, kind: "customer_receipt", fixture: "test-m", label: "£24,000.00 customer receipt (Test M)" },
  { movement: "receipt-17280", grossPence: 1_728_000, kind: "customer_receipt", fixture: "test-m", label: "£17,280.00 customer receipt (Test M)" },
  { movement: "receipt-960", grossPence: 96_000, kind: "customer_receipt", fixture: "test-n", label: "£960.00 customer receipt (Test N)" },
  { movement: "supplier-refund-540", grossPence: 54_000, kind: "supplier_refund", fixture: "supplier-refund", label: "£540.00 supplier refund" },
].map((entry) => Object.freeze(entry as PracticeMovementDefinition)));

const definitions = new Map<PracticeMovementKey, PracticeMovementDefinition>(practiceMovementCatalogueV1.map((entry) => [entry.movement, entry]));
export function practiceMovementDefinition(key: PracticeMovementKey): PracticeMovementDefinition {
  const found = definitions.get(key);
  if (!found) throw new Error(`Unknown practice movement ${String(key)}`);
  return found;
}
const catalogueIndex = (key: PracticeMovementKey) => practiceMovementCatalogueV1.findIndex((entry) => entry.movement === key);

export const practiceFeedStepV1 = z.enum(["pending", "settled", "replay", "page_overlap", "alternate_representation", "unknown_duplicate"]);
export type PracticeFeedStep = z.infer<typeof practiceFeedStepV1>;

const commandBase = {
  version: z.literal("practice-feed-command.v1"), commandId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative().max(1_000_000),
};
export const practiceFeedCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("connect") }).strict(),
  z.object({ ...commandBase, action: z.literal("advance"), movement: practiceMovementKeyV1, step: practiceFeedStepV1 }).strict(),
  z.object({ ...commandBase, action: z.literal("reconcile_duplicate"), movement: practiceMovementKeyV1 }).strict(),
  z.object({ ...commandBase, action: z.literal("match_receipt"), movement: practiceReceiptMovementKeyV1, paymentId: z.string().uuid() }).strict(),
  z.object({ ...commandBase, action: z.literal("disconnect") }).strict(),
]);
export type PracticeFeedCommand = z.infer<typeof practiceFeedCommandV1>;

export const practiceFeedQueryV1 = z.object({
  version: z.literal("practice-feed-query.v1"),
  cursor: z.string().regex(/^(0|[1-9][0-9]{0,5})$/u).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export type PracticeFeedQuery = z.infer<typeof practiceFeedQueryV1>;

const eventKinds = ["pending", "settled", "statement", "unknown"] as const;
const kindRules = {
  pending: { state: "pending", identity: "identified", representationId: "feed" },
  settled: { state: "settled", identity: "identified", representationId: "feed" },
  statement: { state: "settled", identity: "identified", representationId: "statement-line" },
  unknown: { state: "possible_duplicate", identity: "unidentified", representationId: "unidentified-line" },
} as const;

/** What the internal deterministic adapter emits. Strict: every field is cross-checked against the fixed catalogue. */
export const practiceFeedAdapterEventV1 = z.object({
  version: z.literal("practice-feed-event.v1"), environment: z.literal("synthetic_demo"),
  eventId: z.string().min(1).max(64), eventKind: z.enum(eventKinds), movementKey: practiceMovementKeyV1,
  identity: z.enum(["identified", "unidentified"]), representationId: z.enum(["feed", "statement-line", "unidentified-line"]),
  grossPence: z.number().int().safe(), currency: z.literal("GBP"),
  state: z.enum(["pending", "settled", "possible_duplicate"]),
}).strict().superRefine((event, context) => {
  const rule = kindRules[event.eventKind];
  const fail = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
  if (event.state !== rule.state) fail("state", "state does not match the event kind");
  if (event.identity !== rule.identity) fail("identity", "identity does not match the event kind");
  if (event.representationId !== rule.representationId) fail("representationId", "representation does not match the event kind");
  if (event.eventId !== `${event.eventKind}-${event.movementKey}`) fail("eventId", "event id is not the fixed generated identity");
  if (event.grossPence !== practiceMovementDefinition(event.movementKey).grossPence) fail("grossPence", "amount is not the fixed catalogue amount");
});
export type PracticeFeedAdapterEvent = z.infer<typeof practiceFeedAdapterEventV1>;
export type PracticeFeedEventKind = PracticeFeedAdapterEvent["eventKind"];
export type HashedPracticeFeedEvent = PracticeFeedAdapterEvent & { sourceHash: string };

/** The only mapping from a generated step to adapter events. No amount, state or identity comes from a browser. */
export function generatedPracticeFeedEvents(movement: PracticeMovementKey, step: PracticeFeedStep): PracticeFeedAdapterEvent[] {
  const event = (eventKind: PracticeFeedEventKind): PracticeFeedAdapterEvent => ({
    version: "practice-feed-event.v1", environment: "synthetic_demo", eventId: `${eventKind}-${movement}`, eventKind,
    movementKey: movement, identity: kindRules[eventKind].identity, representationId: kindRules[eventKind].representationId,
    grossPence: practiceMovementDefinition(movement).grossPence, currency: "GBP", state: kindRules[eventKind].state,
  });
  switch (step) {
    case "pending": return [event("pending")];
    case "settled": case "replay": return [event("settled")];
    case "page_overlap": return [event("pending"), event("settled")];
    case "alternate_representation": return [event("statement")];
    case "unknown_duplicate": return [event("unknown")];
  }
}

export type PracticeFeedMovementState = "pending" | "settled" | "possible_duplicate";
export type PracticeFeedMovement = Readonly<{
  id: string; movementKey: PracticeMovementKey; underlyingMovementId: string; kind: PracticeMovementKind;
  fixture: PracticeMovementFixture; label: string; grossPence: number; currency: "GBP"; state: PracticeFeedMovementState;
  /** A settled movement is a fact only. Allocation is a separate, later, reviewed act and is always nil here. */
  allocatedEligibleNetPence: 0; eligibleForAllocation: boolean; eventIds: string[]; sourceHashes: string[];
}>;

/**
 * Monotone factual projection. Events are a set (identity = event id), so replays and overlapping pages add
 * nothing; a late pending event cannot undo a settled fact; an unidentified duplicate is held as its own
 * movement, and blocks its settled sibling, until it is reconciled.
 */
export function projectPracticeFeedMovements(
  accountId: string,
  events: ReadonlyArray<HashedPracticeFeedEvent>,
  reconciled: ReadonlyArray<PracticeMovementKey>,
): PracticeFeedMovement[] {
  const resolved = new Map<PracticeMovementKey, Map<string, HashedPracticeFeedEvent>>();
  const unidentified = new Map<PracticeMovementKey, Map<string, HashedPracticeFeedEvent>>();
  const put = (table: typeof resolved, event: HashedPracticeFeedEvent) => {
    const rows = table.get(event.movementKey) ?? new Map<string, HashedPracticeFeedEvent>();
    if (!rows.has(event.eventId)) rows.set(event.eventId, event);
    table.set(event.movementKey, rows);
  };
  for (const event of events) {
    if (event.identity === "unidentified" && !reconciled.includes(event.movementKey)) put(unidentified, event);
    else put(resolved, event);
  }
  const movements: Array<{ order: number; tie: number; movement: PracticeFeedMovement }> = [];
  const build = (key: PracticeMovementKey, rows: Map<string, HashedPracticeFeedEvent>, held: boolean): PracticeFeedMovement => {
    const definition = practiceMovementDefinition(key), list = [...rows.values()];
    const state: PracticeFeedMovementState = held ? "possible_duplicate"
      : list.some((event) => event.state === "settled") ? "settled" : "pending";
    const unresolvedSibling = !held && unidentified.has(key);
    return {
      id: held ? `${accountId}:unresolved-${key}` : `${accountId}:${key}`, movementKey: key,
      underlyingMovementId: held ? `unresolved-${key}` : key, kind: definition.kind, fixture: definition.fixture, label: definition.label,
      grossPence: definition.grossPence, currency: "GBP", state, allocatedEligibleNetPence: 0,
      eligibleForAllocation: state === "settled" && !unresolvedSibling,
      eventIds: list.map((event) => event.eventId), sourceHashes: list.map((event) => event.sourceHash),
    };
  };
  for (const [key, rows] of resolved) movements.push({ order: catalogueIndex(key), tie: 0, movement: build(key, rows, false) });
  for (const [key, rows] of unidentified) movements.push({ order: catalogueIndex(key), tie: 1, movement: build(key, rows, true) });
  return movements.sort((a, b) => a.order - b.order || a.tie - b.tie).map((entry) => entry.movement);
}

export type AttestedReceiptInput = Readonly<{ paymentId: string; amountPence: number; currency: "GBP"; reversed: boolean }>;
export type ReceiptMatchRecord = Readonly<{ paymentId: string; movementKey: PracticeMovementKey }>;
export type ReceiptAssessmentReason =
  | "no_generated_amount" | "no_movement_yet" | "pending" | "duplicate_held" | "movement_already_matched"
  | "ready_to_match" | "matched" | "reversed";
export type ReceiptAssessment = Readonly<{
  status: "attested_only" | "qualifies" | "reversed"; reason: ReceiptAssessmentReason; canMatch: boolean;
  candidateMovementKey: PracticeMovementKey | null; matchedMovementKey: PracticeMovementKey | null;
}>;

/**
 * A builder-attested receipt is the builder's own record, not settlement evidence. It qualifies only once it
 * is matched to a settled, identified, unheld simulated movement of exactly its amount, and it stops
 * qualifying if the receipt is reversed. Pure and deterministic: the database enforces the same rules.
 */
export function assessAttestedReceipt(
  receipt: AttestedReceiptInput,
  movements: readonly PracticeFeedMovement[],
  matches: readonly ReceiptMatchRecord[],
): ReceiptAssessment {
  const recorded = matches.find((match) => match.paymentId === receipt.paymentId) ?? null;
  const done = (status: ReceiptAssessment["status"], reason: ReceiptAssessmentReason, candidate: PracticeMovementKey | null, canMatch = false): ReceiptAssessment => ({
    status, reason, canMatch, candidateMovementKey: candidate, matchedMovementKey: recorded?.movementKey ?? null,
  });
  if (receipt.reversed) return done("reversed", "reversed", null);
  if (recorded) return done("qualifies", "matched", recorded.movementKey);
  const candidate = receipt.currency === "GBP"
    ? practiceMovementCatalogueV1.find((entry) => entry.kind === "customer_receipt" && entry.grossPence === receipt.amountPence) ?? null
    : null;
  if (!candidate) return done("attested_only", "no_generated_amount", null);
  if (matches.some((match) => match.movementKey === candidate.movement)) return done("attested_only", "movement_already_matched", candidate.movement);
  const movement = movements.find((entry) => entry.movementKey === candidate.movement && entry.underlyingMovementId === candidate.movement);
  if (!movement) return done("attested_only", "no_movement_yet", candidate.movement);
  if (movement.state === "pending") return done("attested_only", "pending", candidate.movement);
  if (!movement.eligibleForAllocation) return done("attested_only", "duplicate_held", candidate.movement);
  return done("attested_only", "ready_to_match", candidate.movement, true);
}

export type PracticeFeedReceiptView = Readonly<{
  paymentId: string; invoiceId: string; paidOn: string; reference: string; amountPence: number; currency: "GBP";
  reversed: boolean; assessment: ReceiptAssessment;
}>;
export type PracticeFeedConsent = Readonly<{
  version: "practice-feed-consent.v1"; scope: "read_generated_movements"; provider: "none";
  grantedAtRevision: number; revokedAtRevision: number | null;
}>;
export type PracticeFeedView = Readonly<{
  version: "practice-feed-view.v1"; environment: "synthetic_demo"; realExternalActions: 0; jobId: string;
  accountId: string | null; feedState: "not_connected" | "connected" | "disconnected"; consent: PracticeFeedConsent | null;
  revision: number; catalogue: readonly PracticeMovementDefinition[]; movementCount: number; movements: PracticeFeedMovement[];
  receipts: PracticeFeedReceiptView[]; allocatedEligibleNetPence: 0; eventCount: number; nextCursor: string | null;
}>;
