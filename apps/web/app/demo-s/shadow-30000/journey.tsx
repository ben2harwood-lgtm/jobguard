"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { practiceFeedResponseV1, type PracticeFeedResponse } from "@jobguard/api/practice-feed-contracts";
import { MappedReceipt } from "../../ui/mapped-value-receipt";
import { z } from "zod";
import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { sessionResponseV1 } from "../../lib/contracts";
import { demoLink } from "../chooser-state";
import { parseShadowReport, shadowCaptureText, shadowSteps, type ShadowReport } from "./journey-model";
const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export function SavedMatchedReceipts({ jobId, invoiceId, feed }: { jobId: string; invoiceId: string; feed: PracticeFeedResponse | null }) {
 const receipts = feed?.jobId === jobId ? feed.receipts.filter(receipt => receipt.invoiceId === invoiceId) : [];
 return <section aria-label="Saved invoice receipts">{!feed ? <p>Matched receipt evidence unavailable.</p> : receipts.length === 0 ? <p>No saved receipt for this invoice.</p> : <ul>{receipts.map(receipt => <li key={receipt.paymentId}>
  Receipt {receipt.paymentId} · {receipt.reference} · {pounds(receipt.amountPence)} · {receipt.paidOn} · {receipt.reversed ? "Reversed" : receipt.assessment.reason === "matched" && receipt.assessment.status === "qualifies" ? `Matched settled practice movement ${receipt.assessment.matchedMovementKey}` : "Settlement not verified"}
 </li>)}</ul>}</section>;
}
function InvoiceReceipts({ jobId, invoiceId }: { jobId: string; invoiceId: string }) {
 const [feed, setFeed] = useState<PracticeFeedResponse | null>(null);
 useEffect(() => {
  const abort = new AbortController(); setFeed(null);
  void fetch(`/api/jobs/${jobId}/practice-feed?limit=50`, { cache: "no-store", signal: abort.signal }).then(async response => {
   if (!response.ok) throw new Error();
   const parsed = practiceFeedResponseV1.parse(await response.json());
   if (parsed.jobId === jobId && !abort.signal.aborted) setFeed(parsed);
  }).catch(() => { /* Unavailable evidence remains unavailable. */ });
  return () => abort.abort();
 }, [jobId]);
 return <SavedMatchedReceipts jobId={jobId} invoiceId={invoiceId} feed={feed} />;
}
export function ShadowSavedReport({ report }: { report: ShadowReport }) {
 const view = report.account, account = view.account;
 return <section aria-label="Saved shadow journey report" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
  <h2>Saved job evidence</h2><p>Practice evidence only. No fee is charged.</p>
  <h3>Customer approval of the catches</h3>
  <p>{report.customerApproval.state === "approved" ? "Customer approval recorded." : report.customerApproval.state === "awaiting_customer" ? "Awaiting customer approval." : "Customer approval is not ready yet (MON-5)."}</p>
  <ul>{report.customerApproval.approvals.map(approval => <li key={approval.variationId}>Extra {approval.variationId} · approved {approval.approvedAt} · customer portal</li>)}</ul>
  <p><a href={`/jobs/${report.jobId}`}>Open the same saved job</a></p>
  <dl><dt>Final account</dt><dd>{account ? `${pounds(account.totals.net.pence)} net · revision ${account.revision}` : "Not built yet"}</dd>
   <dt>Lock</dt><dd>{view.lock ? `${view.lock.id} · ${view.lock.lockedAt}` : "Not locked"}</dd>
   <dt>Real external actions</dt><dd>{report.realExternalActions}</dd></dl>
  <h3>Your capture register — fee-free in every state</h3>
  <ul>{view.captures.map(capture => <li key={capture.id}>{capture.description} · {capture.netPence === null ? "Unpriced" : pounds(capture.netPence)} · {capture.state} · recovery fee £0</li>)}</ul>
  {report.finalCheck && <section><h3>Saved Final Check</h3><p>{report.finalCheck.state}</p>
   <ul>{report.finalCheck.items.map(item => <li key={item.signalId}>{item.description} · {item.disposition ?? "Awaiting your answer"}</li>)}</ul>
   <a href={`/jobs/${report.jobId}#final-check`}>Open the saved reveal and confirm extra work</a></section>}
  <h3>Saved invoices</h3>
  {report.invoices.invoices.length === 0 ? <p>No invoice issued.</p> : <ul>{report.invoices.invoices.map(invoice => <li key={invoice.id}>
   <a href={`/api/jobs/${report.jobId}/customer-invoices/${invoice.id}`}>{invoice.number}</a> · {pounds(invoice.netPence)} net / {pounds(invoice.totalPence)} gross · balance {pounds(invoice.balancePence)}
   <InvoiceReceipts jobId={report.jobId} invoiceId={invoice.id} />
   <p>A recorded receipt or zero balance alone is not verified qualifying settlement.</p></li>)}</ul>}
  {report.assessments && <section><h3>SV-6 historical assessments</h3><p>Latest saved revision per catch and line. Unreviewed; not current qualification or a fee posting. Reversals require a new assessment.</p>
   <ul>{report.assessments.map(({ assessment: a, illustrationAsAssessed: illustration }) => <li key={a.assessmentId}>Revision {a.revision} · {a.assessmentOutcome} · illustration as assessed: recovered {illustration.display.recovered ?? "Exact fraction; inspect source"}, proposed fee {illustration.display.fee}, yours {illustration.display.yoursBeforeVatAndTax ?? "Exact fraction; inspect source"} before VAT and tax
    <a href={`/api/jobs/${report.jobId}/success-fee-attribution`}> Inspect saved source manifest {a.assessmentId}</a></li>)}</ul></section>}
  <section><h3>CH-8 lock and reveal evidence packs</h3>
   {report.packs?.length ? <ul>{report.packs.map(pack => <li key={pack.caseId}><a href={`/demo-s/shadow-30000?jobId=${report.jobId}&screen=pack&caseId=${pack.caseId}`}>Open CH-8 v3 pack screen for case {pack.caseId}</a></li>)}</ul> : <p>No saved case pack evidence available yet.</p>}
  </section>
  <section><h3>CH-9 mapped value receipt</h3>
   {report.value.status === "mapped" ? <MappedReceipt receipt={report.value.receipt} /> : <p>Value receipt incomplete; producer bindings held. No mapped figures available.</p>}
  </section>
  <p>Illustration — proposed policy; principal only</p>
  <p><a href={`/demo-s/shadow-30000?jobId=${report.jobId}&screen=payment-fees`}>Open MON-4A payment-fees screen</a></p>
  <p>Independent verdict: missing. Non-technical builder observations: 0 of 2 recorded here.</p>
  <p><a href={`/api/jobs/${report.jobId}/shadow-demo`}>Inspect this report's persisted source references</a></p>
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
   if (!response.ok) throw new Error("The capture could not be confirmed. Retry to recover the same request.");
   const capture = captureWorkspaceResponseV1.parse(await response.json());
   setJobId(capture.jobId);
   history.replaceState(null, "", `?${new URLSearchParams({ jobId: capture.jobId })}`);
  } catch (reason) { setError((reason as Error).message); }
  finally { active.current = false; setBusy(false); }
 }
 return <main className="workspace-page"><a href={chooserLink}>← Practice chooser</a><h1>Final Check £30,000 journey</h1>
  <p>Practice sandbox — made-up data; nothing is sent or charged. Targets below describe the journey; saved evidence is shown separately.</p>
  <ol>{shadowSteps.map(step => <li key={step}><p>{step}</p></li>)}</ol>
  <p><a href="/">Open Jobs and start the safe practice demo</a></p>
  <button disabled={busy} onClick={() => void start()}>Create or recover the J3 capture</button>
  <form onSubmit={event => void load(event)}><label>Saved job reference<input style={{ boxSizing: "border-box", maxWidth: "100%", minWidth: 0 }} value={jobId} disabled={busy} onChange={event => { setJobId(event.target.value); setReport(null); }}/></label>
   <button disabled={busy} type="submit">Load saved J3 evidence</button></form>
  {jobId && z.string().uuid().safeParse(jobId).success && <p><a href={`/jobs/${jobId}`}>Continue this job through its real controls</a> · <a href={`/jobs/${jobId}#final-account-title`}>Final account and lock</a></p>}
  {error && <p role="alert">{error}</p>}
  {report && <ShadowSavedReport report={report} />}
 </main>;
}
