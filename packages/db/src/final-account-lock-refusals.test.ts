import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { FinalAccountLockError } from "@jobguard/core";
import { FinalAccountLockRepository, type FinalAccountLockView } from "./final-account-lock-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

function invoiceFailure(error: Error) {
 const tenantId = randomUUID(), jobId = randomUUID(), lockId = randomUUID(), at = "2026-10-31T12:00:00.000000Z";
 const query = vi.fn(async (sql: string) => {
  if (sql.startsWith("SELECT app.issue_lock_bound_customer_invoice")) throw error;
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
it("maps the checked invoice's SQL FORBIDDEN refusal to the route's typed code and rolls back", async () => {
 const f = invoiceFailure(Object.assign(new Error("FORBIDDEN"), { code: "42501", detail: "private SQL diagnostic" }));
 const refused = f.call();
 await expect(refused).rejects.toBeInstanceOf(FinalAccountLockError);
 await expect(refused).rejects.toMatchObject({ code: "FORBIDDEN", message: "FORBIDDEN" });
 expect(f.query.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
 expect(f.query.mock.calls.map(([sql]) => sql)).not.toContain("COMMIT");expect(f.release).toHaveBeenCalledOnce();
});
it.each([
 Object.assign(new Error("permission denied for table private_table"), { code: "42501" }),
 Object.assign(new Error("FORBIDDEN"), { code: "XX000" }),
])("keeps unexpected SQL failures outside the typed authority refusal", async error => {
 const f = invoiceFailure(error);await expect(f.call()).rejects.toBe(error);expect(f.release).toHaveBeenCalledOnce();
});
