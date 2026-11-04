import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ContractorBundleCheckApplication } from '../../../apps/api/src/evidence-bundle.application.js';
import { ExtraApprovalRepository } from '../src/extra-approval-chain-repository.js';
import { chainWorld, cluster, submitted, approveInput, type Cluster } from './extra-approval-chain-fixtures.js';
import { storage } from './site-extra-evidence-fixtures.js';
let c: Cluster;
beforeAll(async () => { vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo'); c = await cluster(); }, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it('checks actual approvals read-only, preserves absences, and refuses inaccessible/foreign jobs before reading objects', async () => {
  const w = await chainWorld(c), context = await w.ctx, s = await submitted(c, w, 40000);
  const repo = new ExtraApprovalRepository(c.runtime);
  await repo.approveExtraStep(context, w.members.supervisor.member, approveInput(s, 0));
  const readObject = vi.spyOn(storage, 'readExactVersion');
  const app = new ContractorBundleCheckApplication(c.runtime, storage);
  const query = { version: 'contractor-bundle-query.v1', jobId: s.jobId, extraId: s.extraId, requestId: s.requestId };
  const snapshot = async () => {
    const rows = [];
    for (const table of ['extra_approval_request', 'extra_approval_step_fact', 'extra_approval_outcome', 'extra_event', 'audit_event']) {
      rows.push((await c.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') data FROM app.${table} t WHERE tenant_id=$1`, [context.tenantId])).rows[0].data);
    }
    return rows;
  };
  const before = await snapshot();
  const a = await app.check(context, w.members.surveyor.member, query), b = await app.check(context, w.members.surveyor.member, query);
  expect(a).toEqual(b); expect(a.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(a.report).toMatchObject({ content: 'intact', sourceComplete: false, checkpoint: 'missing', authorityBound: false, externallyVerified: false });
  for (const name of ['export', 'invoice', 'payment']) expect(a.sections).toContainEqual({ name, state: 'absent' });
  expect(JSON.stringify(a)).not.toMatch(/originalBytesBase64|object_key|account_number/);
  expect(await snapshot()).toEqual(before);
  readObject.mockClear();
  const other = await chainWorld(c), foreign = await submitted(c, other, 40000);
  for (const jobId of [w.otherJob, randomUUID(), foreign.jobId]) {
    await expect(app.check(context, w.members.surveyor.member, { ...query, jobId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }
  expect(readObject).not.toHaveBeenCalled();
  await repo.reviseExtra(context, w.members.surveyor.member, { version: 'revise-extra.v1', commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 40001 });
  expect(await app.check(context, w.members.surveyor.member, query)).toMatchObject({ reason: 'APPROVAL_OR_SCOPE_INVALID', manifestDigest: null });
  readObject.mockRestore();
});
