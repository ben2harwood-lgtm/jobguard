"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
type ExportRow = { id: string; createdAt: string; entryCount: number; headHash: string; file: { publicKeyPem: string; [key: string]: unknown } };
const endpoint = "/api/contractor/audit-exports";
export default function Page() {
  const [exports, setExports] = useState<ExportRow[]>([]), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("Loading persisted exports");
  const alert = useRef<HTMLParagraphElement>(null), command = useRef<string | undefined>(undefined);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const load = useCallback(async () => {
    setBusy(true); setError(""); setLoaded(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store" }), data = await response.json();
      if (!response.ok) throw new Error(data.code);
      setExports(data.exports); setLoaded(true); setStatus("Persisted exports loaded");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "AUDIT_EXPORT_UNAVAILABLE"); setStatus("Exports could not be refreshed"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function create() {
    setBusy(true); setError(""); setStatus("Creating signed export");
    command.current ??= crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "audit-export-request.v1", commandId: command.current }) }), data = await response.json();
      if (!response.ok) {
        // Only a typed definitive 4xx refusal proves this attempt did not create an export.
        if (response.status >= 400 && response.status < 500 && data?.version === "audit-export-error.v1" && ["AUDIT_EXPORT_FORBIDDEN", "AUDIT_EXPORT_INVALID_INPUT", "AUDIT_EXPORT_CHECKPOINT_REQUIRED", "AUDIT_EXPORT_MODE_HELD"].includes(data.code)) command.current = undefined;
        throw new Error(data?.code ?? "AUDIT_EXPORT_UNAVAILABLE");
      }
      if (data?.id !== command.current) throw new Error("AUDIT_EXPORT_UNAVAILABLE");
      command.current = undefined;
      // The creation response is not a substitute for the authoritative persisted list.
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "AUDIT_EXPORT_UNAVAILABLE"); setStatus("Export creation not confirmed; reload or retry the same request"); }
    finally { setBusy(false); }
  }
  const download = (content: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type })), anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  };
  return <main style={{ maxWidth: 900, margin: "auto", padding: 16, overflowWrap: "anywhere" }}>
    <style>{`.audit-export-action {display:inline-block;min-height:44px;min-width:44px;padding:12px;margin:4px;} .audit-export-action:focus-visible {outline:3px solid #1746a2;outline-offset:3px}`}</style>
    <Link className="audit-export-action" href="/">Back to Jobs</Link><Link className="audit-export-action" href="/admin/contractor">Contractor organisation practice</Link>
    <h1>Audit exports</h1><p>Use the generated fictional contractor only. Do not enter real people or documents.</p>
    <p>The signature proves export integrity only</p><p>It does not prove that a commercial claim is true. A bundled public key needs independent trust. Checkpoints come from the restricted assurance path; no external timestamp is asserted.</p>
    <p>Actor attribution is authenticated only for audit.v3 entries: bound_member identifies the bound session member; system identifies database work, never a person. Earlier actor names are historical claims. Lower-trust statements do not establish commercial facts.</p>
    <p>Creation in other modes is HELD until a founder key decision. Key rotation and long-term verification remain HELD under M5-9.</p>
    <p role="status">{status}</p>{error && <p ref={alert} role="alert" tabIndex={-1}>{error === "AUDIT_EXPORT_CHECKPOINT_REQUIRED" ? "AUDIT_EXPORT_CHECKPOINT_REQUIRED: the restricted assurance path must hand off a trusted checkpoint before export creation." : error}</p>}
    <button className="audit-export-action" disabled={busy} onClick={() => void load()}>Reload persisted exports</button>
    <button className="audit-export-action" disabled={busy || !loaded} onClick={() => void create()}>Create signed audit export</button>
    {loaded && exports.length === 0 && <p>No exports have been created for this tenant.</p>}
    <ul>{loaded && exports.map(row => <li key={row.id} data-testid="audit-export-row"><p>Export {row.id}</p><p>{row.createdAt} · {row.entryCount} entries</p><p>Head {row.headHash}</p>
      <button className="audit-export-action" onClick={() => download(JSON.stringify(row.file, null, 2), `audit-export-${row.id}.json`, "application/json")}>Download export {row.id}</button>
      <button className="audit-export-action" onClick={() => download(row.file.publicKeyPem, `audit-export-${row.id}-public.pem`, "text/plain")}>Download public key {row.id}</button></li>)}</ul>
  </main>;
}
