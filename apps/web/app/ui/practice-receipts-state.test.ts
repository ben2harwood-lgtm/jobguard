import { describe, expect, it } from "vitest";
import { practiceFeedCommandV1 } from "@jobguard/core";
import {
  advanceCommand, connectCommand, disconnectCommand, failureFromResponse, initialUi, matchReceiptCommand, movementStateLabels, mutationsPaused, nextUi,
  reconcileCommand, receiptHintLabels, receiptStatusLabels, stepLabels, TRANSPORT_UNKNOWN, type FeedUi,
} from "./practice-receipts-state";

const payment = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
describe("practice receipts wording and commands", () => {
  it("uses the exact plan wording for each movement state, and no wording is shared between states", () => {
    expect(movementStateLabels).toEqual({
      pending: "Pending — cannot qualify",
      settled: "Simulated settled movement",
      possible_duplicate: "Possible duplicate movement — review needed",
    });
  });
  it("has distinct receipt wording for every qualification status and reason, none reusing a movement-state label", () => {
    expect(receiptStatusLabels.attested_only).toBe("Builder-attested only — cannot qualify yet");
    expect(receiptStatusLabels.qualifies).toBe("Qualifies — verified by a simulated settled movement");
    expect(receiptStatusLabels.reversed).toBe("Reversed — no longer qualifies");
    const hints = Object.values(receiptHintLabels), states = Object.values(movementStateLabels);
    expect(new Set(hints).size).toBe(hints.length);
    for (const text of [...hints, ...Object.values(receiptStatusLabels)]) expect(states).not.toContain(text);
    expect(Object.keys(receiptHintLabels).sort()).toEqual(["duplicate_held", "matched", "movement_already_matched", "movement_used_by_reversed_receipt", "no_generated_amount", "no_movement_yet", "pending", "ready_to_match", "reversed"]);
  });
  it("builds only commands the strict server schema accepts, each with a fresh command id and the saved revision", () => {
    const built = [
      connectCommand(0), advanceCommand(1, "receipt-384", "pending"), reconcileCommand(2, "receipt-384"),
      matchReceiptCommand(3, "receipt-384", payment), disconnectCommand(4),
    ];
    for (const command of built) expect(() => practiceFeedCommandV1.parse(command)).not.toThrow();
    expect(new Set(built.map((command) => command.commandId)).size).toBe(built.length);
    expect(built.map((command) => command.expectedRevision)).toEqual([0, 1, 2, 3, 4]);
    for (const command of built) expect(Object.keys(command).sort()).not.toEqual(expect.arrayContaining(["grossPence"]));
  });
  it("names every generated step", () => {
    expect(stepLabels.map(([value]) => value)).toEqual(["pending", "settled", "replay", "page_overlap", "alternate_representation", "unknown_duplicate"]);
  });
  it("separates a rejected command from an unknown transport result", () => {
    expect(failureFromResponse(409, { version: "practice-feed-error.v1", code: "PRACTICE_FEED_MOVEMENT_NOT_SETTLED" })).toMatchObject({ kind: "rejected", message: expect.stringContaining("not settled") });
    expect(failureFromResponse(409, { code: "PRACTICE_FEED_STALE_REVISION" })).toMatchObject({ kind: "rejected", message: expect.stringContaining("changed") });
    expect(failureFromResponse(503, { code: "DATABASE_UNAVAILABLE" })).toMatchObject({ kind: "unknown" });
    expect(failureFromResponse(500, "not json")).toMatchObject({ kind: "unknown" });
    expect(failureFromResponse(400, { code: "SOMETHING_NEW" })).toMatchObject({ kind: "rejected" });
    expect(TRANSPORT_UNKNOWN).toMatchObject({ kind: "unknown", message: expect.stringContaining("unknown") });
  });
});

describe("unknown-outcome pause survives until a successful saved-state read", () => {
  const run = (...events: Parameters<typeof nextUi>[1][]) => events.reduce<FeedUi>((state, event) => nextUi(state, event), initialUi);
  it("starts unpaused and shows nothing", () => {
    expect(initialUi).toEqual({ failure: null, reconcile: false });
    expect(mutationsPaused(initialUi, false)).toBe(false);
  });
  it("pauses on an unknown POST result and stays paused through a failed reload", () => {
    const paused = run({ type: "post_started" }, { type: "post_unknown" });
    expect(paused).toMatchObject({ reconcile: true, failure: TRANSPORT_UNKNOWN });
    expect(mutationsPaused(paused, false)).toBe(true);
    const stillPaused = run({ type: "post_started" }, { type: "post_unknown" }, { type: "load_started" }, { type: "load_failed" });
    expect(stillPaused.reconcile).toBe(true);
    expect(mutationsPaused(stillPaused, false)).toBe(true);
    // A failed read after an unresolved write must not claim that nothing changed.
    expect(stillPaused.failure).toMatchObject({ kind: "unknown", message: expect.stringContaining("stay paused") });
    expect(stillPaused.failure!.message).not.toContain("Nothing was changed");
    // load_started alone keeps the pause and the explanation while the retry is in flight.
    expect(run({ type: "post_unknown" }, { type: "load_started" })).toMatchObject({ reconcile: true, failure: TRANSPORT_UNKNOWN });
  });
  it("lifts the pause only after a successful read", () => {
    const resolved = run({ type: "post_unknown" }, { type: "load_started" }, { type: "load_failed" }, { type: "load_started" }, { type: "load_ok" });
    expect(resolved).toEqual({ failure: null, reconcile: false });
    expect(mutationsPaused(resolved, false)).toBe(false);
  });
  it("a plain first-load failure is retryable and says nothing was changed, without pausing changes it never attempted", () => {
    const failed = run({ type: "load_started" }, { type: "load_failed" });
    expect(failed).toMatchObject({ reconcile: false, failure: { kind: "rejected", message: expect.stringContaining("Nothing was changed") } });
  });
  it("a definite rejection is shown but does not pause, and a later success clears it", () => {
    const rejected = run({ type: "post_started" }, { type: "post_rejected", failure: failureFromResponse(409, { code: "PRACTICE_FEED_STALE_REVISION" }) });
    expect(rejected).toMatchObject({ reconcile: false, failure: { kind: "rejected" } });
    expect(mutationsPaused(rejected, false)).toBe(false);
    expect(run({ type: "post_rejected", failure: { kind: "rejected", message: "x" } }, { type: "post_started" }, { type: "post_ok" })).toEqual(initialUi);
  });
  it("is paused while a request is in flight regardless of reconciliation", () => {
    expect(mutationsPaused(initialUi, true)).toBe(true);
  });
});
