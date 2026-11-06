"use client";
import { useEffect, useState } from "react";
import { exportPreviewV1, exportStatusV1, type ExportPreview, type ExportStatus } from "@jobguard/api/accounting-export-contracts";

import { RouteChange } from "./route-change";

type Session = { csrfToken: string; memberships: { tenantId: string }[] };
const statusText: Record<ExportStatus["status"], string> = {
  pending: "Approved; waiting for the fake executor.", pushed: "Linked to the fake accounting object.",
  outcome_unknown: "Outcome unknown. Reconcile the existing attempt before taking further action.",
  confirmed_absent: "No object observed. Export remains held; no automatic retry.",
  external_edit: "External edit: resolve the changed object before reconciliation.",
  duplicate_import: "Duplicate import: resolve the duplicate objects before reconciliation.",
  reference_conflict: "Reference conflict: check the existing accounting reference.",
};
export function ExportScreen({ sourceId }: { sourceId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tenantId, setTenant] = useState("");
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [approval, setApproval] = useState<object | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" }).then(async response => {
      if (!response.ok) throw new Error("SIGN_IN_REQUIRED");
      const value = await response.json() as Session;
      if (!value.csrfToken || !value.memberships?.length) throw new Error("SIGN_IN_REQUIRED");
      if (active) { setSession(value); setTenant(value.memberships[0]!.tenantId); }
    }).catch(() => { if (active) setError("SIGN_IN_REQUIRED"); });
    return () => { active = false; };
  }, []);
  const clear = () => { setPreview(null); setStatus(null); setConfirmed(false); setApproval(null); setError(""); };
  async function request(view: "preview" | "read" | "approve", body?: object) {
    const response = await fetch(`/api/accounting-exports/${encodeURIComponent(sourceId)}${view === "approve" ? "" : `?view=${view}`}`, {
      method: view === "approve" ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
      headers: { "x-csrf-token": session!.csrfToken, "x-tenant-id": tenantId, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error((value as { code?: string }).code ?? "EXPORT_UNAVAILABLE");
    return value;
  }
  async function act(action: "preview" | "read" | "approve") {
    setBusy(true); setError("");
    try {
      if (action === "preview") {
        clear();
        const value = exportPreviewV1.parse(await request("preview"));
        setPreview(value);
        // Keep the same Decision bytes when a response is lost and the person retries approval.
        setApproval({ version: 1, decisionId: crypto.randomUUID(), previewHash: value.previewHash,
          expiresAt: new Date(Date.now() + 300_000).toISOString(), humanConfirmed: true });
        try { setStatus(exportStatusV1.parse(await request("read"))); }
        catch (reason) { if (!(reason instanceof Error) || reason.message !== "EXPORT_NOT_FOUND") throw reason; }
      } else setStatus(exportStatusV1.parse(await request(action, action === "approve" ? approval! : undefined)));
    } catch (reason) { setError(reason instanceof Error && /^[A-Z_]+$/.test(reason.message) ? reason.message : "EXPORT_UNAVAILABLE"); }
    finally { setBusy(false); }
  }
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <h1>Accounting export preview</h1>
    <p>Practice only — synthetic data and fake adapters. Nothing is sent to Codat or Xero.</p>
    <p>External paid labels are never qualifying recovery proof. Retention, CIS and DRC are unsupported; tax tags are fictional mappings.</p>
    {!session && <a href="/sign-in">Sign in to your company</a>}
    {session && <>
      <label>Company tenant <select value={tenantId} disabled={busy} style={{ maxWidth: "100%" }} onChange={event => { clear(); setTenant(event.target.value); }}>
        {session.memberships.map(member => <option key={member.tenantId} value={member.tenantId}>{member.tenantId}</option>)}
      </select></label>
      <p>Source: {sourceId}</p>
      <button disabled={busy} onClick={() => void act("preview")}>Load current preview</button>
      <button disabled={busy} onClick={() => void act("read")}>Refresh status</button>
    </>}
    {error && <p role="alert">{error}. Load a current preview if the source or mapping changed.</p>}
    {session && <RouteChange key={`${tenantId}:${sourceId}`} sourceId={sourceId} tenantId={tenantId} csrfToken={session.csrfToken} />}
    {preview && <section aria-label="Exact export artifact">
      <h2>Review the exact export</h2>
      <p>Target company: {preview.artifact.scope.companyId}</p>
      <p>Source revision: {preview.artifact.source.revision}. Mapping revision: {preview.artifact.scope.mapping.revision}.</p>
      <p>Preview hash: <span data-testid="preview-hash">{preview.previewHash}</span></p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} data-testid="export-artifact">{JSON.stringify(preview.artifact, null, 2)}</pre>
      <label><input type="checkbox" checked={confirmed} disabled={busy || !!status} onChange={event => setConfirmed(event.target.checked)} />
        I confirm this exact artifact, target company, mappings and scope.</label>
      <button disabled={busy || !confirmed || !!status || !approval} onClick={() => void act("approve")}>Approve this preview</button>
    </section>}
    {status && <section aria-label="Export status">
      <h2>{status.status}</h2><p role="status">{statusText[status.status]}</p>
      <p>Attempts: {status.attempts}. External object: {status.externalId ?? "None linked"}.</p>
      <p>Approved preview hash: {status.previewHash}</p>
      <p>Qualifying recovery proof: false.</p>
    </section>}
  </main>;
}
