import type { Pool } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PaymentFeeCollectionRepository } from "./payment-fee-collection-repository.js";
import { verifiedTenantContextFromMembership } from "./tenant-context.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = "a".repeat(64), context = verifiedTenantContextFromMembership({ identityUserId: id(8), membershipId: id(6), tenantId: id(1) } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo")); afterEach(() => vi.unstubAllEnvs());
function fixture(state = "approved") {
  const document = { version: "payment-fee-statement.v1", statementId: id(3), jobId: id(2), paymentId: id(4),
    statementHash: hash, sourceHash: hash, revision: 1, feePence: 8000, policyVersion: "reference_fee_policy_v3",
    environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0 };
  const approval = { id: id(5), actor_membership_id: id(6), decision_id: id(7), expires_at: new Date("2027-01-01T00:00:00Z"), revoked_at: null as Date | null };
  let present = true, authorized = true;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("payment_fee_actor")) return { rows: [{ actor: id(6) }] };
    if (sql.includes("SELECT document,decision_id")) return { rows: present ? [{ document, decision_id: id(7) }] : [] };
    if (sql.includes("payment_fee_current")) return { rows: [{ state }] };
    if (sql.includes("FOR SHARE OF a")) return { rows: authorized ? [approval] : [] };
    return { rows: [] };
  });
  const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  const repo = new PaymentFeeCollectionRepository(pool);
  const run = () => repo.withReader(context, hash, read => read(id(2), id(3), hash));
  return { run, repo, query, release, document, approval, missing: () => { present = false; }, noApproval: () => { authorized = false; } };
}
it("loads real MON-4A table/state/approval contracts under the tenant transaction, not the read view", async () => {
  const f = fixture(), result = await f.run();
  expect(result).toMatchObject({ tenantId: id(1), invoiceId: id(3), paymentId: id(4), verifiedFeePence: 8000,
    authorization: { kind: "statement", id: id(5), decisionId: id(7), amountPence: 8000 },
    binding: { statementId: id(3), principal: { pence: 8000, currency: "GBP" } } });
  expect(f.query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)", [id(1)]);
  expect(f.query).toHaveBeenCalledWith("SELECT app.payment_fee_actor($1,$2) actor", [id(2), hash]);
  expect(f.query).toHaveBeenCalledWith("COMMIT", undefined); expect(f.release).toHaveBeenCalledOnce();
  expect(f.query.mock.calls.some(([sql]) => sql.includes("read_payment_fees"))).toBe(false);
});
it.each([["disputed", "AUTHORITY_DISPUTED"], ["approval_revoked", "AUTHORITY_REVOKED"],
  ["approval_expired", "AUTHORITY_EXPIRED"], ["source_changed", "AUTHORITY_STALE"],
  ["awaiting_approval", "AUTHORITY_STALE"]])("pauses %s without returning an authority", async (state, reason) => {
  const f = fixture(state); await expect(f.run()).rejects.toMatchObject({ reason });
  expect(f.query).toHaveBeenCalledWith("ROLLBACK", undefined);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("FOR SHARE OF a"))).toBe(false);
});
it("refuses missing/foreign statements, misbound documents and missing exact approval", async () => {
  const f = fixture(); f.missing(); await expect(f.run()).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
  const g = fixture(); g.document.jobId = id(99); await expect(g.run()).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
  const h = fixture(); h.noApproval(); await expect(h.run()).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
});
it("detects revocation between state evaluation and the authorization lock", async () => {
  const f = fixture(); f.approval.revoked_at = new Date();
  await expect(f.run()).rejects.toMatchObject({ reason: "AUTHORITY_REVOKED" });
});
it("refuses production before connecting", async () => {
  const f = fixture(); vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(f.run()).rejects.toThrow("SYNTHETIC_MODE_REQUIRED"); expect(f.query).not.toHaveBeenCalled();
});
