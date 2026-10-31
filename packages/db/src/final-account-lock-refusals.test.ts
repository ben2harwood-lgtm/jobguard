import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { FinalAccountLockError, FINAL_ACCOUNT_DECLARATION_VERSION } from "@jobguard/core";
import { FinalAccountLockRepository, type FinalAccountLockView } from "./final-account-lock-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

function invoiceFailure(error: Error, revokedReplay = false, probeError?: Error) {
 const tenantId = randomUUID(), jobId = randomUUID(), lockId = randomUUID(), at = "2026-10-31T12:00:00.000000Z";
 const query = vi.fn(async (sql: string) => {
  if (sql.startsWith("SELECT app.issue_lock_bound_customer_invoice")) throw error;
  if (sql.includes("AS revoked_member_replay")) {
   if (probeError) throw probeError;
   return { rows: [{ revoked_member_replay: revokedReplay }], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
 });
 const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
 const repo = new FinalAccountLockRepository(pool);
 vi.spyOn(repo, "read").mockResolvedValue({
  captures: [], dispositions: [], termsAccepted: true,
  lock: { id: lockId, tenantId, jobId, lockedAt: at } as NonNullable<FinalAccountLockView["lock"]>,
  checkStatus: "completed", check: { lockId, tenantId, jobId, evidenceCutoffAt: at, status: "completed" },
 });
 const call = () => repo.issueInvoice(verifiedTenantContextForQueuedJob(tenantId), { jobId, actorMembershipId: randomUUID(), commandId: randomUUID(),
  finalAccountRevisionId: randomUUID(), expectedSourceHash: "a".repeat(64), invoiceKind: "final", recipient: "fictional@example.invalid", issuedOn: "2026-10-31" });
 return { call, query, release };
}
it("maps only a proven revoked-member invoice replay after the original authority refusal rolls back", async () => {
 const f = invoiceFailure(Object.assign(new Error("FORBIDDEN"), { code: "42501", detail: "private SQL diagnostic" }), true);
 const refused = f.call();
 await expect(refused).rejects.toBeInstanceOf(FinalAccountLockError);
 await expect(refused).rejects.toMatchObject({ code: "FORBIDDEN", message: "FORBIDDEN" });
 expect(f.query.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
 const statements = f.query.mock.calls.map(([sql]) => sql);
 const originalRollback = statements.indexOf("ROLLBACK"), probe = statements.findIndex(sql => sql.includes("AS revoked_member_replay"));
 expect(probe).toBeGreaterThan(originalRollback);expect(f.release).toHaveBeenCalledTimes(2);
});
it.each([
 Object.assign(new Error("permission denied for table private_table"), { code: "42501" }),
 Object.assign(new Error("FORBIDDEN"), { code: "XX000" }),
])("keeps unexpected SQL failures outside the typed authority refusal", async error => {
 const f = invoiceFailure(error);await expect(f.call()).rejects.toBe(error);expect(f.release).toHaveBeenCalledOnce();
});

it("preserves the raw practice-digest or first-execution invoice refusal when no revoked replay is proven", async () => {
 const error = Object.assign(new Error("FORBIDDEN"), { code: "42501" }), f = invoiceFailure(error);
 await expect(f.call()).rejects.toBe(error);expect(f.release).toHaveBeenCalledTimes(2);
});
it("a failed replay classification cannot replace the original raw authority refusal", async () => {
 const error = Object.assign(new Error("FORBIDDEN"), { code: "42501" }), f = invoiceFailure(error, false, new Error("query failure"));
 await expect(f.call()).rejects.toBe(error);expect(f.release).toHaveBeenCalledTimes(2);
});
it("lock keeps its original SQL FORBIDDEN code and never probes invoice replay", async () => {
 const error = Object.assign(new Error("FORBIDDEN"), { code: "42501" }), query = vi.fn(async (sql: string) => {
  if (sql.includes("FROM app.lock_final_account(")) throw error;
  return { rows: [], rowCount: 0 };
 });
 const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
 await expect(new FinalAccountLockRepository(pool).lock(verifiedTenantContextForQueuedJob(randomUUID()), {
  jobId: randomUUID(), actorMembershipId: randomUUID(), commandId: randomUUID(), finalAccountRevisionId: randomUUID(),
  expectedRevision: 1, declarationVersion: FINAL_ACCOUNT_DECLARATION_VERSION,
 })).rejects.toBe(error);
 expect(query.mock.calls.some(([sql]) => sql.includes("AS revoked_member_replay"))).toBe(false);expect(release).toHaveBeenCalledOnce();
});
