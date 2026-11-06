import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { ContractorRepository } from "../src/contractor-repository.js";
import { ContractorPartyRepository } from "../src/contractor-party-repository.js";
import { SorRepository } from "../src/sor-repository.js";
import { WorkOrderRepository } from "../src/work-order-repository.js";
import { RecoveryDemoRepository } from "../src/recovery-demo-repository.js";
import { FeeIllustrationRepository } from "../src/fee-illustration-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";

// Adapter regression only. CI must prove the guarded SQL and permissions on PostgreSQL.
const member = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
const session = randomUUID(), job = randomUUID();
const paths = ["work orders", "SoR", "contractor parties", "contractor admin", "recovery", "fee illustration"] as const;
function fixture(refused = false) {
  const reachedBusiness = new Error("business boundary reached");
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("app.bind_request") && refused) throw Object.assign(new Error("REQUEST_BINDING_REFUSED"), { code: "42501" });
    if (sql.includes("app.current_actor()")) return { rows: [{ actor: member.membershipId, tenant: member.tenantId }] };
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.includes("app.bind_request") || sql.includes("set_config")) return { rows: [] };
    throw reachedBusiness;
  });
  const pool = {
    query: vi.fn(async () => ({ rows: [{ tenant_id: member.tenantId, membership_id: member.membershipId, identity_user_id: member.identityUserId }] })),
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
  return { pool, query };
}
async function call(path: typeof paths[number], pool: Pool) {
  const principal = await new ContractorRepository(pool).resolveSession(session);
  if (path === "work orders") return new WorkOrderRepository(pool).overview(principal);
  if (path === "SoR") return new SorRepository(pool).list(principal);
  if (path === "contractor parties") return new ContractorPartyRepository(pool).readResident(principal, job);
  if (path === "contractor admin") return new ContractorRepository(pool).query(principal, { version: "contractor-query.v1", tenantId: member.tenantId, resource: "organisation" });
  const context = verifiedTenantContextFromMembership(member, { kind: "practice", credential: "a".repeat(64) });
  if (path === "recovery") return new RecoveryDemoRepository(pool).select(context, job, randomUUID(), "eligible");
  return new FeeIllustrationRepository(pool).create(context, job, randomUUID());
}
it.each(paths)("passes the caller's binding before %s business SQL", async path => {
  const { pool, query } = fixture();
  await expect(call(path, pool)).rejects.toBeDefined();
  expect(query.mock.calls[1]).toEqual(["SELECT app.bind_request($1, $2, $3)", [path === "recovery" || path === "fee illustration" ? "practice" : "contractor_practice", path === "recovery" || path === "fee illustration" ? "a".repeat(64) : session, member.tenantId]]);
  expect(query.mock.calls[2]?.[0]).toContain("app.current_actor()");
  expect(query.mock.calls[4]?.[0]).not.toBe("ROLLBACK");
});
it.each(paths)("refuses an expired or revoked binding before %s business SQL", async path => {
  const { pool, query } = fixture(true);
  await expect(call(path, pool)).rejects.toBeDefined();
  expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]);
});
it("keeps the contractor credential out of the returned principal's JSON", async () => {
  const { pool } = fixture();
  expect(JSON.stringify(await new ContractorRepository(pool).resolveSession(session))).not.toContain(session);
});
