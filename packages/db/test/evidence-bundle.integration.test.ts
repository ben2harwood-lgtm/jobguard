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
