import { describe, expect, it, vi } from "vitest";
import { chaseCommand, chaseMessage, nextChase, requireV2Chasing, type ChaseItem } from "./v2-chase-policy.js";
const anchor = Date.parse("2026-11-01T12:00:00Z");
const item: ChaseItem = { id: "e2020000-0000-4000-8000-000000000002", kind: "quote", reference: "Q-42",
  amountPence: 12345, anchor, stoppedReason: null, recipient: "customer@jobguard-v2.invalid" };
describe("V2-K4 fixed local chase policy", () => {
  it("quotes have exactly day 3 and day 7 steps", () => {
    expect(nextChase(item, [])).toEqual({ step: 1, due: "2026-11-04T12:00:00.000Z" });
    expect(nextChase(item, [1])).toEqual({ step: 2, due: "2026-11-08T12:00:00.000Z" });
    expect(nextChase(item, [1, 2])).toBeNull();
  });
  it("invoices have exactly due+3 and due+10 steps", () => {
    expect(nextChase({ ...item, kind: "invoice" }, [])).toEqual({ step: 1, due: "2026-11-04T12:00:00.000Z" });
    expect(nextChase({ ...item, kind: "invoice" }, [1])).toEqual({ step: 2, due: "2026-11-11T12:00:00.000Z" });
    expect(nextChase({ ...item, kind: "invoice" }, [1, 2])).toBeNull();
  });
  it.each(["paid", "disputed", "pilot_no_charge", "reply", "decision", "builder_stop", "missing_current_due_or_dispute_facts"])("suppresses %s", stoppedReason => {
    expect(nextChase({ ...item, stoppedReason }, [])).toBeNull();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN])("rejects unsafe or empty amounts %s", amountPence => {
    expect(nextChase({ ...item, amountPence }, [])).toBeNull();
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
