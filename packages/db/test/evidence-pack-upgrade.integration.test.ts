import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATION_URLS } from '../src/index.js';
import { closeTestPools } from './pool-test-utils.js';
import { seedEvidencePackFixture } from './evidence-pack-fixture.js';

// Upgrade path for 0042 on a database that is really at 0041, applied by the same
// non-superuser role the Neon/Vercel bootstrap uses (FORCE RLS applies to that owner).
let postgres: EmbeddedPostgres, admin: Pool, directory: string;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
let packId: string, revisionId: string;
const nameOf = (url: URL) => fileURLToPath(url).split('/').at(-1)!;
const migration0042 = MIGRATION_URLS.find(url => nameOf(url).startsWith('0042_'))!;

async function apply0042(role?: string) {
  const client = await admin.connect();
  try {
    if (role) await client.query(`SET ROLE ${role}`);
    await client.query(await readFile(fileURLToPath(migration0042), 'utf8'));
  } finally {
    // A rejected 0042 leaves its transaction aborted; a successful one has already committed.
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('RESET ROLE').catch(() => undefined);
    client.release();
  }
}
const evidencePackState = async () => (await admin.query(`SELECT to_regclass('app.evidence_pack_attachment_approval') IS NOT NULL AS applied,
  (SELECT count(*)::int FROM pg_constraint WHERE conname='evidence_pack_revision_exact_case_fk') AS fk_count`)).rows[0];

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'jg-evidence-upgrade-'));
  const port = 60600 + Math.floor(Math.random() * 200);
  const postgresLog: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic', persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ['--lc-messages=C'], onLog: message => { postgresLog.push(message); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${postgresLog.join('\n')}`); }
  admin = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'synthetic', database: 'postgres' });
  // A real 0041 database: apply 0000..0041 exactly as the runner would, stop before 0042.
  await admin.query('CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
  for (const url of MIGRATION_URLS) {
    if (nameOf(url).startsWith('0042_')) break;
    await admin.query(await readFile(fileURLToPath(url), 'utf8'));
    await admin.query('INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)', [nameOf(url)]);
  }
  fixture = await seedEvidencePackFixture(admin);
  // 0041 allows this: the revision's case and its pack's case are each valid recovery cases of the same job,
  // but they are different cases. 0042's exact (case, pack) foreign key must reject it.
  packId = randomUUID(); revisionId = randomUUID();
  await admin.query('INSERT INTO app.evidence_pack(id,tenant_id,job_id,case_id) VALUES($1,$2,$3,$4)', [packId, fixture.tenantId, fixture.jobId, fixture.caseId]);
  await admin.query(`INSERT INTO app.evidence_pack_revision(id,tenant_id,job_id,case_id,pack_id,revision,command_id,canonical_manifest,manifest_hash,content_hash,sources,format,actor_ref,subject_hash)
    VALUES($1,$2,$3,$4,$5,1,$6,'{}',$7,$8,'[]','ZIP','legacy-actor',$9)`,
  [revisionId, fixture.tenantId, fixture.jobId, fixture.customerCaseId, packId, randomUUID(), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]);
}, 120_000);
afterAll(async () => { await closeTestPools(admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe('0042 upgrade from a real 0041 database', () => {
  it('rejects an inconsistent 0041 row for a superuser (control) and for jobguard_migration under FORCE RLS', async () => {
    await expect(apply0042()).rejects.toMatchObject({ code: '23503' });
    expect(await evidencePackState()).toEqual({ applied: false, fk_count: 0 });
    // Same SQL, same data, applied by the role the bootstrap uses: must also be rejected, never "validated" vacuously.
    await expect(apply0042('jobguard_migration')).rejects.toMatchObject({ code: '23503' });
    expect(await evidencePackState()).toEqual({ applied: false, fk_count: 0 });
  });

  it('applies consistent data as jobguard_migration with the foreign key really validated and FORCE RLS restored', async () => {
    // Test-database fixture correction (superuser): make the legacy row consistent rather than removing it.
    await admin.query('UPDATE app.evidence_pack_revision SET case_id=$3 WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, revisionId, fixture.caseId]);
    await apply0042('jobguard_migration');
    expect(await evidencePackState()).toEqual({ applied: true, fk_count: 1 });
    const fk = await admin.query("SELECT convalidated FROM pg_constraint WHERE conname='evidence_pack_revision_exact_case_fk'");
    expect(fk.rows).toEqual([{ convalidated: true }]);
    const tables = await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname = ANY($1) ORDER BY c.relname`,
    [['evidence_pack', 'evidence_pack_revision', 'evidence_pack_attachment_approval']]);
    expect(tables.rows).toEqual([
      { relname: 'evidence_pack', relrowsecurity: true, relforcerowsecurity: true, rolname: 'jobguard_migration' },
      { relname: 'evidence_pack_attachment_approval', relrowsecurity: true, relforcerowsecurity: true, rolname: 'jobguard_migration' },
      { relname: 'evidence_pack_revision', relrowsecurity: true, relforcerowsecurity: true, rolname: 'jobguard_migration' },
    ]);
    // The existing row survived and is still visible under its own tenant context.
    const client = await admin.connect();
    try {
      await client.query('SET ROLE jobguard_migration');
      await client.query("SELECT set_config('app.tenant_id',$1,false)", [fixture.tenantId]);
      expect((await client.query('SELECT case_id FROM app.evidence_pack_revision WHERE id=$1', [revisionId])).rows).toEqual([{ case_id: fixture.caseId }]);
    } finally { await client.query('RESET ROLE'); client.release(); }
  });
});
