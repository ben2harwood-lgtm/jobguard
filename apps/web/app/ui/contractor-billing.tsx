"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { BILLING_SANDBOX_LABEL, exactPenceV1 } from "@jobguard/core";
import styles from "./work-orders.module.css";

type Exact = z.infer<typeof exactPenceV1>;
const id = z.string().min(1).max(200), net = { net: exactPenceV1 };
const projectionLineV1 = z.object({ lineId: id, billedNet: exactPenceV1, creditedNet: exactPenceV1, paidNet: exactPenceV1, rejected: z.boolean() });
/** The fields this screen shows from `contractor-billing-projection.v1`; anything else in the response is ignored. */
export const contractorBillingReadV1 = z.object({
  version: z.literal("contractor-billing-projection.v1"),
  exports: z.array(z.object({ id, lines: z.array(z.unknown()), totalNet: z.object({ pence: z.number().int() }), csvHash: z.string() })),
  invoices: z.array(z.object({ source: id, invoiceNumber: id, projection: z.object({
    lines: z.array(projectionLineV1), totals: z.object({ billedNet: exactPenceV1, creditedNet: exactPenceV1, paidNet: exactPenceV1 }),
    held: z.array(z.object({ sourceEventId: id, reason: id })) }) })),
  quarantine: z.array(z.object({ fact_id: id, reason: id })),
  deliveries: z.array(z.object({ id, batch_id: id, status: id, adapter: id })),
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
const channel: Record<string, string> = { fake_download: "Download", fake_sftp: "Practice SFTP", fake_api: "Practice API" };
const short = (v: string) => <code className={styles.ident} title={v}>{v.slice(0, 8)}</code>;

function Drill({ title, total, rows, testId }: { title: string; total: Exact; rows: { key: string; label: ReactNode; net: Exact }[]; testId: string }) {
  return <details data-testid={testId}><summary>{title}: {exactPounds(total)} ({rows.length})</summary>
    {rows.length ? <ul>{rows.map(r => <li key={r.key}>{r.label} · {exactPounds(r.net)}</li>)}</ul> : <p className={styles.muted}>None.</p>}
  </details>;
}

export function BillingView({ jobId, view }: { jobId: string; view: ContractorBillingRead }) {
  const r = view.reconciliation;
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
      {view.exports.length ? view.exports.map(e => { const sent = view.deliveries.filter(d => d.batch_id === e.id);
        return <div key={e.id} data-testid={`export-${e.id}`}>
          <p>Batch {short(e.id)} · {e.lines.length} line{e.lines.length === 1 ? "" : "s"} · net {exactPounds({ numerator: String(e.totalNet.pence), denominator: "1" })}</p>
          <p>{sent.length ? sent.map(d => <span key={d.id}>{channel[d.adapter] ?? d.adapter}: {d.status}. </span>) : "Not delivered yet."}</p>
          {sent.some(d => d.adapter === "fake_download" && d.status === "succeeded") && <a className={styles.action} href={`/api/contractor/jobs/${jobId}/billing/download?batchId=${e.id}`}>Download CSV</a>}
        </div>; }) : <p className={styles.muted}>No export batches yet.</p>}
    </section>
    <section aria-label="Invoices and payments">
      <h2>Invoices and payments</h2>
      {view.invoices.length ? view.invoices.map(i => <div key={`${i.source}/${i.invoiceNumber}`} data-testid={`invoice-${i.invoiceNumber}`}>
        <h3>Invoice {i.invoiceNumber} <small className={styles.muted}>from {i.source}</small></h3>
        <div className={styles.scroll}><table><thead><tr><th>Line</th><th>Billed net</th><th>Credited</th><th>Paid net</th><th>State</th></tr></thead><tbody>
          {i.projection.lines.map(l => <tr key={l.lineId}><td>{l.lineId}</td><td>{exactPounds(l.billedNet)}</td><td>{exactPounds(l.creditedNet)}</td><td>{exactPounds(l.paidNet)}</td><td>{l.rejected ? "Rejected" : "Open"}</td></tr>)}
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
  const errorRef = useRef<HTMLParagraphElement>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/contractor/jobs/${jobId}/billing`, { cache: "no-store" }), body = await response.json();
      if (!response.ok) { setCode(body.code ?? "DATABASE_UNAVAILABLE"); setStatus("Billing could not be loaded."); return; }
      setView(contractorBillingReadV1.parse(body)); setCode(""); setStatus("Billing loaded");
    } catch { setCode("DATABASE_UNAVAILABLE"); setStatus("Billing could not be loaded."); }
  }, [jobId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (code) errorRef.current?.focus(); }, [code]);
  return <main className={styles.main}>
    <h1>Billing and reconciliation</h1>
    <p className={styles.muted}>{BILLING_SANDBOX_LABEL}</p>
    <p role="status">{status}</p>
    {code && <p role="alert" tabIndex={-1} ref={errorRef}>{code === "BILLING_NOT_FOUND" ? "This job's billing is not available to you." : code === "BILLING_FORBIDDEN" ? "Only finance and commercial managers can see billing." : code === "UNAUTHENTICATED" ? "Start the generated contractor practice first." : `Billing could not be loaded (${code}).`}</p>}
    {view ? <BillingView jobId={jobId} view={view}/> : <button type="button" onClick={() => void load()}>Reload billing</button>}
  </main>;
}
