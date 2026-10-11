import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractorRoles } from "@jobguard/core";
import { AuditExportRepository, ContractorRepository, exportAuditCheckpoints, handoffAuditExportCheckpoint, verifySignedAuditExport, migrate, MIGRATION_URLS, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type AuditCheckpoint } from "../src/index.js";
import { closeTestPools } from "./pool-test-utils.js";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractor: ContractorRepository, repo: AuditExportRepository;
const context = (p: AuthenticatedMembership) => verifiedTenantContextFromMembership(p);
const actor = (p: AuthenticatedMembership) => ({ membershipId: p.membershipId, identityUserId: p.identityUserId });
let priorSecurityCatalog: unknown;
async function securityCatalog() {
  return {
    tables: (await admin.query(`SELECT n.nspname,c.relname,c.relacl::text,c.relowner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') AND c.relkind='r' AND c.relname NOT IN ('audit_export','audit_export_checkpoint') ORDER BY n.nspname,c.relname`)).rows,
    policies: (await admin.query(`SELECT * FROM pg_policies WHERE schemaname IN ('app','audit_control','identity','control_plane','infrastructure') AND tablename NOT IN ('audit_export','audit_export_checkpoint') ORDER BY schemaname,tablename,policyname`)).rows,
    routines: (await admin.query(`SELECT n.nspname,p.proname,p.proargtypes::text,p.proacl::text,p.proowner,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') ORDER BY n.nspname,p.proname,p.proargtypes`)).rows,
    roles: (await admin.query(`SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname LIKE 'jobguard_%' ORDER BY rolname`)).rows,
  };
}
const request = (commandId = randomUUID()) => ({ version: "audit-export-request.v1", commandId });
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  dir = await mkdtemp(join(tmpdir(), "jg-audit-export-")); const port = 58300 + Math.floor(Math.random() * 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  // Real upgrade from the preceding supported schema, then idempotent migrator replay.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.filter(u => !u.pathname.endsWith("/0116_audit_export.sql"))) {
    await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  priorSecurityCatalog = await securityCatalog();
  await migrate(admin); await migrate(admin);
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
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name='0116_audit_export.sql'")).rows).toEqual([{ migration_name: "0116_audit_export.sql" }]);
    expect(await securityCatalog()).toEqual(priorSecurityCatalog);
  });
  it("exports one tenant only, including shared-user tenants, with its own audit event and distinct public key", async () => {
    const a = await setup(), b = await setup();
    await admin.query("UPDATE app.membership SET identity_user_id=$1 WHERE tenant_id=$2 AND id=$3", [a.p.identityUserId, b.p.tenantId, b.p.membershipId]);
    await admin.query("UPDATE control_plane.contractor_practice_session SET identity_user_id=$1 WHERE session_id=$2", [a.p.identityUserId, b.session]);
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
});
