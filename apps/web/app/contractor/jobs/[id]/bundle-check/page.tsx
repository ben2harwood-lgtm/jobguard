'use client';
import { Suspense, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { bundleCheckResultV1, type BundleCheckResult } from '@jobguard/api/evidence-bundle-contracts';

const reasons = {
  APPROVAL_OR_SCOPE_INVALID: 'Approval is stale, incomplete or linked to a different scope.',
  MISSING_ORIGINAL: 'An original file is missing or could not be read.',
  WRONG_VERSION: 'An original file has the wrong version.',
  ALTERED_FILE: 'An original file has changed or its metadata does not match.',
  SOURCE_LINK_INVALID: 'Source identities, versions or scope links do not match.',
};
function BundleCheckScreen() {
  const { id } = useParams<{ id: string }>(), query = useSearchParams();
  const selection = `${id}?${query.toString()}`;
  const [saved, setSaved] = useState<{ selection: string; value: BundleCheckResult } | null>(null);
  const result = saved?.selection === selection ? saved.value : null;
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  async function check() {
    setSaved(null); setError(false); setBusy(true);
    try {
      const params = new URLSearchParams({ extraId: query.get('extraId') ?? '', requestId: query.get('requestId') ?? '' });
      const response = await fetch(`/api/contractor/jobs/${encodeURIComponent(id)}/bundle-check?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      setSaved({ selection, value: bundleCheckResultV1.parse(await response.json()) });
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 720, margin: '0 auto', padding: 16, overflowWrap: 'anywhere' }}>
    <h1>Practice: contractor evidence bundle check</h1>
    <p>Made-up data only. Checking stores nothing. This check is not proof of workmanship or customer agreement.</p>
    <p>Checks apply to the extra and approval selected for this practice view.</p>
    <button onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check bundle'}</button>
    {error && <p role="alert">Bundle check unavailable. You may not have access to this job.</p>}
    {result && <>
      <h2>{result.reason || !result.report?.exportIntegrityComplete ? 'Not complete' : 'Integrity checks complete'}</h2>
      {result.reason && <p role="alert">{reasons[result.reason]}</p>}
      <ul>{result.sections.map(section => <li key={section.name}>{section.name}: {section.state === 'present' ? 'Present' : section.state === 'absent' ? 'Absent' : 'Not checked'}</li>)}</ul>
      {result.manifestDigest && <p>Manifest digest: <code>{result.manifestDigest}</code></p>}
      {result.report && <>
        <p>Content: {result.report.content === 'intact' ? 'Intact' : 'Damaged'}. Absent files: {result.report.absent.length}. Altered files: {result.report.altered.length}.</p>
        <p>Checkpoint: {result.report.checkpoint}. Independent manifest trust: {result.report.authorityBound ? 'Confirmed' : 'Unverified'}.</p>
        <p>External claims: unverified. Hashes do not prove settlement truth or fee entitlement.</p>
        <ul>{result.report.findings.map(finding => <li key={finding}>{finding.replaceAll('_', ' ').toLowerCase()}</li>)}</ul>
      </>}
    </>}
  </main>;
}

export default function BundleCheckPage() {
  return <Suspense fallback={<main><p>Loading practice bundle check…</p></main>}><BundleCheckScreen/></Suspense>;
}
