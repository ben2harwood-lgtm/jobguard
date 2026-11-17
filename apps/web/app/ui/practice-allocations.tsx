"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { practiceAllocationResponseV1, type PracticeAllocationResponse } from "@jobguard/api/practice-allocation-contracts";
import { pounds } from "../lib/pounds";
import styles from "./practice-allocations.module.css";

function pence(text: string): number {
  if (!/^\d{1,10}(\.\d{1,2})?$/u.test(text)) throw new Error("Enter a positive pound amount with at most two decimal places.");
  const [whole, minor = ""] = text.split(".");
  const value = BigInt(whole!) * 100n + BigInt(minor.padEnd(2, "0"));
  if (value <= 0n || value > 1_000_000_000_000n) throw new Error("Enter a positive pound amount within the practice limit.");
  return Number(value);
}
const errors: Record<string, string> = {
  ALLOCATION_STALE_REVISION: "Another reviewer changed this recovery. Load the saved allocations before trying again.",
  PRACTICE_ALLOCATION_STALE_REVISION: "Another reviewer changed this recovery. Load the saved allocations before trying again.",
  ALLOCATION_OVERALLOCATED: "This amount exceeds the available cash or outstanding claim. Nothing was allocated.",
  ALLOCATION_TAX_BASIS_UNCERTAIN: "The exact net and reference VAT split is uncertain. This allocation is held.",
};

export function PracticeAllocations({ jobId }: { jobId: string }) {
  const [view, setView] = useState<PracticeAllocationResponse | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [invoiceId, setInvoiceId] = useState(""), [caseOne, setCaseOne] = useState(""), [caseTwo, setCaseTwo] = useState("");
  const [evidenceOne, setEvidenceOne] = useState(""), [evidenceTwo, setEvidenceTwo] = useState("");
  const [movementId, setMovementId] = useState(""), [representationId, setRepresentationId] = useState("");
  const [caseId, setCaseId] = useState(""), [evidenceId, setEvidenceId] = useState(""), [amount, setAmount] = useState("320.00");
  const [reversalAmount, setReversalAmount] = useState("2500.00");
  const generation = useRef(0), active = useRef<AbortController | null>(null), errorRef = useRef<HTMLDivElement>(null);
  const path = `/api/jobs/${encodeURIComponent(jobId)}/practice-allocation`;
  const load = useCallback(async () => {
    const current = ++generation.current;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(path, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("load");
      const snapshot = practiceAllocationResponseV1.parse(await response.json());
      if (current === generation.current) setView(snapshot);
    } catch { if (current === generation.current && !controller.signal.aborted) setError("Saved allocations could not load. Load the saved facts again."); }
    finally { if (current === generation.current) setBusy(false); }
  }, [path]);
  useEffect(() => { setView(null); void load(); return () => { generation.current++; active.current?.abort(); }; }, [load]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!view) return;
    setInvoiceId(old => old || view.invoices[0]?.id || "");
    setCaseOne(old => old || view.cases.find(item => item.claimedNetPence === 32000)?.id || "");
    setCaseTwo(old => old || view.cases.find(item => item.claimedNetPence === 250000)?.id || "");
    setEvidenceOne(old => old || view.evidence[0]?.id || ""); setEvidenceTwo(old => old || view.evidence[0]?.id || "");
    setMovementId(old => old || view.movements[0]?.id || "");
    setCaseId(old => old || view.cases.find(item => item.claimedNetPence === 32000)?.id || "");
    setEvidenceId(old => old || view.evidence[0]?.id || "");
  }, [view]);
  const movement = view?.movements.find(item => item.id === movementId);
  useEffect(() => { setRepresentationId(movement?.representations[0] ?? ""); }, [movement?.id, movement?.representations[0]]);

  async function act(command: Record<string, unknown>) {
    if (!view || busy) return;
    const current = ++generation.current; active.current?.abort(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "practice-allocation-command.v1", commandId: crypto.randomUUID(), expectedRevision: view.revision, ...command }) });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body ? String(body.code) : "UNKNOWN";
        throw new Error(errors[code] ?? `This recovery change was not recorded (${code}). Load the saved allocations before trying again.`);
      }
      const snapshot = practiceAllocationResponseV1.parse(body);
      if (current === generation.current) { setView(snapshot); setNotice("Saved in this simulation. The authoritative allocation history is shown below."); }
    } catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : "The result is unknown. Load the saved allocations before trying again."); }
    finally { if (current === generation.current) setBusy(false); }
  }
  function withAmount(command: Record<string, unknown>, value: string) {
    try { void act({ ...command, netPence: pence(value) }); } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the amount."); }
  }
  const caseOptions = view?.cases.map(item => <option key={item.id} value={item.id}>{pounds(item.claimedNetPence)} claim · {item.id.slice(0, 8)}</option>);
  const evidenceOptions = view?.evidence.map(item => <option key={item.id} value={item.id}>Verified original · {item.id.slice(0, 8)}</option>);
  return <section id="practice-allocations" className={styles.panel} aria-labelledby="practice-allocations-title" aria-busy={busy}>
    <p className="eyebrow">recovery-18800 · exact allocation review</p>
    <h2 id="practice-allocations-title">Allocate recovered money</h2>
    <p>Use the supplied fictional job, generated receipts and verified practice evidence. Do not enter real customer details.</p>
    <p>Reference D03 and reference VAT apply only to this simulation. A receipt is separate from an eligible recovery; uncertain attribution stays held.</p>
    {busy && <p role="status">{view ? "Saving or reading recovery facts…" : "Loading saved allocations…"}</p>}
    {error && <div ref={errorRef} role="alert" tabIndex={-1} className={styles.error}><p>{error}</p></div>}
    {notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={() => void load()}>Load saved allocations</button>
    {view && <>
      <dl className={styles.facts}>
        <div><dt>Gross recovery movements</dt><dd data-testid="recovery-gross-movements">{pounds(view.recoveryGrossMovementsPence)}</dd></div>
        <div><dt>Eligible recovered net</dt><dd data-testid="eligible-net">{pounds(view.eligibleNetPence)}</dd></div>
        <div><dt>Allocated reference VAT</dt><dd data-testid="allocated-tax">{pounds(view.allocatedTaxPence)}</dd></div>
        <div><dt>Customer invoice balance</dt><dd data-testid="customer-invoice-balance">{view.customerInvoiceBalancePence === null ? "No invoice selected" : pounds(view.customerInvoiceBalancePence)}</dd></div>
        <div><dt>Landing</dt><dd data-testid="allocation-landing">{view.landing}</dd></div>
        <div><dt>Fee execution</dt><dd data-testid="fee-execution-state">{view.feeExecutionState}</dd></div>
      </dl>
      {!view.prepared && <fieldset disabled={busy}>
        <legend>Prepare the supplied recovery sources</legend>
        <p>First issue the fictional £22,560 customer invoice, open and approve the £320 and £2,500 evidence-backed claims, finalize practice evidence, and settle £384 in Practice receipts. Then load the saved sources here.</p>
        <div className={styles.actions}>
          <label>Customer invoice<select value={invoiceId} onChange={event => setInvoiceId(event.target.value)}><option value="">Choose issued invoice</option>{view.invoices.map(item => <option key={item.id} value={item.id}>{item.number} · {pounds(item.totalPence)}</option>)}</select></label>
          <label>Claim 1 source<select value={caseOne} onChange={event => setCaseOne(event.target.value)}><option value="">Choose claim</option>{caseOptions}</select></label>
          <label>Claim 2 source<select value={caseTwo} onChange={event => setCaseTwo(event.target.value)}><option value="">Choose claim</option>{caseOptions}</select></label>
          <label>Claim 1 evidence<select value={evidenceOne} onChange={event => setEvidenceOne(event.target.value)}><option value="">Choose evidence</option>{evidenceOptions}</select></label>
          <label>Claim 2 evidence<select value={evidenceTwo} onChange={event => setEvidenceTwo(event.target.value)}><option value="">Choose evidence</option>{evidenceOptions}</select></label>
        </div>
        <button type="button" disabled={!invoiceId || !caseOne || !caseTwo || !evidenceOne || !evidenceTwo} onClick={() => void act({ action: "prepare", invoiceId, caseIds: [caseOne, caseTwo], evidenceIds: [evidenceOne, evidenceTwo] })}>Prepare generated allocation sources</button>
      </fieldset>}
      {view.prepared && <fieldset disabled={busy}>
        <legend>Review an exact allocation</legend>
        <p className={styles.muted}>Selections and amount are unsaved drafts until you approve. Approval binds this movement, claim, evidence, reference policy and reviewer.</p>
        <div className={styles.actions}>
          <label>Settled movement<select value={movementId} onChange={event => setMovementId(event.target.value)}>{view.movements.map(item => <option key={item.id} value={item.id}>{pounds(item.grossPence)} gross · {item.state} · {item.id.slice(0, 8)}</option>)}</select></label>
          <label>Source representation<select value={representationId} onChange={event => setRepresentationId(event.target.value)}>{movement?.representations.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
          <label>Allocation claim<select value={caseId} onChange={event => setCaseId(event.target.value)}>{caseOptions}</select></label>
          <label>Allocation evidence<select value={evidenceId} onChange={event => setEvidenceId(event.target.value)}>{evidenceOptions}</select></label>
          <label>Net to allocate (£)<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        </div>
        {movement && <p>Available gross <strong data-testid="available-allocation-gross">{pounds(movement.availableGrossPence)}</strong>. Original receipt {pounds(movement.grossPence)}; remaining settled cash {pounds(movement.remainingGrossPence)}.</p>}
        <button type="button" onClick={() => withAmount({ action: "approve", movementId, representationId, caseId, evidenceId }, amount)}>Approve exact allocation</button>
      </fieldset>}
      {view.allocations.length === 0 && <p>No recovered money has been allocated.</p>}
      {view.prepared && view.cases.map((item, index) => <p key={item.id}>Claim {index + 1}: <strong data-testid={`case-${index + 1}-state`}>{item.state}</strong> · outstanding {pounds(item.outstandingNetPence)}</p>)}
      {view.allocations.length > 0 && <>
        <label>Net cash to reverse (£)<input disabled={busy} inputMode="decimal" value={reversalAmount} onChange={event => setReversalAmount(event.target.value)} /></label>
        <p>Cash reversal reduces the receipt and reopens the corresponding customer balance. Evidence invalidation holds fee eligibility while keeping settled cash. A dispute records uncertainty separately.</p>
        <ul className={styles.history}>{view.allocations.map(item => <li key={item.id} aria-label={`Allocation ${pounds(item.netPence)}`}>
          <h3>{pounds(item.grossPence)} gross = {pounds(item.netPence)} net + {pounds(item.taxPence)} reference VAT</h3>
          <p>{item.eligible ? "Eligible — simulated" : "Held or reversed — not fee eligible"}; net reversed {pounds(item.reversedNetPence)}</p>
          <p>Policy {item.policyVersion} · reviewer {item.reviewerRef}</p>
          <div className={styles.actions}>
            <button type="button" disabled={busy || item.reversedNetPence >= item.netPence} onClick={() => withAmount({ action: "reverse", allocationId: item.id }, reversalAmount)}>Reverse cash for this allocation</button>
            <button type="button" disabled={busy || !item.eligible} onClick={() => void act({ action: "invalidate_evidence", allocationId: item.id })}>Invalidate only this evidence</button>
            <button type="button" disabled={busy || !item.eligible} onClick={() => void act({ action: "dispute", allocationId: item.id })}>Dispute this allocated cash</button>
          </div>
        </li>)}</ul>
      </>}
      <details className={styles.details} data-testid="allocation-sources"><summary>Allocation details and sources</summary>
        <p>Job <code data-testid="allocation-job-id">{view.jobId}</code></p>
        <p>Invoice <code data-testid="allocation-invoice-id">{view.invoiceId ?? "None"}</code></p>
        <p>Saved revision <strong data-testid="allocation-revision">{view.revision}</strong> · real external actions <strong data-testid="allocation-real-external-actions">{view.realExternalActions}</strong></p>
        {view.movements.map(item => <div key={item.id}><p>Movement <code data-testid="allocation-movement-id">{item.id}</code></p><p>Underlying cash <code data-testid="allocation-underlying-id">{item.underlyingMovementId}</code></p><p>Source hash <code data-testid="allocation-movement-hash">{item.sourceHash}</code></p></div>)}
        {view.allocations.map(item => <div key={item.id}><p>Allocation <code data-testid="allocation-id">{item.id}</code></p><p>Exact claim <code data-testid="allocation-case-id">{item.caseId}</code></p><p>Finalized evidence <code data-testid="allocation-evidence-id">{item.evidenceId}</code></p></div>)}
        {view.evidence.map(item => <p key={item.id}>Original version <code data-testid="allocation-evidence-version">{item.objectVersionId}</code> · SHA-256 <code data-testid="allocation-evidence-hash">{item.sha256}</code></p>)}
        <ul>{view.events.map(item => <li key={item.id}><span data-testid="allocation-event-kind">{item.kind}</span>: {pounds(item.grossPence)} gross / {pounds(item.netPence)} net / {pounds(item.taxPence)} VAT · <code data-testid="allocation-event-id">{item.id}</code> · linked allocation {item.allocationId}</li>)}</ul>
      </details>
    </>}
  </section>;
}
