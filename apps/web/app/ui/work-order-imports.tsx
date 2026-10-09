"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { workOrderBatchDetailV1, workOrderImportResultV1, workOrderOverviewV1, type WorkOrderReceipt } from "@jobguard/core";
import { pounds } from "../lib/pounds";
import styles from "./work-orders.module.css";

type Overview = ReturnType<typeof workOrderOverviewV1.parse>;
type Rows = { title: string; rows: WorkOrderReceipt[]; counts: { rows: number; created: number; revised: number; unchanged: number; rejected: number }; replayed?: boolean };
/** Plain-English copy for every typed row error; the code itself is always shown beside it. */
const reasons: Record<string, string> = {
  INVALID_ROW: "The row is not a valid work-order row.", UNKNOWN_SOR_CODE: "This code is not in the schedule of rates in force on the order's issue date.", NEGATIVE_QUANTITY: "A quantity is below zero.",
  QUANTITY_PRECISION: "A quantity has more than 6 decimal places.", INVALID_QUANTITY: "A quantity is not a valid number.", MONEY_OUT_OF_RANGE: "The priced amount is outside the allowed range.",
  CONTRACTOR_PARTIES_REQUIRED: "The client, contract, site, or resident contact (or no-resident reason) is missing.", PARTY_NOT_FOUND: "A client, contract or site in the row was not found for your organisation.",
  CUSTOMER_TYPE_MISMATCH: "The client's linked customer is a different type.", NOT_FOUND: "You cannot import for the client named in this row.", STALE_REVISION: "The order has moved on since this row was prepared.",
  PARTY_CHANGE_REFUSED: "The client, contract, site or resident differs from the one this order was created with.", ASSIGNMENT_INVALID: "The team or an assigned operative is not valid for your organisation.",
  ORDER_NOT_FOUND: "A cancellation names an order that does not exist.", SOR_VERSION_NOT_FOUND: "No schedule of rates was in force on the issue date.", AMBIGUOUS_SOR_VERSION: "Two schedules of rates took effect on the same day.",
  NEGATIVE_MULTIPLIER: "The contract's adjustment would make the price negative.", INVALID_ADJUSTMENT: "The contract's adjustment is not valid.", DUPLICATE_LINE_REFERENCE: "Two lines share one client line reference.",
};
const fileErrors: Record<string, string> = {
  UNAUTHENTICATED: "Start the generated contractor practice first.", NOT_FOUND: "Your role cannot import work orders. Work orders are imported by an owner, an admin or finance.", TRACK_FORBIDDEN: "Work-order import is only for contractor organisations.",
  MODE_FORBIDDEN: "Work-order import is only available in the practice sandbox.", COMMAND_CONFLICT: "That import conflicts with an earlier one.", UPLOAD_NOT_ALLOWED: "Choose one of the generated files; uploads are not allowed in the practice sandbox.",
  DATABASE_UNAVAILABLE: "The register could not be reached. Nothing changed - try again.",
};
const outcomeLabel = { created: "Created", revised: "Revised", unchanged: "Unchanged (recorded)", rejected: "Refused" } as const;

export function WorkOrderImports() {
  const [overview, setOverview] = useState<Overview | null>(null), [code, setCode] = useState(""), [sample, setSample] = useState("starter_orders"), [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Rows | null>(null), [status, setStatus] = useState("Loading the persisted register…");
  const resultsHeading = useRef<HTMLHeadingElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/contractor/work-order-imports", { cache: "no-store" }), body = await response.json();
      if (!response.ok) { setCode(body.code ?? "DATABASE_UNAVAILABLE"); setStatus("The register could not be loaded."); return; }
      setOverview(workOrderOverviewV1.parse(body)); setCode(""); setStatus("Persisted register loaded");
    } catch { setCode("DATABASE_UNAVAILABLE"); setStatus("The register could not be loaded."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (code) errorRef.current?.focus(); }, [code]);
  useEffect(() => { if (results) resultsHeading.current?.focus(); }, [results]);
  async function importSelected() {
    if (busy) return;
    setBusy(true); setCode(""); setStatus("Importing…");
    try {
      const response = await fetch("/api/contractor/work-order-imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "work-order-import-request.v1", environment: "synthetic_demo", commandId: crypto.randomUUID(), source: { kind: "generated", sample } }) });
      const body = await response.json();
      if (!response.ok) { setCode(body.code ?? "DATABASE_UNAVAILABLE"); setStatus("The import was not confirmed. Nothing was shown as saved."); return; }
      const result = workOrderImportResultV1.parse(body);
      setResults({ title: result.replayed ? "This file was already imported - nothing new was written" : "Import results", rows: result.rows, counts: result.counts, replayed: result.replayed });
      setStatus(result.replayed ? "Already imported" : "Import saved"); await load();
    } catch { setCode("DATABASE_UNAVAILABLE"); setStatus("The import was not confirmed. Reload the register before trying again."); } finally { setBusy(false); }
  }
  async function showBatch(id: string, name: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/contractor/work-order-imports/${id}`, { cache: "no-store" }), body = await response.json();
      if (!response.ok) { setCode(body.code ?? "DATABASE_UNAVAILABLE"); return; }
      const batch = workOrderBatchDetailV1.parse(body); setResults({ title: `Rows of ${name}`, rows: batch.rows, counts: batch.counts });
    } finally { setBusy(false); }
  }
  return <main className={styles.main}>
    <Link href="/">Back to Jobs</Link>
    <h1>Work orders</h1>
    <p>Choose one of the generated fictional files and import it. Orders become live jobs straight away, with no quote or fee set-up. Nothing is sent, and no real people are involved.</p>
    <p role="status" data-testid="register-status">{status}</p>
    {code && <p role="alert" tabIndex={-1} ref={errorRef}>{fileErrors[code] ?? `The request was refused (${code}).`} {code === "UNAUTHENTICATED" && <Link href="/admin/contractor">Open contractor practice</Link>}</p>}
    {overview && <>
      <section aria-labelledby="choose-file"><h2 id="choose-file">Choose a generated file</h2>
        <fieldset><legend>Generated work-order file</legend>
          {overview.samples.map(item => <label className={styles.choice} key={item.id}><input type="radio" name="sample" value={item.id} checked={sample === item.id} onChange={() => setSample(item.id)}/><span>{item.label}<small>{item.description}</small></span></label>)}
        </fieldset>
        <button className={styles.primary} type="button" disabled={busy} onClick={() => void importSelected()}>Import selected file</button>
      </section>
      {results && <section aria-labelledby="results-heading"><h2 id="results-heading" tabIndex={-1} ref={resultsHeading}>{results.title}</h2>
        <p data-testid="import-counts">{results.counts.created} created · {results.counts.revised} revised · {results.counts.unchanged} unchanged · {results.counts.rejected} refused (of {results.counts.rows} rows)</p>
        <div className={styles.scroll}><table><thead><tr><th>Row</th><th>Order</th><th>Result</th><th>Reason</th></tr></thead><tbody>
          {results.rows.map(row => <tr key={row.rowNumber} data-testid={`receipt-row-${row.rowNumber}`} className={row.outcome === "rejected" ? styles.rejected : undefined}>
            <td>{row.rowNumber}</td><td>{row.workOrderId ? <Link href={`/contractor/work-orders/${row.workOrderId}`}>{row.reference ?? "Order"}</Link> : row.reference ?? "-"}</td><td>{outcomeLabel[row.outcome]}</td>
            <td className={styles.wrap}>{row.errorCode ? <><code>{row.errorCode}</code> {reasons[row.errorCode] ?? ""}</> : ""}</td></tr>)}
        </tbody></table></div></section>}
      <section aria-labelledby="orders-heading"><h2 id="orders-heading">Orders</h2>
        {overview.orders.length === 0 ? <p>No orders yet. Import the starter orders to begin.</p> : <div className={styles.scroll}><table data-testid="orders-table"><thead><tr><th>Order</th><th>Client</th><th>Status</th><th>Revision</th><th>Priority</th><th>Issued</th><th>Net</th><th>Job</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
          {overview.orders.map(order => <tr key={order.id} data-testid={`order-${order.reference}`}><td>{order.reference}</td><td>{order.clientName}</td><td>{order.status === "cancelled" ? <span className={`${styles.badge} ${styles.cancelled}`}>Cancelled</span> : "Ordered"}</td><td>{order.revision}</td><td>{order.priority}</td><td>{order.issuedOn}</td><td>{pounds(order.netTotalPence)}</td><td>{order.jobStatus === "live" ? "Live" : order.jobStatus}</td>
            <td><Link className={styles.action} href={`/contractor/work-orders/${order.id}`} aria-label={`Revisions of ${order.reference}`}>Revisions</Link></td></tr>)}
        </tbody></table></div>}
        <p className={styles.muted}>Resident contact details are held separately and are not shown on this list.</p></section>
      <section aria-labelledby="history-heading"><h2 id="history-heading">Import history</h2>
        {overview.batches.length === 0 ? <p>Nothing imported yet.</p> : <ul>{overview.batches.map(batch => <li key={batch.id} data-testid="batch">{batch.sourceName} · {batch.counts.created} created · {batch.counts.revised} revised · {batch.counts.unchanged} unchanged · {batch.counts.rejected} refused <button type="button" disabled={busy} onClick={() => void showBatch(batch.id, batch.sourceName)} aria-label={`Show rows of ${batch.sourceName}`}>Show rows</button></li>)}</ul>}
      </section>
    </>}
    {!overview && code !== "UNAUTHENTICATED" && <button type="button" onClick={() => void load()}>Reload persisted register</button>}
  </main>;
}
