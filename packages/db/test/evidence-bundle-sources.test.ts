import { expect, it } from 'vitest';
import { assembleEvidencePackV3 } from '@jobguard/core';
import { projectBundleBillingLine, smallBuilderBundleMaterial } from '../src/evidence-bundle-sources.js';
import { assembleEvidenceBundle, bundleHash } from '../src/evidence-bundle.js';
const tenantId = '10000000-0000-4000-8000-000000000001', jobId = '10000000-0000-4000-8000-000000000002', caseId = '10000000-0000-4000-8000-000000000003';
const at = '2026-10-28T12:00:00.123456Z';
const sectionKinds = ['lock', 'capture_snapshot', 'source_observations', 'reconciliation', 'reveal', 'disposition', 'attribution_revision', 'settlement'];
const record = (kind: string) => ({ kind, sourceId: kind, recordedAt: at, content: `Exact original ${kind} £300.00\r\n` });
const selected = (sources: ReturnType<typeof smallBuilderBundleMaterial>['sources']) => sources.map(({ sourceId, sourceVersion, objectVersion, sha256 }) => ({ sourceId, sourceVersion, objectVersion, sha256, disclosure: 'original' }));
it('CH-8 exact lock/capture and all eight section bytes survive conversion, and a different locked bill is refused', () => {
  const pack = assembleEvidencePackV3({ tenantId, jobId, caseId, lifecycle: { state: 'post_lock', lockedAt: at, evidenceCutoff: at }, records: sectionKinds.map(record) });
  const material = smallBuilderBundleMaterial(pack.artifactText);
  const build = (raw = material) => assembleEvidenceBundle({ version: 'evidence-bundle-input.v1', subject: { kind: 'small_builder', ...raw.owner }, lifecycle: raw.lifecycle,
    sources: raw.sources, selected: selected(raw.sources), absentSections: raw.absentSections, recipients: [tenantId], checkpoint: null });
  const bundle = build();
  expect(bundle.sourceComplete).toBe(true);
  for (const source of material.sources) expect(source.sha256).toBe(bundleHash(pack.sources.find(s => s.sourceId === source.sourceId)!.content));
  expect(bundle.manifest.entries.map(e => e.kind)).toEqual(expect.arrayContaining(['lock', 'capture_snapshot', 'attribution', 'settlement']));
  const other = structuredClone(material);
  if (other.lifecycle.state !== 'post_lock') throw new Error();
  other.lifecycle.lock.sha256 = 'f'.repeat(64);
  expect(() => build(other)).toThrow();
});
it('pre-lock CH-8 adapter has no hidden section placeholders and is byte-identical for repeated ordinary input', () => {
  const pack = assembleEvidencePackV3({ tenantId, jobId, caseId, lifecycle: { state: 'pre_lock' }, records: [record('ordinary')] });
  const m = smallBuilderBundleMaterial(pack.artifactText);
  expect(m.lifecycle).toEqual({ state: 'pre_lock' }); expect(m.absentSections).toEqual([]);
  expect(m.sources.map(s => s.kind)).toEqual(['case_history']);
  expect(smallBuilderBundleMaterial(pack.artifactText)).toEqual(m);
  const raw = JSON.parse(pack.artifactText); raw.sources[0].content = 'tampered';
  expect(() => smallBuilderBundleMaterial(JSON.stringify(raw))).toThrow();
});
it('line disclosure preserves exact fractions, predecessor and signed reversals while excluding other-job money and totals', () => {
  const f = (n: string) => ({ numerator: n, denominator: '31' });
  const line = (lineId: string) => ({ lineId, billedNet: f('24000'), creditedNet: f('0'), paidNet: f('0'), paidGross: f('0'), matchedExtraNet: f('0'), rejected: false });
  const allocation = (lineId: string, n: string) => ({ lineId, rule: 'pro_rata' as const, sourceRef: 'receipt-1', gross: f(n), net: f(n), matchedExtraNet: f(n) });
  const projection = { lines: [line('extra'), line('PRIVATE-OTHER-JOB')], allocations: [
    { sourceRef: 'receipt-1', originalSourceRef: null, lines: [allocation('extra', '300000'), allocation('PRIVATE-OTHER-JOB', '900000')] },
    { sourceRef: 'reversal-1', originalSourceRef: 'receipt-1', lines: [allocation('extra', '-300000'), allocation('PRIVATE-OTHER-JOB', '-900000')] },
  ], totals: { billedNet: f('PRIVATE'), creditedNet: f('0'), paidNet: f('0'), paidGross: f('0'), matchedExtraNet: f('0') }, held: [] };
  const run = { id: caseId, predecessor_id: jobId, record_hash: 'a'.repeat(64), line_id: 'extra', projection };
  const text = projectBundleBillingLine(run), exported = JSON.parse(text);
  expect(text).not.toContain('PRIVATE'); expect(text).not.toContain('totals');
  expect(exported.predecessorId).toBe(jobId);
  expect(exported.allocations[1]).toMatchObject({ originalSourceRef: 'receipt-1', lines: [{ net: f('-300000') }] });
  expect(exported.allocations[0].lines[0].gross).toEqual(f('300000'));
  expect(() => projectBundleBillingLine({ ...run, line_id: 'missing' })).toThrow();
  expect(() => projectBundleBillingLine({ ...run, projection: { ...projection, lines: [...projection.lines, line('extra')] } })).toThrow();
});
