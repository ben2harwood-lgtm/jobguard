import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { withTenant, type VerifiedTenantContext } from "../src/index.js";
import { approvalWorld, cluster, insertBinding, insertPack, ownerTx, bindingCount, type Cluster } from "./extra-approval-fixtures.js";
import { loadExtraApprovalBinding } from "../src/extra-approval-repository.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
let c: Cluster, world: Awaited<ReturnType<typeof approvalWorld>>;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); world = await approvalWorld(c); }, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("E5-24 partial catalog RLS and absent business writer boundary", async () => {
  const tables = ["extra_approval_revision_binding", "extra_evidence_pack"];
  const catalog = (await c.admin.query(`SELECT c.relname,r.rolname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=ANY($1) ORDER BY c.relname`, [tables])).rows;
  expect(catalog).toEqual(tables.map(relname => ({ relname, rolname: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true })));
  for (const table of tables) {
    const grants = (await c.admin.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name=$1 ORDER BY privilege_type", [table])).rows;
    expect(grants).toEqual([{ privilege_type: "SELECT" }]);
    const policy = (await c.admin.query("SELECT policyname,roles::text[] roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='app' AND tablename=$1 ORDER BY policyname", [table])).rows;
    const tenantQual = "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)";
    const expectedPolicies: Array<{ policyname: string; roles: string[]; cmd: string; qual: string; with_check: string | null }> = [{ policyname: "tenant_isolation", roles: ["jobguard_migration", "jobguard_runtime"], cmd: "ALL", qual: tenantQual, with_check: tenantQual }];
    if (table === "extra_approval_revision_binding") expectedPolicies.unshift({ policyname: "lp5b_command_read", roles: ["jobguard_command_writer"], cmd: "SELECT", qual: tenantQual, with_check: null });
    expect(policy.map(row => ({ ...row, roles: [...row.roles].sort() }))).toEqual(expectedPolicies);
    for (const operation of [`INSERT INTO app.${table}(tenant_id,id,job_id,variation_id) VALUES($1,$2,$3,$4)`, `UPDATE app.${table} SET id=id WHERE tenant_id=$1`, `DELETE FROM app.${table} WHERE tenant_id=$1`, `TRUNCATE app.${table}`, `ALTER TABLE app.${table} DISABLE TRIGGER ALL`]) {
      const context: VerifiedTenantContext = await world.a.ctx;
      await expect(withTenant(c.runtime, context, async db => db.$client.query(operation, operation.includes("$4") ? [world.a.p.tenantId, randomUUID(), world.a.jobId, world.a.priced.variationId] : operation.includes("$1") ? [world.a.p.tenantId] : []))).rejects.toMatchObject({ code: "42501" });
    }
  }
  expect((await c.admin.query("SELECT proname FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN('ent5_command','ent5_client_decide','ent5_record_extra_pack','ent5_fire_escalation')")).rows).toEqual([]);
  for (const role of ["jobguard_runtime", "jobguard_infrastructure"]) expect((await c.admin.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'ent5_%' AND has_function_privilege($1,p.oid,'EXECUTE')", [role])).rows).toEqual([]);
  expect((await c.admin.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE n.nspname='app' AND p.proname LIKE 'ent5_%' AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows).toEqual([]);
});
it("E5-09 partial source binding preserves the origin-bound SoR row and basis", async () => {
  const f = world.a;
  const before = (await c.admin.query("SELECT row_to_json(t)::text bytes FROM app.extra_sor_revision t WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, f.priced.variationId])).rows;
  const sourceProof = await proofBefore(c.admin, ["app.extra_origin", "app.extra_sor_revision", "app.extra_pricing_basis", "app.variation"]);
  const binding = await insertBinding(c, f); await insertBinding(c, world.b); await insertPack(c, f);
  expect(await proofDifferences(c.admin, sourceProof)).toEqual({ rows: [], types: [] });
  const fresh = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "ent4b_login", max: 1 });
  try {
    const freshContext: VerifiedTenantContext = await f.ctx;
    const stored = await withTenant(fresh, freshContext, db => loadExtraApprovalBinding(db, { version: "extra-binding-query.v1", jobId: f.jobId, extraId: f.priced.variationId, bindingId: binding.id }));
    expect(JSON.parse(stored).source_revision_id).toBe(f.source.id);
    expect(JSON.parse(stored).source_hash).toBe(f.source.content_hash);
  } finally { await fresh.end(); }
  expect(await bindingCount(c, f)).toBe(1); expect(await bindingCount(c, world.b)).toBe(1);
  expect((await c.admin.query("SELECT row_to_json(t)::text bytes FROM app.extra_sor_revision t WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, f.priced.variationId])).rows).toEqual(before);
  const context: VerifiedTenantContext = await f.ctx;
  await withTenant(c.runtime, context, async db => { expect((await db.$client.query("SELECT id FROM app.extra_approval_revision_binding WHERE tenant_id=$1", [world.b.p.tenantId])).rows).toEqual([]); });
  const client = await c.runtime.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id','',true)");
    expect((await client.query("SELECT id FROM app.extra_approval_revision_binding")).rows).toEqual([]);
    await client.query("SELECT set_config('app.tenant_id','invalid',true)");
    await expect(client.query("SELECT id FROM app.extra_evidence_pack")).rejects.toMatchObject({ code: "22P02" });
  } finally { await client.query("ROLLBACK"); client.release(); }
});
it("E5-24 partial wrong-job revision hash and predecessor specimens refuse", async () => {
  for (const changes of [{ job_id: world.a.otherJob }, { source_hash: "a".repeat(64) }, { sor_revision_id: world.b.source.id, source_revision_id: world.b.source.id }, { variation_id: world.a.captured.variationId }, { logical_revision: 2, predecessor_binding_id: randomUUID() }, { logical_revision: 2, predecessor_binding_id: null }, { source_kind: "ordinary", sor_revision_id: null, variation_revision_id: world.a.source.id }]) await expect(insertBinding(c, world.a, changes)).rejects.toMatchObject({ code: expect.stringMatching(/^235(?:03|05|14)$/u) });
});
it("E5-24 partial migration-owner mutation of immutable foundation rows refuses", async () => {
  const f = await (await import("./extra-approval-fixtures.js")).approvalFixture(c);
  await insertBinding(c, f); await insertPack(c, f);
  for (const table of ["extra_approval_revision_binding", "extra_evidence_pack"]) for (const verb of ["UPDATE", "DELETE"]) await expect(ownerTx(c, f.p.tenantId, async db => db.$client.query(verb === "UPDATE" ? `UPDATE app.${table} SET id=id` : `DELETE FROM app.${table}`))).rejects.toMatchObject({ code: "55000" });
});
