"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { PILOT_DRAFT_COMPLETION, PILOT_DRAFT_WARNING, pilotDraftRows, pilotDraftStatements,
  type PilotInvoiceDraft } from "@jobguard/core";
import { Card } from "./designed-ui";

type Source = { jobId: string; binding: string; accountRevision: number; sourceHash: string };
export function PilotInvoiceDraftPanel({ jobId, pilotFetch }: { jobId: string; pilotFetch: typeof fetch }) {
  const [source, setSource] = useState<Source>();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [vatNumber, setVatNumber] = useState("");
  const [draft, setDraft] = useState<PilotInvoiceDraft>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/jobs/${encodeURIComponent(jobId)}/customer-invoices/draft`;
  const load = useCallback(async (signal?: AbortSignal) => {
    setSource(undefined); setDraft(undefined); setChecks({}); setError("");
    const response = await pilotFetch(url, { signal: signal ?? null });
    if (!response.ok) throw new Error("UNAVAILABLE");
    const current = await response.json() as Source;
    if (current.jobId !== jobId) throw new Error("WRONG_JOB");
    if (!signal?.aborted) setSource(current);
  }, [jobId, pilotFetch, url]);
  const unavailable = "A locked, current saved account and completed Final Check are required. Your saved work is unchanged.";
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => { if (!controller.signal.aborted) setError(unavailable); });
    return () => controller.abort();
  }, [load]);

  async function prepare(format: "preview" | "html" | "csv") {
    if (!source || busy) return;
    setBusy(true); setError("");
    try {
      const response = await pilotFetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "pilot-invoice-draft.v1", binding: source.binding,
          checklist: { ...checks, vatNumber }, format }) });
      if (!response.ok) {
        const body = await response.json();
        if (body.code === "STALE_REVISION") {
          setChecks({}); setDraft(undefined);
          const fresh = await pilotFetch(url);
          if (fresh.ok) setSource(await fresh.json() as Source);
          else setSource(undefined);
          throw new Error("The account, extras, parties or builder details changed. Reload the saved account, review every line and confirm the checklist again.");
        }
        throw new Error("Draft unavailable. Confirm every statement and VAT-number format. Unsupported or unknown tax, customer or payment cases need separate review outside JobGuard. Your saved work is unchanged.");
      }
      if (format === "preview") setDraft(await response.json() as PilotInvoiceDraft);
      else {
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a"); link.href = blobUrl;
        link.download = `invoice-draft.${format === "csv" ? "csv" : "html"}`;
        link.click(); setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (reason) {
      setDraft(undefined);
      setError(reason instanceof Error ? reason.message : "Could not prepare the draft.");
    } finally { setBusy(false); }
  }
  return <Card title="Prepare an invoice draft">
    <p>{PILOT_DRAFT_WARNING}</p>
    <p>The builder checks, completes and sends the final document outside JobGuard. This flow does not issue an invoice.</p>
    <p>Unknown answers and unsupported cases cannot produce a VAT draft. Builder statements below are not verified tax facts. Repeat them for every changed account and extra.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void load().catch(() => setError(unavailable))}>Reload draft source</button>
    {source && <form onSubmit={event => { event.preventDefault(); void prepare("preview"); }}>
      <p>Saved account revision {source.accountRevision}</p>
      {Object.entries(pilotDraftStatements).map(([key, label]) => <label key={key} style={{ display: "block", marginBlock: "1rem" }}>
        <input type="checkbox" required disabled={busy} checked={checks[key] ?? false} onChange={event => {
          setChecks(previous => ({ ...previous, [key]: event.target.checked })); setDraft(undefined);
        }}/>{label}
      </label>)}
      <label>Builder-stated VAT number<input required disabled={busy} value={vatNumber} maxLength={20} onChange={event => {
        setVatNumber(event.target.value); setDraft(undefined);
      }}/></label>
      <button type="submit" disabled={busy}>Preview draft</button>
    </form>}
    {draft && <>
      <h3>{PILOT_DRAFT_WARNING}</h3>
      <dl>{pilotDraftRows(draft).map((row, index) => <div key={index} style={{ overflowWrap: "anywhere", marginBlock: "1rem" }}>
        <dt>{row[0]}</dt><dd>{row.slice(1).join(" · ")}</dd>
      </div>)}</dl>
      <button type="button" disabled={busy} onClick={() => void prepare("html")}>Download printable draft</button>
      <p>Open the downloaded HTML draft in your browser to print it.</p>
      <button type="button" disabled={busy} onClick={() => void prepare("csv")}>Download draft CSV</button>
    </>}
    <p>{PILOT_DRAFT_COMPLETION}</p>
  </Card>;
}
