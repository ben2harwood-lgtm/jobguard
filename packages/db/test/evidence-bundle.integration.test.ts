import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ExtraApprovalRepository } from '../src/extra-approval-chain-repository.js';
import { withEvidencePackV3Snapshot } from '../src/evidence-pack-v3-sources.js';
import { loadContractorBundleSources, hydrateContractorBundleSources, loadRecoveryBundleSources } from '../src/evidence-bundle-sources.js';
import { assembleEvidenceBundle, verifyEvidenceBundle } from '../src/evidence-bundle.js';
import { chainWorld, cluster, submitted, approveInput, type Cluster } from './extra-approval-chain-fixtures.js';
import { seedEvidencePackFixture } from './evidence-pack-fixture.js';
import { testTenantContext } from './tenant-context-test-utils.js';
import { storage } from './site-extra-evidence-fixtures.js';
let c: Cluster;
beforeAll(async () => { vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo'); c = await cluster(); }, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it('joins actual immutable origin, revision, requirement and approval facts; replays deterministically; refuses stale requests and cross-tenant actors', async () => {
  const w = await chainWorld(c), ctx = await w.ctx, repo = new ExtraApprovalRepository(c.runtime);
  const s = await submitted(c, w, 40000);
  const q = { version: 'contractor-bundle-query.v1', jobId: s.jobId, extraId: s.extraId, requestId: s.requestId };
  const read = (actor = w.members.surveyor.member, input = q) => withEvidencePackV3Snapshot(c.runtime, ctx, tx => loadContractorBundleSources(tx, actor, input));
  // No positive assertion is derived from a submission, a missing step or a non-approved outcome.
  await expect(read()).rejects.toBeDefined();
  await repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(s, 0));
  const loaded = await read(), sources = await hydrateContractorBundleSources(loaded, storage);
  const build = (records = sources) => assembleEvidenceBundle({ version: 'evidence-bundle-input.v1', subject: { kind: 'extra', ...loaded.owner }, lifecycle: { state: 'ordinary' },
    recipients: [w.members.supervisor.member.membershipId], checkpoint: null, sources: records,
    selected: records.map(({ sourceId, sourceVersion, objectVersion, sha256 }) => ({ sourceId, sourceVersion, objectVersion, sha256, disclosure: 'metadata' })), absentSections: loaded.absentSections });
  const pack = build();
  expect(pack.sourceComplete).toBe(false); // A real absence: not exported, invoiced or paid.
  expect(pack.manifest.entries.map(e => e.sourceId.split(':')[0])).toEqual(expect.arrayContaining(['extra_origin', 'variation_revision', 'extra_approval_revision_binding', 'extra_approval_request', 'extra_approval_step_fact', 'extra_approval_outcome']));
  const again = await hydrateContractorBundleSources(await read(), storage);
  expect(build(again).zip).toEqual(pack.zip);
  expect(verifyEvidenceBundle(pack.zip).content).toBe('intact');
  await expect(read({ ...w.members.surveyor.member, tenantId: randomUUID() })).rejects.toBeDefined();
  await expect(read(w.members.surveyor.member, { ...q, jobId: randomUUID() })).rejects.toBeDefined();
  await expect(read(w.members.surveyor.member, { ...q, extraId: randomUUID() })).rejects.toBeDefined();
  await repo.reviseExtra(ctx, w.members.surveyor.member, { version: 'revise-extra.v1', commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 40001 });
  await expect(read()).rejects.toBeDefined();
});

it('reuses real quote/acceptance, variation, proof, supplier and case joins, refusing foreign and same-tenant wrong-job references', async () => {
  const f = await seedEvidencePackFixture(c.admin, { withVariation: true });
  const read = (caseId = f.caseId, tenantId = f.tenantId) => withEvidencePackV3Snapshot(c.runtime, testTenantContext(tenantId), tx => loadRecoveryBundleSources(tx, tenantId, caseId, []));
  const loaded = await read();
  expect(loaded.sources.map(s => s.kind)).toEqual(expect.arrayContaining(['accepted_quote', 'approval', 'variation', 'proof', 'order', 'delivery', 'invoice', 'case_history']));
  expect(loaded.sources.every(s => s.tenantId === f.tenantId && s.jobId === f.jobId && s.subjectId === f.caseId)).toBe(true);
  expect(loaded.sources.some(s => s.sourceId.includes(f.unrelatedSupplierVersionId))).toBe(false);
  await expect(read(f.caseId, f.otherTenantId)).rejects.toBeDefined();
  await expect(read(f.crossJobReferenceCaseId)).rejects.toBeDefined();
  const again = await read();
  expect(again.sources).toEqual(loaded.sources);
});

it.each(['bundle', 'Northside'] as const)('LATER-SAFETY-47 %s follows exact duplicate-link reversals without changing billing', async reader => {
  const { world } = await import('./contractor-billing-fixtures.js');
  const { raiseOn } = await import('./extra-approval-chain-fixtures.js');
  const { ExtraRepository } = await import('../src/extra-repository.js');
  const { northsideExtras } = await import('../src/northside-demo.js');
  const f = await world(c), { w, ctx, s } = f;
  const approvals = new ExtraApprovalRepository(c.runtime), extras = new ExtraRepository(c.runtime);
  const actor = w.members.supervisor.member;
  const canonicalId = await raiseOn(c, w, s.jobId);
  const query = { version: 'contractor-bundle-query.v1', jobId: s.jobId, extraId: s.extraId, requestId: s.requestId };
  const read = async (state: 'approved' | 'duplicate') => {
    if (reader === 'Northside') {
      const rows = await northsideExtras(c.runtime, actor, 'supervisor', ctx);
      expect(rows.find(row => row.extraId === s.extraId)?.state).toBe(state);
      return;
    }
    const load = () => withEvidencePackV3Snapshot(c.runtime, ctx, tx => loadContractorBundleSources(tx, actor, query));
    if (state === 'duplicate') {
      await expect(load()).rejects.toBeDefined();
      return;
    }
    const loaded = await load(), sources = await hydrateContractorBundleSources(loaded, storage);
    const bundle = assembleEvidenceBundle({ version: 'evidence-bundle-input.v1', subject: { kind: 'extra', ...loaded.owner }, lifecycle: { state: 'ordinary' },
      recipients: [actor.membershipId], checkpoint: null, sources,
      selected: sources.map(({ sourceId, sourceVersion, objectVersion, sha256 }) => ({ sourceId, sourceVersion, objectVersion, sha256, disclosure: 'metadata' })), absentSections: loaded.absentSections });
    expect(verifyEvidenceBundle(bundle.zip).content).toBe('intact');
  };
  const mark = () => approvals.markDuplicate(ctx, actor, { version: 'mark-duplicate.v1', commandId: randomUUID(), jobId: s.jobId, duplicateId: s.extraId, canonicalId });
  const unlink = async (linkId: string) => extras.unlinkDuplicate(ctx, { version: 'extra-duplicate-unlink.v1', commandId: randomUUID(), jobId: s.jobId,
    actorMembershipId: actor.membershipId, linkId, expectedRevision: (await extras.readDuplicateLinks(ctx, s.jobId)).revision, reasonCode: 'linked_in_error' });
  await read('approved');
  const linked = await mark();
  await read('duplicate');
  await unlink(String(linked.linkId));
  // The raw latest fact stays duplicate; only its exact reversed link is ignored.
  expect((await c.admin.query('SELECT kind FROM app.extra_event WHERE tenant_id=$1 AND job_id=$2 AND variation_id=$3 ORDER BY sequence DESC LIMIT 1', [w.p.tenantId, s.jobId, s.extraId])).rows[0].kind).toBe('duplicate');
  const billingBefore = await f.repo.read(ctx, f.session, s.jobId);
  await read('approved');
  expect(await f.repo.read(ctx, f.session, s.jobId)).toEqual(billingBefore);
  // Reversing an earlier link must not hide a new, still-active duplicate event.
  const relinked = await mark();
  await read('duplicate');
  await unlink(String(relinked.linkId));
  await read('approved');
  // The existing billing writer still exports the original approved identity and value.
  const batch = await f.exported();
  const lines = (await f.repo.read(ctx, f.session, s.jobId)).exports.find(row => row.id === batch.batchId)!.artifact.lines;
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ extraId: s.extraId, approvedNet: { pence: s.net, currency: 'GBP' } });
}, 180_000);
