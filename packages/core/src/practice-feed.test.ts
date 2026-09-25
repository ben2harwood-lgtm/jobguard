import { describe, expect, it } from "vitest";
import { generatedPracticeFeedEvents, practiceFeedAdapterEventV1, practiceFeedCommandV1, practiceFeedQueryV1, projectPracticeFeedMovements } from "./practice-feed.js";
const base = { version: "practice-feed-command.v1", commandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 0 };
const events = (scenario: Parameters<typeof generatedPracticeFeedEvents>[0]) => generatedPracticeFeedEvents(scenario).map(event => ({ ...event, sourceHash: "a".repeat(64) }));
describe("M4-7-S deterministic practice feed", () => {
  it("accepts versioned bounded commands and pagination", () => {
    expect(practiceFeedCommandV1.parse({ ...base, action: "advance", scenario: "pending_384" }).action).toBe("advance");
    expect(practiceFeedQueryV1.parse({ version: "practice-feed-query.v1", limit: "1", cursor: "0" })).toMatchObject({ limit: 1, cursor: "0" });
    for (const query of [{ limit: 0 }, { limit: 51 }, { cursor: "-1" }, { cursor: "1.5" }, { tenantId: "forged" }]) expect(practiceFeedQueryV1.safeParse({ version: "practice-feed-query.v1", ...query }).success).toBe(false);
  });
  it.each(["amountPence", "grossPence", "settled", "tenantId", "accountId", "event", "environment", "signature"])("refuses browser authority field %s", field => {
    expect(practiceFeedCommandV1.safeParse({ ...base, action: "advance", scenario: "settled_384", [field]: "forged" }).success).toBe(false);
  });
  it("pending is not settled or allocated, and settlement is never allocation", () => {
    const pending = projectPracticeFeedMovements("account", events("pending_384"), false);
    expect(pending).toMatchObject([{ grossPence: 38400, state: "pending", allocatedEligibleNetPence: 0, eligibleForAllocation: false }]);
    const settled = projectPracticeFeedMovements("account", [...events("pending_384"), ...events("settled_384")], false);
    expect(settled).toMatchObject([{ state: "settled", allocatedEligibleNetPence: 0, eligibleForAllocation: true }]);
    expect(settled[0]!.id).toBe(pending[0]!.id);
  });
  it("replays, overlapping pages, known aliases and out-of-order pending retain one movement", () => {
    const projected = projectPracticeFeedMovements("account", [...events("settled_384"), ...events("replay_event"), ...events("page_overlap"), ...events("alternate_representation"), ...events("pending_384")], false);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ state: "settled", eventIds: ["settled-384", "pending-384", "statement-384"] });
    expect(projectPracticeFeedMovements("other-account", events("settled_384"), false)[0]!.id).not.toBe(projected[0]!.id);
  });
  it("holds both possible duplicates, and reconciliation preserves all source identities", () => {
    const source = [...events("settled_384"), ...events("unknown_duplicate")];
    const held = projectPracticeFeedMovements("account", source, false);
    expect(held).toHaveLength(2); expect(held.every(movement => !movement.eligibleForAllocation)).toBe(true);
    expect(held[1]!.state).toBe("possible_duplicate");
    const reconciled = projectPracticeFeedMovements("account", source, true);
    expect(reconciled).toHaveLength(1); expect(reconciled[0]).toMatchObject({ state: "settled", eligibleForAllocation: true, allocatedEligibleNetPence: 0, eventIds: ["settled-384", "unknown-384"] });
  });
  it("strict adapter schema refuses non-synthetic, arbitrary event identity or money", () => {
    const event = generatedPracticeFeedEvents("settled_384")[0]!;
    for (const extra of [{ environment: "production" }, { environment: "production_billing" }, { environment: "pilot_no_charge" }, { grossPence: 38500 }, { grossPence: 1.5 }, { eventId: "forged" }, { currency: "EUR" }]) expect(practiceFeedAdapterEventV1.safeParse({ ...event, ...extra }).success).toBe(false);
  });
});
