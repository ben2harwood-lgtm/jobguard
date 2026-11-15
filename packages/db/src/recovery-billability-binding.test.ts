import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { RecoveryBillabilityRepository } from "./recovery-billability-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bindingSql = "SELECT app.bind_request($1, $2, $3)";
const review = { version: "recovery-billability-command.v1", action: "review", commandId: id(1),
  caseId: id(2), workId: id(3), lineId: id(4), expectedCaseRevision: 1,
  claimedEligiblePrincipalPence: 1, reasons: "Fictional review" };
const { claimedEligiblePrincipalPence: _amount, reasons: _reasons, ...base } = review;
const approval = { ...base, action: "approve", reviewCommandId: id(5) };

function fixture(failure?: unknown) {
  const saved = { version: "first-saved-result" };
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql === bindingSql && failure) throw failure;
    return { rows: sql.startsWith("SELECT app.recovery_billability") ? [{ result: { replay: saved } }] : [] };
  });
  const release = vi.fn();
  const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  return { query, release, saved, repository: new RecoveryBillabilityRepository(pool, "synthetic_demo") };
}

it.each([[review, "practice"], [approval, "real"]] as const)(
  "binds the command's own credential before guarded execution (%s, %s)", async (command, kind) => {
    const f = fixture(), digest = "a".repeat(64);
    expect(await f.repository.command(verifiedTenantContextForQueuedJob(id(8)), id(9), digest, command)).toBe(f.saved);
    expect(f.query.mock.calls[2]).toEqual([bindingSql, [kind, digest, id(8)]]);
    expect(f.query.mock.calls[3]?.[0]).toMatch(/^SELECT app.recovery_billability/);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(f.release).toHaveBeenCalledOnce();
  },
);

it("rolls back a refused credential without reaching the money routine", async () => {
  const f = fixture(Object.assign(new Error("REQUEST_BINDING_REFUSED"), { code: "42501" }));
  await expect(f.repository.command(verifiedTenantContextForQueuedJob(id(8)), id(9), "a".repeat(64), approval))
    .rejects.toThrow("BILLABILITY_FORBIDDEN");
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN", "SELECT set_config('app.tenant_id', $1, true)", bindingSql, "ROLLBACK",
  ]);
  expect(f.release).toHaveBeenCalledOnce();
});
