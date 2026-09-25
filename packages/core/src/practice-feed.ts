import { z } from "zod";

export const practiceFeedScenarioV1 = z.enum([
  "pending_384", "settled_384", "replay_event", "page_overlap", "alternate_representation", "unknown_duplicate",
]);
const commandBase = {
  version: z.literal("practice-feed-command.v1"), commandId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
};
export const practiceFeedCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("connect") }).strict(),
  z.object({ ...commandBase, action: z.literal("advance"), scenario: practiceFeedScenarioV1 }).strict(),
  z.object({ ...commandBase, action: z.literal("disconnect") }).strict(),
  z.object({ ...commandBase, action: z.literal("reconcile_duplicate") }).strict(),
]);
export const practiceFeedQueryV1 = z.object({
  version: z.literal("practice-feed-query.v1"),
  cursor: z.string().regex(/^(0|[1-9][0-9]{0,5})$/u).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export const practiceFeedAdapterEventV1 = z.object({
  version: z.literal("practice-feed-event.v1"), environment: z.literal("synthetic_demo"),
  eventId: z.enum(["pending-384", "settled-384", "statement-384", "unknown-384"]),
  underlyingMovementId: z.enum(["receipt-384", "unresolved-384"]),
  representationId: z.enum(["feed-384", "statement-line-384", "unidentified-line-384"]),
  grossPence: z.literal(38400), currency: z.literal("GBP"),
  state: z.enum(["pending", "settled", "possible_duplicate"]),
}).strict();
export type PracticeFeedQuery = z.infer<typeof practiceFeedQueryV1>;
export type PracticeFeedCommand = z.infer<typeof practiceFeedCommandV1>;
export type PracticeFeedScenario = z.infer<typeof practiceFeedScenarioV1>;
export type PracticeFeedAdapterEvent = z.infer<typeof practiceFeedAdapterEventV1>;
export type PracticeFeedMovement = Readonly<{
  id: string; underlyingMovementId: string; grossPence: number; currency: "GBP";
  state: "pending" | "settled" | "possible_duplicate"; allocatedEligibleNetPence: 0;
  eligibleForAllocation: boolean; eventIds: string[]; sourceHashes: string[];
}>;
export type PracticeFeedView = Readonly<{
  version: "practice-feed-view.v1"; environment: "synthetic_demo"; scenario: "recovery-18800";
  jobId: string; accountId: string | null; feedState: "not_connected" | "connected" | "disconnected";
  revision: number; movements: PracticeFeedMovement[]; eventCount: number; nextCursor: string | null;
  realExternalActions: 0;
}>;

/** Fixed synthetic adapter input. No amount, settlement fact, account or tenant comes from a browser. */
export function generatedPracticeFeedEvents(scenario: PracticeFeedScenario): PracticeFeedAdapterEvent[] {
  const base = { version: "practice-feed-event.v1", environment: "synthetic_demo", grossPence: 38400, currency: "GBP" } as const;
  const pending: PracticeFeedAdapterEvent = { ...base, eventId: "pending-384", underlyingMovementId: "receipt-384", representationId: "feed-384", state: "pending" };
  const settled: PracticeFeedAdapterEvent = { ...base, eventId: "settled-384", underlyingMovementId: "receipt-384", representationId: "feed-384", state: "settled" };
  switch (scenario) {
    case "pending_384": return [pending];
    case "settled_384": case "replay_event": return [settled];
    case "page_overlap": return [pending, settled];
    case "alternate_representation": return [{ ...settled, eventId: "statement-384", representationId: "statement-line-384" }];
    case "unknown_duplicate": return [{ ...base, eventId: "unknown-384", underlyingMovementId: "unresolved-384", representationId: "unidentified-line-384", state: "possible_duplicate" }];
  }
}

/** Monotone factual projection: late pending events cannot undo a settled fact. */
export function projectPracticeFeedMovements(
  accountId: string,
  events: ReadonlyArray<PracticeFeedAdapterEvent & { sourceHash: string }>,
  duplicateReconciled: boolean,
): PracticeFeedMovement[] {
  const unresolved = !duplicateReconciled && events.some(event => event.state === "possible_duplicate");
  const grouped = new Map<string, Array<PracticeFeedAdapterEvent & { sourceHash: string }>>();
  for (const event of events) {
    const key = duplicateReconciled && event.underlyingMovementId === "unresolved-384" ? "receipt-384" : event.underlyingMovementId;
    const rows = grouped.get(key) ?? [];
    if (!rows.some(row => row.eventId === event.eventId)) rows.push(event);
    grouped.set(key, rows);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
    const state = key === "unresolved-384" ? "possible_duplicate" : rows.some(row => row.state === "settled") ? "settled" : "pending";
    return { id: `${accountId}:${key}`, underlyingMovementId: `${accountId}:${key}`, grossPence: 38400,
      currency: "GBP", state, allocatedEligibleNetPence: 0, eligibleForAllocation: state === "settled" && !unresolved,
      eventIds: rows.map(row => row.eventId), sourceHashes: rows.map(row => row.sourceHash) };
  });
}
