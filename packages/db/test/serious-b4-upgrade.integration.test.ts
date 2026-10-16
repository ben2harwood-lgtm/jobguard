import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, insertPhoto, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 120000);
afterAll(async () => closeWorkFixture(f));

it("SERIOUS-B4 upgrade preserves populated completions, receipts, money, audit and privileges, then applies later migrations twice", async () => {
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("_evidence_proof_rework.sql"));
  expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
    await f.admin.query(await readFile(url, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  await seedEvidencePackFixture(f.admin, { withVariation: true });
  const a = await seedWorkJob(f), evidence = await insertPhoto(f, a), link = randomUUID(), completion = randomUUID();
  await workTenant(f.admin, a.tenantId, async db => {
    await db.query("INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type) SELECT $1,tenant_id,id,job_id,scope_item_id,evidence_type FROM app.evidence_object WHERE tenant_id=$2 AND id=$3", [link, a.tenantId, evidence]);
    await db.query("INSERT INTO app.stage_completion(id,tenant_id,job_id,scope_item_id,stage,evidence_link_id,command_id) VALUES($1,$2,$3,$4,'upgrade-stage',$5,$6)", [completion, a.tenantId, a.jobId, a.scopeId, link, randomUUID()]);
  });
  const tables = ["app.stage_completion", "app.stage_review_event", "app.evidence_object", "app.evidence_upload", "app.command_receipt", "app.audit_event", "app.customer_invoice", "app.variation_approval"];
  const before = await proofBefore(f.admin, tables);
  expect(Object.keys(before["app.stage_completion"]!.rows)).toHaveLength(1);
  const privileges = async () => (await f.admin.query("SELECT c.oid::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c WHERE c.oid IN ('app.stage_completion'::regclass,'app.material_requirement'::regclass) ORDER BY c.oid")).rows;
  const routineAcl = async () => (await f.admin.query("SELECT proacl::text,proconfig,prosecdef,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid='app.guard_practice_material_requirement()'::regprocedure")).rows;
  const grants = await privileges(), acl = await routineAcl();
  await f.admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [MIGRATION_URLS[own]!.pathname.split("/").at(-1)]);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  expect(await privileges()).toEqual(grants);
  expect(await routineAcl()).toEqual(acl);
  expect((await f.admin.query("SELECT supersedes_completion_id FROM app.stage_completion WHERE id=$1", [completion])).rows).toEqual([{ supersedes_completion_id: null }]);
  // Duplicate roots and wrong-stage predecessors fail even through owner writes.
  for (const stage of ["upgrade-stage", "wrong-stage"]) await rolledBack(f.admin, async db => {
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    await expect(db.query("INSERT INTO app.stage_completion(id,tenant_id,job_id,scope_item_id,stage,evidence_link_id,command_id,supersedes_completion_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(), a.tenantId, a.jobId, a.scopeId, stage, link, randomUUID(), stage === "wrong-stage" ? completion : null])).rejects.toMatchObject({ code: stage === "wrong-stage" ? "23503" : "23505" });
  });
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
});
