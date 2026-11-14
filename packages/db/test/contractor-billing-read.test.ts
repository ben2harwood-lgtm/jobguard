import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { ContractorBillingRepository } from "../src/contractor-billing-repository.js";
import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";

const job = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const extra = "33333333-3333-4333-8333-333333333333";
const member = "44444444-4444-4444-8444-444444444444";
function fixture(installed: boolean, routineError?: unknown) {
 const query = vi.fn(async (sql: string) => {
  // LP-6d: the session's own bound request answers like the database (current actor and tenant).
  if (sql.includes("app.current_actor() actor")) return { rows: [{ actor: member, tenant: job }] };
  if (sql.includes("to_regprocedure(")) return { rows: [{ installed }] };
  if (sql.includes("FROM app.contractor_approved_not_exported(")) {
   if (routineError) throw routineError;
   return { rows: [{ extra_id: extra, net_pence: "338" }] };
  }
  if (sql.includes("SELECT q.variation_id extra_id")) return { rows: [{ extra_id: extra, net_pence: "338" }] };
  return { rows: [] };
 });
 const release = vi.fn();
 // LP-6d: the read resolves the persisted contractor session before binding its own request.
 const sessionLookup = vi.fn(async (sql: string) => ({ rows: sql.includes("app.contractor_session(") ? [{ tenant_id: job, membership_id: member, identity_user_id: member }] : [] }));
 const pool = { connect: async () => ({ query, release }), query: sessionLookup } as unknown as Pool;
 return { query, release, read: () => new ContractorBillingRepository(pool).read(verifiedTenantContextForQueuedJob(job), session, job) };
}
for (const installed of [false, true]) {
 it(`reads approved extras with 0653 ${installed ? "installed" : "absent on a predecessor"}`, async () => {
  const f = fixture(installed);
  expect((await f.read()).reconciliation.approvedNotExported).toEqual([{ extraId: extra, net: { numerator: "338", denominator: "1" } }]);
  const calls = f.query.mock.calls.map(([sql]) => sql);
  expect(calls.findIndex(sql => sql.includes("app.cb_authority("))).toBeLessThan(calls.findIndex(sql => sql.includes("to_regprocedure(")));
  expect(calls.some(sql => sql.includes("FROM app.contractor_approved_not_exported("))).toBe(installed);
  expect(calls.some(sql => sql.includes("SELECT q.variation_id extra_id"))).toBe(!installed);
  expect(f.query).toHaveBeenLastCalledWith("COMMIT");
  expect(f.release).toHaveBeenCalledOnce();
 });
}
for (const code of ["42501", "P0002", "42883"]) {
 it(`does not fall back when an installed routine fails with ${code}`, async () => {
  const f = fixture(true, { code });
  await expect(f.read()).rejects.toMatchObject({ code: code === "42883" ? "DATABASE_UNAVAILABLE" : "BILLING_FORBIDDEN" });
  expect(f.query.mock.calls.some(([sql]) => sql.includes("SELECT q.variation_id extra_id"))).toBe(false);
  expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");
  expect(f.release).toHaveBeenCalledOnce();
 });
}
