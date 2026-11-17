"use client";
import { useEffect, useState } from "react";
import type { EvidenceManifestV3, EvidenceSpecimenSourceV3 } from "@jobguard/core";
type Pack = { id: string; manifest: EvidenceManifestV3; sources: EvidenceSpecimenSourceV3[];
  manifestHash: string; contentHash: string; findings: string[]; contentMatches: boolean; attachmentApprovalRecorded: boolean };
type View = { visibleSourceRevision: string; requests: { commandId: string; finished: boolean }[]; packs: Pack[] };

export function EvidencePacksV3({ caseId }: { caseId: string }) {
  const endpoint = `/api/recovery-cases/${caseId}/evidence-packs`;
  const [view, setView] = useState<View | null>(null), [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = view?.requests.some(r => !r.finished) ?? false;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch(`${endpoint}?version=3`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.code);
        if (!stopped) setView(body);
      } catch (failure) { if (!stopped) setError(failure instanceof Error ? failure.message : "Pack unavailable"); }
    };
    void read();
    const timer = setInterval(() => void read(), 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [active, endpoint]);
  const pack = view?.packs.at(-1);
  async function command(approve: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}${approve && pack ? `/${pack.id}/attachment-approval` : ""}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(approve && pack ? {
          version: "evidence-pack-attachment-approval.v3", commandId: crypto.randomUUID(),
          expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash,
        } : { version: "evidence-pack-command.v3", commandId: crypto.randomUUID(), format: "TEXT", expectedVisibleSourceRevision: view?.visibleSourceRevision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.code);
      setView(body);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Pack request failed"); }
    finally { setBusy(false); }
  }
  return <section aria-label="Lock and reveal evidence pack" style={{ overflowWrap: "anywhere" }}>
    <h4>Lock and reveal evidence pack</h4>
    <p>Synthetic records only. A pack ordered before lock contains ordinary evidence only.</p>
    {!active ? <button type="button" onClick={() => setActive(true)}>Open lock and reveal packs</button> : <>
      <button type="button" disabled={!view || busy || pending} onClick={() => void command(false)}>Build lock and reveal pack</button>
      {pending && <p role="status">Worker check requested. No new pack or approval is recorded yet.</p>}
      {pack && <article data-testid="pack-v3-explorer">
        <p>{pack.manifest.lifecycle.state === "pre_lock" ? "Ordinary evidence only — ordered before lock" : "After-lock evidence sections"}</p>
        <p>Manifest digest <code data-testid="pack-v3-manifest-hash">{pack.manifestHash}</code></p>
        <p>Content digest <code>{pack.contentHash}</code></p>
        {pack.contentMatches && <p>Content matches manifest</p>}
        {pack.findings.map(f => <p key={f}>{f}</p>)}
        <ul>{pack.manifest.sections.map(s => <li key={s.kind}>{s.kind}: {s.status === "present" ? "recorded" : s.reason}</li>)}</ul>
        <ol>{pack.sources.map(s => <li key={s.sourceId}><details>
          <summary>{s.kind} · {s.sourceId}</summary>
          <p>Exact record version <code>{s.sourceVersion}</code> · {s.recordedAt}</p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{s.content}</pre>
        </details></li>)}</ol>
        <a href={`${endpoint}/${pack.id}/download`} download>Download lock and reveal pack</a>
        <button type="button" disabled={busy || pending || pack.attachmentApprovalRecorded} onClick={() => void command(true)}>Approve lock and reveal pack for attachment</button>
        <p>{pack.attachmentApprovalRecorded ? "Approval recorded for these exact hashes" : "Approval needed"}</p>
        {pack.manifest.trustLimitations.map(f => <p key={f}>{f}</p>)}
      </article>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
