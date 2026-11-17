import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractorRoles } from "@jobguard/core";
import { AuditExportRepository, ContractorRepository, exportAuditCheckpoints, handoffAuditExportCheckpoint, verifyAuditChain, verifySignedAuditExport, migrate, MIGRATION_URLS, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type AuditCheckpoint, type AuditEvent } from "../src/index.js";
import { AuditExportApplication, auditExportHttpFailure } from "../../../apps/api/src/audit-export/audit-export.application.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import * as upgradeProof from "./upgrade-proof-utils.js";
import { compare, type Subject } from "./audit-export-privilege-comparator.js";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractor: ContractorRepository, repo: AuditExportRepository;
const context = (p: AuthenticatedMembership) => verifiedTenantContextFromMembership(p);
const actor = (p: AuthenticatedMembership) => ({ membershipId: p.membershipId, identityUserId: p.identityUserId });
let priorSecurityCatalog: unknown;
let upgrade: {
  before: Subject[]; names: string[]; own: number; halfOid: string; ownRegistry: string[]; ownTables: boolean[];
  ownStepSecurityCatalog: SecurityCatalog; ownStepDifferences: string[]; controls: ControlResult[];
  afterControlsCatalog: SecurityCatalog; afterControlsDifferences: string[]; scratchCount: string; afterAllDifferences: string[];
};
type Queryable = Pick<Pool | PoolClient, "query">;
async function securityCatalog(db: Queryable = admin) {
  return {
    tables: (await db.query(`SELECT n.nspname,c.relname,c.relacl::text,c.relowner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') AND c.relkind='r' AND c.relname NOT IN ('audit_export','audit_export_checkpoint') ORDER BY n.nspname,c.relname`)).rows,
    policies: (await db.query(`SELECT * FROM pg_policies WHERE schemaname IN ('app','audit_control','identity','control_plane','infrastructure') AND tablename NOT IN ('audit_export','audit_export_checkpoint') ORDER BY schemaname,tablename,policyname`)).rows,
    routines: (await db.query(`SELECT n.nspname,p.proname,p.proargtypes::text,p.proacl::text,p.proowner,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') ORDER BY n.nspname,p.proname,p.proargtypes`)).rows,
    roles: (await db.query(`SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname LIKE 'jobguard_%' ORDER BY rolname`)).rows,
  };
}
type SecurityCatalog = Awaited<ReturnType<typeof securityCatalog>>;
type Control = { id: string; statements: string[]; expected: string[] | "owner moved"; merged: (keyof SecurityCatalog)[] | null; inspect?: "replace" | "column" | "name"; precondition?: string };
type ControlReading = { after: string[]; merged?: (keyof SecurityCatalog)[]; confirmed?: boolean; precondition?: boolean } | { error: string };
type ControlResult = Control & { result: ControlReading };

// Not compared at any step: grants on schemas, sequences, views and types, or default privileges.
// After later migrations: routine bodies/settings are not compared; any older policy text change stops the proof,
// without deciding whether it got tighter. An older object dropped without a same-id/name counterpart is no longer compared.
// Memberships of an older jobguard_ role are read in both directions ("member of X" and "has member X"), so any role, new or
// old, jobguard_ or not, that joins an older jobguard_ role is seen on that older role. Not read: admin, inherit and set flags
// of a membership that already existed, and role-level settings.
async function privilegeFacts(db: Queryable): Promise<Subject[]> {
  const rows = (await db.query(`
    SELECT row_to_json(s)::text AS bytes FROM (
      SELECT 'table'::text AS kind,c.oid::text AS oid,(n.nspname||'.'||c.relname)::text AS name,
        ARRAY['owner '||pg_get_userbyid(c.relowner)] || ARRAY(
          SELECT 'grant '||(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)||' '||a.privilege_type||g.suffix
          FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
          CROSS JOIN LATERAL (SELECT ''::text AS suffix UNION ALL SELECT ' WITH GRANT OPTION' WHERE a.is_grantable) g
        ) || (CASE WHEN c.relrowsecurity THEN ARRAY[]::text[] ELSE ARRAY['row security off'] END)
          || (CASE WHEN c.relforcerowsecurity THEN ARRAY[]::text[] ELSE ARRAY['row security not forced'] END) AS facts,
        ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE (a.attrelid=c.oid) AND (a.attnum>0) AND (NOT a.attisdropped) ORDER BY a.attnum) AS columns,
        coalesce((SELECT json_agg(json_build_object('column',a.attname::text,'fact',
          'grant '||(CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END)||' '||acl.privilege_type||g.suffix))
          FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl
          CROSS JOIN LATERAL (SELECT ''::text AS suffix UNION ALL SELECT ' WITH GRANT OPTION' WHERE acl.is_grantable) g
          WHERE (a.attrelid=c.oid) AND (a.attnum>0) AND (NOT a.attisdropped)), '[]'::json) AS "columnGrants",
        coalesce((SELECT json_object_agg(p.policyname,json_build_object('permissive',p.permissive='PERMISSIVE','text',
          (SELECT row_to_json(x)::text FROM (SELECT p.permissive,p.roles,p.cmd,p.qual,p.with_check) x)))
          FROM pg_policies p WHERE (p.schemaname=n.nspname) AND (p.tablename=c.relname)), '{}'::json) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname IN ('app','audit_control','identity','control_plane','infrastructure')) AND (c.relkind='r')
    ) s
    UNION ALL
    SELECT row_to_json(s)::text AS bytes FROM (
      SELECT 'routine'::text AS kind,p.oid::text AS oid,(n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')')::text AS name,
        ARRAY['owner '||pg_get_userbyid(p.proowner)] || ARRAY(
          SELECT 'grant '||(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)||' '||a.privilege_type||g.suffix
          FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          CROSS JOIN LATERAL (SELECT ''::text AS suffix UNION ALL SELECT ' WITH GRANT OPTION' WHERE a.is_grantable) g
        ) || (CASE WHEN p.prosecdef THEN ARRAY['runs as owner'] ELSE ARRAY[]::text[] END) AS facts,
        ARRAY[]::text[] AS columns,'[]'::json AS "columnGrants",'{}'::json AS policies
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure')
    ) s
    UNION ALL
    SELECT row_to_json(s)::text AS bytes FROM (
      SELECT 'role'::text AS kind,r.oid::text AS oid,r.rolname::text AS name,
        ARRAY(SELECT a.name FROM (VALUES ('rolsuper',r.rolsuper),('rolbypassrls',r.rolbypassrls),('rolcreaterole',r.rolcreaterole),
          ('rolcreatedb',r.rolcreatedb),('rolinherit',r.rolinherit),('rolcanlogin',r.rolcanlogin),('rolreplication',r.rolreplication)) a(name,enabled) WHERE a.enabled)
          || ARRAY(SELECT DISTINCT 'member of '||pg_get_userbyid(m.roleid) FROM pg_auth_members m WHERE m.member=r.oid)
          || ARRAY(SELECT DISTINCT 'has member '||pg_get_userbyid(m.member) FROM pg_auth_members m WHERE m.roleid=r.oid) AS facts,
        ARRAY[]::text[] AS columns,'[]'::json AS "columnGrants",'{}'::json AS policies
      FROM pg_roles r WHERE r.rolname LIKE 'jobguard_%'
    ) s
  `)).rows as { bytes: string }[];
  return rows.map(row => JSON.parse(row.bytes) as Subject);
}
async function privilegeDifferences(db: Queryable, before: Subject[]): Promise<string[]> {
  return compare(before, await privilegeFacts(db));
}
const request = (commandId = randomUUID()) => ({ version: "audit-export-request.v1", commandId });
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  dir = await mkdtemp(join(tmpdir(), "jg-audit-export-")); const port = await freePort(58300, 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  // Real upgrade from the preceding supported schema, then idempotent migrator replay.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const names = MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!), own = names.indexOf("0121_audit_export.sql");
  expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) {
    await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  priorSecurityCatalog = await securityCatalog();
  const before = await privilegeFacts(admin);
  await admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [names[own]]);
  const ownRegistry = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name as string);
  const ownTables = (await admin.query("SELECT (to_regclass('app.audit_export') IS NOT NULL) AS exports,(to_regclass('app.audit_export_checkpoint') IS NOT NULL) AS checkpoints")).rows[0]!;
  const ownStepSecurityCatalog = await securityCatalog();
  const ownStepDifferences = await privilegeDifferences(admin, before);
  const half = "app.half_even_ratio(bigint,bigint,bigint)";
  const halfOid = (await admin.query("SELECT $1::regprocedure::oid::text AS oid", [half])).rows[0]!.oid as string;
  const halfName = before.find(subject => subject.kind === "routine" && subject.oid === halfOid)?.name;
  const definitions: Control[] = [
    { id: "S1", statements: ["GRANT TRUNCATE ON app.job TO jobguard_runtime"], expected: ["table app.job: + grant jobguard_runtime TRUNCATE"], merged: ["tables"], precondition: "SELECT has_table_privilege('jobguard_runtime','app.job','TRUNCATE') AS allowed" },
    { id: "S2", statements: ["CREATE ROLE mo5_scratch_role NOLOGIN", "GRANT SELECT ON app.job TO mo5_scratch_role"], expected: ["table app.job: + grant mo5_scratch_role SELECT"], merged: ["tables"] },
    { id: "S3", statements: ["GRANT SELECT ON app.job TO jobguard_runtime WITH GRANT OPTION"], expected: ["table app.job: + grant jobguard_runtime SELECT WITH GRANT OPTION"], merged: ["tables"] },
    { id: "S4", statements: ["GRANT UPDATE(title) ON app.job TO jobguard_runtime"], expected: ["table app.job: + column title grant jobguard_runtime UPDATE"], merged: [], precondition: "SELECT has_column_privilege('jobguard_runtime','app.job','title','UPDATE') AS allowed" },
    { id: "S5", statements: ["ALTER TABLE app.job OWNER TO jobguard_runtime"], expected: "owner moved", merged: ["tables"] },
    { id: "S6", statements: ["ALTER TABLE app.job DISABLE ROW LEVEL SECURITY", "ALTER TABLE app.job NO FORCE ROW LEVEL SECURITY"], expected: ["table app.job: + row security not forced", "table app.job: + row security off"], merged: ["tables"] },
    { id: "S7", statements: ["ALTER POLICY tenant_isolation ON app.job USING (true)"], expected: ["policy app.job.tenant_isolation: changed"], merged: ["policies"] },
    { id: "S8", statements: ["ALTER POLICY tenant_isolation ON app.job TO PUBLIC"], expected: ["policy app.job.tenant_isolation: changed"], merged: ["policies"] },
    { id: "S9", statements: ["CREATE POLICY mo5_scratch ON app.job FOR SELECT TO jobguard_runtime USING (true)"], expected: ["policy app.job.mo5_scratch: permissive policy added"], merged: ["policies"] },
    { id: "S10", statements: ["DROP POLICY practice_material_isolation ON app.merchant"], expected: ["policy app.merchant.practice_material_isolation: restrictive policy gone"], merged: ["policies"] },
    { id: "S11", statements: ["CREATE ROLE mo5_scratch_role NOLOGIN", `GRANT EXECUTE ON FUNCTION ${half} TO mo5_scratch_role`], expected: [`routine ${halfName}: + grant mo5_scratch_role EXECUTE`], merged: ["routines"] },
    { id: "S12", statements: [`ALTER FUNCTION ${half} SECURITY DEFINER`], expected: [`routine ${halfName}: + runs as owner`], merged: ["routines"] },
    { id: "S13", statements: ["ALTER ROLE jobguard_runtime CREATEDB"], expected: ["role jobguard_runtime: + rolcreatedb"], merged: ["roles"] },
    { id: "S14", statements: ["GRANT jobguard_migration TO jobguard_runtime"], expected: ["role jobguard_migration: + has member jobguard_runtime", "role jobguard_runtime: + member of jobguard_migration"], merged: [] },
    { id: "S15", statements: ["CREATE ROLE mo5_scratch_role NOLOGIN", `ALTER FUNCTION ${half} RENAME TO mo5_half_renamed`, "GRANT EXECUTE ON FUNCTION app.mo5_half_renamed(bigint,bigint,bigint) TO mo5_scratch_role"], expected: [`routine ${halfName?.replace("half_even_ratio", "mo5_half_renamed")}: + grant mo5_scratch_role EXECUTE`], merged: ["routines"] },
    { id: "S16", statements: ["CREATE ROLE mo5_scratch_role NOLOGIN", "GRANT jobguard_runtime TO mo5_scratch_role"], expected: ["role jobguard_runtime: + has member mo5_scratch_role"], merged: [] },
    { id: "N1", statements: [], expected: ["table app.job: + grant jobguard_runtime SELECT"], merged: null, inspect: "name" },
    { id: "P1", statements: ["REVOKE INSERT ON app.job FROM jobguard_runtime"], expected: [], merged: ["tables"] },
    { id: "P2", statements: ["CREATE TABLE app.mo5_scratch(tenant_id uuid NOT NULL, id uuid PRIMARY KEY)", "ALTER TABLE app.mo5_scratch ENABLE ROW LEVEL SECURITY", "CREATE POLICY mo5_scratch ON app.mo5_scratch FOR ALL TO jobguard_runtime USING (true)", "GRANT SELECT,INSERT,UPDATE,DELETE ON app.mo5_scratch TO jobguard_runtime, PUBLIC"], expected: [], merged: ["tables", "policies"] },
    { id: "P3", statements: [], expected: [], merged: [], inspect: "replace" },
    { id: "P4", statements: ["ALTER TABLE app.job ADD COLUMN mo5_scratch text"], expected: [], merged: [], inspect: "column" },
    { id: "P5", statements: ["CREATE FUNCTION app.mo5_scratch() RETURNS integer LANGUAGE sql AS 'SELECT 1'"], expected: [], merged: ["routines"] },
    { id: "P6", statements: ["CREATE ROLE jobguard_mo5_scratch NOLOGIN CREATEDB"], expected: [], merged: ["roles"] },
    { id: "P7", statements: ["ALTER TABLE app.job ADD COLUMN mo5_scratch text", "GRANT UPDATE(mo5_scratch) ON app.job TO jobguard_runtime"], expected: [], merged: [] },
    { id: "P8", statements: ["CREATE POLICY mo5_scratch ON app.job AS RESTRICTIVE FOR ALL TO jobguard_runtime USING (false)"], expected: [], merged: ["policies"] },
    { id: "P9", statements: ["DROP POLICY tenant_isolation ON app.job"], expected: [], merged: ["policies"] },
    { id: "P10", statements: [`ALTER FUNCTION ${half} SET search_path=pg_catalog`], expected: [], merged: ["routines"] },
  ];
  const controls: ControlResult[] = [];
  for (const control of definitions) {
    let result: ControlReading;
    try {
      result = await upgradeProof.rolledBack(admin, async client => {
        const precondition = control.precondition ? (await client.query(control.precondition)).rows[0]!.allowed as boolean : undefined;
        for (const statement of control.statements) await client.query(statement);
        let confirmed: boolean | undefined;
        if (control.inspect === "replace") confirmed = await upgradeProof.scratchReplaceFunction(client, half);
        if (control.inspect === "column") confirmed = (await client.query("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid='app.job'::regclass) AND (attname='mo5_scratch') AND (NOT attisdropped)) AS present")).rows[0]!.present as boolean;
        if (control.inspect === "name") {
          const copy = structuredClone(before), job = copy.find(subject => subject.kind === "table" && subject.name === "app.job")!;
          job.oid = "0"; job.facts = job.facts.filter(fact => fact !== "grant jobguard_runtime SELECT");
          return { after: compare(copy, await privilegeFacts(client)) };
        }
        const after = await privilegeDifferences(client, before), catalog = await securityCatalog(client);
        const merged = (Object.keys(catalog) as (keyof SecurityCatalog)[]).filter(key => !isDeepStrictEqual(catalog[key], (priorSecurityCatalog as SecurityCatalog)[key]));
        return { after, merged, ...(confirmed === undefined ? {} : { confirmed }), ...(precondition === undefined ? {} : { precondition }) };
      });
    } catch (error) { result = { error: error instanceof Error ? error.message : String(error) }; }
    controls.push({ ...control, result });
  }
  const afterControlsCatalog = await securityCatalog();
  const afterControlsDifferences = await privilegeDifferences(admin, before);
  const scratchCount = (await admin.query(`SELECT (count(*))::text AS count FROM (
    SELECT relname::text AS name FROM pg_class WHERE relkind='r'
    UNION ALL SELECT proname::text FROM pg_proc
    UNION ALL SELECT policyname::text FROM pg_policies
    UNION ALL SELECT rolname::text FROM pg_roles
  ) s WHERE name LIKE '%mo5%'`)).rows[0]!.count as string;
  await migrate(admin); await migrate(admin);
  // [MO5-e] The reading is taken here, before the test's own login below joins jobguard_runtime, and asserted in the test.
  const afterAllDifferences = await privilegeDifferences(admin, before);
  upgrade = { before, names, own, halfOid, ownRegistry, ownTables: [ownTables.exports, ownTables.checkpoints], ownStepSecurityCatalog, ownStepDifferences, controls, afterControlsCatalog, afterControlsDifferences, scratchCount, afterAllDifferences };
  await admin.query("CREATE ROLE audit_export_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO audit_export_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "audit_export_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 6 });
  contractor = new ContractorRepository(runtime); repo = new AuditExportRepository(runtime);
}, 120000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });
async function setup() { const session = randomUUID(), p = await contractor.startPractice(session); return { session, p }; }
async function checkpoint(p: AuthenticatedMembership) {
  // Existing restricted path: exportAuditCheckpoints creates records using assurance credentials, not runtime.
  // It covers all tenants, but only this tenant's record is handed to its export.
  const existing = (await admin.query<AuditCheckpoint>(`SELECT tenant_id AS "tenantId",sequence::int,event_hash AS "eventHash",recorded_at AS "recordedAt" FROM audit_control.checkpoint WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1`, [p.tenantId])).rows[0];
  const c = existing ?? (await admin.query<AuditCheckpoint>(`INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash)
    SELECT tenant_id,sequence,event_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1
    RETURNING tenant_id AS "tenantId",sequence::int,event_hash AS "eventHash",recorded_at AS "recordedAt"`, [p.tenantId])).rows[0]!;
  await handoffAuditExportCheckpoint(admin, c); return c;
}
async function invite(p: AuthenticatedMembership, role: string, scopeKind = "tenant", scopeId = p.tenantId) {
  const id = randomUUID(), view = await contractor.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
  await contractor.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id, expectedRevision: view.revision, kind: "member.invite", role, email: `${id}@fictional.invalid`, scope: { kind: scopeKind, id: scopeId }, clientId: role === "client_approver" ? scopeId : null, contractId: null });
  const row = (await admin.query<{ identity_user_id: string }>("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [p.tenantId, id])).rows[0]!;
  return { ...p, membershipId: id, identityUserId: row.identity_user_id } as AuthenticatedMembership;
}
describe("ENT-10b PostgreSQL audit exports", () => {
  it("leaves every existing table, policy, routine privilege and runtime role attribute unchanged on upgrade", async () => {
    // [MO5-a] Older subjects and the exact subjects used by the controls exist before 0121.
    for (const kind of ["table", "routine", "role"] as const) expect(upgrade.before.some(subject => subject.kind === kind), `[MO5-a] ${kind}`).toBe(true);
    expect(upgrade.before.some(subject => Object.keys(subject.policies).length > 0), "[MO5-a] policy").toBe(true);
    const job = upgrade.before.find(subject => subject.kind === "table" && subject.name === "app.job")!;
    expect(job, "[MO5-a] app.job").toBeDefined();
    expect(job.facts, "[MO5-a] app.job grants").toEqual(expect.arrayContaining(["grant jobguard_runtime SELECT", "grant jobguard_runtime INSERT"]));
    expect(job.facts, "[MO5-a] row security on").not.toContain("row security off");
    expect(job.facts, "[MO5-a] row security forced").not.toContain("row security not forced");
    expect(job.policies.tenant_isolation?.permissive, "[MO5-a] permissive tenant policy").toBe(true);
    expect(upgrade.before.find(subject => subject.kind === "table" && subject.name === "app.merchant")?.policies.practice_material_isolation?.permissive, "[MO5-a] restrictive merchant policy").toBe(false);
    expect(upgrade.before.find(subject => subject.kind === "routine" && subject.oid === upgrade.halfOid), "[MO5-a] half_even_ratio identity").toBeDefined();
    expect(upgrade.before.some(subject => subject.kind === "role" && subject.name === "jobguard_runtime"), "[MO5-a] runtime role").toBe(true);
    for (const name of ["app.audit_export", "app.audit_export_checkpoint"]) expect(upgrade.before.some(subject => subject.name === name), `[MO5-a] not yet present: ${name}`).toBe(false);
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name='0121_audit_export.sql'")).rows).toEqual([{ migration_name: "0121_audit_export.sql" }]);
    expect(upgrade.ownRegistry, "[MO5-b] 0121 alone registry").toEqual(upgrade.names.slice(0, upgrade.own + 1));
    expect(upgrade.ownTables, "[MO5-b] 0121 tables exist at its own step").toEqual([true, true]);
    expect(upgrade.ownStepSecurityCatalog).toEqual(priorSecurityCatalog); // [MO5-c] Same four merged queries and full equality at 0121 alone.
    expect(upgrade.ownStepDifferences, "[MO5-c] named permission facts").toEqual([]);
    // [MO5-d] Every scratch statement was rolled back; a refused statement is a recorded failure here.
    for (const control of upgrade.controls) {
      const message = `[MO5-d] ${control.id}: ${JSON.stringify(control.result)}`;
      expect(control.result, message).not.toHaveProperty("error");
      if ("error" in control.result) continue;
      if (control.expected === "owner moved") {
        expect(control.result.after, message).toContain("table app.job: + owner jobguard_runtime");
        expect(control.result.after.every(line => line.startsWith("table app.job: + ")), message).toBe(true);
      } else expect(control.result.after, message).toEqual(control.expected);
      if (control.merged !== null) expect(control.result.merged, message).toEqual(control.merged);
      if (control.precondition) expect(control.result.precondition, message).toBe(false);
      if (control.inspect === "replace" || control.inspect === "column") expect(control.result.confirmed, message).toBe(true);
    }
    expect(upgrade.afterControlsCatalog, "[MO5-f] catalogue restored").toEqual(upgrade.ownStepSecurityCatalog);
    expect(upgrade.afterControlsDifferences, "[MO5-f] permission facts restored").toEqual([]);
    expect(upgrade.scratchCount, "[MO5-f] no scratch objects or roles").toBe("0");
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO5-e] all migrations recorded").toEqual(upgrade.names);
    // Nothing reads whole catalogue rows, routine text or routine settings after the later migrations.
    // They may add tables, columns, policies on their own tables, routines and roles, replace routines and take privileges away.
    // They may not widen a grant, move an owner, switch row security off, change an older policy, add a permissive policy to an
    // older row-secured table, remove an older restrictive policy, give an older jobguard_ role an attribute or a membership, or
    // give any role (new or old) membership of an older jobguard_ role. The reading was taken in the set-up directly after the
    // migrate() pair, before the test's own login joined jobguard_runtime, and is asserted here.
    // Reviewed 0209 exceptions only: five source SELECT grants and their five
    // tenant-scoped policies. The comparator and every other refusal stay intact.
    const reviewedMeterSources=["app.job","app.job_activation","app.job_activation_terms","app.job_party_binding","app.membership"].flatMap(table=>[
      `table ${table}: + grant jobguard_meter_owner SELECT`,
      `policy ${table}.meter_lifecycle_source_read: permissive policy added`,
    ]).sort();
    expect(upgrade.afterAllDifferences, "[MO5-e] only reviewed meter source additions to older permission facts").toEqual(reviewedMeterSources);
  });
  it("exports one tenant only, including shared-user tenants, with its own audit event and distinct public key", async () => {
    const a = await setup(), b = await setup();
    await admin.query("UPDATE app.membership SET identity_user_id=$1 WHERE tenant_id=$2 AND id=$3", [a.p.identityUserId, b.p.tenantId, b.p.membershipId]);
    await admin.query("UPDATE control_plane.contractor_practice_session SET identity_user_id=$1 WHERE tenant_id=$2 AND membership_id=$3", [a.p.identityUserId, b.p.tenantId, b.p.membershipId]);
    const bp = await contractor.resolveSession(b.session); expect(bp.identityUserId).toBe(a.p.identityUserId);
    await exportAuditCheckpoints(admin); await checkpoint(a.p); await checkpoint(bp);
    const bFile = await repo.create(context(bp), actor(bp), request());
    await expect(repo.list(context(a.p), actor(bp))).rejects.toMatchObject({ code: "AUDIT_EXPORT_FORBIDDEN" });
    await expect(repo.create(context(a.p), actor(bp), request())).rejects.toMatchObject({ code: "AUDIT_EXPORT_FORBIDDEN" });
    const aFile = await repo.create(context(a.p), actor(a.p), request());
    const payload = verifySignedAuditExport(aFile.file, aFile.file.publicKeyPem).payload;
    expect(payload.entries.every(e => e.tenantId === a.p.tenantId)).toBe(true); expect(payload.checkpoints.every(c => c.tenantId === a.p.tenantId)).toBe(true);
    for (const foreign of [bp.tenantId, bp.membershipId, bFile.id, bFile.headHash, bFile.file.publicKeyPem]) expect(JSON.stringify(payload)).not.toContain(foreign);
    expect(aFile.file.publicKeyPem).not.toBe(bFile.file.publicKeyPem);
    expect(payload.entryCount).toBe((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [a.p.tenantId])).rows[0].n);
    expect((await admin.query("SELECT id FROM app.audit_event WHERE tenant_id=$1 AND event_type='audit.export.created'", [a.p.tenantId])).rows).toEqual([{ id: aFile.id }]);
    expect(payload.entries.at(-1)?.id).toBe(aFile.id);
    expect(await repo.list(context(a.p), actor(a.p))).toMatchObject([{ id: aFile.id }]);
    const otherConnection = new AuditExportRepository(runtime); expect(await otherConnection.list(context(a.p), actor(a.p))).toMatchObject([{ id: aFile.id }]);
    await withTenant(runtime, context(a.p), async db => { for (const table of ["audit_export", "audit_export_checkpoint"]) expect((await db.$client.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`, [bp.tenantId])).rows).toEqual([]); });
  });
  it("requires a trusted handoff and rolls back creation/audit on failure", async () => {
    const { p } = await setup(), cmd = request();
    await expect(repo.create(context(p), actor(p), cmd)).rejects.toMatchObject({ code: "AUDIT_EXPORT_CHECKPOINT_REQUIRED" });
    expect((await admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [p.tenantId, cmd.commandId])).rowCount).toBe(0);
    const cp = await checkpoint(p); await handoffAuditExportCheckpoint(admin, cp);
    await expect(handoffAuditExportCheckpoint(admin, { ...cp, eventHash: "f".repeat(64), sequence: cp.sequence + 100 })).rejects.toMatchObject({ code: "AUDIT_EXPORT_CHECKPOINT_REQUIRED" });
    // An assurance-path error cannot create a successful export or commit its audit event.
    const bad = await setup();
    const badCheckpoint = (await admin.query<AuditCheckpoint>(`INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash)
      SELECT tenant_id,sequence,event_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1
      RETURNING tenant_id AS "tenantId",sequence::int,event_hash AS "eventHash",recorded_at AS "recordedAt"`, [bad.p.tenantId])).rows[0]!;
    await admin.query("INSERT INTO app.audit_export_checkpoint VALUES($1,$2,$3,$4)", [bad.p.tenantId, badCheckpoint.sequence, "f".repeat(64), badCheckpoint.recordedAt]);
    await expect(handoffAuditExportCheckpoint(admin, { ...badCheckpoint, eventHash: "f".repeat(64) })).rejects.toMatchObject({ code: "AUDIT_EXPORT_CHECKPOINT_REQUIRED" });
    const badCommand = request();
    await expect(repo.create(context(bad.p), actor(bad.p), badCommand)).rejects.toThrow();
    expect((await admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [bad.p.tenantId, badCommand.commandId])).rowCount).toBe(0);
    expect(await repo.list(context(bad.p), actor(bad.p))).toEqual([]);
    await expect(repo.create(context(p), actor(p), { ...cmd, tenantId: p.tenantId })).rejects.toThrow();
  });
  it("replays racing command IDs once and persists one audited effect", async () => {
    const { p } = await setup(); await checkpoint(p); const cmd = request();
    const [a, b] = await Promise.all([repo.create(context(p), actor(p), cmd), repo.create(context(p), actor(p), cmd)]);
    expect(b.file).toEqual(a.file); expect(a.id).toBe(cmd.commandId);
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [p.tenantId, cmd.commandId])).rows[0].n).toBe(1);
    expect((await repo.list(context(p), actor(p))).filter(e => e.id === cmd.commandId)).toHaveLength(1);
    const adminMember = await invite(p, "admin"); await expect(repo.create(context(adminMember), actor(adminMember), cmd)).rejects.toMatchObject({ code: "AUDIT_EXPORT_COMMAND_CONFLICT" });
  });
  it("allows only current tenant-wide owner/admin and durably audits every other role's create/list refusal", async () => {
    const { p } = await setup(); await checkpoint(p);
    const view = await contractor.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
    const branch = view.units.find(u => u.kind === "branch")!.id;
    const clientId = randomUUID();
    await contractor.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: clientId, expectedRevision: view.revision, kind: "client.create", branchId: branch, name: "Fictional client", clientType: "housing_association" });
    for (const role of contractorRoles.filter(r => r !== "owner")) {
      const member = await invite(p, role, role === "client_approver" ? "client" : "tenant", role === "client_approver" ? clientId : p.tenantId);
      if (role === "admin") { expect(await repo.create(context(member), actor(member), request())).toHaveProperty("file"); expect((await repo.list(context(member), actor(member))).length).toBeGreaterThan(0); }
      else {
        for (const work of [() => repo.create(context(member), actor(member), request()), () => repo.list(context(member), actor(member))]) await expect(work()).rejects.toMatchObject({ code: "AUDIT_EXPORT_FORBIDDEN" });
        expect((await admin.query("SELECT payload->'references'->>'action' action FROM app.audit_event WHERE tenant_id=$1 AND actor_ref=$2 AND event_type='audit.export.refused' ORDER BY sequence", [p.tenantId, `membership:${member.membershipId}`])).rows).toEqual([{ action: "create" }, { action: "list" }]);
      }
    }
    const scopedAdmin = await invite(p, "admin", "branch", branch); await expect(repo.list(context(scopedAdmin), actor(scopedAdmin))).rejects.toMatchObject({ code: "AUDIT_EXPORT_FORBIDDEN" });
    const administrator = await invite(p, "admin");
    const grant = (await admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2", [p.tenantId, administrator.membershipId])).rows[0]!.id;
    await admin.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,$2,$3)", [p.tenantId, randomUUID(), grant]);
    await expect(repo.create(context(administrator), actor(administrator), request())).rejects.toMatchObject({ code: "AUDIT_EXPORT_FORBIDDEN" });
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [p.tenantId, p.membershipId]);
    await expect(repo.list(context(p), actor(p))).rejects.toMatchObject({ code: "AUDIT_EXPORT_FORBIDDEN" });
  });
  it("catalogs append-only tenant-qualified tables and denies missing-context, cross-tenant, mutation and checkpoint privilege attacks", async () => {
    const a = await setup(), b = await setup(); const cp = await checkpoint(a.p);
    await expect(handoffAuditExportCheckpoint(runtime, cp)).rejects.toMatchObject({ code: "42501" });
    const row = await repo.create(context(a.p), actor(a.p), request());
    const tables = ["audit_export", "audit_export_checkpoint"];
    const catalog = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tables])).rows;
    expect(catalog).toEqual(tables.map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" })));
    expect((await runtime.query("SELECT * FROM app.audit_export")).rows).toEqual([]); expect((await runtime.query("SELECT * FROM app.audit_export_checkpoint")).rows).toEqual([]);
    for (const table of tables) for (const action of ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) expect((await admin.query("SELECT has_table_privilege('jobguard_runtime',$1,$2) allowed", [`app.${table}`, action])).rows[0].allowed).toBe(false);
    for (const sql of ["SELECT * FROM audit_control.checkpoint", "SELECT * FROM audit_control.audit_head", "INSERT INTO app.audit_export_checkpoint(tenant_id,sequence,event_hash,recorded_at) VALUES(gen_random_uuid(),1,repeat('a',64),now())"]) await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    for (const table of tables) for (const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) await expect(withTenant(runtime, context(a.p), db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
    for (const table of tables) await expect(admin.query(`UPDATE app.${table} SET tenant_id=tenant_id WHERE tenant_id=$1`, [a.p.tenantId])).rejects.toMatchObject({ code: "55000" });
    await expect(withTenant(runtime, context(a.p), db => db.$client.query("INSERT INTO app.audit_export SELECT $1,$2,actor_membership_id,created_at,entry_count,head_hash,file FROM app.audit_export WHERE tenant_id=$3", [b.p.tenantId, randomUUID(), a.p.tenantId]))).rejects.toMatchObject({ code: "42501" });
    await expect(admin.query("INSERT INTO app.audit_export VALUES($1,$2,$3,$4,$5,$6,$7)", [a.p.tenantId, randomUUID(), b.p.membershipId, row.createdAt, row.entryCount, row.headHash, row.file])).rejects.toMatchObject({ code: "23503" });
    await expect(admin.query("INSERT INTO app.audit_export VALUES($1,$2,$3,$4,$5,$6,$7)", [a.p.tenantId, randomUUID(), a.p.membershipId, row.createdAt, row.entryCount, row.headHash, {}])).rejects.toMatchObject({ code: "23514" });
    expect((await runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
  });
  it.each(["pilot_no_charge", "production_billing"])("refuses creation server-side in %s", async mode => {
    const { p } = await setup(); process.env.JOBGUARD_ENV = mode;
    try { await expect(repo.create(context(p), actor(p), request())).rejects.toMatchObject({ code: "AUDIT_EXPORT_MODE_HELD" }); }
    finally { process.env.JOBGUARD_ENV = "synthetic_demo"; }
  });

  it.each(["list", "create"] as const)("audits the revoked session member's %s refusal through the application boundary", async action => {
    const { p, session } = await setup(), other = await setup();
    const otherCount = (await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [other.p.tenantId])).rows[0]!.n;
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [p.tenantId, p.membershipId]);
    const application = new AuditExportApplication(runtime);
    const response = await (action === "list" ? application.list(session) : application.create(session, request()))
      .then(() => undefined, error => auditExportHttpFailure(error));
    expect(response).toEqual({ status: 403, body: { version: "audit-export-error.v1", code: "AUDIT_EXPORT_FORBIDDEN" } });
    expect((await admin.query("SELECT tenant_id,actor_ref,payload->'references'->>'action' action FROM app.audit_event WHERE tenant_id=$1 AND event_type='audit.export.refused'", [p.tenantId])).rows)
      .toEqual([{ tenant_id: p.tenantId, actor_ref: `membership:${p.membershipId}`, action }]);
    expect((await admin.query("SELECT id FROM app.audit_export WHERE tenant_id=$1", [p.tenantId])).rows).toEqual([]);
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [other.p.tenantId])).rows[0]!.n).toBe(otherCount);
  });

  it("serializes distinct concurrent export commands on two connections into consistent verifiable snapshots", async () => {
    const { p } = await setup(), cp = await checkpoint(p), commands = [request(), request()];
    const before = (await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [p.tenantId])).rows[0]!.n as number;
    // pg-pool keeps `password` non-enumerable, so a plain spread of `runtime.options` would drop it; copy it explicitly.
    const poolOptions = { ...runtime.options, password: runtime.options.password, max: 1 };
    const firstPool = new Pool(poolOptions), secondPool = new Pool(poolOptions);
    try {
      const clients = await Promise.all([firstPool.connect(), secondPool.connect()]);
      try {
        const pids = await Promise.all(clients.map(client => client.query("SELECT pg_backend_pid() pid")));
        expect(pids[0]!.rows[0]!.pid).not.toBe(pids[1]!.rows[0]!.pid);
      } finally { clients.forEach(client => client.release()); }
      const [first, second] = await Promise.all([
        new AuditExportRepository(firstPool).create(context(p), actor(p), commands[0]),
        new AuditExportRepository(secondPool).create(context(p), actor(p), commands[1]),
      ]);
      expect(new Set([first.id, second.id])).toEqual(new Set(commands.map(command => command.commandId)));
      const rows = await repo.list(context(p), actor(p)); expect(rows).toHaveLength(2);
      const events = (await admin.query<AuditEvent>(`SELECT id,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,tenant_id AS "tenantId",sequence::int,occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [p.tenantId])).rows;
      expect(events).toHaveLength(before + 2);
      expect(events.map(event => event.sequence)).toEqual(Array.from({ length: events.length }, (_, i) => i + 1));
      expect(new Set(events.map(event => event.sequence)).size).toBe(events.length);
      expect(events.filter(event => event.eventType === "audit.export.created")).toHaveLength(2);
      expect(new Set(events.filter(event => event.eventType === "audit.export.created").map(event => event.id))).toEqual(new Set([first.id, second.id]));
      expect(() => verifyAuditChain(events, cp)).not.toThrow();
      expect((await admin.query("SELECT sequence::int,event_hash FROM audit_control.audit_head WHERE tenant_id=$1", [p.tenantId])).rows)
        .toEqual([{ sequence: events.length, event_hash: events.at(-1)!.eventHash }]);
      expect([first.entryCount, second.entryCount].sort((a, b) => a - b)).toEqual([before + 1, before + 2]);
      for (const exported of [first, second]) {
        const persisted = rows.find(row => row.id === exported.id)!;
        expect(persisted.file).toEqual(exported.file); expect(persisted.entryCount).toBe(exported.entryCount); expect(persisted.headHash).toBe(exported.headHash);
        const payload = verifySignedAuditExport(persisted.file, persisted.file.publicKeyPem).payload;
        expect(payload.entryCount).toBe(persisted.entryCount); expect(payload.headHash).toBe(persisted.headHash);
        expect(payload.createdAt).toBe(new Date(persisted.createdAt).toISOString());
        expect(payload.entries).toEqual(events.slice(0, persisted.entryCount).map(event => ({ ...event, occurredAt: event.occurredAt.toISOString() })));
        expect(payload.entries.at(-1)).toMatchObject({ id: persisted.id, eventType: "audit.export.created", eventHash: persisted.headHash });
        const file = join(dir, `${persisted.id}.json`), publicKey = join(dir, `${persisted.id}.pem`);
        await writeFile(file, JSON.stringify(persisted.file)); await writeFile(publicKey, persisted.file.publicKeyPem);
        const result = spawnSync(process.execPath, [fileURLToPath(new URL("../tools/verify-audit-export.mjs", import.meta.url)), file, "--trusted-public-key", publicKey], { encoding: "utf8" });
        expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({ integrityValid: true, complete: true, signerTrusted: true, tenantId: p.tenantId, exportId: persisted.id, entryCount: persisted.entryCount });
      }
    } finally { await closeTestPools(firstPool, secondPool); }
  });

});
