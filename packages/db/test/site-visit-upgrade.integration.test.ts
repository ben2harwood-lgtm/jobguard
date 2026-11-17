// Rule 9 upgrade proof for migration 0139 (ENT-3b). Real PostgreSQL (embedded). Proves ITS OWN migration only.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ExtraRepository, MIGRATION_URLS, migrate } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
import { siteFixture, direct, ownerTx, type SiteFixture } from "./site-extra-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
const migrationName = "0139_site_visit_closeout.sql";
const passphrase = randomUUID();
let postgres: EmbeddedPostgres, directory: string, admin: Pool, runtime: Pool, migrationLogin: Pool, f: SiteFixture, c: Cluster;
let openVisit: string, doneVisit: string;
const nameOf = (url: URL) => url.pathname.split("/").at(-1)!;

beforeAll(async () => {
 directory = await mkdtemp(join(tmpdir(), "jg-ent3b-upgrade-"));
 const port = await freePort(64400, 200);
 const config = { host: "127.0.0.1", port, user: "postgres", password: passphrase };
 postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: passphrase, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start();
 const control = new Pool(config); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
 admin = new Pool({ ...config, database: "jobguard_synthetic_demo" });
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 const at = MIGRATION_URLS.findIndex(url => nameOf(url) === migrationName);
 expect(at).toBeGreaterThan(0);
 // Everything before N, exactly as migrate() applies it (details-needed backfill mode for 0095).
 for (const url of MIGRATION_URLS.slice(0, at)) {
  const sql = await readFile(url, "utf8");
  await admin.query(nameOf(url) === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [nameOf(url)]);
 }
 await installLegacySyntheticPartyFixtures(admin);
 await admin.query(`CREATE ROLE ent3b_up_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS; GRANT jobguard_runtime TO ent3b_up_login`);
 runtime = new Pool({ ...config, database: "jobguard_synthetic_demo", user: "ent3b_up_login", max: 8 });
 await admin.query(`CREATE ROLE ent3b_up_migration LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_migration TO ent3b_up_migration`);
 migrationLogin = new Pool({ ...config, database: "jobguard_synthetic_demo", user: "ent3b_up_migration" });
 c = { admin, runtime, config, close: async () => undefined } as unknown as Cluster;
 // Populated history written at the schema just before N: roster, assignments, grants, receipts, audit events, an extra, an open and a completed visit.
 f = await siteFixture(c);
 openVisit = randomUUID(); doneVisit = randomUUID();
 await ownerTx(c, f.p.tenantId, async db => {
  await db.$client.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES($1,$2,$3,$4,$5)", [f.p.tenantId, openVisit, f.jobId, f.orderId, f.members.operative.member.membershipId]);
  await db.$client.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id,started_at,completed_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')", [f.p.tenantId, doneVisit, f.jobId, f.orderId, f.members.operative.member.membershipId]);
 });
 await new ExtraRepository(runtime).raiseExtra(f.ctx, direct(f, f.members.operative, { siteVisitId: openVisit }));
}, 240_000);
afterAll(async () => { await closeTestPools(runtime, migrationLogin, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

type CatalogRow = { identity: string; bytes: string };
async function catalog() {
 const ns = "n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'";
 const q = async (sql: string) => (await admin.query<CatalogRow>(sql)).rows;
 return {
  relations: await q(`SELECT n.nspname||'.'||c.relname identity,row_to_json(t)::text bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL (SELECT c.relkind,pg_get_userbyid(c.relowner) owner,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity) t WHERE ${ns} AND c.relkind IN('r','i','v','S','m','p','f') ORDER BY identity`),
  columns: await q(`SELECT n.nspname||'.'||c.relname||'.'||a.attname identity,row_to_json(t)::text bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum CROSS JOIN LATERAL (SELECT a.attnum,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attacl::text acl,pg_get_expr(d.adbin,d.adrelid) default_expression) t WHERE ${ns} AND c.relkind IN('r','v','m','p','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY identity`),
  functions: await q(`SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' identity,row_to_json(t)::text bytes FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL (SELECT pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl) t WHERE ${ns} AND p.prokind IN('f','p') ORDER BY identity`),
  policies: await q(`SELECT schemaname||'.'||tablename||'.'||policyname identity,row_to_json(p)::text bytes FROM pg_policies p WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema' ORDER BY identity`),
  triggers: await q(`SELECT n.nspname||'.'||c.relname||'.'||g.tgname identity,row_to_json(t)::text bytes FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL (SELECT pg_get_triggerdef(g.oid) definition,g.tgenabled) t WHERE ${ns} AND NOT g.tgisinternal ORDER BY identity`),
  constraints: await q(`SELECT n.nspname||'.'||c.relname||'.'||k.conname identity,row_to_json(t)::text bytes FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL (SELECT k.contype,pg_get_constraintdef(k.oid) definition) t WHERE ${ns} ORDER BY identity`),
 };
}
type Catalog = Awaited<ReturnType<typeof catalog>>;
/** Every identity present before is present after with identical bytes; returns the identities that are new. */
function added(before: CatalogRow[], after: CatalogRow[], label: string): string[] {
 const now = new Map(after.map(row => [row.identity, row]));
 for (const row of before) expect(now.get(row.identity), `${label}: pre-existing ${row.identity}`).toEqual(row);
 const names = new Set(before.map(row => row.identity));
 return after.filter(row => !names.has(row.identity)).map(row => row.identity);
}
async function privilegeOnVisit() {
 return (await admin.query("SELECT p.privilege,has_table_privilege('jobguard_runtime','app.site_visit',p.privilege) held FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege) ORDER BY 1")).rows;
}

describe("ENT-3b migration 0139 upgrade proof (rule 9)", () => {
 it("[B19] applies only 0139 over populated visits, extras, grants, receipts and audit history, then everything after twice; named canonical columns, full types and primary identities are unchanged; four controls behave as rule 9 says", async () => {
  const names = MIGRATION_URLS.map(nameOf), index = names.indexOf(migrationName);
  expect(names).toEqual([...names].sort());
  expect((await admin.query<{ migration_name: string }>("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name)).toEqual(names.slice(0, index));
  expect((await admin.query("SELECT to_regclass('app.closeout_answer') name")).rows[0]!.name).toBeNull();
  // The compared tables: the six the order names plus every other populated predecessor table.
  const tables = ["app.site_visit", "app.job_assignment", "app.extra_origin", "app.command_receipt", "app.role_grant", "app.audit_event"];
  const everyTable = (await admin.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1`)).rows.map(row => row.name as string);
  for (const table of everyTable) if (!tables.includes(table) && (await admin.query(`SELECT EXISTS(SELECT 1 FROM ${table}) populated`)).rows[0]!.populated) tables.push(table);
  const before = await proofBefore(admin, tables);
  // Guard: at least one pre-existing row per compared table, and the visit table holds both an open and a completed visit.
  for (const table of tables) expect(Object.keys(before[table]!.rows).length, `${table}: at least one pre-existing row`).toBeGreaterThan(0);
  expect(Object.keys(before["app.site_visit"]!.rows).length).toBeGreaterThanOrEqual(2);
  const catalogBefore = await catalog(), visitPrivilegesBefore = await privilegeOnVisit();
  const clean = { rows: [], types: [] };
  // N alone, as the migration role.
  const url = MIGRATION_URLS.find(item => nameOf(item) === migrationName)!;
  const client = await migrationLogin.connect();
  try { await client.query("SET ROLE jobguard_migration"); await client.query(await readFile(url, "utf8")); } finally { await client.query("RESET ROLE"); client.release(); }
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migrationName]);
  expect(await proofDifferences(admin, before)).toEqual(clean);
  // The only differences at N's own step: the new table with its policy, constraints, indexes and triggers; the six functions; the one trigger on the visit table.
  const after: Catalog = await catalog();
  expect(added(catalogBefore.relations, after.relations, "relations").sort()).toEqual(["app.closeout_answer", "app.closeout_answer_pkey", "app.closeout_answer_tenant_id_command_id_key", "app.closeout_answer_tenant_id_site_visit_id_key"]);
  expect(added(catalogBefore.columns, after.columns, "columns").sort()).toEqual(["answer", "command_id", "id", "job_id", "membership_id", "question_version", "server_recorded_at", "site_visit_id", "tenant_id", "work_order_id"].map(name => `app.closeout_answer.${name}`).sort());
  expect(added(catalogBefore.functions, after.functions, "functions").sort()).toEqual(["app.ent3b_closeout_guard()", "app.ent3b_complete_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_answer text)", "app.ent3b_require_closeout_audit()", "app.ent3b_require_open_visit(p_job uuid, p_variation uuid)", "app.ent3b_start_visit(p_actor uuid, p_command uuid, p_job uuid)", "app.ent3b_visit_authority(p_actor uuid, p_job uuid)"].sort());
  expect(added(catalogBefore.policies, after.policies, "policies")).toEqual(["app.closeout_answer.tenant_isolation"]);
  expect(added(catalogBefore.triggers, after.triggers, "triggers").sort()).toEqual(["app.closeout_answer.closeout_answer_audit", "app.closeout_answer.closeout_answer_guard", "app.closeout_answer.closeout_answer_immutable", "app.site_visit.site_visit_closeout_answer"]);
  expect(added(catalogBefore.constraints, after.constraints, "constraints").filter(identity => !identity.startsWith("app.closeout_answer."))).toEqual(["app.site_visit.site_visit_closeout_answer"]);
  // (A deferred constraint trigger has a constraint row of its own: the one on the visit table is the only addition to an existing table.)
  // No grant, column, index, policy or constraint of any existing table changed: the runtime role keeps SELECT only on the visit table.
  expect(await privilegeOnVisit()).toEqual(visitPrivilegesBefore);
  expect(visitPrivilegesBefore.filter(row => row.held).map(row => row.privilege)).toEqual(["SELECT"]);
  // Everything after N, twice.
  await migrate(admin); await migrate(admin);
  expect(await proofDifferences(admin, before)).toEqual(clean);
  expect((await admin.query<{ migration_name: string }>("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name)).toEqual(names);

  // Controls: every one uses precisely the same comparison and rolls back its own change.
  await rolledBack(admin, async db => {
   await db.query("UPDATE app.site_visit SET started_at=started_at+interval '1 microsecond' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, openVisit]);
   const changed = await proofDifferences(db, before);
   expect(changed.rows).toHaveLength(1); expect(changed.rows[0]).toContain("app.site_visit"); expect(changed.types).toEqual([]);
  });
  expect(await proofDifferences(admin, before)).toEqual(clean);
  await rolledBack(admin, async db => {
   await db.query("ALTER TABLE app.command_receipt ALTER COLUMN semantic_key TYPE text");
   const changed = await proofDifferences(db, before);
   expect(changed.types.some(change => change.includes("semantic_key") && change.includes("text"))).toBe(true);
  });
  expect(await proofDifferences(admin, before)).toEqual(clean);
  await rolledBack(admin, async db => {
   await db.query("ALTER TABLE app.site_visit ADD COLUMN later_nullable_control text");
   expect(await proofDifferences(db, before)).toEqual(clean);
  });
  await rolledBack(admin, async db => {
   expect(await scratchReplaceFunction(db, "app.contractor_job_assigned(uuid,uuid)")).toBe(true);
   expect(await proofDifferences(db, before)).toEqual(clean);
  });
  // A row added by a later migration (or later work) is ignored: only the captured identities are compared.
  await rolledBack(admin, async db => {
   const later = randomUUID();
   await db.query("INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES($1,$2,$3,$4,$5)", [f.p.tenantId, later, f.jobId, f.orderId, f.members.operative.member.membershipId]);
   expect((await db.query("SELECT count(*)::int n FROM app.site_visit WHERE id=$1", [later])).rows).toEqual([{ n: 1 }]);
   expect(await proofDifferences(db, before)).toEqual(clean);
  });
  expect(await proofDifferences(admin, before)).toEqual(clean);
  // The proof's own subject rows are unchanged to the microsecond, as canonical text.
  expect((await admin.query("SELECT row_to_json(v)::text row FROM (SELECT completed_at,started_at FROM app.site_visit WHERE tenant_id=$1 AND id=$2) v", [f.p.tenantId, doneVisit])).rows).toHaveLength(1);
 });
});
