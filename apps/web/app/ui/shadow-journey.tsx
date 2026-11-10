"use client";
import { jobPageFetch as fetch } from "./job-page-fetch";
import { useCallback, useEffect, useState } from "react";

const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const TENANT = "/api/session";
type Json = any; // Each route's own contract validates it; this guide only passes saved identities back.
type CaseReview = { reviewId: string; approvalHash: string } | "allocated";
type Assessed = { assessment: { assessmentId: string; revision: number; sourceHash: string } };

async function read(path: string): Promise<Json | null> {
 const response = await fetch(path, { cache: "no-store" });
 return response.ok ? response.json() : null;
}
async function send(path: string, body: unknown): Promise<Json> {
 const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
 const saved = await response.json().catch(() => null);
 if (!response.ok) throw new Error(String(saved?.code ?? "REFUSED"));
 return saved;
}
const messages: Readonly<Record<string, string>> = {
 CUSTOMER_LINK_RATE_LIMITED: "A link was issued in the last minute. Wait a minute and try again.",
 DEMO_SOURCE_HOLD_TERMS_REQUIRED: "Accept the final check terms on the job first.",
 DEMO_SOURCE_HOLD_LOCKED: "The final account is locked, so the final check examines these sources instead.",
};

/** Practice guide for shadow-30000: controls for the steps with no other screen. Every figure and state is read back from saved records. */
export function ShadowJourney({ jobId }: { jobId: string }) {
 const base = `/api/jobs/${jobId}`;
 const [data, setData] = useState<Record<string, Json | null>>({});
 const [busy, setBusy] = useState(false), [error, setError] = useState("");
 const [link, setLink] = useState(""), [lineReview, setLineReview] = useState<{ reviewId: string; approvalHash: string; sourceRevision: number } | null>(null);
 const [evaluated, setEvaluated] = useState(false);
 const [paymentId, setPaymentId] = useState(""), [caseReviews, setCaseReviews] = useState<Record<string, CaseReview>>({}), [assessed, setAssessed] = useState<Record<string, Assessed>>({}), [reviewed, setReviewed] = useState<Record<string, boolean>>({});

 const load = useCallback(async () => {
  const [session, proof, parties, account, lockView, invoices, lines, cases, variations, hold, inputs] = await Promise.all([read(TENANT), read(`${base}/proof`), read(`${base}/parties`), read(`${base}/final-account`), read(`${base}/final-account/lock`), read(`${base}/customer-invoices`), read(`${base}/receipt-case-allocations`), read(`${base}/recovery-cases`), read(`${base}/variations`), read(`${base}/shadow-demo/source-hold`), read(`${base}/shadow-demo/review-inputs`)]);
  const invoice = invoices?.invoices?.[0];
  const receipts = invoice ? await read(`${base}/customer-invoices/${invoice.id}/receipts`) : null;
  setPaymentId(receipts?.receipts?.[0]?.id ?? "");
  setData({ session, proof, parties, account, lockView, invoices, lines, cases, variations, hold, inputs });
 }, [base]);
 useEffect(() => { void load().catch(() => setError("The saved job could not load. Try again.")); }, [load]);
 // The worker runs about once a minute; keep reading until it says it has finished.
 useEffect(() => {
  if (data.hold?.state !== "requested") return;
  const timer = setInterval(() => void load().catch(() => undefined), 5000);
  return () => clearInterval(timer);
 }, [data.hold?.state, load]);
 async function act(work: () => Promise<void>) {
  setBusy(true); setError("");
  try { await work(); await load(); }
  catch (failure) { setError(messages[(failure as Error).message] ?? "This step was refused and nothing changed. Read the saved job and try again."); }
  finally { setBusy(false); }
 }
 const tenantId: string | undefined = data.session?.tenants?.[0]?.id;
 const proofCommand = (body: Record<string, unknown>) => send(`${base}/proof`, { version: "practice-proof-command.v1", commandId: crypto.randomUUID(), ...body });
 const upload = data.proof?.upload, proofDone = !!data.proof?.completion;
 const account = data.account?.account, lock = data.lockView?.lock;
 const customerId: string | undefined = data.parties?.currentIds?.customerId;
 const invoice = data.invoices?.invoices?.[0];
 const rows: Json[] = data.lines?.rows ?? [];
 const catches: Json[] = (data.cases?.cases ?? []).filter((row: Json) => row.caseType === "missed_variation_final_account");
 const allocation = (target: "receipt_lines" | "case", command: unknown) => send(`${base}/receipt-case-allocations`, { version: "receipt-case-allocation-command.v1", target, command });
 const lineFor = (row: Json) => {
  const variationId = row.sourceRefs.find((ref: string) => ref.startsWith("variation:"))?.slice(10);
  const variation = data.variations?.variations?.find((item: Json) => item.id === variationId);
  return rows.find(line => line.commercialRevisionId === variation?.currentRevisionId);
 };
 const inputFor = (caseId: string) => data.inputs?.cases?.find((row: Json) => row.caseId === caseId);

 return <main className="workspace-page"><a href={`/demo-s/shadow-30000?${new URLSearchParams({ jobId })}`}>← Final Check £30,000 guide</a> · <a href={`/jobs/${jobId}`}>Open the job</a>
  <h1>Shadow-30000 practice guide</h1>
  <p>Practice sandbox — made-up data; nothing is sent or charged. These controls cover the steps with no job screen.</p>
  {error && <p role="alert">{error}</p>}

  <section aria-label="Completion proof"><h2>Proof of the finished work</h2>
   <p data-testid="guide-proof-state">{proofDone ? "Proof complete" : upload ? (upload.state === "verified" ? "Photo checked" : "Photo attached") : evaluated ? "Proof required" : "Not checked yet"}</p>
   <button disabled={busy || !tenantId || evaluated || !!upload} onClick={() => void act(async () => { await send("/api/decisions", { version: "finding-evaluation-command.v1", commandId: crypto.randomUUID(), tenantId, jobId }); setEvaluated(true); })}>Check what proof this job needs</button>
   <button disabled={busy || !evaluated || !data.proof || !!upload} onClick={() => void act(async () => { await proofCommand({ action: "select_generated", scopeItemId: data.proof.scopeItemId, fixture: "j3-drainage-photo" }); })}>Attach the generated drainage photo</button>
   <button disabled={busy || upload?.state !== "pending"} onClick={() => void act(async () => { await proofCommand({ action: "finalize", uploadId: upload.id, objectVersionId: upload.objectVersionId }); })}>Check file integrity</button>
   <button disabled={busy || upload?.state !== "verified" || proofDone} onClick={() => void act(async () => { await proofCommand({ action: "complete", evidenceId: upload.evidenceId, scopeItemId: data.proof.scopeItemId }); })}>Record proof complete</button>
  </section>

  <section aria-label="Hold signals"><h2>Hold signals from saved sources</h2>
   <p>After the supplier document, photo and diary note are saved and the final check terms accepted. The answer never says what was found. Ordinary findings stay hidden until lock; a must-surface rule creates a mandatory Decision straight away.</p>
   <p role="status" data-testid="guide-hold-state">{data.hold?.state === "finished" ? "Saved sources examined" : data.hold?.state === "requested" ? "Asked for. It takes about a minute." : "Not asked for yet"}</p>
   <button disabled={busy || !!lock || data.hold?.state === "requested"} onClick={() => void act(async () => { await send(`${base}/shadow-demo/source-hold`, {}); })}>Hold signals from saved sources</button>
  </section>

  <section aria-label="Customer approval link"><h2>Ask the customer to approve the extras</h2>
   <p>Delivery is simulated: the link is shown here instead of being sent. Open it as the customer, in a private window.</p>
   <button disabled={busy || !customerId || !lock} onClick={() => void act(async () => { setLink((await send(`${base}/shadow-demo/customer-link`, { version: "shadow-guide-customer-link.v1", customerId })).path); })}>Issue customer link</button>
   {link && <p><a data-testid="guide-customer-link" href={link} target="_blank" rel="noreferrer">Open the customer's practice link</a></p>}
  </section>

  <section aria-label="Combined invoice"><h2>Issue the one invoice</h2>
   <p>After the customer approves, rebuild the bill so it holds the approved extras, then issue it.</p>
   <p data-testid="guide-bill">{account ? `${pounds(account.totals.net.pence)} net / ${pounds(account.totals.total.pence)} gross` : "No bill yet"}</p>
   <button disabled={busy || !account || !!invoice} onClick={() => void act(async () => { await send(`${base}/final-account`, { version: "final-account.assemble.v1", commandId: crypto.randomUUID(), expectedRevision: account.revision }); })}>Rebuild the bill</button>
   <button disabled={busy || !account || !lock || account.id === lock.finalAccountRevisionId || !!invoice} onClick={() => void act(async () => { await send(`${base}/final-account/lock`, { version: "lock-bound-invoice.issue.v1", commandId: crypto.randomUUID(), invoiceKind: "final", finalAccountRevisionId: account.id, expectedSourceHash: account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: new Date().toISOString().slice(0, 10) }); })}>Issue this one invoice</button>
   {invoice && <p data-testid="guide-invoice">{invoice.number}: {pounds(invoice.netPence)} net / {pounds(invoice.totalPence)} gross · balance {pounds(invoice.balancePence)}</p>}
  </section>

  <section aria-label="Receipt line split"><h2>Split the settled receipt across the bill</h2>
   <p>After the receipt is recorded and matched to its settled movement on the job. No amounts are typed: the saved invoice decides the split.</p>
   <p role="status" data-testid="guide-lines-state">{rows.length > 0 ? "Line split saved" : lineReview ? "Review ready to approve" : "Not reviewed yet"}</p>
   <button disabled={busy || !paymentId || rows.length > 0 || !!lineReview} onClick={() => void act(async () => {
    const review = await allocation("receipt_lines", { version: "receipt-line-facts-command.v1", action: "review", commandId: crypto.randomUUID(), paymentId, expectedSourceRevision: data.lines.revision });
    setLineReview({ reviewId: review.reviewId, approvalHash: review.approvalHash, sourceRevision: review.sourceRevision });
   })}>Review the line split</button>
   <button disabled={busy || !lineReview} onClick={() => void act(async () => {
    await allocation("receipt_lines", { version: "receipt-line-facts-command.v1", action: "approve", commandId: crypto.randomUUID(), reviewId: lineReview!.reviewId, approvalHash: lineReview!.approvalHash, expectedSourceRevision: lineReview!.sourceRevision });
    setLineReview(null);
   })}>Approve this exact line split</button>
  </section>

  <section aria-label="Found extras review"><h2>Allocate and review each found extra</h2>
   {catches.length === 0 && <p>No found extra has a case yet.</p>}
   {catches.map(row => {
    const line = lineFor(row), input = inputFor(row.id), review = caseReviews[row.id], saved = assessed[row.id];
    const name = pounds(row.claimedNetPence);
    const command = () => ({ version: "stored-receipt-case-command.v1", commandId: crypto.randomUUID(), factLineId: line.lineAllocationId, caseId: row.id, workId: input.workId, expectedCaseRevision: row.revision });
    const attribution = () => ({ version: "recovery-attribution-command.v1", commandId: crypto.randomUUID(), caseId: row.id, workId: input.workId, lineId: line.lineId, lockId: lock.id, expectedCaseRevision: row.revision });
    return <article key={row.id} data-case-id={row.id} aria-label={`Found extra ${name}`}><h3>{row.description ?? "Found extra"} · {name}</h3>
     <p role="status" data-testid="guide-case-state">{reviewed[row.id] ? "Assessment review recorded" : saved ? `Assessed: ${name} remains` : review === "allocated" ? "Allocated" : review ? "Allocation ready to approve" : "Not allocated"}</p>
     <button disabled={busy || !line || !input || !!review} onClick={() => void act(async () => { const result = await allocation("case", { ...command(), action: "review" }); setCaseReviews(all => ({ ...all, [row.id]: { reviewId: result.reviewId, approvalHash: result.approvalHash } })); })}>Review allocation of {name}</button>
     <button disabled={busy || !review || review === "allocated"} onClick={() => void act(async () => { const r = review as Exclude<CaseReview, "allocated">; await allocation("case", { ...command(), action: "approve", reviewId: r.reviewId, approvalHash: r.approvalHash }); setCaseReviews(all => ({ ...all, [row.id]: "allocated" })); })}>Approve allocation of {name}</button>
     <button disabled={busy || review !== "allocated" || !!saved} onClick={() => void act(async () => { const result = await send(`${base}/success-fee-attribution`, { ...attribution(), action: "assess", expectedAttributionRevision: 0 }); setAssessed(all => ({ ...all, [row.id]: result })); })}>Assess {name}</button>
     <button disabled={busy || !saved || !!reviewed[row.id] || input?.assessmentId !== saved?.assessment.assessmentId} onClick={() => void act(async () => { await send(`${base}/success-fee-attribution`, { ...attribution(), action: "approve_review", expectedAttributionRevision: saved!.assessment.revision, assessmentId: saved!.assessment.assessmentId, expectedSourceHash: saved!.assessment.sourceHash, reviewArtifactHash: input.reviewArtifactHash }); setReviewed(all => ({ ...all, [row.id]: true })); })}>Approve assessment review of {name}</button>
    </article>;
   })}
  </section>
  <p><a href={`/demo-s/shadow-30000?${new URLSearchParams({ jobId })}`}>Back to the saved report</a></p>
 </main>;
}
