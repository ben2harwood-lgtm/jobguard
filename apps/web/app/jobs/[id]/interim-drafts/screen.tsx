"use client";
import { useEffect, useRef, useState } from "react";
import type { InterimDraftBook, reconcileInterimDraftBook } from "@jobguard/core";

type View = { book: InterimDraftBook; reconciliation: ReturnType<typeof reconcileInterimDraftBook>; issueRefusal: string; issueBlockerMessages: string[]; message: string };
const kinds = {
  "interim.schedule.v1": "Contract schedule draft",
  "interim.application.v1": "Application",
  "interim.certification.v1": "Certified sum",
  "interim.invoice-draft.v1": "Invoice draft",
  "interim.credit-draft.v1": "Credit draft",
  "interim.synthetic-receipt.v1": "Synthetic receipt",
} as const;
type Pending = { commandId: string; recordText: string; body: string };
export function InterimDraftScreen({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null), [text, setText] = useState("");
  const [message, setMessage] = useState("Loading stored drafts…"), [busy, setBusy] = useState(true);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<Pending | null>(null);
  const storageKey = `interim-draft-command:${jobId}`;
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/interim-drafts`;
  async function load() {
    setBusy(true); setView(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
      const answer = await response.json();
      if (!response.ok) throw new Error(answer.message ?? "Draft book unavailable.");
      setView(answer as View); setMessage(answer.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Draft book unavailable."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) { pending.current = JSON.parse(saved) as Pending; setText(pending.current.recordText); setUncertain(true); }
    } catch { setMessage("Saved retry unavailable. Refresh the book before adding a record."); }
    void load();
    // This component is keyed by jobId in its page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function add() {
    setBusy(true);
    try {
      if (!pending.current) {
        const commandId = crypto.randomUUID();
        pending.current = { commandId, recordText: text, body: JSON.stringify({
          version: "interim.persist-command.v1", commandId, jobId, record: JSON.parse(text) as unknown,
        }) };
        // Save before sending so reloads and uncertain network outcomes keep the exact command.
        try { sessionStorage.setItem(storageKey, JSON.stringify(pending.current)); }
        catch { pending.current = null; throw new Error("Browser retry storage is unavailable. No record was sent."); }
      }
      setUncertain(true);
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (!sessionResponse.ok) throw new Error("Sign in again, then retry this same record.");
      const session = await sessionResponse.json() as { csrfToken: string };
      const response = await fetch(endpoint, { method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken }, body: pending.current.body });
      const answer = await response.json();
      if (response.status < 500) {
        sessionStorage.removeItem(storageKey); pending.current = null; setUncertain(false);
      }
      if (!response.ok) { setView(null); throw new Error(answer.message ?? "Draft refused. Refresh the stored book."); }
      setView(answer as View); setMessage(answer.message); setText("");
    } catch (error) {
      setView(null);
      setMessage(error instanceof Error ? error.message : "Outcome unknown. Retry the same record.");
    } finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: 16, overflowWrap: "anywhere" }}>
    <h1>Interim draft records</h1>
    <p>Simulation — nothing is issued, sent or posted. Synthetic receipts are fictional, not proof of payment.</p>
    <p role="alert">{message}</p>
    <button type="button" disabled={busy} onClick={() => void load()} style={{ minHeight: 44 }}>Reload stored book</button>
    {view && <>
      <p>{view.reconciliation.watermark}</p>
      {Object.entries(kinds).map(([version, label]) => <section key={version} aria-label={label}>
        <h2>{label}</h2>
        {view.book.records.filter(record => record.version === version).map(record => <pre key={record.id}
          style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(record, null, 2)}</pre>)}
      </section>)}
      <section aria-label="Server reconciliation"><h2>Server reconciliation</h2>
        <p>Application value, certified net value, net invoice drafts and gross synthetic receipts are separate. Amounts below are in pence.</p>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(view.reconciliation, null, 2)}</pre>
      </section>
      <button type="button" disabled style={{ minHeight: 44 }}>Issue — unavailable</button>
      <p>{view.issueRefusal}</p>
      {view.issueBlockerMessages.map(reason => <p key={reason}>{reason}</p>)}
    </>}
    <section><h2>Add one synthetic record</h2>
      <label htmlFor="interim-record">Record JSON (version and source references required; omit tenantId and jobId)</label>
      <textarea id="interim-record" value={text} disabled={busy || uncertain} onChange={event => setText(event.target.value)}
        rows={12} style={{ width: "100%", boxSizing: "border-box", minHeight: 44 }} />
      {uncertain && <p>The previous outcome may be unknown. Retry keeps the same command and content, including after reload.</p>}
      <button type="button" disabled={busy || !text.trim()} onClick={() => void add()} style={{ minHeight: 44 }}>
        {uncertain ? "Retry same record" : "Add record"}
      </button>
    </section>
  </main>;
}
