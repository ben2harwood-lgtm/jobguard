import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RateSuggestionRepository } from "../src/rate-suggestion-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 120000);
afterAll(async () => { await closeWorkFixture(f); });
it("retains actor/source provenance across repository reload and refuses foreign, revoked and non-owner reads without commercial effects", async () => {
  const a = await meterCompany(f), b = await meterCompany(f), repo = new RateSuggestionRepository(f.runtime);
  const actor = { kind: "human", sessionDigest: a.digest };
  const sources: { id: string; revision: string; scope: string }[] = [];
  await workTenant(f.admin, a.tenantId, async db => {
    for (let i = 0; i < 3; i++) {
      const row = { id: randomUUID(), revision: randomUUID(), scope: randomUUID() }; sources.push(row);
      await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')", [a.tenantId, a.jobId, row.scope]);
      await db.query(`INSERT INTO app.scope_revision(tenant_id,job_id,scope_item_id,id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
        VALUES($1,$2,$3,$4,1,'Fictional rate','1','each',100,100)`, [a.tenantId,a.jobId,row.scope,row.revision]);
      await db.query(`INSERT INTO app.rate_book_observation(tenant_id,job_id,scope_item_id,id,source_scope_revision_id,unit,rate_principal_pence,currency,tax_basis,category,region,effective_at,provenance)
        VALUES($1,$2,$3,$4,$5,'each',100,'GBP','standard_rate_20','paint','london','2026-10-30','entered')`, [a.tenantId,a.jobId,row.scope,row.id,row.revision]);
    }
  });
  const query = { version: "rate-query.v1", asOf: "2026-11-01T00:00:00.000Z", unit: "each", taxBasis: "standard_rate_20", category: "paint", region: "london" };
  const baseline = await repo.read(a.context, query), target = sources[0]!;
  const input = { version: "rate-suggestion-accept.v1", commandId: randomUUID(), jobId: a.jobId,
    scopeItemId: target.scope, currentRevisionId: target.revision, query, acceptedRatePence: 100, baselineHash: baseline.baselineHash };
  const snapshot = async () => {
    const rows: Record<string, unknown> = {};
    for (const table of ["quote_revision", "quote_line", "quote_version", "scope_revision", "rate_book_observation", "material_rate_revision", "customer_invoice", "cap_snapshot"])
      rows[table] = (await f.admin.query(`SELECT to_jsonb(r) row FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`, [a.tenantId])).rows;
    return rows;
  };
  const outdated = sources[1]!;
  await workTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.scope_revision
    (tenant_id,job_id,scope_item_id,id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
    VALUES($1,$2,$3,$4,2,'New fictional revision','1','each',100,100)`, [a.tenantId,a.jobId,outdated.scope,randomUUID()]));
  await expect(repo.accept(a.context, actor, { ...input, commandId: randomUUID(), scopeItemId: outdated.scope,
    currentRevisionId: outdated.revision })).rejects.toThrow("STALE_REVISION");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.rate_suggestion_acceptance WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(0);
  const before = await snapshot();
  const accepted = await repo.accept(a.context, actor, input);
  const history = await new RateSuggestionRepository(f.runtime).readAcceptances(a.context, actor, a.jobId);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ id: accepted.id, actorId: a.actorId, recordHash: accepted.recordHash, previousRevisionId: target.revision });
  expect(history[0]!.sources.map(x => x.sourceScopeRevisionId).sort()).toEqual(sources.map(x => x.revision).sort());
  expect(Number.isFinite(Date.parse(history[0]!.acceptedAt))).toBe(true);
  expect(await repo.accept(a.context, actor, input)).toEqual(accepted);
  await expect(repo.accept(a.context, actor, { ...input, commandId: randomUUID() })).rejects.toThrow("STALE_REVISION");
  await expect(repo.accept(a.context, actor, { ...input, commandId: randomUUID(), jobId: b.jobId })).rejects.toThrow("NOT_FOUND");
  await expect(repo.readAcceptances(a.context, actor, b.jobId)).rejects.toThrow("NOT_FOUND");
  await expect(repo.readAcceptances(b.context, actor, a.jobId)).rejects.toThrow();
  await expect(repo.readAcceptances(a.context, { kind: "human", sessionDigest: b.digest }, a.jobId)).rejects.toThrow();
  await workTenant(f.admin, a.tenantId, db => db.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.actorId]));
  await expect(repo.readAcceptances(a.context, actor, a.jobId)).rejects.toThrow();
  await workTenant(f.admin, a.tenantId, db => db.query("UPDATE app.membership SET role='owner',revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.actorId]));
  await expect(repo.readAcceptances(a.context, actor, a.jobId)).rejects.toThrow();
  await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT * FROM app.rate_suggestion_acceptance"))).rejects.toThrow("permission denied");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.rate_suggestion_acceptance WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(1);
  expect(await snapshot()).toEqual(before);
}, 120_000);
