"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalManifest, type EvidenceManifest, type EvidenceSource } from "@jobguard/core";
import { pounds } from "../lib/pounds";

type Inspection = { findings: string[]; contentMatches: boolean; complete: boolean };
type Pack = Inspection & {
  id: string; revision: number; manifest: EvidenceManifest; manifestHash: string; contentHash: string;
  format: "TEXT"; sources: EvidenceSource[]; attachmentApprovalValid: boolean; attachmentApprovalRecorded: boolean;
};
/** Stable in-page target for one mapped source, so a message can link to the exact version it relies on. */
export const packSourceAnchor = (sourceId: string, version: number) => `pack-source-${sourceId.replace(/[^A-Za-z0-9_-]/gu, "-")}-v${version}`;
const errorMessage = (code: string) => /STALE|CONFLICT/u.test(code)
  ? "The evidence changed. Rebuild and review the current pack before approving."
  : code.includes("SOURCE_NOT_FOUND") ? "A referenced source is unavailable. Open a case using recorded source versions."
  : code;

export function EvidencePacks({ caseId, claimedNetPence, onChange }: { caseId: string; claimedNetPence: number; onChange?: () => void }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [scenario, setScenario] = useState("intact"), [inspection, setInspection] = useState<Inspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const generation = useRef(0), errorRef = useRef<HTMLParagraphElement>(null);
  const endpoint = `/api/recovery-cases/${caseId}/evidence-packs`;
  const load = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" }), body = await response.json();
      if (own !== generation.current) return;
      if (!response.ok) throw new Error(body.code);
      setPacks(body.packs);
    } catch (failure) { if (own === generation.current) setError(failure instanceof Error ? failure.message : "Pack could not be loaded"); }
    finally { if (own === generation.current) setLoading(false); }
  }, [endpoint]);
  useEffect(() => { setPacks([]); setInspection(null); setScenario("intact"); setError(""); void load(); }, [load]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const pack = packs.at(-1);
  useEffect(() => {
    if (!pack) return;
    const controller = new AbortController();
    setInspecting(true); setInspection(null);
    void fetch(`${endpoint}/${pack.id}/inspect?scenario=${encodeURIComponent(scenario)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.code); if (!controller.signal.aborted) setInspection(body); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Inspection could not be loaded"); })
      .finally(() => { if (!controller.signal.aborted) setInspecting(false); });
    return () => controller.abort();
  }, [endpoint, pack, scenario]);

  async function send(path: string, command: object) {
    const own = ++generation.current;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (own !== generation.current) return;
      if (!response.ok) throw new Error(body.code);
      setPacks(body.packs); setScenario("intact"); onChange?.();
    } catch (failure) { if (own === generation.current) setError(failure instanceof Error ? failure.message : "Pack command failed"); }
    finally { if (own === generation.current) setBusy(false); }
  }
  const build = () => send("", { version: "evidence-pack-command.v1", commandId: crypto.randomUUID(), format: "TEXT" });
  const approve = () => pack && send(`/${pack.id}/attachment-approval`, {
    version: "evidence-pack-attachment-approval.v1", commandId: crypto.randomUUID(),
    expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash,
  });
  const invalidated = packs.some(item => item.attachmentApprovalRecorded && !item.attachmentApprovalValid);
  return <section className="evidence-packs" style={{ overflowWrap: "anywhere", minWidth: 0 }} aria-labelledby="pack-heading" aria-busy={busy || loading}>
    <h4 id="pack-heading">Inspectable evidence pack</h4>
    <p>This maps selected records for human inspection. It does not establish that a claim is true.</p>
    <p>Claim shown in this pack: <strong data-testid="pack-claim-money">{pounds(claimedNetPence)}</strong></p>
    <button type="button" disabled={busy || loading} onClick={() => void build()}>Build evidence pack</button>
    {loading && <p role="status">Loading recorded packs…</p>}
    {!loading && !pack && <p>No evidence pack has been recorded for this case.</p>}
    {error && <p role="alert" tabIndex={-1} ref={errorRef}>{errorMessage(error)}</p>}
    {pack && <article data-testid="pack-explorer">
      <p data-testid="pack-state">Sources mapped — inspect the evidence</p>
      <p>Mapped manifest <code data-testid="pack-manifest">{canonicalManifest(pack.manifest)}</code></p>
      <p>Pack revision <span data-testid="pack-revision">{pack.revision}</span> · immutable manifest <code data-testid="pack-manifest-hash">{pack.manifestHash}</code></p>
      <p>Pack content digest <code data-testid="pack-content-hash">{pack.contentHash}</code></p>
      <p>Text bundle · exact recorded sources and an inspectable manifest.</p>
      <label>Server inspection scenario <select style={{ minHeight: 44, maxWidth: "100%" }} aria-label="Check a pack scenario" value={scenario} disabled={busy} onChange={event => setScenario(event.target.value)}>
        <option value="intact">Intact sources</option><option value="missing">Missing source</option>
        <option value="tampered">Changed content</option><option value="wrong-version">Wrong version</option>
        <option value="checkpoint">Untrusted checkpoint (same intact sources)</option>
      </select></label>
      {scenario === "checkpoint" && <p>Same intact sources. No independent checkpoint digest is available in any server scenario.</p>}
      {scenario !== "intact" && scenario !== "checkpoint" && <p>Generated malformed practice scenario. The recorded pack is unchanged.</p>}
      {inspecting && <p role="status">Checking the stored bundle on the server…</p>}
      {inspection && <div data-testid="pack-server-inspection" aria-live="polite">
        {inspection.contentMatches && <p>Content matches manifest</p>}
        {inspection.findings.map(finding => <p data-testid={`pack-finding-${finding.toLowerCase().replaceAll(" ", "-")}`} key={finding}>{finding}</p>)}
        {inspection.complete && <p data-testid="pack-complete">Manifest inspection complete</p>}
      </div>}
      <p>Claims still need human review.</p>
      <h5>Source explorer</h5>
      <ol>{pack.manifest.entries.map(entry => <li key={`${entry.sourceId}:${entry.version}`}><details id={packSourceAnchor(entry.sourceId, entry.version)}>
        <summary>{entry.label} · exact version {entry.version}</summary>
        <p>Source identity <code>{entry.sourceId}</code></p><p>SHA-256 <code>{entry.contentHash}</code></p>
        {entry.redactedFrom && <p>Redacted derivative of {entry.redactedFrom.sourceId} version {entry.redactedFrom.version}, original hash {entry.redactedFrom.hash}</p>}
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{pack.sources.find(source => source.sourceId === entry.sourceId && source.version === entry.version)?.content}</pre>
      </details></li>)}</ol>
      <a style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }} href={`${endpoint}/${pack.id}/download`} download>Download evidence pack (.txt)</a>
      <p>Statement provenance: {pack.manifest.statement.provenance}</p>
      <ul>{pack.manifest.statement.trustLimitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul>
      <button type="button" disabled={busy || pack.attachmentApprovalValid || !pack.contentMatches} onClick={() => void approve()}>Approve this pack for attachment</button>
      <p data-testid="pack-current-attachment-status">{pack.attachmentApprovalValid ? "Attachment approval recorded for these exact hashes" : "Attachment approval needed"}</p>
      {invalidated && <p data-testid="pack-attachment-status">Previous attachment approval invalidated by the new evidence version</p>}
    </article>}
  </section>;
}
