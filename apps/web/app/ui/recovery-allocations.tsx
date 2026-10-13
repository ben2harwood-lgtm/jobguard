"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parsePoundsToPence, type RecoveryAllocationCommand } from "@jobguard/core";
import { recoveryAllocationRefusalV1, recoveryAllocationViewV1, type RecoveryAllocationView } from "../../../api/src/recovery-allocation.contracts";
import { pounds } from "../lib/pounds";
import styles from "./recovery-allocations.module.css";
const messages: Readonly<Record<string, string>> = {
  ALLOCATION_EXCEEDS_AVAILABLE: "This amount exceeds the receipt's available settled money.", ALLOCATION_EXCEEDS_CLAIM: "This amount exceeds the case's outstanding claim.",
  ALLOCATION_EXCEEDS_EVIDENCE: "This amount exceeds the evidenced claim.", ALLOCATION_APPROVAL_CHANGED: "The reviewed facts changed. Load the saved allocations and review again.",
  ALLOCATION_REVISION_CONFLICT: "The case changed. Load the saved allocations and review again.", ALLOCATION_EVIDENCE_HELD: "The evidence is held. This allocation cannot be approved.",
  ALLOCATION_SOURCE_REQUIRED: "A matched settled movement and approved evidence are required.", ALLOCATION_REVERSAL_SOURCE_REQUIRED: "Record the receipt reversal, refund or credit before reviewing a reversal.",
};
export function RecoveryAllocations({ jobId }: { jobId: string }) {
  const [view, setView] = useState<RecoveryAllocationView | null>(null);
  const [reversalSources, setReversalSources] = useState<Record<string, string>>({});
  const [remittanceEvidenceId, setRemittanceEvidenceId] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [caseId, setCaseId] = useState(""); const [paymentId, setPaymentId] = useState(""); const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(true); const [error, setError] = useState(""); const [unknown, setUnknown] = useState(false);
  const [errorSequence, setErrorSequence] = useState(0);
  const report = (message: string) => { setError(message); setErrorSequence(value => value + 1); };
  const [review, setReview] = useState<RecoveryAllocationView["review"]>(null);
  const alert = useRef<HTMLParagraphElement>(null), generation = useRef(0), active = useRef<AbortController | null>(null);
  const path = `/api/jobs/${encodeURIComponent(jobId)}/recovery-allocations`;
  const load = useCallback(async () => {
    const current = ++generation.current; active.current?.abort(); const controller = new AbortController(); active.current = controller; setBusy(true); setReview(null);
    try { const response = await fetch(path, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error("load"); const saved = recoveryAllocationViewV1.parse(await response.json());
      if (current === generation.current) { setView(saved); setUnknown(false); setError(""); } }
    catch { if (current === generation.current && !controller.signal.aborted) { setUnknown(true); setError("Saved allocations could not load. Changes stay paused until they are read."); setErrorSequence(value => value + 1); } }
    finally { if (current === generation.current) setBusy(false); }
  }, [path]);
  useEffect(() => { setView(null); setReversalSources({}); setRemittanceEvidenceId(""); setEvidenceId(""); setCaseId(""); setPaymentId(""); setAmount(""); setUnknown(false); void load(); return () => { generation.current++; active.current?.abort(); }; }, [load]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error, errorSequence]);
  async function send(command: RecoveryAllocationCommand) {
    if (busy || unknown || !view) return;
    const current = ++generation.current; active.current?.abort(); setBusy(true); setError(""); setReview(null);
    try {
      const response = await fetch(command.action.includes("reverse") ? `${path}/reversals` : path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      const body: unknown = await response.json(); if (current !== generation.current) return;
      if (!response.ok) {
        const failure = recoveryAllocationRefusalV1.safeParse({ status: response.status, body });
        if (!failure.success) throw new Error("unknown");
        report(messages[failure.data.body.code] ?? `Allocation refused (${failure.data.body.code}). Load the saved allocations before reviewing again.`); return;
      }
      const saved = recoveryAllocationViewV1.parse(body); setView(saved); setReview(saved.review);
    } catch { if (current === generation.current) { setUnknown(true); report("The result is unknown. Read the saved allocations before doing anything else."); } }
    finally { if (current === generation.current) setBusy(false); }
  }
  function reviewAllocation() {
    const selected = view?.cases.find(item => item.caseId === caseId);
    if (!selected || !paymentId || !evidenceId) { report("Choose a case, a matched receipt and evidence on file."); return; }
    let grossPence: number; try { grossPence = parsePoundsToPence(amount); } catch { report("Enter a positive amount in pounds with at most two decimal places."); return; }
    if (grossPence <= 0) { report("Enter a positive amount in pounds."); return; }
    void send({ version: "recovery-allocation-command.v1", commandId: crypto.randomUUID(), action: "review", caseId, paymentId, evidenceId, ...(remittanceEvidenceId ? { remittanceEvidenceId } : {}), expectedCaseRevision: selected.revision, grossPence });
  }
  function reversalSource(allocationId: string) {
    const sources = view?.reversalSources.filter(source => source.allocationId === allocationId && source.availableGrossPence > 0) ?? [];
    return sources.find(source => `${source.kind}:${source.sourceId}` === reversalSources[allocationId]) ?? sources[0];
  }
  function reviewReversal(item: RecoveryAllocationView["allocations"][number]) {
    const selected = view?.cases.find(row => row.caseId === item.caseId), source = reversalSource(item.id);
    if (!selected || !source) { report(messages.ALLOCATION_REVERSAL_SOURCE_REQUIRED!); return; }
    const grossPence = Math.min(item.grossPence - item.reversedPence, source.availableGrossPence);
    if (grossPence <= 0) return;
    setReversalSources(current => ({ ...current, [item.id]: `${source.kind}:${source.sourceId}` }));
    void send({ version: "recovery-allocation-command.v1", commandId: crypto.randomUUID(), action: "review_reverse", allocationId: item.id,
      expectedCaseRevision: selected.revision, grossPence, ...(source.kind === "credit_note" ? { creditNoteId: source.sourceId } : {}) });
  }
  function approve() {
    if (!review) return;
    const common = { version: "recovery-allocation-command.v1" as const, commandId: crypto.randomUUID(), expectedCaseRevision: review.expectedCaseRevision, grossPence: review.grossPence, approvalHash: review.approvalHash };
    if (review.action === "reverse" && review.allocationId) {
      const source = reversalSource(review.allocationId);
      if (!source) { report(messages.ALLOCATION_REVERSAL_SOURCE_REQUIRED!); setReview(null); return; }
      void send({ ...common, action: "reverse", allocationId: review.allocationId, ...(source.kind === "credit_note" ? { creditNoteId: source.sourceId } : {}) });
    }
    else if (review.action === "allocate") void send({ ...common, action: "allocate", caseId: review.caseId, paymentId: review.paymentId, evidenceId, ...(remittanceEvidenceId ? { remittanceEvidenceId } : {}) });
  }
  const locked = busy || unknown || !view;
  return <section id="recovery-allocations" data-testid="recovery-allocation-workbench" className={styles.panel} aria-labelledby="recovery-allocation-title" aria-busy={busy}>
    <h2 id="recovery-allocation-title">Allocate practice receipts</h2>
    <p>Review generated settled money against a recovery case. Nothing is sent or charged.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>Load saved allocations</button>
    {error && <p ref={alert} role="alert" tabIndex={-1} data-testid="recovery-allocation-error" className={styles.error}>{error}</p>}
    {view && <>
      <dl className={styles.facts}>
        <div><dt>Recovery gross movements</dt><dd data-testid="recovery-gross-movements">{pounds(view.grossMovementsPence)}</dd></div>
        <div><dt>Eligible net</dt><dd data-testid="eligible-net">{pounds(view.eligibleNetPence)}</dd></div>
        <div><dt>Allocated tax</dt><dd data-testid="allocated-tax">{pounds(view.allocatedTaxPence)}</dd></div>
        <div><dt>Customer invoice balance</dt><dd data-testid="customer-invoice-balance">{pounds(view.invoiceBalancePence)}</dd></div>
      </dl>
      {view.paused && <p data-testid="fee-execution-state">Paused — recovery changed</p>}
      <fieldset disabled={locked} className={styles.form}><legend>Review allocation</legend>
        <label>Recovery case<select value={caseId} onChange={event => { setCaseId(event.target.value); setReview(null); }}><option value="">Choose a case</option>{view.cases.map(item => <option key={item.caseId} value={item.caseId}>{pounds(item.claimedNetPence)} claim · {item.caseType}</option>)}</select></label>
        <label>Matched receipt<select value={paymentId} onChange={event => { setPaymentId(event.target.value); setReview(null); }}><option value="">Choose a receipt</option>{view.receipts.filter(item => !item.reversed).map(item => <option key={item.paymentId} value={item.paymentId}>{pounds(item.grossPence)} receipt · {pounds(item.availablePence)} available</option>)}</select></label>
        <label>Recovery evidence on file<select value={evidenceId} onChange={event => { setEvidenceId(event.target.value); setReview(null); }}><option value="">Choose evidence on file</option>{view.availableEvidence.map(item => <option key={item.evidenceId} value={item.evidenceId}>{item.label}</option>)}</select></label>
        <label>Remittance evidence (optional)<select value={remittanceEvidenceId} onChange={event => { setRemittanceEvidenceId(event.target.value); setReview(null); }}><option value="">No explicit remittance selected</option>{view.availableEvidence.map(item => <option key={item.evidenceId} value={item.evidenceId}>{item.label}</option>)}</select></label>
        <label>Allocation gross (£)<input inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); setReview(null); }} /></label>
        <button type="button" onClick={reviewAllocation}>Review receipt allocation</button>
      </fieldset>
      {review && <section aria-label="Exact allocation review"><h3>{review.action === "reverse" ? "Reversal review" : "Allocation review"}</h3><p data-testid="allocation-review-split">{pounds(review.grossPence)} = {pounds(review.eligibleNetPence)} net + {pounds(review.taxPence)} tax</p><p>Policy {review.policyVersion}</p><button type="button" disabled={locked} onClick={approve}>{review.action === "reverse" ? "Approve exact allocation reversal" : "Approve exact receipt allocation"}</button></section>}
      {view.cases.map((item, index) => <p key={item.caseId} data-testid={`case-${index + 1}-state`}>{item.outstandingNetPence > 0 && view.allocations.some(row => row.caseId === item.caseId && row.reversedPence > 0) ? `Reopened — ${pounds(item.outstandingNetPence)} outstanding` : `${item.state} — ${pounds(item.outstandingNetPence)} outstanding`}</p>)}
      {view.allocations.map(item => <article key={item.id} data-testid="recovery-allocation" data-allocation-id={item.id}>
        <p>{pounds(item.grossPence)} allocated · {pounds(item.eligibleNetPence)} net · {pounds(item.taxPence)} tax</p>
        {item.held && <p data-testid="allocation-held">Held — evidence invalidated</p>}
        <details><summary>Allocation evidence</summary><p>Movement <code>{item.movementId}</code> · source hash <code>{item.movementHash}</code></p><p>Evidence <code>{item.evidenceId}</code> · version <code>{item.objectVersionId}</code> · SHA-256 <code>{item.evidenceHash}</code></p><p>Policy {item.policyVersion} · reviewer {item.reviewerRef} · authorization <code>{item.authorizationId}</code></p></details>
        {view.reversalSources.some(source => source.allocationId === item.id && source.availableGrossPence > 0) && <label>Recorded reversal source<select disabled={locked} value={reversalSource(item.id) ? `${reversalSource(item.id)!.kind}:${reversalSource(item.id)!.sourceId}` : ""} onChange={event => { const selectedSource = event.target.value; setReversalSources(current => ({ ...current, [item.id]: selectedSource })); setReview(null); }}>{view.reversalSources.filter(source => source.allocationId === item.id && source.availableGrossPence > 0).map(source => <option key={`${source.kind}:${source.sourceId}`} value={`${source.kind}:${source.sourceId}`}>{source.kind === "credit_note" ? "Credit note" : "Payment reversal"} · {source.sourceId} · {pounds(source.availableGrossPence)} available</option>)}</select></label>}
        <button type="button" disabled={locked || item.reversedPence >= item.grossPence || !reversalSource(item.id)} onClick={() => reviewReversal(item)}>Review allocation reversal</button>
      </article>)}
      <details><summary>Exact line allocations</summary>{view.lines.map(item => <p key={item.id} data-testid="exact-line-allocation">{item.lineId} · {item.rule} · gross {item.gross.numerator}/{item.gross.denominator} pence · net {item.net.numerator}/{item.net.denominator} pence · source {item.sourceRef}{item.reversesId && ` · reverses ${item.reversesId}`}</p>)}</details>
    </>}
  </section>;
}
