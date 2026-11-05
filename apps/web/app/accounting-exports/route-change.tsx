"use client";
import React, { useEffect, useRef, useState } from "react";
import { routeApprovalV1, routeReadV1, type RouteRead } from "@jobguard/api/accounting-export-contracts";

export const routeRefusals: Readonly<Record<string, string>> = {
  EXPORT_CONSENT_EXPIRED: "Consent is stale or expired. Ask the administrator to renew it.",
  EXPORT_STALE_REVISION: "The connection, source revision or mapping is stale. Load the current change again.",
  EXPORT_RECONCILE_REQUIRED: "An export is held or its outcome is unknown. Reconcile it before changing route.",
  EXPORT_APPROVAL_REQUIRED: "The proposal changed or this approval expired. Load the current change and confirm it again.",
  EXPORT_REPLAY_CONFLICT: "This approval or command was already used for a different change. Load the current change again.",
  EXPORT_FORBIDDEN: "You do not have permission to change this export route.",
  EXPORT_NOT_FOUND: "This company has no matching export source.",
  EXPORT_UNAVAILABLE: "The result is uncertain. Retry confirmation with the same approval, or reload to check the stored route.",
};
export function RouteChange({ sourceId, tenantId, csrfToken }: { sourceId: string; tenantId: string; csrfToken: string }) {
  const [value, setValue] = useState<RouteRead | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const approval = useRef<ReturnType<typeof routeApprovalV1.parse> | null>(null);
  async function request(body?: object) {
    const response = await fetch(`/api/accounting-exports/${encodeURIComponent(sourceId)}/route-change`, {
      method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
      headers: { "x-csrf-token": csrfToken, "x-tenant-id": tenantId, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    // A definite refusal needs a fresh proposal and approval; only uncertain outcomes retain the exact retry.
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      approval.current = null;
      setValue(null);
    }
    const result: unknown = await response.json();
    if (!response.ok) throw new Error((result as { code?: string }).code ?? "EXPORT_UNAVAILABLE");
    return result;
  }
  async function act(confirm = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (confirm) {
        if (!value?.proposal) return;
        approval.current ??= { version: 1, commandId: crypto.randomUUID(), decisionId: crypto.randomUUID(),
          previewHash: value.proposal.previewHash, expiresAt: new Date(Date.now() + 300_000).toISOString(), humanConfirmed: true };
        await request(approval.current);
      }
      const next = routeReadV1.parse(await request());
      setValue(next);
      // Only an explicit fresh read/success replaces an approval. Network uncertainty keeps its exact bytes.
      approval.current = null;
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "EXPORT_UNAVAILABLE";
      setError(routeRefusals[code] ?? "The server refused this change. Sign in with export permission and load the current change.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => { void act(); }, []);
  const artifact = value?.proposal?.artifact ?? value?.confirmed?.artifact;
  return <section aria-label="Practice export route change">
    <h2>Practice export route change</h2>
    <p>History is kept. Already-sent items are not sent again.</p>
    <button disabled={busy} onClick={() => void act()}>Load current route change</button>
    {error && <p role="alert">{error}</p>}
    {artifact && <>
      <p>{value?.proposal ? "Proposed change" : "Confirmed route"}: {artifact.from} → {artifact.to}</p>
      <p>Target company: {artifact.scope.companyId}</p>
      <p>Historic entries: {artifact.entries.length}</p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} data-testid="route-change-artifact">{JSON.stringify(artifact, null, 2)}</pre>
    </>}
    {value?.proposal && <button disabled={busy} onClick={() => void act(true)}>Confirm this exact route change</button>}
    {value?.confirmed && <p role="status">Stored route: {value.confirmed.artifact.to}. Revision {value.confirmed.revision}.</p>}
    {value && !artifact && <p>No route change is proposed or confirmed.</p>}
    {!!value?.history.length && <details open><summary>Confirmed route history ({value.history.length})</summary>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} data-testid="route-change-history">{JSON.stringify(value.history, null, 2)}</pre>
    </details>}
  </section>;
}
