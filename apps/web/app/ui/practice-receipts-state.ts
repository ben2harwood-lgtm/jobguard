import type { PracticeFeedResponse } from "@jobguard/api/practice-feed-contracts";
import type { PracticeFeedStep, PracticeMovementKey } from "@jobguard/core";

type Movement = PracticeFeedResponse["movements"][number];
type Assessment = PracticeFeedResponse["receipts"][number]["assessment"];

export const movementStateLabels: Readonly<Record<Movement["state"], string>> = {
  pending: "Pending — cannot qualify",
  settled: "Simulated settled movement",
  possible_duplicate: "Possible duplicate movement — review needed",
};
export const receiptStatusLabels: Readonly<Record<Assessment["status"], string>> = {
  attested_only: "Builder-attested only — cannot qualify yet",
  qualifies: "Qualifies — verified by a simulated settled movement",
  reversed: "Reversed — no longer qualifies",
};
export const receiptHintLabels: Readonly<Record<Assessment["reason"], string>> = {
  no_generated_amount: "No generated practice movement has this amount.",
  no_movement_yet: "No practice movement of this amount has arrived yet.",
  pending: "The matching movement is still pending, so this receipt cannot qualify yet.",
  duplicate_held: "The matching movement is held as a possible duplicate until it is reconciled.",
  movement_already_matched: "Another receipt already uses this movement.",
  ready_to_match: "A settled simulated movement of this exact amount is ready to match.",
  matched: "Matched to a simulated settled movement. Nothing has been allocated.",
  reversed: "This receipt was reversed, so it can no longer qualify.",
};
export const stepLabels: ReadonlyArray<readonly [PracticeFeedStep, string]> = [
  ["pending", "Pending event"],
  ["settled", "Settlement event"],
  ["replay", "Replay of the settlement event"],
  ["page_overlap", "Overlapping page (pending and settled)"],
  ["alternate_representation", "Same money as a statement line"],
  ["unknown_duplicate", "Unidentified possible duplicate"],
];

// Commands carry only a fresh id, the saved revision and fixed catalogue names: no amount, state, tenant or account.
const base = (expectedRevision: number) => ({ version: "practice-feed-command.v1" as const, commandId: crypto.randomUUID(), expectedRevision });
export const connectCommand = (revision: number) => ({ ...base(revision), action: "connect" as const });
export const disconnectCommand = (revision: number) => ({ ...base(revision), action: "disconnect" as const });
export const advanceCommand = (revision: number, movement: PracticeMovementKey, step: PracticeFeedStep) => ({ ...base(revision), action: "advance" as const, movement, step });
export const reconcileCommand = (revision: number, movement: PracticeMovementKey) => ({ ...base(revision), action: "reconcile_duplicate" as const, movement });
export const matchReceiptCommand = (revision: number, movement: PracticeMovementKey, paymentId: string) => ({ ...base(revision), action: "match_receipt" as const, movement, paymentId });

export type Failure = Readonly<{ kind: "rejected" | "unknown"; message: string }>;
const rejected: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: "Open this practice job from your own practice session.",
  PRACTICE_FEED_FORBIDDEN: "This practice session cannot change that feed.",
  PRACTICE_FEED_STALE_REVISION: "This practice feed changed since you loaded it. Load the saved state, then try again.",
  PRACTICE_FEED_DISCONNECTED: "The practice feed is disconnected, so it accepts no new events or matches.",
  PRACTICE_FEED_MOVEMENT_NOT_SETTLED: "That movement is not settled yet, so the receipt cannot qualify.",
  PRACTICE_FEED_RECEIPT_MISMATCH: "That receipt does not match the movement amount, or it was reversed.",
  PRACTICE_FEED_RECEIPT_ALREADY_MATCHED: "That receipt or movement is already matched.",
  PRACTICE_FEED_DUPLICATE_HELD: "The movement is held as a possible duplicate. Reconcile it first.",
  PRACTICE_FEED_SETTLEMENT_REQUIRED: "That event needs a settled movement first.",
  PRACTICE_FEED_DUPLICATE_NOT_FOUND: "There is no unreconciled duplicate for that movement.",
};
export const TRANSPORT_UNKNOWN: Failure = { kind: "unknown", message: "The result is unknown. Read the saved practice feed before doing anything else." };
/** A definite 4xx answer is a rejection; anything else leaves the outcome unknown and pauses further changes. */
export function failureFromResponse(status: number, body: unknown): Failure {
  const code = body && typeof body === "object" && "code" in body && typeof (body as { code: unknown }).code === "string" ? (body as { code: string }).code : "";
  if (status >= 400 && status < 500) return { kind: "rejected", message: rejected[code] ?? "The practice feed refused that request. Nothing was changed." };
  return TRANSPORT_UNKNOWN;
}
