import { describe, expect, it, vi } from "vitest";
import { chaseCommand, chaseMessage, chaseSchedule, requireV2Chasing, type ChaseItem } from "./v2-chase-policy.js";
const anchor = Date.parse("2026-11-01T12:00:00Z");
const item: ChaseItem = { id: "e2020000-0000-4000-8000-000000000002", kind: "quote", reference: "Q-42",
  amountPence: 12345, anchor, stoppedReason: null, recipient: "customer@jobguard-v2.invalid" };
describe("V2-K4 fixed local chase policy", () => {
  it("quotes have exactly day 3 and day 7 steps", () => {
    expect(chaseSchedule(item, [], anchor).next).toEqual({ step: 1, due: "2026-11-04T12:00:00.000Z" });
    expect(chaseSchedule(item, [1], anchor).next).toEqual({ step: 2, due: "2026-11-08T12:00:00.000Z" });
    expect(chaseSchedule(item, [1, 2], anchor).next).toBeNull();
  });
  it("invoices have exactly due+3 and due+10 steps", () => {
    expect(chaseSchedule({ ...item, kind: "invoice" }, [], anchor).next).toEqual({ step: 1, due: "2026-11-04T12:00:00.000Z" });
    expect(chaseSchedule({ ...item, kind: "invoice" }, [1], anchor).next).toEqual({ step: 2, due: "2026-11-11T12:00:00.000Z" });
    expect(chaseSchedule({ ...item, kind: "invoice" }, [1, 2], anchor).next).toBeNull();
  });
  it.each(["paid", "disputed", "pilot_no_charge", "reply", "decision", "builder_stop", "missing_current_due_or_dispute_facts"])("suppresses %s", stoppedReason => {
    expect(chaseSchedule({ ...item, stoppedReason }, [], anchor)).toEqual({ next: null, skipped: [] });
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN])("rejects unsafe or empty amounts %s", amountPence => {
    expect(chaseSchedule({ ...item, amountPence }, [], anchor)).toEqual({ next: null, skipped: [] });
  });
  it.each([["quote", 7], ["invoice", 10]] as const)("uses only the two scheduled %s dates across missed runs", (kind, lastDay) => {
    const day = 86_400_000;
    const source = { ...item, kind };
    const first = { step: 1, due: new Date(anchor + 3 * day).toISOString() };
    const last = { step: 2, due: new Date(anchor + lastDay * day).toISOString() };
    const at = (elapsed: number, recorded: number[] = []) => chaseSchedule(source, recorded, anchor + elapsed);
    expect(at(3 * day - 1)).toEqual({ next: first, skipped: [] });
    expect(at(3 * day)).toEqual({ next: first, skipped: [] });
    expect(at(5 * day)).toEqual({ next: first, skipped: [] });
    expect(at(5 * day + 1)).toEqual({ next: last, skipped: [first] });
    expect(at(lastDay * day)).toEqual({ next: last, skipped: [first] });
    expect(at((lastDay + 2) * day)).toEqual({ next: last, skipped: [first] });
    expect(at((lastDay + 2) * day + 1)).toEqual({ next: null, skipped: [first, last] });
    expect(at(40 * day, [1])).toEqual({ next: null, skipped: [last] });
    expect(at(40 * day, [1, 2])).toEqual({ next: null, skipped: [] });
    expect(at(4 * day, [1, 2])).toEqual({ next: null, skipped: [] });
    expect(at(4 * day, [2])).toEqual({ next: null, skipped: [first] });
  });
  it("accepts a recorded decision as a stop reason", () => {
    const command = { version: "v2-chase-command.v1", commandId: item.id, expectedVersion: 1,
      action: "stop", itemId: item.id, kind: "quote", reason: "decision" };
    expect(chaseCommand.parse(command)).toEqual(command);
    expect(chaseSchedule({ ...item, stoppedReason: "decision" }, [], anchor + 20 * 86_400_000))
      .toEqual({ next: null, skipped: [] });
  });
  it("returns no timing decision for an invalid server clock or out-of-range date", () => {
    expect(chaseSchedule(item, [], NaN)).toEqual({ next: null, skipped: [] });
    expect(chaseSchedule({ ...item, anchor: Number.MAX_SAFE_INTEGER }, [], anchor)).toEqual({ next: null, skipped: [] });
  });
  it("formats only the firm, reference and exact pounds in fixed templates", () => {
    expect(chaseMessage("Fictional Builders", item)).toBe("Fictional Builders: Just checking whether you have had a chance to look at quote Q-42 for £123.45. Please let us know if you have any questions. Thank you.");
    expect(chaseMessage("Fictional Builders", { ...item, kind: "invoice", amountPence: 1 })).toContain("£0.01 outstanding");
  });
  it("requires both local V2 and synthetic mode without touching non-V2 work", () => {
    try {
      vi.stubEnv("JOBGUARD_LOCAL_V2", "0"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
      expect(requireV2Chasing).toThrow("CHASE_DARK");
      vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "production");
      expect(requireV2Chasing).toThrow("CHASE_DARK");
      vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); expect(requireV2Chasing).not.toThrow();
    } finally { vi.unstubAllEnvs(); }
  });
  it("rejects invented balances, recipients, client times and stale command formats", () => {
    const run = { version: "v2-chase-command.v1", commandId: item.id, expectedVersion: 1, action: "run" };
    expect(chaseCommand.safeParse(run).success).toBe(true);
    for (const extra of [{ now: anchor }, { amount: 50 }, { recipient: "someone@real.test" }, { tenantId: item.id }])
      expect(chaseCommand.safeParse({ ...run, ...extra }).success).toBe(false);
    expect(chaseCommand.safeParse({ ...run, expectedVersion: -1 }).success).toBe(false);
  });
});
