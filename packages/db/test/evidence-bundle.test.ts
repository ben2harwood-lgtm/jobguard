import { expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleEvidenceBundle, bundleHash, EvidenceBundleError, verifyEvidenceBundle, type EvidenceBundleSource } from '../src/evidence-bundle.js';
import { bundleZip, readBundleZip } from '../src/evidence-bundle-files.js';
const tenantId = '10000000-0000-4000-8000-000000000001', jobId = '10000000-0000-4000-8000-000000000002';
const subjectId = '10000000-0000-4000-8000-000000000003', scopeItemId = '10000000-0000-4000-8000-000000000004';
const recipient = '10000000-0000-4000-8000-000000000005';
const owner = { tenantId, jobId, subjectId, scopeItemId };
const checkpoint = { tenantId, sequence: '23', headHash: 'a'.repeat(64) };
const source = (kind: EvidenceBundleSource['kind'], id: string = kind, content = `Immutable ${kind} £300.00`) : EvidenceBundleSource => ({ ...owner, kind, sourceId: id, sourceVersion: 'revision:1', objectVersion: 'object-version:1', content, sha256: bundleHash(content), links: [] });
const pin = (s: EvidenceBundleSource) => ({ sourceId: s.sourceId, sourceVersion: s.sourceVersion, objectVersion: s.objectVersion, sha256: s.sha256 });
const select = (s: EvidenceBundleSource, disclosure: 'original' | 'metadata' = 'original') => ({ ...pin(s), disclosure });
function input() {
  const sources = (['origin', 'approval', 'export', 'invoice', 'payment'] as const).map(kind => source(kind));
  sources[1]!.links = [pin(sources[0]!)];
  return { version: 'evidence-bundle-input.v1', subject: { kind: 'extra', ...owner }, lifecycle: { state: 'ordinary' }, recipients: [recipient], checkpoint, sources, selected: sources.map(s => select(s)), absentSections: [] };
}
const trusted = (bundle: ReturnType<typeof assembleEvidenceBundle>) => ({ trustedManifestDigest: bundle.manifestHash, trustedCheckpoints: [checkpoint] });
it('same immutable selection produces byte-identical manifest, PDF and ZIP independent of order, clock and replay', () => {
  const i = input(), a = assembleEvidenceBundle(i), b = assembleEvidenceBundle({ ...i, selected: [...i.selected].reverse(), sources: [...i.sources].reverse() });
  expect(b.zip).toEqual(a.zip); expect(b.pdf).toEqual(a.pdf); expect(b.manifestHash).toBe(a.manifestHash);
  expect(a.pdf.toString()).toContain('%PDF-1.4');
  const report = verifyEvidenceBundle(a.zip, trusted(a));
  expect(report).toMatchObject({ content: 'intact', checkpoint: 'trusted', authorityBound: true, exportIntegrityComplete: true, externalClaims: 'externally_unverified', externallyVerified: false });
  expect(readBundleZip(a.zip).size).toBe(7);
});
it.each(['source', 'selection', 'recipient', 'link'])('rejects duplicate/replayed %s identities', attack => {
  const i = input();
  if (attack === 'source') i.sources.push(i.sources[0]!);
  if (attack === 'selection') i.selected.push(i.selected[0]!);
  if (attack === 'recipient') i.recipients.push(recipient);
  if (attack === 'link') i.sources[1]!.links.push(i.sources[1]!.links[0]!);
  expect(() => assembleEvidenceBundle(i)).toThrow(EvidenceBundleError);
});
it.each(['tenantId', 'jobId', 'subjectId', 'scopeItemId', 'content', 'objectVersion', 'sourceVersion'])('rejects altered or wrong %s before offering a bundle', field => {
  const i = input(), s = i.sources[0]!;
  (s as any)[field] = field.endsWith('Id') ? recipient : 'altered';
  expect(() => assembleEvidenceBundle(i)).toThrow(EvidenceBundleError);
});
it('rejects missing originals and stale revision/hash links', () => {
  const i = input(); i.sources.shift();
  expect(() => assembleEvidenceBundle(i)).toThrow(EvidenceBundleError);
  const stale = input(); stale.sources[1]!.links[0]!.sourceVersion = 'revision:0';
  expect(() => assembleEvidenceBundle(stale)).toThrow(EvidenceBundleError);
});
it('metadata derivatives bind originals without leaking the original bank/personal payload or unrelated records', () => {
  const i = input(); i.sources[4] = source('payment', 'payment', 'SECRET unrelated bank transaction and resident name');
  i.selected[4] = select(i.sources[4], 'metadata');
  i.sources.push(source('proof', 'unrelated', 'NEVER EXPORTED'));
  const a = assembleEvidenceBundle(i), archive = a.zip.toString();
  expect(archive).not.toContain('SECRET'); expect(archive).not.toContain('NEVER EXPORTED');
  const e = a.manifest.entries.find(e => e.sourceId === 'payment')!;
  expect(JSON.parse(a.files.get(e.artifact.path)!.toString())).toMatchObject({ version: 'evidence-bundle-metadata.v1', derivedFrom: pin(i.sources[4]) });
  expect(verifyEvidenceBundle(a.zip, trusted(a)).content).toBe('intact');
  expect(assembleEvidenceBundle({ ...i, recipients: [tenantId] }).manifestHash).not.toBe(a.manifestHash);
  expect(assembleEvidenceBundle({ ...i, selected: i.sources.slice(0, 5).map(s => select(s)) }).manifestHash).not.toBe(a.manifestHash);
});
it('distinguishes absent, altered, unmanifested files, checkpoint missing/untrusted and independent manifest authority', () => {
  const a = assembleEvidenceBundle(input()), files = new Map(a.files), path = a.manifest.entries[0]!.artifact.path;
  files.delete(path);
  expect(verifyEvidenceBundle(bundleZip(files), trusted(a))).toMatchObject({ content: 'damaged', absent: [path] });
  files.set(path, Buffer.from('tampered'));
  expect(verifyEvidenceBundle(bundleZip(files), trusted(a)).altered).toEqual([path]);
  files.set(`sources/${'b'.repeat(64)}.json`, Buffer.from('extra'));
  expect(verifyEvidenceBundle(bundleZip(files), trusted(a)).findings).toContain('UNMANIFESTED_FILE');
  expect(verifyEvidenceBundle(a.zip)).toMatchObject({ content: 'intact', checkpoint: 'untrusted', authorityBound: false });
  expect(verifyEvidenceBundle(a.zip, { trustedManifestDigest: a.manifestHash, trustedCheckpoints: [{ ...checkpoint, tenantId: jobId }] }).checkpoint).toBe('untrusted');
  const missing = assembleEvidenceBundle({ ...input(), checkpoint: null });
  expect(verifyEvidenceBundle(missing.zip, trusted(missing)).checkpoint).toBe('missing');
});
it('archive structure rejects CRC/central-directory tampering, truncation and trailing bytes', () => {
  const a = assembleEvidenceBundle(input());
  const corrupt = Buffer.from(a.zip); corrupt[14] = corrupt[14]! ^ 1;
  for (const zip of [corrupt, a.zip.subarray(0, -1), Buffer.concat([a.zip, Buffer.from('junk')])]) expect(() => verifyEvidenceBundle(zip)).toThrow(EvidenceBundleError);
});
it('missing export/invoice/payment is declared, and never presented as a complete source set', () => {
  const i = input(); i.sources = i.sources.slice(0, 2); i.selected = i.selected.slice(0, 2);
  expect(() => assembleEvidenceBundle(i)).toThrow(EvidenceBundleError);
  const a = assembleEvidenceBundle({ ...i, absentSections: ['export', 'invoice', 'payment'] });
  expect(a.sourceComplete).toBe(false); expect(verifyEvidenceBundle(a.zip, trusted(a)).findings).toContain('ABSENT_SECTIONS');
});
it('small builder sections require the exact lock/capture snapshot and reject pre-lock hidden fields', () => {
  const sources = (['lock', 'capture_snapshot', 'source_observations', 'reconciliation', 'reveal', 'disposition', 'attribution', 'settlement'] as const).map(k => source(k));
  for (const s of sources.slice(2)) s.links = [pin(sources[0]!), pin(sources[1]!)];
  const i = { ...input(), subject: { ...input().subject, kind: 'small_builder' }, sources, selected: sources.map(s => select(s)), lifecycle: { state: 'post_lock', lock: pin(sources[0]!), captureSnapshot: pin(sources[1]!) } };
  expect(assembleEvidenceBundle(i).sourceComplete).toBe(true);
  expect(() => assembleEvidenceBundle({ ...i, lifecycle: { ...i.lifecycle, lock: { ...i.lifecycle.lock, sourceVersion: 'unlocked-bill' } } })).toThrow();
  expect(() => assembleEvidenceBundle({ ...i, lifecycle: { state: 'pre_lock' } })).toThrow();
  sources[3]!.links = [pin(sources[0]!)]; expect(() => assembleEvidenceBundle(i)).toThrow();
  const ordinary = source('case_history');
  const pre = { ...i, sources: [ordinary], selected: [select(ordinary)], lifecycle: { state: 'pre_lock' } };
  expect(assembleEvidenceBundle(pre).zip).toEqual(assembleEvidenceBundle(structuredClone(pre)).zip);
});
it('exports a standard ZIP readable by an independent implementation and a PDF with valid xref offsets', () => {
  const a = assembleEvidenceBundle(input()), dir = mkdtempSync(join(tmpdir(), 'jg-bundle-')), path = join(dir, 'bundle.zip');
  writeFileSync(path, a.zip);
  const listing = execFileSync('/usr/bin/unzip', ['-t', path], { encoding: 'utf8' });
  expect(listing).toContain('No errors detected');
  const pdf = a.pdf.toString(), xref = Number(pdf.match(/startxref\n(\d+)/)![1]);
  expect(pdf.slice(xref, xref + 4)).toBe('xref');
  for (const match of pdf.matchAll(/(\d{10}) 00000 n /g)) expect(pdf.slice(Number(match[1]))).toMatch(/^\d+ 0 obj/);
});
it('standalone verifier runs without database/application and preserves the external-verification distinction', () => {
  const a = assembleEvidenceBundle(input()), dir = mkdtempSync(join(tmpdir(), 'jg-bundle-cli-')), path = join(dir, 'bundle.zip'), cp = join(dir, 'checkpoints.json');
  writeFileSync(path, a.zip); writeFileSync(cp, JSON.stringify([checkpoint]));
  // CI tests precede this package's build. Compile just the offline verifier's two modules,
  // using the installed compiler, so the real CLI subprocess also works on a clean checkout.
  const compiler = new URL('../node_modules/typescript/lib/tsc.js', import.meta.url).pathname;
  const packageRoot = new URL('..', import.meta.url).pathname;
  execFileSync(process.execPath, [compiler, '--target', 'ES2023', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--noCheck',
    '--rootDir', 'src', '--outDir', 'dist', 'src/evidence-bundle.ts', 'src/evidence-bundle-files.ts'], { cwd: packageRoot });
  const cli = new URL('../tools/verify-evidence-bundle.mjs', import.meta.url).pathname;
  const run = (args: string[]) => spawnSync(process.execPath, [cli, path, ...args], { encoding: 'utf8' });
  const trustedRun = run(['--trusted-manifest-sha256', a.manifestHash, '--trusted-checkpoints', cp]);
  expect(trustedRun.status, trustedRun.stderr).toBe(0);
  expect(JSON.parse(trustedRun.stdout).externalClaims).toBe('externally_unverified');
  expect(run([]).status).toBe(1); expect(run(['--unexpected', 'yes']).status).toBe(2);
});
