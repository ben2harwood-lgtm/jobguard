"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { reconciliationReportResponseV1, type ReconciliationReportResponse } from "../lib/financial-reconciliation-report";
import { pounds } from "../lib/pounds";
const labels = {
 grossCharged: "Gross charged", providerFees: "Provider fees", netPayout: "Net payout", vat: "Invoiced VAT", refunds: "Refunds",
 invoicedGross: "Invoiced gross", invoicedNet: "Invoiced net", invoiceOutstanding: "Invoice outstanding", allocated: "Allocated", reserved: "Reserved",
 outstandingClearing: "Outstanding clearing", payoutInTransit: "Payout in transit", bankObserved: "Bank observed",
 journalPayments: "Journal payments", journalRefunds: "Journal refunds", journalFees: "Journal fees", journalPayouts: "Journal payouts",
} as const;
export function ReconciliationReportView({ value }: { value: ReconciliationReportResponse }) {
 return <><h1>Financial reconciliation</h1><p>Synthetic reference report. Source verification is unavailable; nothing is sent or charged.</p>
  <p>Gross charged, refunds, fees and net payout are separate observations. Net payout is not gross recovered money and does not establish fee entitlement. VAT is recorded invoice VAT.</p>
  <p>Run {value.runId}</p><p style={{ overflowWrap: "anywhere" }}>Source hash {value.report.sourceHash}</p>
  <section aria-label="Reconciliation balances"><h2>Balances</h2><dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd data-testid={`reconciliation-${key}`}>{pounds(value.report.balances[key as keyof typeof labels].pence)}</dd></div>)}</dl></section>
  <section aria-label="Unexplained balance queue"><h2>Unexplained balance queue</h2>{value.report.queue.length ? <ul>{value.report.queue.map(item => <li key={item.differenceId} style={{ overflowWrap: "anywhere" }}><h3>{item.code.replaceAll("_", " ")}</h3><p>Difference {item.differenceId}</p><p>References: {item.refs.join(", ") || "Report balance"}</p><p>Expected: {item.expected === null ? "Not specified" : pounds(item.expected.pence)} · Observed: {item.observed === null ? "Not specified" : pounds(item.observed.pence)}</p></li>)}</ul> : <p>No unexplained differences in this reference run.</p>}</section>
  <p>Read-only report. Adjustments require the separate approval path and append-only facts.</p></>;
}
export function ReconciliationReportPage({ jobId, runId }: { jobId: string; runId: string }) {
 const [state, setState] = useState<{ key: string; value?: ReconciliationReportResponse; error?: string } | null>(null);
 const key = `${jobId}/${runId}`;
 useEffect(() => {
  const controller = new AbortController();
  void (async () => {
   try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/reconciliation/${encodeURIComponent(runId)}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) { if (!controller.signal.aborted) setState({ key, error: response.status === 403 ? "You do not have access to this report." : response.status === 404 ? "Report not found." : "Report unavailable." }); return; }
    const value = reconciliationReportResponseV1.parse(await response.json());
    if (value.jobId !== jobId || value.runId !== runId) throw new Error("Report scope mismatch");
    if (!controller.signal.aborted) setState({ key, value });
   } catch { if (!controller.signal.aborted) setState({ key, error: "Report unavailable." }); }
  })();
  return () => controller.abort();
 }, [jobId, runId, key]);
 const current = state?.key === key ? state : null;
 return <main className="workspace-page"><Link href={`/jobs/${encodeURIComponent(jobId)}`}>Back to job</Link>{current?.value ? <ReconciliationReportView value={current.value} /> : <><h1>Financial reconciliation</h1><p role="status">{current?.error ?? "Loading report…"}</p></>}</main>;
}
