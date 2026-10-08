import { testTenantContext } from './tenant-context-test-utils.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EvidencePackRepository, MIGRATION_URLS, RecoveryMessageRepository, migrate, type VerifiedTenantContext } from '../src/index.js';
import { closeTestPools, installLegacySyntheticPartyFixtures } from './pool-test-utils.js';
import { seedEvidencePackFixture } from './evidence-pack-fixture.js';

// Upgrade path for 0107 on a database that is at the previous supported schema (through 0106) and already holds recovery cases and evidence packs,
// applied by the non-superuser migration role the Neon/Vercel bootstrap uses (FORCE RLS applies to that owner).
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
let context: VerifiedTenantContext, packId: string, manifestHash: string, contentHash: string;
const nameOf = (url: URL) => fileURLToPath(url).split('/').at(-1)!;
const migration0107 = MIGRATION_URLS.find(url => nameOf(url).startsWith('0107_'))!;
const history = async () => (await admin.query(`SELECT
  (SELECT md5(coalesce(string_agg(id::text||manifest_hash||content_hash||coalesce(artifact_text,''),',' ORDER BY id),'')) FROM app.evidence_pack_revision) AS packs,
  (SELECT md5(coalesce(string_agg(id::text||manifest_hash||content_hash,',' ORDER BY id),'')) FROM app.evidence_pack_attachment_approval) AS approvals,
  (SELECT md5(coalesce(string_agg(id::text||case_type||source_refs::text,',' ORDER BY id),'')) FROM app.recovery_case) AS cases,
  (SELECT md5(coalesce(string_agg(id::text||revision::text||claim_pence::text||landed::text||written_off::text||state,',' ORDER BY id),'')) FROM app.recovery_case_current) AS current_state,
  (SELECT count(*)::int FROM app.audit_event) AS audits,
  (SELECT count(*)::int FROM app.decision) AS decisions`)).rows[0];

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'jg-message-upgrade-'));
  const port = 61200 + Math.floor(Math.random() * 200);
  const postgresLog: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic', persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ['--lc-messages=C', '--encoding=UTF8'], onLog: message => { postgresLog.push(message); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${postgresLog.join('\n')}`); }
  admin = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'synthetic', database: 'postgres' });
  // A real previous-release database (through 0106: M4-1-S-R's 0097, CH-3b's 0102, MON-7a's 0103 and M4-7-S's 0106 included): apply every migration the runner would, stop before 0107.
  await admin.query('CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
  for (const url of MIGRATION_URLS) {
    if (nameOf(url).startsWith('0107_')) break;
    const sql = await readFile(fileURLToPath(url), 'utf8');
    // The runner selects 0095's backfill mode inside that migration's own transaction; this database holds no job yet, so it backfills nothing.
    await admin.query(nameOf(url) === '0095_job_parties.sql' ? sql.replace('BEGIN;', "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
    await admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)', [nameOf(url)]);
  }
  // CH-3a (0095): every job needs fictional parties before its quote document and live switch; the shared fixture recipe supplies them.
  await installLegacySyntheticPartyFixtures(admin);
  fixture = await seedEvidencePackFixture(admin);
  await admin.query("CREATE ROLE upgrade_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO upgrade_login");
  runtime = new Pool({ host: '127.0.0.1', port, user: 'upgrade_login', password: 'synthetic', database: 'postgres' });
  context = testTenantContext(fixture.tenantId);
  // Old-release data. A workbench case always starts with its opening event (claim revision 1 + event 1), which is what makes recovery_case_current (0097) return it;
  // the shared fixture writes only the claim revision, so the opening event is recorded here, before the pack that cites the case's records.
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)",
    [randomUUID(), fixture.tenantId, fixture.jobId, fixture.customerCaseId, randomUUID(), createHash('sha256').update(`open:${fixture.customerCaseId}`).digest('hex')]);
  // A generated, attachment-approved pack for an existing customer case.
  const packs = new EvidencePackRepository(runtime), actorRef = `membership:${fixture.memberId}`;
  const pack = await packs.generate(context, fixture.customerCaseId, { commandId: randomUUID() }, actorRef);
  await packs.approveAttachment(context, fixture.customerCaseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actorRef);
  packId = pack.id; manifestHash = pack.manifestHash; contentHash = pack.contentHash;
}, 120_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe('0107 upgrade from a populated previous supported schema (through 0106)', () => {
  it('is absent before the upgrade and applies under the migration role without touching existing records', async () => {
    expect((await admin.query("SELECT to_regclass('app.recovery_message') IS NOT NULL AS present")).rows[0].present).toBe(false);
    const before = await history();
    const client = await admin.connect();
    try {
      await client.query('SET ROLE jobguard_migration');
      await client.query(await readFile(fileURLToPath(migration0107), 'utf8'));
    } finally { await client.query('RESET ROLE').catch(() => undefined); client.release(); }
    await admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)', [nameOf(migration0107)]);
    // Everything the previous release wrote is byte-for-byte unchanged: packs, approvals, cases, decisions and audit chain.
    expect(await history()).toEqual(before);
    const tables = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,(SELECT count(*)::int FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname LIKE 'recovery_message%' AND c.relkind='r' ORDER BY c.relname`)).rows;
    expect(tables.map(row => row.relname)).toEqual(['recovery_message', 'recovery_message_approval', 'recovery_message_event', 'recovery_message_sink']);
    for (const table of tables) expect(table).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, owner: 'jobguard_migration' });
    // Nothing is invented for old cases: no preview, approval or sink row exists until someone makes one.
    for (const table of ['recovery_message', 'recovery_message_approval', 'recovery_message_event', 'recovery_message_sink']) {
      expect(Number((await admin.query(`SELECT count(*) n FROM app.${table}`)).rows[0].n), table).toBe(0);
    }
  });

  it('keeps the runner idempotent and the previous release path working', async () => {
    await expect(migrate(admin)).resolves.toBeUndefined();
    expect((await admin.query('SELECT count(*)::int n FROM public.jobguard_schema_migration')).rows[0].n).toBe(MIGRATION_URLS.length);
    // The previous release's own commands still run against the upgraded schema.
    const packs = new EvidencePackRepository(runtime);
    const again = await packs.generate(context, fixture.customerCaseId, { commandId: randomUUID() }, `membership:${fixture.memberId}`);
    expect(again.manifestHash).toBe(manifestHash);
    expect(again.contentHash).toBe(contentHash);
    expect(again.id).not.toBe(packId);
  });

  it('lets a case that existed before the upgrade be previewed over its already-approved pack', async () => {
    // The newest pack (the rebuild above) is not yet approved: an old approval does not carry across a revision.
    const repo = new RecoveryMessageRepository(runtime);
    const actor = { membershipId: fixture.memberId, actorRef: `membership:${fixture.memberId}` };
    const ready = await repo.read(context, fixture.customerCaseId);
    expect(ready.readiness).toMatchObject({ eligible: false, reason: 'ATTACHMENT_APPROVAL_REQUIRED' });
    const packs = new EvidencePackRepository(runtime);
    await packs.approveAttachment(context, fixture.customerCaseId, ready.readiness.packId!, { commandId: randomUUID(), expectedManifestHash: manifestHash, expectedContentHash: contentHash }, actor.actorRef);
    const next = await repo.read(context, fixture.customerCaseId);
    expect(next.readiness).toMatchObject({ eligible: true, outstandingPence: 32000 });
    const state = await repo.preview(context, fixture.customerCaseId, { version: 'recovery-message-preview.v1', commandId: randomUUID(), expectedCaseRevision: next.readiness.caseRevision, packId: next.readiness.packId! }, actor);
    expect(state.latest).toMatchObject({ status: 'previewed', message: { amountPence: 32000, recipient: 'practice-customer@example.invalid' } });
  });
});
