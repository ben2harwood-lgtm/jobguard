import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { ContractorBillingRepository } from "../src/contractor-billing-repository.js";
import { JobRepository } from "../src/job-repository.js";
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
const paths = ["work orders", "SoR", "contractor parties", "contractor admin", "recovery", "fee illustration", "billing", "job progress"] as const;
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
  if (path === "billing") return new ContractorBillingRepository(pool).finalise(context, session, job, { version: "billing-finalise.v1", commandId: randomUUID(), clientContractId: randomUUID() });
  if (path === "job progress") return new JobRepository(pool).transitionProgress(context, ["job:update"], { jobId: job, scopeItemId: randomUUID(), expectedRevision: 0, to: "in_progress", reason: "start" });
  return new FeeIllustrationRepository(pool).create(context, job, randomUUID());
}
it.each(paths)("passes the caller's binding before %s business SQL", async path => {
  const { pool, query } = fixture();
  await expect(call(path, pool)).rejects.toBeDefined();
  expect(query.mock.calls[1]).toEqual(["SELECT app.bind_request($1, $2, $3)", [path === "recovery" || path === "fee illustration" || path === "job progress" ? "practice" : "contractor_practice", path === "recovery" || path === "fee illustration" || path === "job progress" ? "a".repeat(64) : session, member.tenantId]]);
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

it.each(["work orders", "contractor parties"] as const)("hides rejected bindings as NOT_FOUND for %s", async path => {
  const { pool } = fixture(true);
  await expect(call(path, pool)).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
});

it("binds a newly issued contractor credential before bootstrap reads and audit", async () => {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("start_contractor_practice") ? [{ tenant_id: member.tenantId }] : [] }));
  const pool = {
    connect: async () => ({ query, release: vi.fn() }),
    query: async () => ({ rows: [{ tenant_id: member.tenantId, membership_id: member.membershipId, identity_user_id: member.identityUserId }] }),
  } as unknown as Pool;
  await new ContractorRepository(pool).startPractice(session);
  expect(query.mock.calls.map(([sql]) => sql).slice(0, 3)).toEqual([
    "BEGIN", "SELECT app.start_contractor_practice($1) tenant_id", "SELECT app.bind_request('contractor_practice',$1,$2)",
  ]);
});

it("hides a malformed import tenant before opening a database transaction", async () => {
  const { pool } = fixture();
  const principal = await new ContractorRepository(pool).resolveSession(session);
  await expect(new WorkOrderRepository(pool).importCsv({ ...principal, tenantId: "not-a-uuid" }, {
    commandId: randomUUID(), name: "fictional.csv", kind: "csv", csv: "",
  })).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
  expect(pool.connect).not.toHaveBeenCalled();
});


it("maps billing binding refusals to its existing typed error", async () => {
  const { pool } = fixture(true);
  await expect(call("billing", pool)).rejects.toMatchObject({ code: "BILLING_FORBIDDEN" });
});
it("refuses a mismatched billing tenant before opening the transaction", async () => {
  const { pool } = fixture();
  const foreign = verifiedTenantContextFromMembership({ ...member, tenantId: randomUUID() });
  await expect(new ContractorBillingRepository(pool).finalise(foreign, session, job, { version: "billing-finalise.v1", commandId: randomUUID(), clientContractId: randomUUID() })).rejects.toMatchObject({ code: "BILLING_FORBIDDEN" });
  expect(pool.connect).not.toHaveBeenCalled();
});
it.each(["work orders", "SoR", "contractor parties", "contractor admin"] as const)("refuses a sessionless principal before %s SQL", async path => {
  const { pool } = fixture();
  const bare = member;
  const work = path === "work orders" ? new WorkOrderRepository(pool).overview(bare)
    : path === "SoR" ? new SorRepository(pool).list(bare)
    : path === "contractor parties" ? new ContractorPartyRepository(pool).readResident(bare, job)
    : new ContractorRepository(pool).query(bare, { version: "contractor-query.v1", tenantId: member.tenantId, resource: "organisation" });
  await expect(work).rejects.toBeDefined();
  expect(pool.connect).not.toHaveBeenCalled();
});
