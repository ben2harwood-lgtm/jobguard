import { testTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EvidencePackRepository, migrate, withTenant, type VerifiedTenantContext } from '../src/index.js';
import { closeTestPools, installLegacySyntheticPartyFixtures } from './pool-test-utils.js';
import { seedEvidencePackFixture } from './evidence-pack-fixture.js';

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
let context: VerifiedTenantContext;
let repo: EvidencePackRepository;
const actor = 'membership:recorded-test-owner';
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'jg-evidence-packs-'));
  const port = 60300 + Math.floor(Math.random() * 200);
  const postgresLog: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic', persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ['--lc-messages=C', '--encoding=UTF8'], onLog: message => { postgresLog.push(message); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${postgresLog.join('\n')}`); }
  admin = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'synthetic', database: 'postgres' });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin); fixture = await seedEvidencePackFixture(admin);
  await admin.query("CREATE ROLE evidence_pack_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO evidence_pack_login");
  runtime = new Pool({ host: '127.0.0.1', port, user: 'evidence_pack_login', password: 'synthetic', database: 'postgres' });
  context = testTenantContext(fixture.tenantId);
  repo = new EvidencePackRepository(runtime);
}, 60_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe('immutable evidence pack commands on PostgreSQL', () => {
  it('replays one command, binds its payload/case, and deterministically maps stored records', async () => {
    const input = { commandId: randomUUID(), format: 'TEXT' as const };
    const pack = await repo.generate(context, fixture.caseId, input, actor);
    expect(await repo.generate(context, fixture.caseId, input, actor)).toMatchObject({ id: pack.id });
    await expect(repo.generate(context, fixture.customerCaseId, input, actor)).rejects.toThrow('EVIDENCE_PACK_COMMAND_CONFLICT');
    const rebuilt = await repo.generate(context, fixture.caseId, { commandId: randomUUID() }, actor);
    expect(rebuilt.manifestHash).toBe(pack.manifestHash); expect(rebuilt.contentHash).toBe(pack.contentHash);
    expect(pack.sources.some(source => source.sourceId.includes(fixture.quoteId))).toBe(true);
    expect(pack.sources.every(source => source.jobId === fixture.jobId)).toBe(true);
    expect(pack.format).toBe('TEXT');
    const count = await admin.query('SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type=$3', [fixture.tenantId, pack.id, 'evidence_pack.generated']);
    expect(Number(count.rows[0].n)).toBe(1);
  });
  it.each(['ZIP', 'PDF'] as const)('reports stored legacy %s format while holding download and approval', async format => {
    const pack = await repo.generate(context, fixture.caseId, { commandId: randomUUID() }, actor);
    await admin.query('UPDATE app.evidence_pack_revision SET format=$3,artifact_text=NULL,request_hash=NULL WHERE tenant_id=$1 AND pack_id=$2', [fixture.tenantId, pack.id, format]);
    expect((await repo.list(context, fixture.caseId)).find(row => row.id === pack.id)).toMatchObject({ format, complete: false, attachmentApprovalValid: false });
    await expect(repo.download(context, fixture.caseId, pack.id)).rejects.toThrow('EVIDENCE_PACK_REBUILD_REQUIRED');
    await expect(repo.approveAttachment(context, fixture.caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor)).rejects.toThrow('EVIDENCE_PACK_STALE_APPROVAL');
  });
  it('keeps raw runtime SQL fail-closed without tenant context', async () => {
    const client = await runtime.connect();
    try {
      await client.query('RESET app.tenant_id');
      for (const table of ['evidence_pack', 'evidence_pack_revision', 'evidence_pack_attachment_approval']) {
        expect((await client.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
      }
      await expect(client.query('INSERT INTO app.evidence_pack(id,tenant_id,job_id,case_id) VALUES($1,$2,$3,$4)', [randomUUID(), fixture.tenantId, fixture.jobId, fixture.caseId])).rejects.toMatchObject({ code: '42501' });
      await client.query("SELECT set_config('app.tenant_id','malformed',false)");
      await expect(client.query('SELECT * FROM app.evidence_pack')).rejects.toMatchObject({ code: '22P02' });
    } finally { await client.query('RESET app.tenant_id'); client.release(); }
  });
  it('records exact attachment approval, rejects stale hashes, and invalidates previous approvals without updating history', async () => {
    const pack = await repo.generate(context, fixture.caseId, { commandId: randomUUID() }, actor);
    const input = { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash };
    await expect(repo.approveAttachment(context, fixture.caseId, pack.id, { ...input, expectedContentHash: '0'.repeat(64) }, actor)).rejects.toThrow('EVIDENCE_PACK_STALE_APPROVAL');
    await repo.approveAttachment(context, fixture.caseId, pack.id, input, actor);
    await repo.approveAttachment(context, fixture.caseId, pack.id, input, actor);
    expect((await repo.list(context, fixture.caseId)).find(row => row.id === pack.id)).toMatchObject({ attachmentApprovalRecorded: true, attachmentApprovalValid: true });
    // A newly appended immutable case fact is a new evidence version, not a client version counter.
    await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,2,32100,'GBP','actual-reviewer',$5)", [randomUUID(), fixture.tenantId, fixture.jobId, fixture.caseId, 'b'.repeat(64)]);
    expect((await repo.list(context, fixture.caseId)).find(row => row.id === pack.id)?.attachmentApprovalValid).toBe(false);
    const next = await repo.generate(context, fixture.caseId, { commandId: randomUUID() }, actor);
    expect(next.manifestHash).not.toBe(pack.manifestHash);
    expect((await repo.list(context, fixture.caseId)).find(row => row.id === pack.id)).toMatchObject({ attachmentApprovalRecorded: true, attachmentApprovalValid: false });
    await expect(repo.approveAttachment(context, fixture.caseId, pack.id, { ...input, commandId: randomUUID() }, actor)).rejects.toThrow('EVIDENCE_PACK_STALE_APPROVAL');
    expect(Number((await admin.query('SELECT count(*) n FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND pack_id=$2', [fixture.tenantId, pack.id])).rows[0].n)).toBe(1);
    expect(Number((await admin.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='evidence_pack.attachment_approved'", [fixture.tenantId, pack.id])).rows[0].n)).toBe(1);
  });
  it('authorizes lookup by tenant and case and reports real server/standalone inspection findings', async () => {
    const pack = await repo.generate(context, fixture.caseId, { commandId: randomUUID() }, actor);
    await expect(repo.download(context, fixture.customerCaseId, pack.id)).rejects.toThrow('EVIDENCE_PACK_NOT_FOUND');
    await expect(repo.download(testTenantContext(fixture.otherTenantId), fixture.caseId, pack.id)).rejects.toThrow('EVIDENCE_PACK_NOT_FOUND');
    await expect(repo.generate(context, randomUUID(), { commandId: randomUUID() }, actor)).rejects.toThrow('EVIDENCE_PACK_CASE_NOT_FOUND');
    // Deliberately unstamped: an empty context must be refused with INVALID_TENANT_CONTEXT.
    await expect(repo.list({} as VerifiedTenantContext, fixture.caseId)).rejects.toThrow('A verified tenant context');
    const intact = await repo.inspect(context, fixture.caseId, pack.id, 'intact');
    expect(intact).toMatchObject({ contentMatches: true, complete: false });
    expect(intact.findings).toContain('Checkpoint not independently trusted');
    for (const [scenario, finding] of [['missing', 'Missing original source'], ['tampered', 'Content hash mismatch'], ['wrong-version', 'Wrong source version']] as const) {
      const check = await repo.inspect(context, fixture.caseId, pack.id, scenario);
      expect(check.findings).toContain(finding); expect(check.complete).toBe(false); expect(check.contentMatches).toBe(false);
    }
  });
  it('rejects tampered persisted artifact bytes and keeps the explorer bound to verified exported contents', async () => {
    const pack = await repo.generate(context, fixture.caseId, { commandId: randomUUID() }, actor);
    const original = await repo.download(context, fixture.caseId, pack.id);
    await admin.query('UPDATE app.evidence_pack_revision SET artifact_text=$3 WHERE tenant_id=$1 AND pack_id=$2', [fixture.tenantId, pack.id, original + ' ']);
    expect((await repo.list(context, fixture.caseId)).find(row => row.id === pack.id)).toMatchObject({ contentMatches: false, complete: false });
    await expect(repo.approveAttachment(context, fixture.caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor)).rejects.toThrow('EVIDENCE_PACK_STALE_APPROVAL');
    await expect(repo.download(context, fixture.caseId, pack.id)).rejects.toThrow('EVIDENCE_PACK_CONTENT_MISMATCH');
  });
  it('serializes identical commands and gives typed conflict for concurrent reuse on another case', async () => {
    const input = { commandId: randomUUID() };
    const pair = await Promise.all([repo.generate(context, fixture.customerCaseId, input, actor), repo.generate(context, fixture.customerCaseId, input, actor)]);
    expect(pair[0].id).toBe(pair[1].id);
    const conflict = { commandId: randomUUID() };
    const outcomes = await Promise.allSettled([repo.generate(context, fixture.caseId, conflict, actor), repo.generate(context, fixture.customerCaseId, conflict, actor)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejection.reason.message).toBe('EVIDENCE_PACK_COMMAND_CONFLICT');
  });
  it('rolls pack writes back when audit append fails and never reuses a command for another action', async () => {
    const commandId = randomUUID();
    await expect(repo.generate(context, fixture.customerCaseId, { commandId }, 'invalid actor with spaces')).rejects.toThrow();
    expect(Number((await admin.query('SELECT count(*) n FROM app.evidence_pack_revision WHERE tenant_id=$1 AND command_id=$2', [fixture.tenantId, commandId])).rows[0].n)).toBe(0);
    const pack = await repo.generate(context, fixture.customerCaseId, { commandId }, actor);
    await expect(repo.approveAttachment(context, fixture.customerCaseId, pack.id, { commandId, expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor)).rejects.toThrow('EVIDENCE_PACK_COMMAND_CONFLICT');
    const approvalId = randomUUID();
    await repo.approveAttachment(context, fixture.customerCaseId, pack.id, { commandId: approvalId, expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor);
    await expect(repo.generate(context, fixture.customerCaseId, { commandId: approvalId }, actor)).rejects.toThrow('EVIDENCE_PACK_COMMAND_CONFLICT');
  });
  it('treats upper- and lower-case spellings of one case UUID as the same case for replay', async () => {
    const input = { commandId: randomUUID() };
    const pack = await repo.generate(context, fixture.customerCaseId.toLowerCase(), input, actor);
    expect(await repo.generate(context, fixture.customerCaseId.toUpperCase(), input, actor)).toMatchObject({ id: pack.id, caseId: fixture.customerCaseId });
  });
  it('serializes on one case lock key whatever the UUID spelling', async () => {
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [fixture.tenantId, fixture.customerCaseId.toLowerCase()]);
      let settled = false;
      const pending = repo.generate(context, fixture.customerCaseId.toUpperCase(), { commandId: randomUUID() }, actor).finally(() => { settled = true; });
      // Observe the lock queue instead of sleeping: a waiter on the held advisory lock must appear before the call can finish.
      let waiting = false;
      for (let i = 0; i < 200 && !waiting && !settled; i += 1) {
        waiting = Number((await admin.query("SELECT count(*) n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n) > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      await holder.query('COMMIT');
      await expect(pending).resolves.toMatchObject({ caseId: fixture.customerCaseId });
    } finally { await holder.query('ROLLBACK').catch(() => undefined); holder.release(); }
  });
  it('rejects runtime approval inserts with hashes that do not belong to the exact pack', async () => {
    const pack = await repo.generate(context, fixture.caseId, { commandId: randomUUID() }, actor);
    await expect(withTenant(runtime, context, db => db.$client.query(`INSERT INTO app.evidence_pack_attachment_approval(id,tenant_id,job_id,case_id,pack_id,command_id,request_hash,manifest_hash,content_hash,actor_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$7,'fixture-owner')`, [randomUUID(), fixture.tenantId, fixture.jobId, fixture.caseId, pack.id, randomUUID(), '0'.repeat(64)]))).rejects.toMatchObject({ code: '23503' });
  });
  it('enforces actual 42501 tenant inserts and immutable runtime grants with FORCE RLS and migration ownership', async () => {
    const tables = ['evidence_pack', 'evidence_pack_revision', 'evidence_pack_attachment_approval'];
    const catalog = await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=ANY($1)", [tables]);
    expect(catalog.rows).toHaveLength(tables.length);
    expect(catalog.rows.every(row => row.relrowsecurity && row.relforcerowsecurity && row.rolname === 'jobguard_migration')).toBe(true);
    for (const table of tables) for (const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) {
      await expect(withTenant(runtime, context, db => db.$client.query(sql))).rejects.toMatchObject({ code: '42501' });
    }
    await expect(withTenant(runtime, context, db => db.$client.query('INSERT INTO app.evidence_pack(id,tenant_id,job_id,case_id) VALUES($1,$2,$3,$4)', [randomUUID(), fixture.otherTenantId, fixture.jobId, fixture.caseId]))).rejects.toMatchObject({ code: '42501' });
    await expect(withTenant(runtime, context, db => db.$client.query('INSERT INTO app.evidence_pack(id,tenant_id,job_id,case_id) VALUES($1,$2,$3,$4)', [randomUUID(), fixture.tenantId, fixture.otherJobId, fixture.caseId]))).rejects.toMatchObject({ code: '23503' });
  });
});
