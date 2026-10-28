"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import Link from "next/link";
import { BILLING_SANDBOX_LABEL, exactPenceV1, parseExactPence, exactPence, sumExactPence, compareExactPence } from "@jobguard/core";
import styles from "./work-orders.module.css";

type Exact = z.infer<typeof exactPenceV1>;
const id = z.string().min(1).max(200), net = { net: exactPenceV1 };
const projectionLineV1 = z.object({ lineId: id, billedNet: exactPenceV1, creditedNet: exactPenceV1, paidNet: exactPenceV1, rejected: z.boolean() });
/** The fields this screen shows from `contractor-billing-projection.v1`; anything else in the response is ignored. */
export const contractorBillingReadV1 = z.object({
  version: z.literal("contractor-billing-projection.v1"),
  exports: z.array(z.object({ id, lines: z.array(z.unknown()), totalNet: z.object({ pence: z.number().int() }), jsonHash: z.string(), csvHash: z.string() })),
  invoices: z.array(z.object({ source: id, invoiceNumber: id, projection: z.object({
    lines: z.array(projectionLineV1), totals: z.object({ billedNet: exactPenceV1, creditedNet: exactPenceV1, paidNet: exactPenceV1 }),
    held: z.array(z.object({ sourceEventId: id, reason: id })) }) })),
  quarantine: z.array(z.object({ fact_id: id, reason: id })),
  deliveries: z.array(z.object({ id, batch_id: id, outbox_action_id: id, status: id, adapter: id })),
  clientContractIds: z.array(id),
  reconciliation: z.object({
    approvedNotExported: z.array(z.object({ extraId: id, ...net })),
    unbilledExports: z.array(z.object({ exportLineId: id, ...net, alertDays: z.number(), overdue: z.boolean() })),
    billedDifferences: z.array(z.object({ exportLineId: id, approvedNet: exactPenceV1, billedNet: exactPenceV1, difference: exactPenceV1 })),
    credits: z.array(z.object({ invoiceNumber: id, lineId: id, ...net })),
    rejections: z.array(z.object({ invoiceNumber: id, lineId: id, ...net })),
    excessPayment: z.array(z.object({ invoiceNumber: id, lineId: id, ...net })),
    totals: z.object({ approvedNotExported: exactPenceV1, unbilledExports: exactPenceV1, billedDifference: exactPenceV1,
      credits: exactPenceV1, rejections: exactPenceV1, excessPayment: exactPenceV1 }),
  }),
});
export type ContractorBillingRead = z.infer<typeof contractorBillingReadV1>;

/** Whole pence show as pounds; a fractional allocation keeps its exact fraction rather than a rounded figure. */
export function exactPounds(value: Exact): string {
  const n = BigInt(value.numerator), d = BigInt(value.denominator);
  if (n % d !== 0n) return `${value.numerator}/${value.denominator} pence`;
  const pence = n / d, abs = pence < 0n ? -pence : pence;
  return `${pence < 0n ? "−" : ""}£${(abs / 100n).toLocaleString("en-GB")}.${String(abs % 100n).padStart(2, "0")}`;
}
/** Display state follows imported exact balances, including credits and payment reversals. */
export function billingLineState(line: z.infer<typeof projectionLineV1>): string {
  if (line.rejected) return "Rejected";
  const billed = parseExactPence(line.billedNet), credit = parseExactPence(line.creditedNet), paid = parseExactPence(line.paidNet);
  const due = sumExactPence([billed, exactPence(-credit.numerator, credit.denominator)]);
  if (paid.numerator > 0n) return compareExactPence(paid, due) >= 0 ? "Paid" : "Part-paid";
  if (credit.numerator > 0n && due.numerator <= 0n) return "Credited";
  return billed.numerator > 0n ? "Billed" : "Unbilled";
}
export type BillingAction = "export" | "import" | "approve-delivery" | "advance-delivery";
type Command = { action: BillingAction; body: unknown };
/** Each click is one new command; the server enforces authority, idempotency and every binding. */
export const exportCommand = (clientContractId: string, commandId: string): Command =>
  ({ action: "export", body: { version: "billing-finalise.v1", commandId, clientContractId } });
export function importCommand(format: "csv" | "json", text: string, commandId: string): Command {
  if (format === "csv") return { action: "import", body: { version: "billing-import-request.v1", commandId, input: { version: "billing-import.v1", transport: "csv", csv: text } } };
  const parsed: unknown = JSON.parse(text), events = Array.isArray(parsed) ? parsed : [parsed];
  return { action: "import", body: { version: "billing-import-request.v1", commandId, input: { version: "billing-import.v1", transport: "api", events } } };
}
export const deliveryCommand = (batch: { id: string; jsonHash: string }, channel: string, destination: string, commandId: string, now: Date): Command =>
  ({ action: "approve-delivery", body: { version: "billing-approve-delivery.v1", commandId, batchId: batch.id, channel, destination, contentHash: batch.jsonHash,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString() } });
/** A retryable delivery may be tried again; an unknown outcome is only ever reconciled, never re-sent. */
export function advanceCommand(delivery: { outbox_action_id: string; status: string }): Command | null {
  const action = delivery.status === "retryable" ? "execute" : delivery.status === "outcome_unknown" ? "reconcile" : null;
  return action ? { action: "advance-delivery", body: { version: "billing-advance-delivery.v1", outboxActionId: delivery.outbox_action_id, action } } : null;
}
const channel: Record<string, string> = { fake_download: "Download", fake_sftp: "Practice SFTP", fake_api: "Practice API" };
const short = (v: string) => <code className={styles.ident} title={v}>{v.slice(0, 8)}</code>;

function Drill({ title, total, rows, testId }: { title: string; total: Exact; rows: { key: string; label: ReactNode; net: Exact }[]; testId: string }) {
  return <details data-testid={testId}><summary>{title}: {exactPounds(total)} ({rows.length})</summary>
    {rows.length ? <ul>{rows.map(r => <li key={r.key}>{r.label} · {exactPounds(r.net)}</li>)}</ul> : <p className={styles.muted}>None.</p>}
  </details>;
}

export function BillingView({ jobId, view, send, busy = false }: { jobId: string; view: ContractorBillingRead; send?: (command: Command) => void; busy?: boolean }) {
  const r = view.reconciliation;
  const [contract, setContract] = useState(""), [format, setFormat] = useState<"csv" | "json">("csv"), [text, setText] = useState(""), [importError, setImportError] = useState("");
  const [routes, setRoutes] = useState<Record<string, { channel: string; destination: string }>>({});
  const route = (batchId: string) => routes[batchId] ?? { channel: "fake_download", destination: "client-billing.invalid" };
  const chosenContract = contract || view.clientContractIds[0] || "";
  function submitImport() {
    try { setImportError(""); send!(importCommand(format, text, crypto.randomUUID())); }
    catch { setImportError("That is not valid JSON. Paste one billing-status.v1 event or a list of them."); }
  }
  return <>
    <section aria-label="Reconciliation">
      <h2>Reconciliation</h2>
      <p className={styles.muted}>Display only: these figures never change an extra, a fact or a fee.</p>
      <Drill testId="approved-not-exported" title="Approved, not yet exported" total={r.totals.approvedNotExported} rows={r.approvedNotExported.map(x => ({ key: x.extraId, label: <>Extra {short(x.extraId)}</>, net: x.net }))}/>
      <Drill testId="unbilled-exports" title="Exported, not yet billed" total={r.totals.unbilledExports} rows={r.unbilledExports.map(x => ({ key: x.exportLineId, label: <>Line {short(x.exportLineId)}{x.overdue ? ` · overdue (${x.alertDays} days)` : ""}</>, net: x.net }))}/>
      <Drill testId="billed-differences" title="Billed differently from approved" total={r.totals.billedDifference} rows={r.billedDifferences.map(x => ({ key: x.exportLineId, label: <>Line {short(x.exportLineId)}: approved {exactPounds(x.approvedNet)}, billed {exactPounds(x.billedNet)}</>, net: x.difference }))}/>
      <Drill testId="credits" title="Credited" total={r.totals.credits} rows={r.credits.map(x => ({ key: `${x.invoiceNumber}/${x.lineId}`, label: <>Invoice {x.invoiceNumber} line {x.lineId}</>, net: x.net }))}/>
      <Drill testId="rejections" title="Rejected by the client" total={r.totals.rejections} rows={r.rejections.map(x => ({ key: `${x.invoiceNumber}/${x.lineId}`, label: <>Invoice {x.invoiceNumber} line {x.lineId}</>, net: x.net }))}/>
      <Drill testId="excess-payment" title="Paid above the billed amount" total={r.totals.excessPayment} rows={r.excessPayment.map(x => ({ key: `${x.invoiceNumber}/${x.lineId}`, label: <>Invoice {x.invoiceNumber} line {x.lineId}</>, net: x.net }))}/>
    </section>
    <section aria-label="Exports">
      <h2>Exports</h2>
      {send && <div data-testid="export-controls">
        {view.clientContractIds.length > 1 && <label>Client contract <select value={chosenContract} onChange={e => setContract(e.target.value)}>
          {view.clientContractIds.map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
        <button type="button" className={styles.primary} disabled={busy || !chosenContract} onClick={() => send(exportCommand(chosenContract, crypto.randomUUID()))}>Export approved extras</button>
        {!chosenContract && <p className={styles.muted}>This job has no client contract to export to.</p>}
      </div>}
      {view.exports.length ? view.exports.map(e => { const sent = view.deliveries.filter(d => d.batch_id === e.id);
        return <div key={e.id} data-testid={`export-${e.id}`}>
          <p>Batch {short(e.id)} · {e.lines.length} line{e.lines.length === 1 ? "" : "s"} · net {exactPounds({ numerator: String(e.totalNet.pence), denominator: "1" })}</p>
          <p>{sent.length ? sent.map(d => <span key={d.id}>{channel[d.adapter] ?? d.adapter}: {d.status}. </span>) : "Not delivered yet."}</p>
          {send && sent.map(d => { const next = advanceCommand(d); return next && <button key={d.id} type="button" disabled={busy} onClick={() => send(next)}>
            {d.status === "retryable" ? `Try ${channel[d.adapter] ?? d.adapter} delivery again` : `Check ${channel[d.adapter] ?? d.adapter} delivery outcome`}</button>; })}
          {send && <fieldset><legend>Approve delivery of this exact batch</legend>
            <label>Channel <select value={route(e.id).channel} onChange={x => setRoutes({ ...routes, [e.id]: { ...route(e.id), channel: x.target.value } })}>
              {Object.entries(channel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{" "}
            <label>Destination <input value={route(e.id).destination} onChange={x => setRoutes({ ...routes, [e.id]: { ...route(e.id), destination: x.target.value } })}/></label>
            <button type="button" disabled={busy} onClick={() => send(deliveryCommand(e, route(e.id).channel, route(e.id).destination, crypto.randomUUID(), new Date()))}>Approve delivery</button>
          </fieldset>}
          {sent.some(d => d.adapter === "fake_download" && d.status === "succeeded") && <a className={styles.action} href={`/api/contractor/jobs/${jobId}/billing/download?batchId=${e.id}`}>Download CSV</a>}
        </div>; }) : <p className={styles.muted}>No export batches yet.</p>}
    </section>
    <section aria-label="Invoices and payments">
      <h2>Invoices and payments</h2>
      {send && <fieldset data-testid="import-controls"><legend>Import invoice and payment status</legend>
        <label>Format <select value={format} onChange={e => setFormat(e.target.value as "csv" | "json")}><option value="csv">CSV file</option><option value="json">JSON (billing-status.v1)</option></select></label>
        <label>Status data <textarea rows={6} value={text} onChange={e => setText(e.target.value)}/></label>
        <label>Or choose a file <input type="file" accept=".csv,.json,text/csv,application/json" onChange={e => void e.target.files?.[0]?.text().then(setText)}/></label>
        <button type="button" disabled={busy || !text.trim()} onClick={submitImport}>Import status</button>
        {importError && <p role="alert">{importError}</p>}
        <p className={styles.muted}>Importing never creates, prices or approves an extra.</p>
      </fieldset>}
      {view.invoices.length ? view.invoices.map(i => <div key={`${i.source}/${i.invoiceNumber}`} data-testid={`invoice-${i.invoiceNumber}`}>
        <h3>Invoice {i.invoiceNumber} <small className={styles.muted}>from {i.source}</small></h3>
        <div className={styles.scroll}><table><thead><tr><th>Line</th><th>Billed net</th><th>Credited</th><th>Paid net</th><th>State</th></tr></thead><tbody>
          {i.projection.lines.map(l => <tr key={l.lineId}><td>{l.lineId}</td><td>{exactPounds(l.billedNet)}</td><td>{exactPounds(l.creditedNet)}</td><td>{exactPounds(l.paidNet)}</td><td>{billingLineState(l)}</td></tr>)}
          <tr><th>Total</th><th>{exactPounds(i.projection.totals.billedNet)}</th><th>{exactPounds(i.projection.totals.creditedNet)}</th><th>{exactPounds(i.projection.totals.paidNet)}</th><th></th></tr>
        </tbody></table></div>
        {i.projection.held.length > 0 && <p>Held until more detail arrives: {i.projection.held.map(h => <span key={h.sourceEventId}>{h.sourceEventId} ({h.reason}) </span>)}</p>}
      </div>) : <p className={styles.muted}>No invoice or payment facts imported yet.</p>}
    </section>
    <section aria-label="Quarantine">
      <h2>Quarantine</h2>
      {view.quarantine.length ? <ul>{view.quarantine.map(q => <li key={q.fact_id} data-testid="quarantined-fact">Fact {short(q.fact_id)}: {q.reason}</li>)}</ul>
        : <p className={styles.muted}>Nothing quarantined.</p>}
    </section>
  </>;
}

export function ContractorBilling({ jobId }: { jobId: string }) {
  const [view, setView] = useState<ContractorBillingRead | null>(null), [code, setCode] = useState(""), [status, setStatus] = useState("Loading billing…");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/contractor/jobs/${jobId}/billing`, { cache: "no-store" }), body = await response.json();
      if (!response.ok) { setCode(body.code ?? "DATABASE_UNAVAILABLE"); setStatus("Billing could not be loaded."); return; }
      setView(contractorBillingReadV1.parse(body)); setCode(""); setStatus("Billing loaded");
    } catch { setCode("DATABASE_UNAVAILABLE"); setStatus("Billing could not be loaded."); }
  }, [jobId]);
  useEffect(() => { void load(); }, [load]);
  const send = useCallback(async ({ action, body }: Command) => {
    setBusy(true); setStatus("Sending…");
    try {
      const response = await fetch(`/api/contractor/jobs/${jobId}/billing/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setCode(result.code ?? "DATABASE_UNAVAILABLE"); setStatus("That did not go through. Nothing was changed by this attempt unless billing below shows it."); return; }
      setCode(""); await load();
      setStatus(action === "export" ? (result.batchId ? `Exported ${result.lineCount} line${result.lineCount === 1 ? "" : "s"}.` : "Nothing new to export.")
        : action === "import" ? "Status imported." : action === "approve-delivery" ? "Delivery approved and attempted." : "Delivery checked.");
    } catch { setCode("DATABASE_UNAVAILABLE"); setStatus("The outcome is unknown. Reload billing to see what was recorded before trying again."); }
    finally { setBusy(false); }
  }, [jobId, load]);
  useEffect(() => { if (code) errorRef.current?.focus(); }, [code]);
  return <main className={styles.main}>
    <Link href="/northside">Practice roles</Link>{" · "}<Link href="/contractor/statements">Monthly statement</Link>{" · "}<Link href="/contractor/dashboard">Dashboard</Link>
    <h1>Billing and reconciliation</h1>
    <p className={styles.muted}>{BILLING_SANDBOX_LABEL}</p>
    <p role="status">{status}</p>
    {code && <p role="alert" tabIndex={-1} ref={errorRef}>{code === "BILLING_NOT_FOUND" ? "This job's billing is not available to you." : code === "BILLING_FORBIDDEN" ? "Only finance users can see or change billing." : code === "UNAUTHENTICATED" ? "Start the generated contractor practice first." : code === "BILLING_DUPLICATES_UNRESOLVED" ? "Resolve the possible duplicate extras before exporting." : code === "JOB_NOT_LIVE" ? "This job is not live." : `Billing request refused (${code}).`}</p>}
    {view ? <BillingView jobId={jobId} view={view} busy={busy} send={command => void send(command)}/> : <button type="button" onClick={() => void load()}>Reload billing</button>}
  </main>;
}
