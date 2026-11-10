import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ExtraApprovalRepository } from '../src/extra-approval-chain-repository.js';
import { withEvidencePackV3Snapshot } from '../src/evidence-pack-v3-sources.js';
import { loadContractorBundleSources, hydrateContractorBundleSources, loadRecoveryBundleSources } from '../src/evidence-bundle-sources.js';
import { assembleEvidenceBundle, EvidenceBundleError, verifyEvidenceBundle } from '../src/evidence-bundle.js';
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
  // LS-111 requires an approved canonical for an approved duplicate.
  await approvals.priceExtra(ctx, w.members.surveyor.member, { version: 'price-extra.v1', commandId: randomUUID(), jobId: s.jobId, extraId: canonicalId, netPence: 24000 });
  const canonical = await approvals.submitExtra(ctx, actor, { version: 'submit-extra.v1', commandId: randomUUID(), jobId: s.jobId, extraId: canonicalId });
  await approvals.approveExtraStep(ctx, actor, approveInput({ jobId: s.jobId, requestId: canonical.requestId as string, hash: canonical.revisionHash as string, net: 24000 }, 0));
  const query = { version: 'contractor-bundle-query.v1', jobId: s.jobId, extraId: s.extraId, requestId: s.requestId };
  const read = async (state: 'approved' | 'duplicate') => {
    if (reader === 'Northside') {
      const rows = await northsideExtras(c.runtime, actor, 'supervisor', ctx);
      expect(rows.find(row => row.extraId === s.extraId)?.state).toBe(state);
      return;
    }
    const load = () => withEvidencePackV3Snapshot(c.runtime, ctx, tx => loadContractorBundleSources(tx, actor, query));
    if (state === 'duplicate') {
      await expect(load()).rejects.toMatchObject({
        constructor: EvidenceBundleError, code: 'EVIDENCE_BUNDLE_INVALID',
      });
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
  // The fixture canonical is no longer linked. Give it an unapproved revision
  // so the billing assertion still concerns only the original approved extra.
  await approvals.reviseExtra(ctx, w.members.surveyor.member, { version: 'revise-extra.v1', commandId: randomUUID(), jobId: s.jobId, extraId: canonicalId, netPence: 24001 });
  // The existing billing writer still exports the original approved identity and value.
  const batch = await f.exported();
  const lines = (await f.repo.read(ctx, f.session, s.jobId)).exports.find(row => row.id === batch.batchId)!.artifact.lines;
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ extraId: s.extraId, approvedNet: { pence: s.net, currency: 'GBP' } });
}, 180_000);


// The importer records allocation runs; lifecycle-event guard cases use the existing
// owner fixture to append states without inventing an import-side event writer.
async function appendBillingLifecycle(f: Awaited<ReturnType<typeof import('./contractor-billing-fixtures.js').world>>, kind: string) {
  const { ownerTx, receipt, terminalizeFixtureReceipt } = await import('./extra-fixtures.js');
  await ownerTx(c, f.w.p.tenantId, async tx => {
    const commandId = randomUUID(), actor = f.w.members.finance.member.membershipId;
    await receipt(tx, f.w.p.tenantId, f.s.jobId, f.s.extraId, actor, 'ImportBillingStatus', commandId,
      { semanticKey: `later-safety-89:${commandId}` });
    await tx.$client.query(`INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [f.w.p.tenantId, randomUUID(), f.s.jobId, f.s.extraId, kind, commandId, actor]);
    await terminalizeFixtureReceipt(tx, f.w.p.tenantId, commandId, { kind });
  });
}

it('LATER-SAFETY-89 preserves an intact bundle through real export, billed and paid imports and post-approval lifecycle states', async () => {
  const { world } = await import('./contractor-billing-fixtures.js');
  const { ContractorBundleCheckApplication } = await import('../../../apps/api/src/evidence-bundle.application.js');
  const f = await world(c), actor = f.w.members.surveyor.member;
  const query = { version: 'contractor-bundle-query.v1', jobId: f.s.jobId, extraId: f.s.extraId, requestId: f.s.requestId };
  const app = new ContractorBundleCheckApplication(c.runtime, storage);
  const check = async (present: string[]) => {
    const loaded = await withEvidencePackV3Snapshot(c.runtime, f.ctx, tx => loadContractorBundleSources(tx, actor, query));
    expect(loaded.sources.map(source => source.kind)).toEqual(expect.arrayContaining(present));
    const result = await app.check(f.ctx, actor, query);
    expect(result.reason).toBeNull();
    expect(result.report).toMatchObject({ content: 'intact' });
    for (const name of present) expect(result.sections).toContainEqual({ name, state: 'present' });
  };
  const invoice = await f.invoice(); // Full approval chain in world(), then the real export command.
  expect((await c.admin.query('SELECT kind FROM app.extra_event WHERE tenant_id=$1 AND variation_id=$2 ORDER BY sequence DESC LIMIT 1',
    [f.w.p.tenantId, f.s.extraId])).rows[0].kind).toBe('exported');
  await check(['export']);
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([invoice]));
  await check(['export', 'invoice', 'payment']);
  await appendBillingLifecycle(f, 'billed');
  await check(['export', 'invoice', 'payment']);
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([f.event('paid', {
    effectiveAt: '2026-10-03T12:00:00Z', reconciliationId: 'later-safety-89-part',
    amount: { netPence: 62000, vatPence: 12400, grossPence: 74400 },
  })]));
  await appendBillingLifecycle(f, 'part_paid');
  await check(['export', 'invoice', 'payment']);
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([f.event('paid', {
    effectiveAt: '2026-10-04T12:00:00Z', reconciliationId: 'later-safety-89-rest',
    amount: { netPence: 62000, vatPence: 12400, grossPence: 74400 },
  })]));
  await appendBillingLifecycle(f, 'paid');
  await check(['export', 'invoice', 'payment']);
  const view = await f.repo.read(f.ctx, f.session, f.s.jobId);
  expect(view.invoices[0]!.projection.totals.paidNet).toEqual({ numerator: '124000', denominator: '1' });
}, 180_000);

it.each(['credited', 'billing_rejected'])('LATER-SAFETY-89 refuses latest %s even with immutable approval and export facts', async kind => {
  const { world } = await import('./contractor-billing-fixtures.js');
  const { ContractorBundleCheckApplication } = await import('../../../apps/api/src/evidence-bundle.application.js');
  const f = await world(c), actor = f.w.members.surveyor.member;
  const invoice = await f.invoice();
  await f.repo.import(f.ctx, f.session, f.s.jobId, f.importInput([invoice]));
  await appendBillingLifecycle(f, kind);
  const query = { version: 'contractor-bundle-query.v1', jobId: f.s.jobId, extraId: f.s.extraId, requestId: f.s.requestId };
  await expect(withEvidencePackV3Snapshot(c.runtime, f.ctx, tx => loadContractorBundleSources(tx, actor, query)))
    .rejects.toMatchObject({ constructor: EvidenceBundleError, code: 'EVIDENCE_BUNDLE_INVALID' });
  const result = await new ContractorBundleCheckApplication(c.runtime, storage).check(f.ctx, actor, query);
  expect(result).toMatchObject({ reason: 'APPROVAL_OR_SCOPE_INVALID', report: null, manifestDigest: null });
  expect(result.sections.every(section => section.state === 'not_checked')).toBe(true);
}, 180_000);
