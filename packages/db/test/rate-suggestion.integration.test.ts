import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RateSuggestionRepository } from "../src/rate-suggestion-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";

let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 120000);
afterAll(async () => { await closeWorkFixture(f); });
const query = { version: "rate-query.v1", asOf: "2026-11-01T00:00:00.000Z", unit: "each", taxBasis: "standard_rate_20", category: "paint", region: "london" };
type Company = Awaited<ReturnType<typeof meterCompany>>;
async function sample(a: Company, pence = 100, unit = "each", traced = true) {
  const scope = randomUUID(), revision = randomUUID(), id = randomUUID();
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')", [a.tenantId, a.jobId, scope]);
    await db.query(`INSERT INTO app.scope_revision(tenant_id,job_id,scope_item_id,id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
      VALUES($1,$2,$3,$4,1,'Fictional paint','1',$5,$6,$6)`, [a.tenantId, a.jobId, scope, revision, unit, traced ? pence : pence + 1]);
    await db.query(`INSERT INTO app.rate_book_observation(tenant_id,job_id,scope_item_id,id,source_scope_revision_id,unit,rate_principal_pence,currency,tax_basis,category,region,effective_at,provenance)
      VALUES($1,$2,$3,$4,$5,$6,$7,'GBP','standard_rate_20','paint','london','2026-10-30T00:00:00Z','entered')`, [a.tenantId, a.jobId, scope, id, revision, unit, pence]);
  }, { membershipId: a.actorId });
  return { scope, revision, id };
}
async function unchangedTables(a: Company) {
  // Compare complete stored rows, including empty tables; no writable paid flags or generated counts.
  const tables = ["job", "scope_revision", "quote_revision", "quote_line", "quote_version", "rate_book_observation", "material_rate_revision", "customer_invoice", "cap_snapshot"];
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    // Catalog existence is an assertion, not a skip: every named protected table must exist.
    result[table] = (await f.admin.query(`SELECT to_jsonb(r) row FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`, [a.tenantId])).rows;
  }
  return result;
}
it("M5-6 real PostgreSQL: provenance, races, replay, stale data, isolation and append-only authority", async () => {
  const a = await meterCompany(f), b = await meterCompany(f), repo = new RateSuggestionRepository(f.runtime);
  const actor = { kind: "human", sessionDigest: a.digest };
  const first = await sample(a), second = await sample(a, 101), third = await sample(a, 100);
  const baseline = await repo.read(a.context, query);
  expect(baseline).toMatchObject({ status: "suggestion", rate: { pence: 100, currency: "GBP" }, sampleCount: 3 });
  expect(baseline.sources.map(row => row.sourceScopeRevisionId).sort()).toEqual([first.revision, second.revision, third.revision].sort());
  for (let i = 0; i < 3; i++) await sample(b, 99999);
  expect(await repo.read(a.context, query)).toEqual(baseline);
  expect((await repo.read(b.context, query)).rate?.pence).toBe(99999);
  const input = { version: "rate-suggestion-accept.v1", commandId: randomUUID(), query, jobId: a.jobId,
    scopeItemId: first.scope, currentRevisionId: first.revision, acceptedRatePence: 100, baselineHash: baseline.baselineHash };
  // A caller with EXECUTE cannot forge the accepted rate or extend the SQL command.
  const sqlInput = { ...input, query: { ...query, tenantId: a.tenantId } };
  for (const forged of [{ ...sqlInput, acceptedRatePence: 999 }, { ...sqlInput, enabled: true }, { ...sqlInput, actorId: b.actorId },
    { ...sqlInput, acceptedRatePence: null }, { ...sqlInput, query: { ...sqlInput.query, unit: null } }]) {
    await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT app.accept_rate_suggestion($1,$2,$3::jsonb)",
      [a.tenantId, a.digest, JSON.stringify(forged)]), { membershipId: a.actorId, bindRequest: false })).rejects.toThrow("INVALID_ACCEPTANCE");
  }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.rate_suggestion_acceptance WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);
  const before = await unchangedTables(a);
  const [one, two] = await Promise.all([repo.accept(a.context, actor, input), repo.accept(a.context, actor, input)]);
  expect(two).toEqual(one); expect(one.actorId).toBe(a.actorId);
  expect(await unchangedTables(a)).toEqual(before);
  expect(await repo.read(a.context, query)).toEqual(baseline);
  const rows = (await f.admin.query("SELECT * FROM app.rate_suggestion_acceptance WHERE tenant_id=$1", [a.tenantId])).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ provenance: "suggestion_accepted", environment: "synthetic_demo", previous_revision_id: first.revision, actor_id: a.actorId });
  expect([...rows[0].source_observation_ids].sort()).toEqual([first.id, second.id, third.id].sort());
  await expect(repo.accept(a.context, actor, { ...input, acceptedRatePence: 101 })).rejects.toThrow("COMMAND_CONFLICT");
  await expect(repo.accept(a.context, actor, { ...input, commandId: randomUUID() })).rejects.toThrow("STALE_REVISION");
  const stale = { ...input, commandId: randomUUID(), scopeItemId: second.scope, currentRevisionId: second.revision };
  const concurrent = await Promise.allSettled([repo.accept(a.context, actor, stale), repo.accept(a.context, actor, { ...stale, commandId: randomUUID() })]);
  expect(concurrent.filter(row => row.status === "fulfilled")).toHaveLength(1);
  expect(String((concurrent.find(row => row.status === "rejected") as PromiseRejectedResult).reason)).toContain("STALE_REVISION");
  await sample(a, 102);
  await expect(repo.accept(a.context, actor, { ...stale, commandId: randomUUID(), scopeItemId: third.scope, currentRevisionId: third.revision })).rejects.toThrow("STALE_BASELINE");
  expect(await repo.accept(a.context, actor, input)).toEqual(one); // Durable replay after new observations.
  const fresh = await repo.read(a.context, query);
  const next = { ...input, commandId: randomUUID(), scopeItemId: third.scope, currentRevisionId: third.revision, baselineHash: fresh.baselineHash };
  await expect(repo.accept(a.context, actor, { ...next, acceptedRatePence: 999 })).rejects.toThrow("INVALID_ACCEPTANCE");
  for (const jobId of [b.jobId, randomUUID()]) await expect(repo.accept(a.context, actor, { ...next, jobId })).rejects.toThrow("NOT_FOUND");
  for (const badActor of [{ kind: "system", sessionDigest: a.digest }, { kind: "human", sessionDigest: b.digest }])
    await expect(repo.accept(a.context, badActor, next)).rejects.toThrow();
  for (const mutation of ["UPDATE app.rate_suggestion_acceptance SET accepted_pence=1", "DELETE FROM app.rate_suggestion_acceptance"])
    await expect(workTenant(f.admin, a.tenantId, db => db.query(mutation), { membershipId: a.actorId })).rejects.toThrow("immutable");
  for (const mutation of ["INSERT INTO app.rate_suggestion_acceptance SELECT * FROM app.rate_suggestion_acceptance", "UPDATE app.rate_suggestion_acceptance SET accepted_pence=1", "DELETE FROM app.rate_suggestion_acceptance", "TRUNCATE app.rate_suggestion_acceptance"])
    await expect(workTenant(f.runtime, a.tenantId, db => db.query(mutation), { membershipId: a.actorId })).rejects.toThrow("permission denied");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.rate_suggestion_acceptance WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(2);
  const duplicates = await meterCompany(f), dup = await sample(duplicates);
  await expect(workTenant(f.admin, duplicates.tenantId, db => db.query(`INSERT INTO app.rate_book_observation
    SELECT $1,tenant_id,job_id,scope_item_id,source_scope_revision_id,unit,rate_principal_pence,currency,tax_basis,category,region,effective_at,provenance,created_at
    FROM app.rate_book_observation WHERE tenant_id=$2 AND id=$3`, [randomUUID(), duplicates.tenantId, dup.id]), { membershipId: duplicates.actorId })).rejects.toThrow(/unique|duplicate/);
  await workTenant(f.admin, duplicates.tenantId, db => db.query(`INSERT INTO app.rate_book_observation
    SELECT $1,tenant_id,job_id,scope_item_id,source_scope_revision_id,unit,rate_principal_pence,currency,'zero_rate',category,region,effective_at,provenance,created_at
    FROM app.rate_book_observation WHERE tenant_id=$2 AND id=$3`, [randomUUID(), duplicates.tenantId, dup.id]), { membershipId: duplicates.actorId });
  const conflicting = await repo.read(duplicates.context, query);
  expect(conflicting).toMatchObject({ status: "unknown", rate: null, sampleCount: 0 });
  expect(conflicting.exclusions.map(row => row.reason)).toEqual(["conflicting_source_revision", "conflicting_source_revision"]);
  const sparse = await meterCompany(f); await sample(sparse); await sample(sparse);
  expect(await repo.read(sparse.context, query)).toMatchObject({ status: "unknown", rate: null });
  const bad = await sample(sparse, 100, "each", false), outlier = await sample(sparse, 9999), unit = await sample(sparse, 100, "kg");
  const exclusions = (await repo.read(sparse.context, query)).exclusions;
  expect(exclusions).toEqual(expect.arrayContaining([{ observationId: bad.id, reason: "untraced_source" }, { observationId: outlier.id, reason: "outlier" }, { observationId: unit.id, reason: "not_comparable" }]));
}, 120_000);

it.each([
  { name: "odd median", rates: [100, 101, 102], expected: 101 },
  { name: "half-even rounds up to even", rates: [100, 101, 102, 103], expected: 102 },
  { name: "half-even rounds down to even", rates: [100, 100, 101, 101], expected: 100 },
  { name: "outlier excluded before final median", rates: [100, 101, 102, 9999], expected: 101 },
])("M5-6 SQL/core parity: $name", async ({ rates, expected }) => {
  const a = await meterCompany(f), repo = new RateSuggestionRepository(f.runtime);
  const observations = [];
  for (const [index, pence] of rates.entries()) observations.push(await sample(a, pence, ["each", "ea", "unit"][index % 3]!));
  const baseline = await repo.read(a.context, query);
  expect(baseline.rate?.pence).toBe(expected);
  const accepted = await repo.accept(a.context, { kind: "human", sessionDigest: a.digest }, {
    version: "rate-suggestion-accept.v1", commandId: randomUUID(), query, jobId: a.jobId,
    scopeItemId: observations[0]!.scope, currentRevisionId: observations[0]!.revision,
    acceptedRatePence: expected, baselineHash: baseline.baselineHash,
  });
  const stored = (await f.admin.query("SELECT accepted_pence,source_observation_ids FROM app.rate_suggestion_acceptance WHERE tenant_id=$1 AND id=$2", [a.tenantId, accepted.id])).rows[0];
  expect(Number(stored.accepted_pence)).toBe(expected);
  expect([...stored.source_observation_ids].sort()).toEqual(baseline.sources.map(source => source.observationId).sort());
}, 120_000);
