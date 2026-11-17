import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { bootstrapSyntheticDemo, SYNTHETIC_DATABASE_NAME } from "../src/demo-bootstrap.js";
import { runAuditCheckpointHandoff } from "../src/audit-checkpoint-handoff.js";
import { AuditExportRepository, ContractorRepository, exportAuditCheckpoints, appendAuditBatch, verifyAuditChain, verifySignedAuditExport, verifiedTenantContextFromMembership, type AuthenticatedMembership, type AuditEvent, type AuditCheckpoint, type TenantTransaction } from "../src/index.js";
import { freePort, closeTestPools } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, directory: string, admin: Pool, owner: Pool, runtime: Pool, ownerUrl: string, runtimeUrl: string, alternateUrl: string;
let a: AuthenticatedMembership, b: AuthenticatedMembership, contractor: ContractorRepository, priorCatalog: unknown;
const operator = "test.operator-1";
const run = (tenantId?: string) => runAuditCheckpointHandoff({ ownerUrl, operator, ...(tenantId ? { tenantId } : {}) });
const tables = ["app.audit_event", "audit_control.audit_head", "audit_control.checkpoint", "app.audit_export_checkpoint", "app.audit_export"];
async function snapshot(tenantId?: string) {
  const rows: Record<string, unknown> = {};
  for (const table of tables) rows[table] = (await admin.query(`SELECT row_to_json(t)::text value FROM ${table} t ${tenantId ? "WHERE tenant_id=$1" : ""} ORDER BY row_to_json(t)::text`, tenantId ? [tenantId] : [])).rows;
  return rows;
}
async function catalog() {
  return {
    roles: (await admin.query("SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolcanlogin,rolreplication,rolconfig FROM pg_roles WHERE rolname LIKE 'jobguard_%' OR rolname='fixture_owner' ORDER BY rolname")).rows,
    membership: (await admin.query("SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor")).rows,
    objects: (await admin.query("SELECT n.nspname,c.relname,c.relkind,c.relacl::text,c.relowner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','audit_control') ORDER BY n.nspname,c.relname")).rows,
    schemas: (await admin.query("SELECT nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname IN ('app','audit_control') ORDER BY nspname")).rows,
    policies: (await admin.query("SELECT * FROM pg_policies WHERE schemaname IN ('app','audit_control') ORDER BY schemaname,tablename,policyname")).rows,
    routines: (await admin.query("SELECT n.nspname,p.proname,p.proargtypes::text,p.proacl::text,p.proowner,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','audit_control') ORDER BY n.nspname,p.proname,p.proargtypes")).rows,
  };
}
async function head(tenantId: string) { return (await admin.query<{ sequence: string; event_hash: string }>("SELECT sequence::text,event_hash FROM audit_control.audit_head WHERE tenant_id=$1", [tenantId])).rows[0]!; }
const eventColumns = `id,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,tenant_id AS "tenantId",sequence::int,occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash"`;
async function verify(tenantId: string) {
  const entries = (await admin.query<AuditEvent>(`SELECT ${eventColumns} FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [tenantId])).rows;
  const rows = (await admin.query<AuditCheckpoint>(`SELECT tenant_id AS "tenantId",sequence::int,event_hash AS "eventHash",recorded_at AS "recordedAt" FROM app.audit_export_checkpoint WHERE tenant_id=$1 ORDER BY sequence`, [tenantId])).rows;
  for (const row of rows) verifyAuditChain(entries, row);
  expect(entries.map(e => e.sequence)).toEqual(entries.map((_, i) => i + 1));
  return { entries, rows };
}
async function ordinary(p: AuthenticatedMembership) {
  const view = await contractor.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
  await contractor.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "member.invite", role: "supervisor", email: `${randomUUID()}@fictional.invalid`, scope: { kind: "tenant", id: p.tenantId }, clientId: null, contractId: null });
}
async function exportFor(p: AuthenticatedMembership) {
  return new AuditExportRepository(runtime).create(verifiedTenantContextFromMembership(p), { membershipId: p.membershipId, identityUserId: p.identityUserId }, { version: "audit-export-request.v1", commandId: randomUUID() });
}
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  directory = await mkdtemp(join(tmpdir(), "jg-checkpoint-")); const port = await freePort(58600, 300), credential = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential, database: "postgres" });
  const literal = `'${credential.replaceAll("'", "''")}'`;
  await control.query(`CREATE ROLE fixture_owner LOGIN PASSWORD ${literal} CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);
  await control.query(`CREATE ROLE fixture_other LOGIN PASSWORD ${literal} NOSUPERUSER NOCREATEROLE NOCREATEDB NOINHERIT NOBYPASSRLS`);
  await control.query(`CREATE DATABASE ${SYNTHETIC_DATABASE_NAME} OWNER fixture_owner`); await control.end();
  const url = (login: string) => { const parsed = new URL(`postgresql://127.0.0.1:${port}/${SYNTHETIC_DATABASE_NAME}`); parsed.username = login; parsed.password = credential; return parsed.toString(); };
  ownerUrl = url("fixture_owner"); runtimeUrl = url("jobguard_runtime"); alternateUrl = url("fixture_other");
  await bootstrapSyntheticDemo({ ownerUrl, runtimeUrl });
  admin = new Pool({ connectionString: url("postgres") }); owner = new Pool({ connectionString: ownerUrl }); runtime = new Pool({ connectionString: runtimeUrl, max: 3 });
  contractor = new ContractorRepository(runtime); priorCatalog = await catalog();
}, 120000);
beforeEach(async () => {
  // Reset state in one transaction as the superuser with triggers off (session_replication_role=replica, the technique the
  // practice-feed and recovery-follow-up tests use). Since 0128 the shadow tables that reference app.audit_event carry statement
  // triggers that deny TRUNCATE (even for the owner), so a plain TRUNCATE ... CASCADE is refused; this test never writes them.
  const reset = await admin.connect();
  try { await reset.query("BEGIN"); await reset.query("SET LOCAL session_replication_role=replica"); await reset.query(`TRUNCATE ${tables.join(",")} CASCADE`); await reset.query("COMMIT"); }
  catch (error) { await reset.query("ROLLBACK"); throw error; }
  finally { reset.release(); }
  a = await contractor.startPractice(randomUUID()); b = await contractor.startPractice(randomUUID());
});
afterAll(async () => {
  try { if (admin) expect(await catalog()).toEqual(priorCatalog); }
  finally { await closeTestPools(runtime, owner, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); }
});
async function restrictedExport(pool: Pool = owner, afterInsert?: (client: PoolClient) => Promise<void>, onStatement?: () => void) {
  const client = await pool.connect();
  try {
    // The helper accepts a pool: give it a facade over this owner connection with a local role in each query transaction.
    const facade = { async query(sql: string, values?: unknown[]) {
      onStatement?.();
      await client.query("BEGIN"); await client.query("SET LOCAL ROLE jobguard_migration");
      try { const result = await client.query(sql, values); await client.query("COMMIT");
        if (sql.includes("INSERT INTO audit_control.checkpoint")) await afterInsert?.(client);
        return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    } } as unknown as Pool;
    return await exportAuditCheckpoints(facade);
  } finally { client.release(); }
}
it("[A1] second checkpoint export returns empty and changes no rows", async () => {
  expect(await restrictedExport()).toHaveLength(2); const before = await snapshot();
  expect(await restrictedExport()).toEqual([]); expect(await snapshot()).toEqual(before);
});
it("[A2] checkpoint export returns only the company with a new event", async () => {
  await restrictedExport(); await ordinary(a);
  expect(await restrictedExport()).toMatchObject([{ tenantId: a.tenantId, sequence: Number((await head(a.tenantId)).sequence) }]);
});
it("[A3] concurrent checkpoint exports resolve with one record per newest sequence", async () => {
  const second = new Pool({ connectionString: ownerUrl });
  try { const results = await Promise.all([restrictedExport(), restrictedExport(second)]); expect(results.flat()).toHaveLength(2);
    expect((await admin.query("SELECT tenant_id,sequence,count(*)::int n FROM audit_control.checkpoint GROUP BY tenant_id,sequence")).rows).toHaveLength(2);
    expect((await admin.query("SELECT max(n)::int n FROM (SELECT count(*) n FROM audit_control.checkpoint GROUP BY tenant_id,sequence) x")).rows[0].n).toBe(1);
  } finally { await second.end(); }
});
it("[A4] different stored hash fails verification while true other-company records stand", async () => {
  const h = await head(a.tenantId);
  await admin.query("INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash) VALUES($1,$2,$3)", [a.tenantId, h.sequence, "f".repeat(64)]);
  const before = await snapshot(a.tenantId);
  await expect(restrictedExport()).rejects.toMatchObject({ code: "AUDIT_VERIFICATION_FAILED" });
  expect(await snapshot(a.tenantId)).toEqual(before);
  expect((await admin.query("SELECT * FROM audit_control.checkpoint WHERE tenant_id=$1", [b.tenantId])).rowCount).toBe(1);
});
// Hold A after its insert statement commits, at the old gap before the moving second read.
// B is a real runtime connection; an advisory lock, rather than a delay, orders the append.
async function interveningAppend(equal: boolean, keepOther: boolean) {
  const h = await head(a.tenantId), otherHead = await head(b.tenantId);
  await admin.query("INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash) VALUES($1,$2,$3)", [a.tenantId, h.sequence, equal ? h.event_hash : "f".repeat(64)]);
  if (!keepOther) await admin.query("INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash) VALUES($1,$2,$3)", [b.tenantId, otherHead.sequence, otherHead.event_hash]);
  const blocker = await admin.connect(), appender = await runtime.connect();
  const lockId = 101001;
  let pending: Promise<{ rows?: AuditCheckpoint[]; error?: unknown }> | undefined;
  let statements = 0;
  try {
    await blocker.query("SELECT pg_advisory_lock($1)", [lockId]);
    pending = restrictedExport(owner, async client => {
      await client.query("SELECT pg_advisory_lock($1)", [lockId]);
      await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
    }, () => { statements++; }).then(rows => ({ rows }), error => ({ error }));
    const deadline = Date.now() + 3000;
    let waiting = false;
    while (Date.now() < deadline) {
      waiting = Boolean((await blocker.query("SELECT 1 FROM pg_stat_activity WHERE usename='fixture_owner' AND wait_event='advisory' AND query LIKE 'SELECT pg_advisory_lock%'")).rowCount);
      if (waiting) break;
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    expect(waiting).toBe(true);
    const waiter = (await blocker.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE usename='fixture_owner' AND wait_event='advisory'")).rows[0]!;
    const writer = (await appender.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!;
    expect(writer.pid).not.toBe(waiter.pid);
    await appender.query("BEGIN");
    await appender.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    await appendAuditBatch({ $client: appender } as TenantTransaction, [{ id: randomUUID(), version: "audit.v1", actorRef: "test:runtime", eventType: "test.append", subjectType: "tenant", subjectRef: a.tenantId, payload: {} }]);
    await appender.query("COMMIT");
    expect(Number((await head(a.tenantId)).sequence)).toBe(Number(h.sequence) + 1);
    await blocker.query("SELECT pg_advisory_unlock($1)", [lockId]);
    const result = await pending;
    if (equal) {
      expect(result.error).toBeUndefined(); expect(result.rows).toEqual([]);
    } else {
      expect(result.error).toMatchObject({ code: "AUDIT_VERIFICATION_FAILED", message: expect.stringContaining(a.tenantId) });
      expect((result.error as Error).message).toContain(`sequence ${h.sequence}`);
    }
    expect((await admin.query("SELECT sequence::text,event_hash FROM audit_control.checkpoint WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ sequence: h.sequence, event_hash: equal ? h.event_hash : "f".repeat(64) }]);
    expect((await admin.query("SELECT sequence::text,event_hash FROM audit_control.checkpoint WHERE tenant_id=$1", [b.tenantId])).rows).toEqual([{ sequence: otherHead.sequence, event_hash: otherHead.event_hash }]);
    // One fixed candidate/insert statement, followed by one fresh verification statement.
    expect(statements).toBe(2);
  } finally {
    await blocker.query("SELECT pg_advisory_unlock($1)", [lockId]);
    await appender.query("ROLLBACK");
    if (pending) await pending;
    blocker.release(); appender.release();
  }
}
it("[Round 1 F1a] candidate disagreement rejects naming company and sequence after an intervening append", () => interveningAppend(false, false));
it("[Round 1 F1b] other-company checkpoint is committed and kept when the candidate disagrees after an append", () => interveningAppend(false, true));
it("[Round 1 F1c] equal candidate hash skips without a duplicate after an intervening append", () => interveningAppend(true, false));
it.each([false, true])("[Round 2 F1] wrong checkpoint committed during insert wait rejects and keeps other company (pre-existing: %s)", async keepOther => {
  const h = await head(a.tenantId), otherHead = await head(b.tenantId);
  if (keepOther) await admin.query("INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash) VALUES($1,$2,$3)", [b.tenantId, otherHead.sequence, otherHead.event_hash]);
  const second = new Pool({ connectionString: ownerUrl, max: 1 });
  const writer = await owner.connect(), observer = await admin.connect();
  let pending: Promise<{ rows?: AuditCheckpoint[]; error?: unknown }> | undefined;
  try {
    const writerPid = (await writer.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
    const observerPid = (await observer.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
    expect(observerPid).not.toBe(writerPid);
    await writer.query("BEGIN"); await writer.query("SET LOCAL ROLE jobguard_migration");
    await writer.query("INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash) VALUES($1,$2,$3)", [a.tenantId, h.sequence, "f".repeat(64)]);
    pending = restrictedExport(second).then(rows => ({ rows }), error => ({ error }));
    const deadline = Date.now() + 3000;
    let waiter: { pid: number } | undefined;
    while (Date.now() < deadline) {
      waiter = (await observer.query<{ pid: number }>(`SELECT pid FROM pg_stat_activity
        WHERE wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))
        AND query LIKE '%INSERT INTO audit_control.checkpoint%'`, [writerPid])).rows[0];
      if (waiter) break;
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    expect(waiter).toBeDefined();
    expect(waiter!.pid).not.toBe(writerPid); expect(waiter!.pid).not.toBe(observerPid);
    // W is still uncommitted, and A is demonstrably waiting on W's unique-key conflict.
    expect((await observer.query("SELECT 1 FROM audit_control.checkpoint WHERE tenant_id=$1", [a.tenantId])).rowCount).toBe(0);
    await writer.query("COMMIT");
    const result = await pending;
    expect(result.error).toMatchObject({ code: "AUDIT_VERIFICATION_FAILED", message: `Stored checkpoint differs for tenant ${a.tenantId} at sequence ${h.sequence}` });
    expect(result.rows).toBeUndefined();
    expect((await observer.query("SELECT sequence::text,event_hash FROM audit_control.checkpoint WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ sequence: h.sequence, event_hash: "f".repeat(64) }]);
    expect((await observer.query("SELECT sequence::text,event_hash FROM audit_control.checkpoint WHERE tenant_id=$1", [b.tenantId])).rows).toEqual([{ sequence: otherHead.sequence, event_hash: otherHead.event_hash }]);
  } finally {
    await writer.query("ROLLBACK");
    if (pending) await pending;
    writer.release(); observer.release(); await second.end();
  }
});
it("[A5] [C-OPS-4] effective run followed by unchanged run has identical snapshots", async () => {
  const first = await run(); expect(first.outcomes).toHaveLength(2);
  expect(first.outcomes.map(o => o.tenantId).sort()).toEqual([a.tenantId, b.tenantId].sort());
  expect(first.outcomes.every(o => o.outcome === "handed_off")).toBe(true); const before = await snapshot();
  const second = await run(); expect(second.outcomes).toHaveLength(2);
  expect(second.outcomes.map(o => o.tenantId).sort()).toEqual([a.tenantId, b.tenantId].sort());
  expect(second.outcomes.every(o => o.outcome === "unchanged")).toBe(true); expect(await snapshot()).toEqual(before);
});
it("[A6] only A advances with the exact hand-off event, operator and stored server time", async () => {
  await run(); await ordinary(a); const h = await head(a.tenantId), beforeB = await snapshot(b.tenantId), beforeA = await snapshot(a.tenantId);
  expect((await run()).outcomes).toEqual(expect.arrayContaining([{ tenantId: a.tenantId, outcome: "handed_off", sequence: Number(h.sequence) + 1 }, { tenantId: b.tenantId, outcome: "unchanged", sequence: Number((await head(b.tenantId)).sequence) }]));
  const afterA = await snapshot(a.tenantId);
  for (const table of ["app.audit_event", "audit_control.checkpoint", "app.audit_export_checkpoint"]) expect((afterA[table] as unknown[]).length).toBe((beforeA[table] as unknown[]).length + 1);
  const { entries, rows } = await verify(a.tenantId); await verify(b.tenantId);
  const event = entries.at(-1)!;
  expect(event).toMatchObject({ version: "audit.v2", actorRef: "operations:audit-checkpoint-handoff", eventType: "audit.checkpoint.handed_off", subjectType: "audit-checkpoint", subjectRef: a.tenantId, payload: { references: { auditTrust: "lower_trust", environment: "synthetic_demo", priorSequence: h.sequence, operator, sessionUser: "fixture_owner" }, hashes: { priorHead: h.event_hash }, classifications: { action: "security" } } });
  expect(event.occurredAt).toBeInstanceOf(Date); expect(rows.at(-1)).toMatchObject({ sequence: event.sequence, eventHash: event.eventHash });
  expect(rows).toHaveLength(2); expect(await snapshot(b.tenantId)).toEqual(beforeB);
});
async function assertConcurrent() {
  const results = await Promise.all([run(a.tenantId), run(a.tenantId)]);
  expect(results.map(r => r.outcomes[0]!.outcome).sort()).toEqual(["handed_off", "unchanged"]);
  const { entries, rows } = await verify(a.tenantId);
  expect(entries.filter(e => e.eventType === "audit.checkpoint.handed_off")).toHaveLength(1); expect(rows).toHaveLength(1);
  expect((await admin.query("SELECT * FROM audit_control.checkpoint WHERE tenant_id=$1", [a.tenantId])).rowCount).toBe(1);
}
it("[A7] two simultaneous operators create only one hand-off", assertConcurrent);
it("[A7] two operators demonstrably wait on the held head then serialize", async () => {
  const blocker = await admin.connect(); let pending: Promise<void> | undefined;
  try {
    await blocker.query("BEGIN"); await blocker.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]); await blocker.query("SELECT * FROM audit_control.audit_head WHERE tenant_id=$1 FOR UPDATE", [a.tenantId]);
    pending = assertConcurrent();
    const deadline = Date.now() + 3000; let waiting: number[] = [];
    while (Date.now() < deadline) {
      waiting = (await admin.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE usename='fixture_owner' AND wait_event_type='Lock' AND query LIKE '%app.lock_audit_head()%'")).rows.map(r => r.pid);
      if (waiting.length === 2) break; await new Promise(r => setTimeout(r, 15));
    }
    expect(new Set(waiting).size).toBe(2); await blocker.query("ROLLBACK"); await pending;
  } finally { await blocker.query("ROLLBACK"); blocker.release(); if (pending) await pending; }
});
it("[A8] selected company leaves B untouched and runtime cannot insert either company's controls", async () => {
  const before = await snapshot(b.tenantId); await run(a.tenantId); expect(await snapshot(b.tenantId)).toEqual(before);
  await expect(exportFor(b)).rejects.toMatchObject({ code: "AUDIT_EXPORT_CHECKPOINT_REQUIRED" });
  const client = await runtime.connect();
  try {
    for (const tenantId of [a.tenantId, b.tenantId]) for (const table of ["app.audit_export_checkpoint", "audit_control.checkpoint"]) {
      await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
      await expect(client.query(`INSERT INTO ${table}(tenant_id,sequence,event_hash,recorded_at) VALUES($1,1,$2,clock_timestamp())`, [tenantId, "a".repeat(64)])).rejects.toMatchObject({ code: "42501" }); await client.query("ROLLBACK");
    }
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
    expect((await client.query("SELECT * FROM app.audit_export_checkpoint WHERE tenant_id=$1", [b.tenantId])).rows).toEqual([]);
    await expect(client.query("SELECT * FROM audit_control.checkpoint")).rejects.toMatchObject({ code: "42501" }); await client.query("ROLLBACK");
  } finally { await client.query("ROLLBACK"); client.release(); }
});
it("[A9] [C-OPS-2] runtime and another login fail before writes and cannot assume migration", async () => {
  const before = await snapshot();
  for (const url of [runtimeUrl, alternateUrl]) await expect(runAuditCheckpointHandoff({ ownerUrl: url, operator })).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_FORBIDDEN" });
  expect(await snapshot()).toEqual(before);
  await expect(runtime.query("SET ROLE jobguard_migration")).rejects.toMatchObject({ code: "42501" }); expect(await catalog()).toEqual(priorCatalog);
});
it("[A10] export goes from required to signed and includes the hand-off, both files keep verifying", async () => {
  await expect(exportFor(a)).rejects.toMatchObject({ code: "AUDIT_EXPORT_CHECKPOINT_REQUIRED" }); await run(a.tenantId);
  const first = await exportFor(a), payload = verifySignedAuditExport(first.file, first.file.publicKeyPem).payload;
  expect(payload.checkpoints).toHaveLength(1); expect(payload.entries.filter(e => e.eventType === "audit.checkpoint.handed_off")).toHaveLength(1);
  expect(payload.checkpoints).toEqual((await verify(a.tenantId)).rows.map(r => ({ ...r, recordedAt: r.recordedAt.toISOString() })));
  await run(a.tenantId); const second = await exportFor(a);
  expect(verifySignedAuditExport(first.file, first.file.publicKeyPem).complete).toBe(true); expect(verifySignedAuditExport(second.file, second.file.publicKeyPem).complete).toBe(true);
});
async function installFailure(tenantId: string) {
  await admin.query(`CREATE FUNCTION app.test_handoff_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='${tenantId}'::uuid THEN RAISE EXCEPTION 'test copy refused'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_handoff_failure BEFORE INSERT ON app.audit_export_checkpoint FOR EACH ROW EXECUTE FUNCTION app.test_handoff_failure()`);
}
async function dropFailure() { await admin.query("DROP TRIGGER test_handoff_failure ON app.audit_export_checkpoint; DROP FUNCTION app.test_handoff_failure()"); }
it("[A11] failing copy rolls back event and controls together, other company proceeds", async () => {
  const before = await snapshot(a.tenantId); await installFailure(a.tenantId);
  try { expect((await run()).outcomes).toEqual(expect.arrayContaining([expect.objectContaining({ tenantId: a.tenantId, outcome: "failed" }), expect.objectContaining({ tenantId: b.tenantId, outcome: "handed_off" })])); expect(await snapshot(a.tenantId)).toEqual(before); }
  finally { await dropFailure(); }
  expect((await run()).outcomes.find(o => o.tenantId === a.tenantId)?.outcome).toBe("handed_off");
  expect((await verify(a.tenantId)).entries.filter(e => e.eventType === "audit.checkpoint.handed_off")).toHaveLength(1);
});
it.each(["above", "different"])("[A12] %s checkpoint disagreement writes nothing for X and handles B", async fault => {
  const h = await head(a.tenantId); await admin.query("INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash) VALUES($1,$2,$3)", [a.tenantId, Number(h.sequence) + (fault === "above" ? 10 : 0), "f".repeat(64)]);
  const before = await snapshot(a.tenantId), result = await run();
  expect(result.outcomes).toEqual(expect.arrayContaining([expect.objectContaining({ tenantId: a.tenantId, outcome: "failed", code: "AUDIT_CHECKPOINT_DISAGREEMENT" }), expect.objectContaining({ tenantId: b.tenantId, outcome: "handed_off" })])); expect(await snapshot(a.tenantId)).toEqual(before);
});
it("[A12] audit head and hand-off hash disagreements fail closed", async () => {
  await run(a.tenantId); const h = await head(a.tenantId);
  await admin.query("UPDATE audit_control.audit_head SET event_hash=$2 WHERE tenant_id=$1", [a.tenantId, "f".repeat(64)]);
  const before = await snapshot(a.tenantId); expect((await run(a.tenantId)).outcomes[0]).toMatchObject({ outcome: "failed", code: "AUDIT_CHECKPOINT_DISAGREEMENT" }); expect(await snapshot(a.tenantId)).toEqual(before);
  await admin.query("UPDATE audit_control.audit_head SET event_hash=$2 WHERE tenant_id=$1", [a.tenantId, h.event_hash]);
  await admin.query("ALTER TABLE app.audit_export_checkpoint DISABLE TRIGGER audit_export_checkpoint_immutable");
  try { await admin.query("UPDATE app.audit_export_checkpoint SET event_hash=$2 WHERE tenant_id=$1", [a.tenantId, "f".repeat(64)]); }
  finally { await admin.query("ALTER TABLE app.audit_export_checkpoint ENABLE TRIGGER audit_export_checkpoint_immutable"); }
  const tampered = await snapshot(a.tenantId); expect((await run(a.tenantId)).outcomes[0]).toMatchObject({ outcome: "failed", code: "AUDIT_CHECKPOINT_DISAGREEMENT" }); expect(await snapshot(a.tenantId)).toEqual(tampered);
});
it("[A13] actual database target and unknown tenant are refused without writes", async () => {
  const before = await snapshot(); await expect(runAuditCheckpointHandoff({ ownerUrl: ownerUrl.replace(SYNTHETIC_DATABASE_NAME, "postgres"), operator })).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_TARGET_FORBIDDEN" });
  await expect(run(randomUUID())).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_TENANT_NOT_FOUND" }); expect(await snapshot()).toEqual(before);
});
it("[C-OPS-3] same connection has empty company setting after commit and forced rollback and is destroyed", async () => {
  await installFailure(b.tenantId);
  const original = Pool.prototype.connect; const observed: Array<{ setting: string | null; destroyed: boolean }> = [];
  const spy = vi.spyOn(Pool.prototype, "connect").mockImplementation(async function (this: Pool) {
    const acquire = original as unknown as (this: Pool) => Promise<PoolClient>;
    const client = await acquire.call(this);
    const query = client.query.bind(client), release = client.release.bind(client);
    client.query = (async (sql: string, values?: unknown[]) => {
      const result = await query(sql, values);
      if (["COMMIT", "ROLLBACK"].includes(sql)) observed.push({ setting: (await query("SELECT current_setting('app.tenant_id',true) setting")).rows[0].setting, destroyed: false });
      return result;
    }) as typeof client.query;
    client.release = (destroy?: boolean | Error) => { if (observed.length) observed.at(-1)!.destroyed = destroy === true; release(destroy); };
    return client;
  });
  try {
    await run(a.tenantId); await run(b.tenantId);
    expect(observed.length).toBeGreaterThanOrEqual(4); expect(observed.every(o => !o.setting)).toBe(true); expect(observed.filter(o => o.destroyed)).toHaveLength(2);
  } finally { spy.mockRestore(); await dropFailure(); }
});
