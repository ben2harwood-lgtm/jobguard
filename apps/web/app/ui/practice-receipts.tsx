"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { practiceFeedResponseV1, type PracticeFeedResponse } from "@jobguard/api/practice-feed-contracts";
import type { PracticeFeedStep, PracticeMovementKey } from "@jobguard/core";
import { pounds } from "../lib/pounds";
import {
  advanceCommand, connectCommand, disconnectCommand, failureFromResponse, initialUi, matchReceiptCommand, movementStateLabels, mutationsPaused, nextUi,
  receiptHintLabels, receiptStatusLabels, reconcileCommand, stepLabels,
} from "./practice-receipts-state";
import styles from "./practice-receipts.module.css";

type Command = { commandId: string } & Record<string, unknown>;
const allocationNote = (movement: PracticeFeedResponse["movements"][number]) =>
  movement.state === "possible_duplicate" ? "Held — ineligible for allocation until reconciled"
    : movement.eligibleForAllocation ? "Ready for a separate allocation review — nothing allocated"
      : movement.state === "pending" ? "Cannot be allocated while pending" : "Held until its possible duplicate is reconciled";

export function PracticeReceipts({ jobId }: { jobId: string }) {
  const [view, setView] = useState<PracticeFeedResponse | null>(null);
  const [movement, setMovement] = useState<PracticeMovementKey>("receipt-384");
  const [step, setStep] = useState<PracticeFeedStep>("pending");
  const [busy, setBusy] = useState(true);
  const [ui, dispatch] = useReducer(nextUi, initialUi);
  const [notice, setNotice] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const path = `/api/jobs/${encodeURIComponent(jobId)}/practice-feed`;

  const load = useCallback(async () => {
    const current = ++generation.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); dispatch({ type: "load_started" });
    try {
      const response = await fetch(`${path}?limit=50`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("load");
      const snapshot = practiceFeedResponseV1.parse(await response.json());
      if (current === generation.current) { setView(snapshot); dispatch({ type: "load_ok" }); }
    } catch {
      if (current === generation.current && !controller.signal.aborted) dispatch({ type: "load_failed" });
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, [path]);

  useEffect(() => {
    setView(null); setNotice(""); void load();
    return () => { generation.current++; active.current?.abort(); };
  }, [load]);
  const failure = ui.failure;
  useEffect(() => { if (failure) alertRef.current?.focus(); }, [failure]);

  async function send(command: Command, done: string) {
    if (!view || mutationsPaused(ui, busy)) return;
    const current = ++generation.current;
    active.current?.abort();
    setBusy(true); dispatch({ type: "post_started" }); setNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      let body: unknown = null;
      try { body = await response.json(); } catch { /* an unreadable body is judged by its status below */ }
      if (current !== generation.current) return;
      if (!response.ok) {
        const failed = failureFromResponse(response.status, body);
        dispatch(failed.kind === "unknown" ? { type: "post_unknown" } : { type: "post_rejected", failure: failed });
        return;
      }
      setView(practiceFeedResponseV1.parse(body)); dispatch({ type: "post_ok" }); setNotice(done);
    } catch {
      // The request may or may not have been saved: pause further changes until the saved state has been read successfully.
      if (current === generation.current) dispatch({ type: "post_unknown" });
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  const connected = view?.feedState === "connected";
  const locked = mutationsPaused(ui, busy);
  const identified = view?.movements.filter((item) => item.state !== "possible_duplicate") ?? [];
  return <section id="practice-receipts" className={styles.panel} aria-labelledby="practice-receipts-title" aria-busy={busy}>
    <p className="eyebrow">Generated movement facts</p>
    <h2 id="practice-receipts-title">Practice receipts</h2>
    <p>Use only the supplied fictional job and generated movements. Do not enter real names, account details or invoices.</p>
    <p>This practice feed has no bank, provider, login or credential. A settled movement is a fact only: it never allocates money to a case.</p>
    <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={() => void load()}>Load saved practice receipts</button>
    </div>
    {busy && <p role="status">{view ? "Checking the saved practice feed…" : "Loading practice receipts…"}</p>}
    {failure && <div ref={alertRef} className={styles.error} role="alert" tabIndex={-1}><p>{failure.message}</p></div>}
    {notice && <p role="status">{notice}</p>}
    {view && <>
      <dl className={styles.facts}>
        <div><dt>Practice feed</dt><dd data-testid="practice-feed-state">{connected ? "Connected" : view.feedState === "disconnected" ? "Disconnected" : "Not connected"}</dd></div>
        <div><dt>Practice consent</dt><dd data-testid="practice-feed-consent">{!view.consent ? "Not given" : view.consent.revokedAtRevision === null ? "Read generated movements only" : "Revoked"}</dd></div>
        <div><dt>Underlying movements</dt><dd data-testid="underlying-movement-count">{identified.length}</dd></div>
        <div><dt>Allocated eligible net</dt><dd data-testid="allocated-eligible-net">{pounds(view.allocatedEligibleNetPence)}</dd></div>
        <div><dt>Real external actions</dt><dd data-testid="practice-feed-real-external-actions">{view.realExternalActions}</dd></div>
      </dl>
      {view.feedState === "not_connected" && <>
        <p>Connecting gives this practice sandbox consent to read generated movements only. It uses no provider and can be disconnected at any time.</p>
        <button type="button" disabled={locked} onClick={() => void send(connectCommand(view.revision), "Practice feed connected. Choose a generated movement and event to run.")}>Connect practice feed</button>
      </>}
      {connected && <>
        <div className={styles.actions}>
          <div className={styles.field}>
            <label htmlFor={`practice-movement-${jobId}`}>Generated movement</label>
            <select id={`practice-movement-${jobId}`} value={movement} disabled={locked} onChange={(event) => setMovement(event.target.value as PracticeMovementKey)}>
              {view.catalogue.map((entry) => <option key={entry.movement} value={entry.movement}>{entry.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor={`practice-step-${jobId}`}>Generated event</label>
            <select id={`practice-step-${jobId}`} value={step} disabled={locked} onChange={(event) => setStep(event.target.value as PracticeFeedStep)}>
              {stepLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <button type="button" disabled={locked} onClick={() => void send(advanceCommand(view.revision, movement, step), "Generated event recorded. The saved movement facts are shown below.")}>Advance practice executor</button>
        </div>
        <p className={styles.muted}>Your movement and event choices are an unsaved draft. Advancing runs the server&apos;s fixed generated event; you never enter an amount.</p>
      </>}
      {view.movements.length === 0 && <p>No practice movements recorded yet.</p>}
      {view.movements.map((item) => <article key={item.id} className={styles.movement} data-testid="practice-movement" data-movement-key={item.movementKey} data-movement-state={item.state} aria-label={`Generated movement ${item.label}`}>
        <h3>{item.kind === "supplier_refund" ? "Fictional supplier refund" : "Fictional customer receipt"}</h3>
        <p className={styles.muted}>{item.label}</p>
        <dl className={styles.facts}>
          <div><dt>Gross amount</dt><dd data-testid="movement-gross">{pounds(item.grossPence)}</dd></div>
          <div><dt>Movement state</dt><dd data-testid="movement-state">{movementStateLabels[item.state]}</dd></div>
          <div><dt>Allocated eligible net</dt><dd data-testid="movement-allocated-net">{pounds(item.allocatedEligibleNetPence)}</dd></div>
        </dl>
        <p data-testid="movement-allocation-note">{allocationNote(item)}</p>
        {item.state === "possible_duplicate" && <div className={styles.warning}>
          <p>These generated records may describe the same money. They stay ineligible until you reconcile them.</p>
          <button type="button" disabled={locked || !connected} onClick={() => void send(reconcileCommand(view.revision, item.movementKey), "Generated duplicate reconciled. No eligible net has been allocated.")}>Reconcile generated duplicate</button>
        </div>}
      </article>)}
      <h3>Builder-attested customer receipts</h3>
      {view.receipts.length === 0 && <p>No builder-attested receipts are recorded on this job yet. Record one under customer receipts, then load the saved practice receipts.</p>}
      {view.receipts.map((receipt) => <article key={receipt.paymentId} className={styles.movement} data-testid="attested-receipt" data-payment-id={receipt.paymentId} aria-label={`Builder-attested receipt ${pounds(receipt.amountPence)} paid ${receipt.paidOn}`}>
        <dl className={styles.facts}>
          <div><dt>Receipt amount</dt><dd data-testid="receipt-amount">{pounds(receipt.amountPence)}</dd></div>
          <div><dt>Paid on</dt><dd>{receipt.paidOn}</dd></div>
          <div><dt>Qualification</dt><dd data-testid="receipt-qualification">{receiptStatusLabels[receipt.assessment.status]}</dd></div>
        </dl>
        <p data-testid="receipt-hint">{receiptHintLabels[receipt.assessment.reason]}</p>
        {receipt.assessment.matchedMovementKey && <p>Matched movement <code data-testid="receipt-matched-movement">{receipt.assessment.matchedMovementKey}</code></p>}
        {receipt.assessment.status === "attested_only" && !receipt.assessment.matchedMovementKey && <button type="button" disabled={locked || !connected || !receipt.assessment.canMatch || !receipt.assessment.candidateMovementKey}
          onClick={() => void send(matchReceiptCommand(view.revision, receipt.assessment.candidateMovementKey!, receipt.paymentId), "Receipt matched to a simulated settled movement. Nothing has been allocated.")}>
          Match {pounds(receipt.amountPence)} receipt to its settled movement
        </button>}
      </article>)}
      {connected && <div className={styles.actions}><button type="button" disabled={locked} onClick={() => void send(disconnectCommand(view.revision), "Practice feed disconnected. Saved movement facts are kept.")}>Disconnect practice feed</button></div>}
      {view.feedState === "disconnected" && <p>New events and matches are stopped. Past movement facts and their source history remain available.</p>}
      <details className={styles.details} data-testid="practice-receipt-sources">
        <summary>Practice receipt details and sources</summary>
        <dl>
          <dt>Job identity</dt><dd><code data-testid="receipt-job-id">{view.jobId}</code></dd>
          <dt>Practice account identity</dt><dd><code data-testid="practice-account-id">{view.accountId ?? "No account yet"}</code></dd>
          <dt>Saved revision</dt><dd data-testid="practice-feed-revision">{view.revision}</dd>
          <dt>Source event count</dt><dd data-testid="practice-feed-event-count">{view.eventCount}</dd>
        </dl>
        {view.movements.map((item) => <div key={item.id}>
          <p>Movement identity <code data-testid="receipt-movement-id">{item.id}</code></p>
          <p>Underlying identity <code data-testid="receipt-underlying-id">{item.underlyingMovementId}</code> · saved state <code>{item.state}</code></p>
          <ul>{item.eventIds.map((id, index) => <li key={id}><code data-testid="receipt-event-id">{id}</code> <code data-testid="receipt-source-hash">{item.sourceHashes[index]}</code></li>)}</ul>
        </div>)}
      </details>
    </>}
  </section>;
}
