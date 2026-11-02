"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { recoveryCaseTermsHash, type SimulationFeeCollectionView, type SimulationMoneyReport, type SuccessFeeResult } from "@jobguard/core";
import { readSimulationFeeCollection } from "./simulation-fee-collection";
import { approveSuccessFee, moneyCheckFigures, moneyCheckLinkFrom, readReceiptLines, readRecoveryJourney, readSavedMoneyCheck, receiptLineCommand, recoveryJourneyMarkers, recoveryJourneySteps, recoveryJourneyUnavailable, reviewSuccessFee, runMoneyCheck, type MoneyCheckLink, type ReceiptLineReview, type RecoveryJourneySnapshot } from "../lib/recovery-journey";
import { pounds } from "../lib/pounds";

const target = { minHeight: 44 } as const;
const signedPounds = (pence: number) => `${pence < 0 ? "−" : ""}${pounds(Math.abs(pence))}`;
const termsErrors: Record<string, string> = { RECOVERY_TERMS_ALREADY_APPROVED: "These exact terms are already approved." };

function CaseTerms({ jobId, cases }: { jobId: string; cases: RecoveryJourneySnapshot["allocations"]["cases"] }) {
  const [notes, setNotes] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  async function approve(caseId: string) {
    setBusy(true);
    let note = "Terms could not be approved. Reload the case and try again.";
    try {
      const response = await fetch(`/api/jobs/${jobId}/recovery-cases/terms`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "recovery-case-terms-command.v1", action: "approve", commandId: crypto.randomUUID(), caseId, termsVersion: "synthetic_recovery_fee_terms.v1", feePolicyVersion: "reference_fee_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", termsHash: recoveryCaseTermsHash(caseId) }) });
      const body = await response.json() as { code?: string };
      note = response.ok ? "Exact terms approved for this case." : termsErrors[body.code ?? ""] ?? note;
    } catch { /* Outcome unknown: the note says to reload, and a repeat approval is refused. */ }
    setNotes(old => ({ ...old, [caseId]: note })); setBusy(false);
  }
  return <section id="journey-case-terms" aria-label="Case terms">
    <h2>Recovery terms for each case</h2>
    <p>Proposed 10% practice terms; recovered net only, principal only. Nothing is charged.</p>
    {cases.length === 0 ? <p>No recovery cases are open yet.</p> : <ul>{cases.map(source => <li key={source.caseId} data-case-id={source.caseId}>
      <button style={target} disabled={busy} onClick={() => void approve(source.caseId)}>Approve exact terms for the {pounds(source.claimedNetPence)} case</button>
      {notes[source.caseId] && <span role="status"> {notes[source.caseId]}</span>}
    </li>)}</ul>}
  </section>;
}

function ReceiptLines({ jobId, allocations, onChange }: { jobId: string; allocations: RecoveryJourneySnapshot["allocations"]; onChange: () => void }) {
  const [view, setView] = useState<Awaited<ReturnType<typeof readReceiptLines>> | null>(null), [review, setReview] = useState<ReceiptLineReview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { void readReceiptLines(jobId, fetch).then(setView).catch(() => setError("Receipt line splits could not be loaded.")); }, [jobId, allocations]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); setView(await readReceiptLines(jobId, fetch)); } catch { setError("The line split could not be saved. Read the saved journey again, then retry."); }
    setBusy(false);
  }
  const saved = (paymentId: string, direction: "receipt" | "reversal") => view?.rows.find(row => row.paymentId === paymentId && row.direction === direction);
  return <section id="journey-receipt-lines" aria-label="Receipt line splits">
    <h2>Invoice line split for each receipt</h2>
    <p>The server splits each saved receipt across the invoice&apos;s lines. Practice records only.</p>
    {!view ? null : allocations.receipts.length === 0 ? <p>No matched receipts yet.</p> : <ul>{allocations.receipts.map(receipt => {
      const original = saved(receipt.paymentId, "receipt"), reversal = saved(receipt.paymentId, "reversal"), caseAllocation = allocations.allocations.find(row => row.paymentId === receipt.paymentId);
      const source = allocations.reversalSources.find(row => row.allocationId === caseAllocation?.id && row.kind === "payment_reversal");
      return <li key={receipt.paymentId} data-receipt-lines={receipt.grossPence}>
        {pounds(receipt.grossPence)} receipt: <span data-testid="receipt-lines-state">{reversal ? "Split and reversal saved" : original ? "Split saved" : "Not split yet"}</span>
        {!original && !receipt.reversed && <button style={target} disabled={busy} onClick={() => void run(async () => setReview(await receiptLineCommand(jobId, { action: "review", paymentId: receipt.paymentId, expectedSourceRevision: view.revision }, fetch)))}>Review line split for {pounds(receipt.grossPence)}</button>}
        {original && receipt.reversed && !reversal && <button style={target} disabled={busy || !source} onClick={() => void run(async () => setReview(await receiptLineCommand(jobId, { action: "review_reverse", allocationRevisionId: original.allocationRevisionId, reversalSource: { kind: "payment_reversal", sourceId: source!.sourceId }, expectedSourceRevision: view.revision }, fetch)))}>Review line split reversal for {pounds(receipt.grossPence)}</button>}
      </li>;
    })}</ul>}
    {review && <button style={target} disabled={busy} onClick={() => void run(async () => { await receiptLineCommand(jobId, { action: review.action === "review" ? "approve" : "reverse", reviewId: review.reviewId, approvalHash: review.approvalHash, expectedSourceRevision: review.sourceRevision }, fetch); setReview(null); onChange(); })}>Approve this exact line split</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

// The demo-only fake rail. Settlement never happens on its own: the person chooses it, for one pending attempt on this job.
function FakeRail({ jobId, revision, onChange }: { jobId: string; revision: number; onChange: () => void }) {
  const [view, setView] = useState<SimulationFeeCollectionView | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const commands = useRef(new Map<string, string>()); // A retry re-sends the same command, so it can only have one effect.
  useEffect(() => { void readSimulationFeeCollection(jobId).then(setView).catch(() => setError("Fake payments could not be loaded.")); }, [jobId, revision]);
  async function settle(attemptId: string) {
    setBusy(true); setError("");
    try {
      const commandId = commands.current.get(attemptId) ?? crypto.randomUUID(); commands.current.set(attemptId, commandId);
      const response = await fetch(`/api/jobs/${jobId}/success-fees/collection/demo-settle`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "simulation-fee-demo-settle-command.v1", commandId, attemptId }) });
      await response.json();
      if (!response.ok) throw new Error("refused");
      setView(await readSimulationFeeCollection(jobId)); onChange();
    } catch { setError("That fake payment could not be settled. Read the saved journey again, then retry."); }
    setBusy(false);
  }
  const pending = view?.attempts.filter(attempt => attempt.state === "pending") ?? [];
  return <section id="journey-fake-rail" aria-label="Fake payment rail">
    <h2>Fake payment rail</h2>
    <p>Demo only. This stands in for the payment provider; no real money moves.</p>
    {pending.length === 0 ? <p>No fake payment is waiting.</p> : <ul>{pending.map(attempt => <li key={attempt.id}>
      <button style={target} disabled={busy} onClick={() => void settle(attempt.id)}>Settle fake {attempt.kind} of {pounds(attempt.amountPence)}</button>
    </li>)}</ul>}
    {view && <p>Settled: <span data-testid="journey-fee-settled">{pounds(view.settledPrincipal)}</span>. Refunded: <span data-testid="journey-fee-refunded">{pounds(view.refundedPrincipal)}</span>.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

function FeePosting({ jobId, onChange }: { jobId: string; onChange: () => void }) {
  const [review, setReview] = useState<SuccessFeeResult | null>(null), [posted, setPosted] = useState<SuccessFeeResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch { setError("The fee could not be reviewed or posted. Finish the saved allocation steps, then review it again."); }
    setBusy(false);
  }
  const statement = review?.statement;
  return <section id="journey-fee-posting" aria-label="Success fee posting">
    <h2>Success fee from saved allocations</h2>
    <p>Each review re-derives the cumulative fee from approved allocations. Practice ledger only; no money moves here.</p>
    <button style={target} disabled={busy} onClick={() => void run(async () => { setPosted(null); setReview(await reviewSuccessFee(jobId, fetch)); })}>Review success fee</button>
    {statement && <>
      <p>Cumulative fee: <strong data-testid="fee-review-cumulative">{pounds(statement.feePence)}</strong></p>
      <p>Change from what is posted: <strong data-testid="fee-review-delta">{signedPounds(statement.deltaPence)}</strong></p>
      <button style={target} disabled={busy} onClick={() => void run(async () => { const saved = await approveSuccessFee(jobId, review, fetch); setPosted(saved); setReview(null); onChange(); })}>Approve this exact fee posting</button>
    </>}
    {posted && <p role="status" data-testid="fee-posting-saved">Saved. Cumulative fee {pounds(posted.statement.feePence)}; change {signedPounds(posted.statement.deltaPence)}.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function RecoveryJourney({ jobId }: { jobId: string }) {
  const [snapshot, setSnapshot] = useState<RecoveryJourneySnapshot | null>(null);
  const [link, setLink] = useState<MoneyCheckLink | null>(null), [report, setReport] = useState<SimulationMoneyReport | null>(null);
  const [error, setError] = useState(false), [revision, refresh] = useState(0), [checking, setChecking] = useState(false), [checkError, setCheckError] = useState("");
  useEffect(() => {
    const controller = new AbortController(), saved = moneyCheckLinkFrom(location.search);
    // A re-read keeps the panels (and their command notes) on screen; a different job clears through `saved` below.
    setError(false); setCheckError(""); setLink(saved);
    void readRecoveryJourney(jobId, fetch, controller.signal).then(async value => {
      const run = saved ? await readSavedMoneyCheck(jobId, saved, fetch, controller.signal) : null;
      if (!controller.signal.aborted) { setSnapshot(value); setReport(run?.report ?? null); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [jobId, revision]);
  async function check() {
    setChecking(true); setCheckError("");
    try {
      const run = await runMoneyCheck(jobId, fetch), next = { runId: run.runId, sourceHash: run.sourceHash };
      history.replaceState(null, "", `?${new URLSearchParams({ run: next.runId, source: next.sourceHash })}`);
      setLink(next); setReport(run.report);
    } catch { setCheckError("Money check unavailable or sources changed. Complete the approved steps and run it again."); }
    setChecking(false);
  }
  // Clear on identity change before effects run, too.
  const saved = snapshot?.jobId === jobId ? snapshot : null;
  const figures = report ? moneyCheckFigures(report) : null;
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <Link href={`/jobs/${encodeURIComponent(jobId)}`}>Back to job</Link>
    <h1>recovery-18800 practice journey</h1>
    <p>Made-up data only. Follow this guide on a fresh job; returning here reads saved progress. Opening a step never completes it.</p>
    <p>To start again, <Link href="/">create another fresh capture from Jobs</Link>. The previous job and its history stay available.</p>
    {error ? <p role="alert">The saved journey could not load. No result is available.</p> : !saved ? <p role="status">Loading saved recovery sources…</p> : <>
      <p role="status" data-testid="recovery-journey-state">{report?.label ?? "Not finished yet — work through the steps, then run the money check."}</p>
      <ol>{recoveryJourneySteps(jobId).map(step => <li key={step.title} style={{ marginBottom: 16 }}>
        <a style={{ display: "inline-block", minHeight: 44 }} href={step.href}>{step.title}</a>
      </li>)}</ol>
      <CaseTerms jobId={jobId} cases={saved.allocations.cases} />
      <ReceiptLines jobId={jobId} allocations={saved.allocations} onChange={() => refresh(value => value + 1)} />
      <FeePosting jobId={jobId} onChange={() => refresh(value => value + 1)} />
      <FakeRail jobId={jobId} revision={revision} onChange={() => refresh(value => value + 1)} />
      <section aria-label="Saved recovery sources">
        <h2>Saved source report</h2>
        <p>Allocated eligible net: <strong data-testid="journey-eligible-net">{pounds(saved.allocations.eligibleNetPence)}</strong></p>
        <p>Customer invoice balance: <strong data-testid="journey-invoice-balance">{pounds(saved.allocations.invoiceBalancePence)}</strong></p>
        {saved.allocations.paused && <p>Recovery changed — fee execution is paused until the compensation is posted.</p>}
        <Link href={`/api/jobs/${jobId}/recovery-allocations`}>Inspect persisted allocations, evidence versions, receipt identities and reversals</Link>
        <ul>{saved.allocations.cases.map(source => <li key={source.caseId}>
          <Link href={`/api/recovery-cases/${source.caseId}/evidence-packs`}>Evidence pack sources for case {source.caseId}</Link>
        </li>)}</ul>
        <p><Link href={`/jobs/${jobId}/value`}>Customer invoice and receipt sources</Link></p>
        <p><a href={`/jobs/${jobId}#simulation-fee-statements`}>Fee statements, sources and approvals</a></p>
      </section>
      <section id="journey-money-check" aria-label="Journey outcomes">
        <h2>Journey outcomes</h2>
        <button style={target} disabled={checking} onClick={() => void check()}>Run money check</button>
        {checkError && <p role="alert">{checkError}</p>}
        <dl>{recoveryJourneyMarkers.map(([id, label]) => <div key={id}><dt>{label}</dt><dd data-testid={id}>{figures ? figures[id] : recoveryJourneyUnavailable}</dd></div>)}
          <div><dt>Real external actions</dt><dd data-testid="real-external-actions">{figures ? figures["real-external-actions"] : saved.allocations.realExternalActions}</dd></div>
        </dl>
        {report && link ? <>
          <p>These figures come from saved money check {link.runId}. Run it again after any later step.</p>
          <ul>{report.differences.map(difference => <li key={difference.differenceHash}>{difference.book}: {difference.code} — {difference.sourceRefs.join(", ")}</li>)}</ul>
        </> : <p>Figures appear only after a money check runs over your saved rows.</p>}
      </section>
    </>}
    <button style={target} onClick={() => refresh(value => value + 1)}>Read saved journey again</button>
  </main>;
}
