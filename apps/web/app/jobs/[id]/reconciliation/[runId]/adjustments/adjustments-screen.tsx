"use client";
import { useEffect, useState } from "react";

type Template = { version: string; reportHash: string; invoiceRevision: string;
 fact: { id: string; invoiceId: string; kind: string; amount: number; sourceId: string } };
type Data = { runId: string; report: { sourceHash: string; queue: unknown[] }; template: Template | null;
 adjustments: { adjustmentId: string; adjustment: unknown; contentHash: string; approvalId: string | null }[] };
const control = { minHeight: 44, minWidth: 44, maxWidth: "100%" };
const jsonStyle = { whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const };
/** Renders server facts only. A persisted pending payload is retried unchanged. */
export function AdjustmentsScreen({ jobId, runId }: { jobId: string; runId: string }) {
 const endpoint = `/api/jobs/${jobId}/reconciliation/${runId}/adjustments`, key = `reconciliation-adjustment:${jobId}:${runId}`;
 const [data, setData] = useState<Data | null>(null);
 const [pending, setPending] = useState<string | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
 async function load() {
  setData(null);
  try {
   const response = await fetch(endpoint, { cache: "no-store" });
   const body = await response.json();
   if (!response.ok) { setMessage(body.message); return; }
   setData(body);
  } catch { setMessage("The run is unavailable. Reload to try again."); }
 }
 useEffect(() => { setPending(sessionStorage.getItem(key)); void load(); }, [endpoint, key]); // eslint-disable-line react-hooks/exhaustive-deps
 async function send(payload: string) {
  setBusy(true);
  setPending(payload);
  sessionStorage.setItem(key, payload);
  try {
   const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
   const body = await response.json();
   setMessage(body.message);
   if (response.status < 500) {
    sessionStorage.removeItem(key); setPending(null);
    if (response.ok) await load();
   }
  } catch { setMessage("The result is uncertain. Retry the saved command; it keeps the same command ID."); }
  finally { setBusy(false); }
 }
 function propose() {
  if (!data?.template) return;
  void send(JSON.stringify({ version: "financial-reconciliation-propose.v1", runId,
   adjustment: { ...data.template, commandId: crypto.randomUUID() } }));
 }
 return <main style={{ maxWidth: 800, margin: "auto", padding: 16, overflowWrap: "anywhere" }}>
  <h1>Reconciliation adjustments</h1>
  <p>Simulation only. Nothing is posted or collected. Another finance user must approve each proposal.</p>
  <p role="status">{message}</p>
  <button style={control} disabled={busy} onClick={() => void load()}>Reload run</button>
  {pending && <section><p>A saved command needs its outcome checked before another change.</p>
   <button style={control} disabled={busy} onClick={() => void send(pending)}>Retry saved command</button></section>}
  {data && <>
   <h2>Unexplained differences</h2>
   <p>Stored report hash: <code>{data.report.sourceHash}</code></p>
   <pre style={jsonStyle}>{JSON.stringify(data.report.queue, null, 2)}</pre>
   <h2>Propose one correction</h2>
   {data.template ? <>
    <p>Propose a missing payment journal for simulation review. Approval records review only.</p>
    <dl>
     <dt>Invoice</dt><dd>{data.template.fact.invoiceId}</dd>
     <dt>Invoice revision</dt><dd>{data.template.invoiceRevision}</dd>
     <dt>Amount in pence</dt><dd>{data.template.fact.amount}</dd>
     <dt>Payment source</dt><dd>{data.template.fact.sourceId}</dd>
    </dl>
    <button style={control} disabled={busy || !!pending} onClick={propose}>Propose correction</button>
   </> : <p>No supported missing payment journal is available in this stored run.</p>}
   <h2>Stored adjustments</h2>
   {data.adjustments.length === 0 && <p>No adjustments proposed.</p>}
   {data.adjustments.map(row => <section key={row.adjustmentId}>
    <h3>{row.approvalId ? "Approved for simulation review" : "Waiting for approval"}</h3>
    <pre style={jsonStyle}>{JSON.stringify(row.adjustment, null, 2)}</pre>
    <p>Exact content hash: <code>{row.contentHash}</code></p>
    {!row.approvalId && <button style={control} disabled={busy || !!pending} onClick={() => void send(JSON.stringify({
     version: "financial-reconciliation-approve.v1", commandId: crypto.randomUUID(), jobId,
     adjustmentId: row.adjustmentId, contentHash: row.contentHash,
    }))}>Approve this exact content</button>}
   </section>)}
  </>}
 </main>;
}
