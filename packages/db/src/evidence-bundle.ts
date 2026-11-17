import { createHash } from 'node:crypto';
import { z } from 'zod';
import { dashboardCanonical as canonical, dashboardCompareText as compare } from '@jobguard/core';
import { bundlePdf, bundleZip, readBundleZip } from './evidence-bundle-files.js';

const uuid = z.string().uuid(), digest = z.string().regex(/^[a-f0-9]{64}$/u);
const ref = z.string().min(1).max(300);
const shadowKinds = ['capture_snapshot', 'source_observations', 'reconciliation', 'reveal', 'disposition', 'attribution', 'settlement'] as const;
export const bundleSourceKind = z.enum(['accepted_quote', 'approval', 'variation', 'proof', 'order', 'delivery', 'invoice', 'case_history', 'landed_money', 'origin', 'export', 'payment', 'lock', ...shadowKinds]);
const identity = z.object({ sourceId: ref, sourceVersion: ref, objectVersion: ref, sha256: digest }).strict();
export const evidenceBundleSourceV1 = z.object({
  ...identity.shape, tenantId: uuid, jobId: uuid, subjectId: uuid, scopeItemId: uuid.nullable(),
  kind: bundleSourceKind, content: z.string().max(16 * 1024 * 1024), links: z.array(identity).max(1000),
}).strict();
export type EvidenceBundleSource = z.infer<typeof evidenceBundleSourceV1>;
const checkpoint = z.object({ tenantId: uuid, sequence: z.string().regex(/^[1-9][0-9]*$/u), headHash: digest }).strict();
const subject = z.object({ kind: z.enum(['extra', 'recovery_case', 'small_builder']), tenantId: uuid, jobId: uuid, subjectId: uuid, scopeItemId: uuid.nullable() }).strict();
const lifecycle = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ordinary') }).strict(),
  z.object({ state: z.literal('pre_lock') }).strict(),
  z.object({ state: z.literal('post_lock'), lock: identity, captureSnapshot: identity }).strict(),
]);
const selection = identity.extend({ disclosure: z.enum(['original', 'metadata']) }).strict();
const descriptor = z.object({ path: z.string().regex(/^(?:summary\.pdf|sources\/[a-f0-9]{64}\.json)$/u), sha256: digest, byteLength: z.number().int().min(0).max(32 * 1024 * 1024) }).strict();
const entry = z.object({ ...selection.shape, kind: bundleSourceKind, scopeItemId: uuid.nullable(), links: z.array(identity), artifact: descriptor }).strict();
const disclaimer = 'Synthetic only. Hashes do not certify workmanship, agreement, source truth, entitlement or external settlement. No send authority is created.';
export const evidenceBundleManifestV1 = z.object({
  version: z.literal('evidence-bundle-manifest.v1'), environment: z.literal('synthetic_demo'),
  subject, lifecycle, recipients: z.array(uuid).min(1).max(100),
  entries: z.array(entry).min(1).max(1000), absentSections: z.array(bundleSourceKind),
  checkpoint: checkpoint.nullable(), summary: descriptor, limitations: z.literal(disclaimer),
}).strict();
export type EvidenceBundleManifest = z.infer<typeof evidenceBundleManifestV1>;
const material = z.object({ version: z.literal('evidence-bundle-input.v1'), subject, lifecycle,
  recipients: z.array(uuid).min(1).max(100), sources: z.array(evidenceBundleSourceV1).min(1).max(1000),
  selected: z.array(selection).min(1).max(1000), absentSections: z.array(bundleSourceKind), checkpoint: checkpoint.nullable(),
}).strict();
export class EvidenceBundleError extends Error {
  readonly code = 'EVIDENCE_BUNDLE_INVALID';
  constructor() { super('Invalid or incomplete selected evidence bundle inputs'); this.name = 'EvidenceBundleError'; }
}
export const bundleHash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const key = (source: z.infer<typeof identity>) => canonical({ sourceId: source.sourceId, sourceVersion: source.sourceVersion, objectVersion: source.objectVersion, sha256: source.sha256 });
const pin = (source: EvidenceBundleSource) => ({ sourceId: source.sourceId, sourceVersion: source.sourceVersion, objectVersion: source.objectVersion, sha256: source.sha256 });
const checked = <T>(operation: () => T): T => { try { return operation(); } catch { throw new EvidenceBundleError(); } };
const ensure = (condition: unknown) => { if (!condition) throw new EvidenceBundleError(); };
const sortedLinks = (links: z.infer<typeof identity>[]) => [...links].sort((a, b) => compare(key(a), key(b)));
const artifact = (path: string, bytes: Buffer) => ({ path, sha256: bundleHash(bytes), byteLength: bytes.length });
const requiredSections = (kind: EvidenceBundleManifest['subject']['kind']) => kind === 'extra'
  ? ['origin', 'approval', 'export', 'invoice', 'payment'] : kind === 'small_builder'
    ? ['lock', ...shadowKinds] : ['case_history'];

function validateManifest(manifest: EvidenceBundleManifest) {
  const { subject: owner, entries, lifecycle: state } = manifest;
  ensure(new Set(manifest.recipients).size === manifest.recipients.length);
  ensure(manifest.recipients.every((v, i, values) => !i || compare(values[i - 1]!, v) < 0));
  ensure(new Set(entries.map(e => e.sourceId)).size === entries.length);
  ensure(new Set(entries.map(e => e.artifact.path)).size === entries.length);
  ensure(new Set(manifest.absentSections).size === manifest.absentSections.length);
  ensure(manifest.checkpoint === null || manifest.checkpoint.tenantId === owner.tenantId);
  ensure(manifest.summary.path === 'summary.pdf');
  ensure(entries.every((e, i) => !i || compare(key(entries[i - 1]!), key(e)) < 0));
  ensure(manifest.absentSections.every((kind, i, all) => !i || compare(all[i - 1]!, kind) < 0));
  for (const e of entries) {
    ensure(e.artifact.path === `sources/${bundleHash(key(e))}.json`);
    ensure(e.scopeItemId === null || owner.scopeItemId === null || e.scopeItemId === owner.scopeItemId);
    ensure(!manifest.absentSections.includes(e.kind));
    ensure(new Set(e.links.map(key)).size === e.links.length);
  }
  for (const kind of requiredSections(owner.kind)) {
    if (owner.kind === 'small_builder' && state.state === 'pre_lock') continue;
    ensure(entries.some(e => e.kind === kind) || manifest.absentSections.includes(kind as z.infer<typeof bundleSourceKind>));
  }
  if (owner.kind === 'small_builder') ensure(state.state !== 'ordinary');
  else {
    ensure(state.state === 'ordinary');
    ensure(!entries.some(e => e.kind === 'lock' || (shadowKinds as readonly string[]).includes(e.kind)));
    ensure(!manifest.absentSections.some(kind => kind === 'lock' || (shadowKinds as readonly string[]).includes(kind)));
  }
  if (state.state === 'pre_lock') {
    ensure(!entries.some(e => e.kind === 'lock' || (shadowKinds as readonly string[]).includes(e.kind)));
    ensure(manifest.absentSections.length === 0);
  }
  if (state.state === 'post_lock') {
    ensure(entries.filter(e => e.kind === 'lock').length === 1);
    ensure(entries.filter(e => e.kind === 'capture_snapshot').length === 1);
    ensure(entries.some(e => e.kind === 'lock' && key(e) === key(state.lock)));
    ensure(entries.some(e => e.kind === 'capture_snapshot' && key(e) === key(state.captureSnapshot)));
    for (const e of entries.filter(e => (shadowKinds as readonly string[]).includes(e.kind) && e.kind !== 'capture_snapshot')) {
      ensure(e.links.some(link => key(link) === key(state.lock)));
      ensure(e.links.some(link => key(link) === key(state.captureSnapshot)));
    }
  }
}

/** Internal assembler, never an authorization boundary. Readers supply immutable, scoped records; callers explicitly select disclosures. */
export function assembleEvidenceBundle(raw: unknown) {
  return checked(() => {
    const input = material.parse(raw), owner = input.subject;
    const all = new Map<string, EvidenceBundleSource>();
    for (const s of input.sources) {
      ensure(s.tenantId === owner.tenantId && s.jobId === owner.jobId && s.subjectId === owner.subjectId);
      ensure(s.scopeItemId === null || owner.scopeItemId === null || s.scopeItemId === owner.scopeItemId);
      ensure(bundleHash(s.content) === s.sha256 && !all.has(s.sourceId));
      all.set(s.sourceId, s);
    }
    for (const s of all.values()) for (const link of s.links) ensure(all.has(link.sourceId) && key(pin(all.get(link.sourceId)!)) === key(link));
    if (input.lifecycle.state === 'post_lock') {
      ensure(input.sources.filter(s => s.kind === 'lock').length === 1);
      ensure(input.sources.filter(s => s.kind === 'capture_snapshot').length === 1);
    }
    const files = new Map<string, Buffer>();
    const entries = input.selected.map(selected => {
      const s = all.get(selected.sourceId);
      ensure(s && key(pin(s)) === key(selected));
      const source = s!;
      // The least-disclosure derivative contains only version commitments, never source free text, object keys or bank payloads.
      const content = selected.disclosure === 'original'
        ? { version: 'evidence-bundle-original.v1', source: { ...source, links: sortedLinks(source.links) } }
        : { version: 'evidence-bundle-metadata.v1', derivedFrom: pin(source), method: 'identity-and-digest-only.v1' };
      const bytes = Buffer.from(canonical(content)), path = `sources/${bundleHash(key(selected))}.json`;
      files.set(path, bytes);
      return { ...selected, kind: source.kind, scopeItemId: source.scopeItemId, links: sortedLinks(source.links), artifact: artifact(path, bytes) };
    }).sort((a, b) => compare(key(a), key(b)));
    const recipients = [...input.recipients].sort(compare);
    const pdf = bundlePdf(['JobGuard synthetic evidence bundle', disclaimer,
      `Subject: ${owner.kind} ${owner.subjectId}`, 'Recipients (opaque references):', ...recipients,
      ...entries.flatMap(e => [e.kind + ' ' + e.disclosure, e.sourceId, e.artifact.path, e.artifact.sha256])]);
    const manifest = evidenceBundleManifestV1.parse({
      version: 'evidence-bundle-manifest.v1', environment: 'synthetic_demo', subject: owner, lifecycle: input.lifecycle,
      recipients, entries, absentSections: [...input.absentSections].sort(compare), checkpoint: input.checkpoint,
      summary: artifact('summary.pdf', pdf), limitations: disclaimer,
    });
    validateManifest(manifest);
    files.set('summary.pdf', pdf); files.set('manifest.json', Buffer.from(canonical(manifest)));
    const zip = bundleZip(files);
    ensure(zip.length <= 64 * 1024 * 1024);
    return { manifest, manifestHash: bundleHash(canonical(manifest)), pdf, zip, files, sourceComplete: manifest.absentSections.length === 0 };
  });
}

/** Offline inspection of the exact exported set. A checkpoint supplied inside a bundle cannot trust itself. */
export function verifyEvidenceBundle(zip: Buffer, options: { trustedManifestDigest?: string; trustedCheckpoints?: unknown } = {}) {
  return checked(() => {
    const files = readBundleZip(zip), bytes = files.get('manifest.json');
    ensure(bytes);
    const manifest = evidenceBundleManifestV1.parse(JSON.parse(bytes!.toString('utf8')));
    ensure(bytes!.toString('utf8') === canonical(manifest));
    validateManifest(manifest);
    const findings: string[] = [], absent: string[] = [], altered: string[] = [];
    const expected = new Set(['manifest.json']);
    for (const d of [manifest.summary, ...manifest.entries.map(e => e.artifact)]) {
      expected.add(d.path);
      const file = files.get(d.path);
      if (!file) absent.push(d.path);
      else if (file.length !== d.byteLength || bundleHash(file) !== d.sha256) altered.push(d.path);
    }
    for (const e of manifest.entries) {
      const file = files.get(e.artifact.path);
      if (!file || altered.includes(e.artifact.path)) continue;
      try {
        const payload = JSON.parse(file.toString('utf8'));
        if (e.disclosure === 'metadata') {
          ensure(file.toString('utf8') === canonical({ version: 'evidence-bundle-metadata.v1', derivedFrom: { sourceId: e.sourceId, sourceVersion: e.sourceVersion, objectVersion: e.objectVersion, sha256: e.sha256 }, method: 'identity-and-digest-only.v1' }));
        } else {
          const parsed = z.object({ version: z.literal('evidence-bundle-original.v1'), source: evidenceBundleSourceV1 }).strict().parse(payload);
          const s = parsed.source, owner = manifest.subject;
          ensure(key(s) === key(e) && bundleHash(s.content) === e.sha256 && s.kind === e.kind && s.scopeItemId === e.scopeItemId);
          ensure(s.tenantId === owner.tenantId && s.jobId === owner.jobId && s.subjectId === owner.subjectId);
          ensure(canonical(sortedLinks(s.links)) === canonical(e.links));
          ensure(file.toString('utf8') === canonical(parsed));
        }
      } catch { altered.push(e.artifact.path); }
    }
    if ([...files.keys()].some(path => !expected.has(path))) findings.push('UNMANIFESTED_FILE');
    if (absent.length) findings.push('ABSENT_FILES');
    if (altered.length) findings.push('ALTERED_FILES');
    const manifestHash = bundleHash(bytes!);
    const authorityBound = options.trustedManifestDigest === manifestHash;
    if (!authorityBound) findings.push('UNTRUSTED_MANIFEST');
    const trusted = z.array(checkpoint).parse(options.trustedCheckpoints ?? []);
    const checkpointState = manifest.checkpoint === null ? 'missing' as const : trusted.some(c => canonical(c) === canonical(manifest.checkpoint)) ? 'trusted' as const : 'untrusted' as const;
    if (checkpointState !== 'trusted') findings.push('CHECKPOINT_' + checkpointState.toUpperCase());
    if (manifest.absentSections.length) findings.push('ABSENT_SECTIONS');
    // These are independent dimensions: intact bytes, independently trusted reference, and truth of external claims.
    return { version: 'evidence-bundle-verification.v1', manifestHash, findings, absent, altered,
      content: absent.length || altered.length || findings.includes('UNMANIFESTED_FILE') ? 'damaged' as const : 'intact' as const,
      checkpoint: checkpointState, authorityBound, sourceComplete: manifest.absentSections.length === 0,
      exportIntegrityComplete: findings.length === 0, externallyVerified: false as const,
      externalClaims: 'externally_unverified' as const, limitations: disclaimer };
  });
}
