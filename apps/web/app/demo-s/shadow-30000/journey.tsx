"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { sessionResponseV1 } from "../../lib/contracts";
import { demoLink } from "../chooser-state";
import { shadowApprovalLabel, parseShadowReport, shadowCaptureText, type ShadowReport } from "./journey-model";
const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export function ShadowSavedReport({ report }: { report: ShadowReport }) {
 const view = report.account, account = view.account;
 return <section aria-label="Saved shadow journey report">
  <h2>Saved job evidence</h2><p>{report.status === "complete" ? "Complete. All nine steps are saved on this job." : `Incomplete. ${shadowApprovalLabel(report)} No fee is charged.`}</p>
  {report.status === "complete" && report.value.status === "mapped" && <dl aria-label="Saved journey figures">
   <dt>Missed extras found by Final Check</dt><dd>{pounds(report.value.receipt.found.recovered?.pence ?? 0)}</dd>
   <dt>Proposed fee (simulation)</dt><dd>{pounds(report.value.receipt.found.fee?.pence ?? 0)}</dd>
   <dt>Yours before VAT and tax</dt><dd>{pounds(report.value.receipt.found.yoursBeforeVatAndTax?.pence ?? 0)}</dd>
   <dt>Your captures</dt><dd>{pounds(report.value.receipt.tracked.pence)} · fee {pounds(report.value.receipt.trackedFee.pence)}</dd>
   <dt>Settlement</dt><dd>Confirmed: a completed practice payment is matched to each extra</dd></dl>}
  <p>Customer approval: {report.customerApproval.state === "not_ready_yet" ? "Not ready for the customer yet" : report.customerApproval.state === "awaiting_customer" ? "Awaiting customer" : "Approved through the customer portal"}.</p>
  <ul>{report.customerApproval.approvals.map(approval => <li key={approval.variationId}>
   <a href={`/jobs/${report.jobId}#final-check`}>Variation {approval.variationId}</a> · approved {approval.approvedAt} · customer portal
  </li>)}</ul>
  <p><a href={`/jobs/${report.jobId}`}>Open the same saved job</a></p>
  <dl><dt>Final account</dt><dd>{account ? `${pounds(account.totals.net.pence)} net · revision ${account.revision}` : "Not built yet"}</dd>
   <dt>Lock</dt><dd>{view.lock ? `${view.lock.id} · ${view.lock.lockedAt}` : "Not locked"}</dd>
   <dt>Real external actions</dt><dd>{report.realExternalActions}</dd></dl>
  <h3>Extras you logged — fee-free at every stage</h3>
  <ul>{view.captures.map(capture => <li key={capture.id}>{capture.description} · {capture.netPence === null ? "Unpriced" : pounds(capture.netPence)} · {capture.state} · recovery fee £0</li>)}</ul>
  {report.finalCheck && <section><h3>Saved Final Check</h3><p>{report.finalCheck.state}</p>
   <ul>{report.finalCheck.items.map(item => <li key={item.signalId}>{item.description} · {item.disposition ?? "Awaiting your answer"}</li>)}</ul>
   <a href={`/jobs/${report.jobId}#final-check`}>Open the saved reveal and confirm extra work</a></section>}
  <h3>Saved invoices</h3>
  {report.invoices.invoices.length === 0 ? <p>No invoice issued.</p> : <ul>{report.invoices.invoices.map(invoice => <li key={invoice.id}>
   <a href={`/api/jobs/${report.jobId}/customer-invoices/${invoice.id}`}>{invoice.number}</a> · {pounds(invoice.netPence)} net / {pounds(invoice.totalPence)} gross · balance {pounds(invoice.balancePence)}
   <p>Entering a payment or showing nothing due does not by itself prove that money has arrived or qualifies for a fee.</p></li>)}</ul>}
  {report.assessments && <section><h3>Saved fee calculations</h3><p>The latest saved calculation for each missed extra and bill item. These examples have not been approved and do not charge a fee. Undoing a payment requires a new calculation.</p>
   <ul>{report.assessments.map(({ assessment: a, illustrationAsAssessed: illustration }) => <li key={a.assessmentId}>Revision {a.revision} · {a.assessmentOutcome} · example calculation: recovered {illustration.display.recovered ?? "See the linked record for the exact amount"}, proposed fee {illustration.display.fee}, yours {illustration.display.yoursBeforeVatAndTax ?? "See the linked record for the exact amount"} before VAT and tax
    <a href={`/api/jobs/${report.jobId}/success-fee-attribution`}> View the records behind this calculation {a.assessmentId}</a></li>)}</ul></section>}
  <p>Supporting evidence packs: {report.status === "complete" ? "an approved pack proves each extra's source chain" : "not all approved yet"}.</p>
  <p>Job value report: {report.value.status}{report.value.status === "incomplete" ? "; supporting records are not ready yet" : "; figures and supporting records saved"}.</p>
  <p><a href={`/api/jobs/${report.jobId}/shadow-demo`}>View the saved records behind this report</a></p>
 </section>;
}
export function ShadowJourney() {
 const [jobId, setJobId] = useState(""), [report, setReport] = useState<ShadowReport | null>(null);
 const [error, setError] = useState(""), [busy, setBusy] = useState(false);
 const active = useRef(false);
 const [chooserLink, setChooserLink] = useState("/demo-s");
 useEffect(() => {
  const query = new URLSearchParams(location.search), saved = query.get("jobId");
  if (saved && z.string().uuid().safeParse(saved).success) setJobId(saved);
  const runId = query.get("runId"), tenantId = query.get("tenantId");
  if (runId && tenantId && z.string().uuid().safeParse(runId).success && z.string().uuid().safeParse(tenantId).success) setChooserLink(demoLink(tenantId, runId));
 }, []);
 async function load(event: FormEvent) {
  event.preventDefault(); if (active.current) return;
  setReport(null); setError("");
  if (!z.string().uuid().safeParse(jobId).success) { setError("Enter a valid saved job reference."); return; }
  active.current = true; setBusy(true);
  try {
   const response = await fetch(`/api/jobs/${jobId}/shadow-demo`, { cache: "no-store" });
   if (!response.ok) throw new Error("This job report is unavailable to the current practice session.");
   setReport(parseShadowReport(await response.json(), jobId));
   const query = new URLSearchParams(location.search); query.set("jobId", jobId);
   history.replaceState(null, "", `?${query}`);
  } catch (reason) { setError((reason as Error).message); }
  finally { active.current = false; setBusy(false); }
 }
 async function start() {
  // A chooser launch already recovered this job. Keep its identity when revisiting the guide.
  if (z.string().uuid().safeParse(jobId).success || active.current) return;
  active.current = true; setBusy(true); setError(""); setReport(null);
  try {
   const sessionResponse = await fetch("/api/session", { cache: "no-store" });
   if (!sessionResponse.ok) throw new Error("Start the safe practice demo from Jobs first.");
   const session = sessionResponseV1.parse(await sessionResponse.json());
   const tenantId = session.tenants[0]?.id;
   if (!tenantId) throw new Error("Open an available practice business first.");
   // Exact capture identity survives unknown outcomes and reloads. Never
   // silently replace it on retry or mark a browser copy as server completion.
   const key = `demo-j3.capture.v1:${tenantId}`;
   let captureId = sessionStorage.getItem(key);
   if (!captureId) { captureId = crypto.randomUUID(); sessionStorage.setItem(key, captureId); }
   const response = await fetch("/api/jobs/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    contractVersion: "job_capture_v1", requested_tenant_id: tenantId, captureId,
    source: { kind: "text", text: shadowCaptureText }, fixtureId: "deterministic-local-v1",
   }) });
   if (!response.ok) throw new Error("The job could not be confirmed. Try again to resume the same job.");
   const capture = captureWorkspaceResponseV1.parse(await response.json());
   setJobId(capture.jobId);
   history.replaceState(null, "", `?${new URLSearchParams({ jobId: capture.jobId })}`);
  } catch (reason) { setError((reason as Error).message); }
  finally { active.current = false; setBusy(false); }
 }
 return <main className="workspace-page"><a href={chooserLink} aria-label="← Practice chooser">← Choose a practice exercise</a><h1>Final Check £30,000 journey</h1>
  <p>Practice with made-up details; nothing is sent or charged. Follow the steps below in the job screens. Return here and load the saved results to check what has happened.</p>
  <ol>
   <li><p>Review the five £6,000 work items and save a £30,000 quote. Record practice acceptance and start this job.</p></li>
   <li><p>Log £3,200 of extras. Recording acceptance yourself is practice only; it is not a customer signature.</p></li>
   <li><p>Add the made-up supplier documents, completion photos and diary note. JobGuard keeps possible missed extras for the final check, but must still show safety warnings straight away.</p></li>
   <li><p>Build the final bill from the accepted quote and approved extras. Add £400 at final review, then rebuild the bill: £33,600 before VAT.</p></li>
   <li><p>Finish adding proof of the work and record the outcome for every work item. Accept the terms and complete the final account. This saves a fixed copy of the bill for checking.</p></li>
   <li><p>Run Final Check and load its saved result. Confirm the £500 and £300 missing extras as drafts and price them. Ask the customer to approve both saved prices through their secure link in the customer portal; only saved customer responses count as approval.</p></li>
   <li><p>After the customer approves, issue one invoice for £34,400 before VAT / £41,280 including VAT. Check that the payment has arrived. These are expected figures; issuing an invoice does not mean it has been paid.</p></li>
   <li><p>Match the confirmed payments to the missing extras and check the fee calculation. Expect £800 recovered, a proposed fee of £80 and £720 for you before VAT and tax. This example calculation does not approve or charge a fee.</p></li>
   <li><p>The £3,200 of extras you logged plus £400 added at review total £3,600, with £0 recovery fee. Open the evidence pack and value report to check the records behind each figure.</p></li>
  </ol>
  <p><a href="/">Open Jobs and start the safe practice demo</a></p>
  <button disabled={busy} onClick={() => void start()} aria-label="Create or recover the J3 capture">Create or resume the £30,000 practice job</button>
  <form onSubmit={event => void load(event)}><label>Saved job reference<input value={jobId} disabled={busy} onChange={event => { setJobId(event.target.value); setReport(null); }}/></label>
   <button disabled={busy} type="submit" aria-label="Load saved J3 evidence">Load this job’s saved results</button></form>
  {jobId && z.string().uuid().safeParse(jobId).success && <p><a href={`/jobs/${jobId}`} aria-label="Continue this job through its real controls">Open this job to follow the steps</a> · <a href={`/jobs/${jobId}#final-account-title`}>Final account and lock</a> · <a href={`/jobs/${jobId}/shadow-journey`}>Return to the £30,000 practice guide</a></p>}
  {error && <p role="alert">{error}</p>}
  {report && <ShadowSavedReport report={report} />}
 </main>;
}
