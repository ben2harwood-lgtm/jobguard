import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildEvidenceManifest, manifestDigest, renderStandalonePack, type EvidenceSource } from '@jobguard/core';

// Standalone, offline verifier: no database or server. Exercised as a real subprocess.
const cli = fileURLToPath(new URL('../tools/verify-evidence-pack.mjs', import.meta.url));
const source = (overrides: Partial<EvidenceSource> = {}): EvidenceSource => ({
  sourceId: 'quote', kind: 'accepted_quote', version: 1, label: 'Accepted quote', content: '£320.00', jobId: 'job-1', ...overrides,
});
const sources = [source(), source({ sourceId: 'approval', kind: 'approval', label: 'Approval', content: 'approved' })];
const manifest = buildEvidenceManifest('case-1', 'job-1', sources);
const digest = manifestDigest(manifest);
async function run(pack: EvidenceSource[], trusted: string | undefined = digest) {
  const directory = await mkdtemp(join(tmpdir(), 'jg-verify-pack-'));
  const file = join(directory, 'pack.txt');
  await writeFile(file, renderStandalonePack(manifest, pack));
  const result = spawnSync(process.execPath, [cli, file, ...(trusted ? ['--trusted-manifest-sha256', trusted] : [])], { encoding: 'utf8' });
  return { status: result.status, report: result.stdout ? JSON.parse(result.stdout) : undefined };
}

describe('standalone evidence pack verifier CLI', () => {
  it('exits 0 only for an intact pack against an independently supplied digest', async () => {
    const { status, report } = await run(sources);
    expect(status).toBe(0);
    expect(report).toMatchObject({ findings: [], contentMatches: true, complete: true, checkpointTrusted: true });
  });
  it('exits 1 when the digest is not supplied, so a file cannot vouch for itself', async () => {
    const { status, report } = await run(sources, '');
    expect(status).toBe(1);
    expect(report.findings).toEqual(['Checkpoint not independently trusted']);
  });
  it.each([
    ['another version of a manifested source with changed content', { version: 2, content: 'unmanifested changed content' }],
    ["another job's content at an unmanifested version", { version: 2, jobId: 'other-job', content: 'other job content' }],
  ] as const)('exits 1 for a pack carrying %s', async (_name, extra) => {
    const { status, report } = await run([...sources, source(extra)]);
    expect(status).toBe(1);
    expect(report).toMatchObject({ findings: ['Wrong source version'], contentMatches: false, complete: false });
  });
});
