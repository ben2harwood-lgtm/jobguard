import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { CisFixtureRepository } from "../src/cis-fixture-repository.js";
import { PurchaseOrderActionRepository } from "../src/purchase-order-action-repository.js";
import { EnterpriseAccessRepository } from "../src/enterprise-access-repository.js";
import { RetentionRecordRepository } from "../src/retention-record-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";

// Protocol doubles only. CI proves the real database/session/privilege boundaries.
function fixture() {
  const member = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
  const context = verifiedTenantContextFromMembership(member, { kind: "real", credential: "a".repeat(64) });
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("app.bind_request")) throw Object.assign(new Error("private binding detail"), { code: "42501" });
    return { rows: [{ result: sql.includes("dark_emergency") ? { notices: [] } : [] }] };
  });
  const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  return { member, context, query, release, pool };
}
afterEach(() => vi.unstubAllEnvs());
it("maps refused CIS proof to the existing not-found response after rollback, without business SQL", async () => {
  const f = fixture();
  await expect(new CisFixtureRepository(f.pool).read(f.context, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]);
  expect(f.release).toHaveBeenCalledOnce();
});
it("maps refused manual-order proof to ORDER_ACTION_INVALID before writes, including retries", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const f = fixture(), repo = new PurchaseOrderActionRepository(f.pool);
  const input = { version: "manual-order-attestation.v1", jobId: randomUUID(), revisionId: randomUUID(), commandId: randomUUID(), supplierReference: "synthetic-test" };
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(repo.attestManual(f.context, input, { sessionDigest: "a".repeat(64) })).rejects.toMatchObject({ code: "ORDER_ACTION_INVALID" });
  }
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(Array(2).fill(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]).flat());
  expect(f.release).toHaveBeenCalledTimes(2);
});
it("keeps emergency notices sessionless while passing the exact session, CSRF and tenant to identity SQL", async () => {
  const f = fixture(), actor = { sessionDigest: "b".repeat(64), csrfToken: "fixture-csrf" }, input = { version: "emergency.v1", operation: "notices" };
  const repo = new EnterpriseAccessRepository(f.pool, {} as Pool);
  await expect(repo.emergencyNotices(f.context, actor)).resolves.toEqual({ notices: [] });
  expect(f.query).toHaveBeenCalledWith('SELECT identity.dark_emergency($1,$2,$3,$4::jsonb) result',
    [actor.sessionDigest, actor.csrfToken, f.member.tenantId, JSON.stringify(input)]);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("bind_request"))).toBe(false);
  f.query.mockClear();
  await expect(repo.emergency(f.context, actor, { version: "emergency.v1", operation: "open" })).rejects.toThrow("FORBIDDEN");
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]);
});
it("uses a sessionless tenant context only for the infrastructure timer; human reads still bind", async () => {
  const f = fixture(), repo = new RetentionRecordRepository(f.pool);
  await expect(repo.raiseTimerReviews(f.context)).resolves.toEqual({ appended: 0, refused: 0 });
  expect(f.query).toHaveBeenCalledWith("SELECT app.retention_timer($1,NULL,NULL,NULL) result", [f.member.tenantId]);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("bind_request"))).toBe(false);
  f.query.mockClear();
  await expect(repo.read(f.context, { sessionDigest: "a".repeat(64) }, randomUUID())).rejects.toMatchObject({ code: "RETENTION_UNAVAILABLE" });
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]);
});
