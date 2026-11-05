import type { Pool } from 'pg';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as db from '@jobguard/db';
import { ContractorBundleCheckApplication } from './evidence-bundle.application.js';
const state = vi.hoisted(() => ({ committed: false, allowed: true }));
vi.mock('@jobguard/db', async original => ({ ...await original<typeof db>(),
  withEvidencePackV3Snapshot: vi.fn(async (_pool, _context, work) => {
    state.committed = false;
    const value = await work({ $client: { query: async () => ({ rows: state.allowed ? [{}] : [] }) } });
    state.committed = true; return value;
  }), loadContractorBundleSources: vi.fn(),
}));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = { tenantId: id(1), jobId: id(2), subjectId: id(3), scopeItemId: id(4) };
const actor = { tenantId: id(1), membershipId: id(5), identityUserId: id(6) } as db.AuthenticatedMembership;
const query = { version: 'contractor-bundle-query.v1', jobId: id(2), extraId: id(3), requestId: id(7) };
const bytes = Buffer.from('PRIVATE ORIGINAL BANK AND PERSONAL DATA');
function fixture(): db.ContractorBundleSources {
  return { owner, absentSections: ['export', 'invoice', 'payment'],
    sources: (['origin', 'approval'] as const).map(kind => ({ ...owner, kind, sourceId: kind, sourceVersion: '1',
      objectVersion: '1', sha256: db.bundleHash('PRIVATE SOURCE'), content: 'PRIVATE SOURCE', links: [] })),
    ordinary: { jobId: id(2), extraId: id(3), omissions: [],
      sources: [{ jobId: id(2), sourceId: 'proof', kind: 'proof', version: 1, label: 'Private label', content: 'PRIVATE RECORD' }],
      originalObjects: [{ sourceId: 'proof', key: 'PRIVATE_KEY', versionId: 'v1', sha256: db.bundleHash(bytes), byteLength: bytes.length, contentType: 'image/png' }] },
  };
}
const read = vi.fn(async () => {
  expect(state.committed).toBe(true);
  return { key: 'PRIVATE_KEY', versionId: 'v1', bytes, byteLength: bytes.length, contentType: 'image/png' };
});
const forbidden = vi.fn(async () => { throw new Error('write/download forbidden'); });
const app = () => new ContractorBundleCheckApplication({} as Pool, { readExactVersion: read,
  createUploadUrl: forbidden, createDownloadUrl: forbidden, deleteExactVersion: forbidden });
const check = () => app().check(db.verifiedTenantContextFromMembership(actor), actor, query);
beforeEach(() => { vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo'); state.allowed = true; vi.mocked(db.loadContractorBundleSources).mockResolvedValue(fixture()); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it('replays the digest, reads storage after commit and returns only the minimal report, with real absences and no invented trust', async () => {
  const first = await check(), again = await check();
  expect(first).toEqual(again); expect(first.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(first.sections.filter(s => ['export', 'invoice', 'payment'].includes(s.name))).toEqual([
    { name: 'export', state: 'absent' }, { name: 'invoice', state: 'absent' }, { name: 'payment', state: 'absent' }]);
  expect(first.report).toMatchObject({ content: 'intact', checkpoint: 'missing', authorityBound: false, externallyVerified: false, sourceComplete: false, exportIntegrityComplete: false });
  expect(Object.keys(first).sort()).toEqual(['manifestDigest', 'reason', 'report', 'sections', 'version']);
  expect(JSON.stringify(first)).not.toMatch(/PRIVATE|originalBytesBase64|bytes|tenantId|membershipId/);
  expect(forbidden).not.toHaveBeenCalled();
});
it.each(['MISSING_ORIGINAL', 'WRONG_VERSION', 'ALTERED_FILE'] as const)('refuses %s with its own safe reason', async reason => {
  if (reason === 'MISSING_ORIGINAL') read.mockRejectedValueOnce(new Error('PRIVATE storage failure'));
  else read.mockResolvedValueOnce({ key: 'PRIVATE_KEY', versionId: reason === 'WRONG_VERSION' ? 'v0' : 'v1',
    bytes: Buffer.from('changed'), byteLength: 7, contentType: 'image/png' });
  expect(await check()).toMatchObject({ reason, report: null, manifestDigest: null });
});
it('shows stale approval as incomplete', async () => {
  vi.mocked(db.loadContractorBundleSources).mockRejectedValueOnce(new db.EvidenceBundleError());
  expect(await check()).toMatchObject({ reason: 'APPROVAL_OR_SCOPE_INVALID', manifestDigest: null });
  expect(read).not.toHaveBeenCalled();
});
it.each(['tenantId', 'scopeItemId'] as const)('rejects a mismatched %s', async field => {
  const f = fixture(); f.sources[0]![field] = id(99); vi.mocked(db.loadContractorBundleSources).mockResolvedValueOnce(f);
  expect(await check()).toMatchObject({ reason: 'SOURCE_LINK_INVALID', report: null });
});
it.each(['inaccessible job', 'another company job'])('%s refuses before source or object reads', async () => {
  state.allowed = false;
  await expect(check()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(db.loadContractorBundleSources).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});
it('refuses outside practice before database or storage access', async () => {
  vi.stubEnv('JOBGUARD_ENV', 'production'); await expect(check()).rejects.toMatchObject({ code: 'MODE_FORBIDDEN' });
  expect(db.withEvidencePackV3Snapshot).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});

it('shows invalid original metadata as incomplete before storage reads', async () => {
  vi.mocked(db.loadContractorBundleSources).mockRejectedValueOnce(new db.ExtraSourceError('EXTRA_SOURCE_INVALID'));
  expect(await check()).toMatchObject({ reason: 'SOURCE_LINK_INVALID', report: null });
  expect(read).not.toHaveBeenCalled();
});
