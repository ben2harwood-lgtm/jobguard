// PostgreSQL execution belongs to CI; local sandbox cannot start a server.
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
let f: WorkFixture;
const name = (url: URL) => url.pathname.split("/").at(-1)!;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => { await closeWorkFixture(f); });
it("0285 upgrades populated pre-existing state without changing rows, catalog privileges or existing routines; reruns are idempotent", async () => {
  const own = MIGRATION_URLS.findIndex(u => name(u) === "0285_enterprise_baseline.sql");
  expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
    const sql = await readFile(url, "utf8");
    await f.admin.query(name(url) === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name(url)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  await seedEvidencePackFixture(f.admin, { withVariation: true });
  const before = await proofBefore(f.admin, ["app.job", "app.variation", "app.membership", "app.evidence_object"]);
  for (const value of Object.values(before)) expect(Object.keys(value.rows).length).toBeGreaterThan(0);
  const relations = async () => (await f.admin.query(`SELECT c.oid::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','infrastructure','audit_control') ORDER BY c.oid`)).rows;
  const routines = async () => (await f.admin.query(`SELECT p.oid::text,p.proacl::text,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','infrastructure','audit_control') AND p.prokind IN('f','p') ORDER BY p.oid`)).rows;
  const oldRelations = await relations(), oldRoutines = await routines();
  await f.admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name(MIGRATION_URLS[own]!)]);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  expect((await relations()).filter(row => oldRelations.some(old => old.oid === row.oid))).toEqual(oldRelations);
  expect((await routines()).filter(row => oldRoutines.some(old => old.oid === row.oid))).toEqual(oldRoutines);
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
}, 300000);
it("0285 is discovered on a fresh install and repeated migration succeeds", async () => {
  const fresh = await createWorkFixture(false);
  try {
    await migrate(fresh.admin); await migrate(fresh.admin);
    expect((await fresh.admin.query("SELECT to_regclass('app.enterprise_baseline_batch')::text name")).rows[0].name).toBe("app.enterprise_baseline_batch");
  } finally { await closeWorkFixture(fresh); }
}, 300000);
