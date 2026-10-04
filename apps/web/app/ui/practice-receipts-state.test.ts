import { describe, expect, it } from "vitest";
import { practiceFeedCommandV1 } from "@jobguard/core";
import {
  advanceCommand, connectCommand, disconnectCommand, failureFromResponse, matchReceiptCommand, movementStateLabels, reconcileCommand,
  receiptHintLabels, receiptStatusLabels, stepLabels, TRANSPORT_UNKNOWN,
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
    expect(Object.keys(receiptHintLabels).sort()).toEqual(["duplicate_held", "matched", "movement_already_matched", "no_generated_amount", "no_movement_yet", "pending", "ready_to_match", "reversed"]);
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
