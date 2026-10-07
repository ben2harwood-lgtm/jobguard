import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";

// 0096 adds job-qualified foreign keys to tables that FORCE row-level security.
// Deployments run migrations as the non-superuser owner role, with no tenant
// context. This suite applies 0096 exactly that way against a preceding-schema
// database that contains a legacy cross-job link in another tenant, and checks
// that (a) the link is found, (b) nothing is half-applied, (c) FORCE RLS is intact
// afterwards, and (d) the same migration applies once the legacy row is repaired.
const name = (url: URL) => basename(fileURLToPath(url));
const target = MIGRATION_URLS.find(url => name(url).endsWith("_watchdog_live.sql"))!;
const TARGET = name(target);
const previous = MIGRATION_URLS.slice(0, MIGRATION_URLS.indexOf(target));
const forcedTables = ["job", "scope_identity", "material_requirement", "purchase_order_draft", "evidence_upload", "evidence_object", "evidence_link", "stage_completion", "synthetic_evidence_original"];
const newConstraints = ["purchase_order_requirement_job_fk", "evidence_upload_job_fk", "evidence_upload_scope_job_fk", "evidence_object_job_fk", "evidence_object_scope_job_fk", "evidence_object_upload_job_fk", "evidence_object_original_job_fk", "evidence_link_evidence_job_fk", "stage_completion_evidence_job_fk", "synthetic_original_upload_job_fk"];
const tenantA = randomUUID(), tenantB = randomUUID();
const jobA = randomUUID(), jobB1 = randomUUID(), jobB2 = randomUUID();
const scopeA = randomUUID(), scopeB1 = randomUUID(), scopeB2 = randomUUID(), mislinkedUpload = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, directory: string;

async function applyAsMigrationOwner() {
  const sql = await readFile(target, "utf8"), client = await admin.connect();
  try {
    await client.query("SET ROLE jobguard_migration");
    await client.query(sql);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}
// The pre-deploy mislink check is documented in MIGRATIONS.md; the suite runs that exact text.
async function documentedMislinkCheck() {
  const docs = await readFile(new URL("../MIGRATIONS.md", import.meta.url), "utf8");
  const sql = docs.match(/```sql\n(-- \d+ pre-deploy check[\s\S]*?)```/u)?.[1];
  expect(sql, `MIGRATIONS.md must contain the ${TARGET} pre-deploy check`).toBeTruthy();
  return (await admin.query<{ constraint_name: string; violations: string }>(sql!)).rows.filter(row => Number(row.violations) > 0).map(row => [row.constraint_name, Number(row.violations)]);
}
const posture = async () => (await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname", [forcedTables])).rows;

beforeAll(async () => {
  expect(previous.some(url => name(url).endsWith("_shared_money_origin.sql"))).toBe(true);
  expect(previous).toEqual(MIGRATION_URLS.slice(0, MIGRATION_URLS.indexOf(target)));
  directory = await mkdtemp(join(tmpdir(), "jg-ch2-owner-"));
  const port = 60500 + Math.floor(Math.random() * 400);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", max: 4 });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of previous) {
    await admin.query(await readFile(url, "utf8"));
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)", [name(url)]);
  }
  await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)", [tenantA, tenantB]);
  for (const [tenant, job, scope] of [[tenantA, jobA, scopeA], [tenantB, jobB1, scopeB1], [tenantB, jobB2, scopeB2]] as const) {
    await admin.query("INSERT INTO app.job(id,tenant_id,title,status)VALUES($1,$2,'Legacy fictional job','live')", [job, tenant]);
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [scope, tenant, job]);
  }
  // Legal before 0096: tenant-qualified only, so job B1's upload may point at job B2's scope.
  await admin.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)VALUES($1,$2,$3,$4,$5,repeat('a',64),'image/png',100,'standard_evidence','2099-01-01')", [mislinkedUpload, tenantB, jobB1, scopeB2, `legacy/${mislinkedUpload}`]);
}, 60000);
afterAll(async () => { await closeTestPools(admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe("CH-2 migration 0096 as the non-superuser migration owner", () => {
  it("is applied by a role that is neither superuser nor BYPASSRLS", async () => {
    expect((await admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_migration'")).rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    expect((await posture()).every(row => row.relrowsecurity && row.relforcerowsecurity && row.rolname === "jobguard_migration")).toBe(true);
  });
  it("finds a legacy cross-job link in another tenant, applies nothing and leaves FORCE RLS intact", async () => {
    // The documented read-only pre-deploy query names the same row's constraint before anything is applied.
    expect(await documentedMislinkCheck()).toEqual([["evidence_upload_scope_job_fk", 1]]);
    await expect(applyAsMigrationOwner()).rejects.toMatchObject({ code: "23503", constraint: "evidence_upload_scope_job_fk" });
    expect((await admin.query("SELECT conname FROM pg_constraint WHERE conname=ANY($1::text[])", [newConstraints])).rows).toEqual([]);
    expect((await admin.query("SELECT to_regprocedure('app.require_watchdog_live(uuid)')::text AS fn")).rows[0].fn).toBeNull();
    const rows = await posture();
    expect(rows).toHaveLength(forcedTables.length);
    expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity && row.rolname === "jobguard_migration")).toBe(true);
  });
  it("applies once the legacy row is repaired, validates every constraint and restores FORCE RLS", async () => {
    // Forward-fix: point the upload at its own job's scope; nothing is removed.
    await admin.query("UPDATE app.evidence_upload SET scope_item_id=$1 WHERE tenant_id=$2 AND id=$3", [scopeB1, tenantB, mislinkedUpload]);
    expect(await documentedMislinkCheck()).toEqual([]);
    await applyAsMigrationOwner();
    const checked = await admin.query("SELECT conname,convalidated FROM pg_constraint WHERE conname=ANY($1::text[])", [newConstraints]);
    expect(checked.rows).toHaveLength(newConstraints.length);
    expect(checked.rows.every(row => row.convalidated)).toBe(true);
    const rows = await posture();
    expect(rows).toHaveLength(forcedTables.length);
    expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity && row.rolname === "jobguard_migration")).toBe(true);
    expect((await admin.query("SELECT scope_item_id FROM app.evidence_upload WHERE id=$1", [mislinkedUpload])).rows).toEqual([{ scope_item_id: scopeB1 }]);
  });
});
