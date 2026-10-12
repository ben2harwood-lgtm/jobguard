import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractorRoles } from "@jobguard/core";
import { AuditExportRepository, ContractorRepository, exportAuditCheckpoints, handoffAuditExportCheckpoint, verifyAuditChain, verifySignedAuditExport, migrate, MIGRATION_URLS, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type AuditCheckpoint, type AuditEvent } from "../src/index.js";
import { AuditExportApplication, auditExportHttpFailure } from "../../../apps/api/src/audit-export/audit-export.application.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
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
  dir = await mkdtemp(join(tmpdir(), "jg-audit-export-")); const port = await freePort(58300, 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  // Real upgrade from the preceding supported schema, then idempotent migrator replay.
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.filter(u => !u.pathname.endsWith("/0121_audit_export.sql"))) {
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
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name='0121_audit_export.sql'")).rows).toEqual([{ migration_name: "0121_audit_export.sql" }]);
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
