import type { Pool } from "pg";
import { expect, it } from "vitest";
import { persistedBillabilityCommandV1, RecoveryBillabilityRepository } from "./recovery-billability-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = { version: "recovery-billability-command.v1", action: "review", commandId: id(1), caseId: id(2), workId: id(3), lineId: id(4), expectedCaseRevision: 1, claimedEligiblePrincipalPence: 1, reasons: "Fictional review" };
it("stored-fact derivation rejects caller values, including nested authorities", () => {
  for (const extra of [{ allocationState: "available" }, { disclosedBeforeLock: false }, { builderCaptured: false }, { lockId: id(5) }, { finalAccountLockId: id(5) }, { facts: {} }, { snapshot: {} }]) {
    expect(persistedBillabilityCommandV1.safeParse({ ...command, ...extra }).success).toBe(false);
  }
});
it("zero is non-positive approval basis; negative, fractional and unsafe review amounts are refused", () => {
  expect(persistedBillabilityCommandV1.safeParse({ ...command, claimedEligiblePrincipalPence: 0 }).success).toBe(true);
  for (const amount of [-1, 0.1, Number.MAX_SAFE_INTEGER]) expect(persistedBillabilityCommandV1.safeParse({ ...command, claimedEligiblePrincipalPence: amount }).success).toBe(false);
});
function database(result: unknown, fail = false) {
  const calls: string[] = [];
  const pool = { connect: async () => ({ query: async (sql: string) => {
    calls.push(sql);
    if (sql.startsWith("SELECT app.recovery_billability")) { if (fail) throw new Error("BILLABILITY_STALE"); return { rows: [{ result: { replay: result } }] }; }
    return { rows: [] };
  }, release: () => { calls.push("release"); } }) } as unknown as Pool;
  return { pool, calls };
}
it("exact replay returns the first database result inside one committed tenant transaction", async () => {
  const saved = { version: "first-saved-result" }, db = database(saved);
  const value = await new RecoveryBillabilityRepository(db.pool, "synthetic_demo").command(verifiedTenantContextForQueuedJob(id(8)), id(9), "a".repeat(64), command);
  expect(value).toBe(saved);
  expect(db.calls[0]).toBe("BEGIN"); expect(db.calls.at(-2)).toBe("COMMIT"); expect(db.calls.at(-1)).toBe("release");
  expect(db.calls.filter(c => c.startsWith("SELECT app.recovery_billability"))).toHaveLength(1);
});
it("a database rejection rolls back the transaction and propagates its typed error", async () => {
  const db = database(null, true);
  await expect(new RecoveryBillabilityRepository(db.pool, "synthetic_demo").command(verifiedTenantContextForQueuedJob(id(8)), id(9), "a".repeat(64), command)).rejects.toThrow("BILLABILITY_STALE");
  expect(db.calls.at(-2)).toBe("ROLLBACK"); expect(db.calls).not.toContain("COMMIT");
});
it("production, pilot and unconfigured paths refuse before opening a connection", async () => {
  for (const mode of ["production", "pilot_no_charge", "unconfigured"]) {
    const db = database(null);
    await expect(new RecoveryBillabilityRepository(db.pool, mode).command(verifiedTenantContextForQueuedJob(id(8)), id(9), "a".repeat(64), command)).rejects.toThrow("BILLABILITY_FORBIDDEN");
    expect(db.calls).toEqual([]);
  }
});
