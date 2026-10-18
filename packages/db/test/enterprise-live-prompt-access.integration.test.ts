// PostgreSQL only; NOT RUN in the restricted builder sandbox. No mocked authority.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { EnterpriseLivePromptRepository, withTenant } from '../src/index.js';
import { cluster, promptFixture, promptSession, materialsInput, evaluateInput, listInput, moveOffLive, smallTrack } from './enterprise-live-prompt-fixtures.js';
import { command } from './site-extra-fixtures.js';
import type { Cluster } from './site-visit-fixtures.js';
let c: Cluster;
beforeAll(async () => { vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo'); c = await cluster(); }, 120_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const forbidden = { code: 'EXTRA_FORBIDDEN' };
describe('ENT-8A-P persisted prompt access', () => {
 it('Possible extras lane is supervisor-only, including a covering supervisor not named on the visit', async () => {
  const f = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime);
  for (const role of ['supervisor', 'named']) await expect(repository.list(f.sessions[role]!, listInput(f))).resolves.toBeDefined();
  for (const role of ['owner', 'admin', 'operative', 'surveyor', 'commercial_manager', 'finance', 'read_only', 'client_approver']) await expect(repository.list(f.sessions[role]!, listInput(f))).rejects.toMatchObject(forbidden);
 });
 it('fresh reads expose a committed prompt; only scoped resolution roles can read its detail', async () => {
  const f = await promptFixture(c), writer = new EnterpriseLivePromptRepository(c.runtime);
  await writer.importMaterials(f.sessions.finance!, materialsInput(f, { unit: 'each' }));
  const row = (await c.admin.query('SELECT id FROM app.extra_prompt WHERE tenant_id=$1 AND job_id=$2', [f.p.tenantId, f.jobId])).rows[0];
  expect(row).toBeDefined();
  const fresh = new Pool({ ...c.config, database: 'jobguard_synthetic_demo', user: 'ent4b_login' });
  try {
  const reader = new EnterpriseLivePromptRepository(fresh);
  const lane = await reader.list(f.sessions.supervisor!, listInput(f));
  expect(JSON.stringify(lane)).toContain(row!.id);
  for (const role of ['supervisor', 'surveyor', 'commercial_manager']) await expect(reader.detail(f.sessions[role]!, { version: 'live-prompt-detail.v1', jobId: f.jobId, promptId: row!.id })).resolves.toBeDefined();
  for (const role of ['owner', 'admin', 'finance', 'operative', 'read_only', 'client_approver']) await expect(reader.detail(f.sessions[role]!, { version: 'live-prompt-detail.v1', jobId: f.jobId, promptId: row!.id })).rejects.toMatchObject(forbidden);
  } finally { await fresh.end(); }
 });
 it('only finance and owner import materials; import does not grant resolution or lane authority', async () => {
  const f = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime);
  for (const role of ['owner', 'finance']) {
   await expect(repository.importMaterials(f.sessions[role]!, materialsInput(f))).resolves.toBeDefined();
   await expect(repository.confirm(f.sessions[role]!, { version: 'confirm-prompt.v1', commandId: randomUUID(), jobId: f.jobId, promptId: randomUUID(), promptHash: 'a'.repeat(64) })).rejects.toMatchObject(forbidden);
  }
  for (const role of ['admin', 'supervisor', 'surveyor', 'commercial_manager', 'operative', 'read_only', 'client_approver']) await expect(repository.importMaterials(f.sessions[role]!, materialsInput(f))).rejects.toMatchObject(forbidden);
 });
 it('an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job', async () => {
  const f = await promptFixture(c), foreign = await promptFixture(c), closed = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime);
  await moveOffLive(c, closed);
  for (const jobId of [randomUUID(), foreign.jobId, closed.jobId, f.jobId]) {
   await expect(repository.evaluate(f.sessions.admin!, evaluateInput(f, { jobId }))).rejects.toMatchObject(forbidden);
   await expect(repository.importMaterials(f.sessions.admin!, materialsInput(f, { jobId }))).rejects.toMatchObject(forbidden);
  }
 });
 it('same-tenant wrong-job scope and cross-tenant reads refuse identically', async () => {
  const f = await promptFixture(c), foreign = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime);
  for (const jobId of [f.otherJob, foreign.jobId, randomUUID()]) await expect(repository.list(f.sessions.supervisor!, { ...listInput(f), jobId })).rejects.toMatchObject(forbidden);
  const wrongSession = await promptSession(c, f.otherSupervisor);
  await expect(repository.list(wrongSession, listInput(f))).rejects.toMatchObject(forbidden);
 });
 it('revoked grants are rechecked on successful replay and reads', async () => {
  const f = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime), input = evaluateInput(f);
  await repository.evaluate(f.sessions.supervisor!, input);
  await command(c, f, { kind: 'grant.revoke', grantId: f.members.supervisor.grant });
  await expect(repository.evaluate(f.sessions.supervisor!, input)).rejects.toMatchObject(forbidden);
  await expect(repository.list(f.sessions.supervisor!, listInput(f))).rejects.toMatchObject(forbidden);
 });
 it('revoked memberships and unknown sessions cannot reuse historic authority', async () => {
  const f = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime);
  await command(c, f, { kind: 'membership.revoke', membershipId: f.members.supervisor.member.membershipId });
  await expect(repository.list(f.sessions.supervisor!, listInput(f))).rejects.toBeDefined();
  await expect(repository.list(randomUUID(), listInput(f))).rejects.toBeDefined();
 });
 it('a revoked persisted session cannot read or mutate', async () => {
  const f = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime);
  await c.admin.query("UPDATE control_plane.contractor_practice_session SET revoked_at=clock_timestamp() WHERE session_digest=app.contractor_practice_session_digest($1)", [f.sessions.supervisor]);
  await expect(repository.list(f.sessions.supervisor!, listInput(f))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await expect(repository.evaluate(f.sessions.supervisor!, evaluateInput(f))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
 });
 it('contractor capability loss preserves read-only prompt history and refuses new work', async () => {
  const f = await promptFixture(c), repository = new EnterpriseLivePromptRepository(c.runtime);
  await repository.importMaterials(f.sessions.finance!, materialsInput(f, { unit: 'each' }));
  const before = await repository.list(f.sessions.supervisor!, listInput(f));
  await smallTrack(c, f);
  expect(await repository.list(f.sessions.supervisor!, listInput(f))).toEqual(before);
  await expect(repository.evaluate(f.sessions.supervisor!, evaluateInput(f))).rejects.toBeDefined();
 });
 it('direct SQL cannot mutate prompt sources, resolutions or settings, even in a valid tenant context', async () => {
  const f = await promptFixture(c);
  for (const table of ['extra_prompt', 'extra_prompt_citation', 'prompt_resolution', 'materials_issue_fact', 'extra_completion_observation', 'extra_office_prompt_signal', 'extra_prompt_rule_settings']) {
   await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(`DELETE FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId]))).rejects.toMatchObject({ code: '42501' });
  }
 });
 it('no new callable routine grants access to shadow storage', async () => {
  const rows = (await c.admin.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname LIKE 'lp_%' AND has_function_privilege('jobguard_runtime',oid,'EXECUTE')")).rows;
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.definition).not.toMatch(/app\.shadow_|final_account_lock/iu);
 });
});
