"use client";
import React, { useEffect, useRef, useState, type FormEvent } from "react";
import type { RetentionBook, RetentionRecord, reconcileRetentionBook } from "@jobguard/core";

type View = { book: RetentionBook; reconciliation: ReturnType<typeof reconcileRetentionBook> };
type Source = Extract<RetentionRecord, { version: "retention.profile.v1" }>["conditions"][number]["source"];
const sourceText = (source: Source) => source.kind === "contract_profile"
  ? `Contract ${source.profileVersion}, clause ${source.clause}` : `Person ${source.actorId}, input ${source.inputId}`;
const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const target = { minHeight: 44, minWidth: 44, maxWidth: "100%", color: "#17201c", backgroundColor: "#ffffff", opacity: 1 };
async function sessionHeaders() {
  const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Sign in with an authorised company session.");
  const session = await response.json() as { csrfToken: string };
  return { "x-csrf-token": session.csrfToken, "Content-Type": "application/json" };
}
export function RetentionRecordScreen({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  // Retain the exact envelope after a lost response. A retry never mints a new ID.
  const pending = useRef<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const path = `/api/jobs/${encodeURIComponent(jobId)}/retention-records`;
  async function load() {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin", headers: await sessionHeaders() });
    if (!response.ok) throw new Error(response.status === 403 ? "You don't have permission."
      : response.status === 401 ? "Sign in with an authorised company session." : "Retention records unavailable. Sign in and refresh.");
    return await response.json() as View;
  }
  useEffect(() => {
    let active = true;
    void load().then(data => { if (active) setView(data); }).catch(reason => { if (active) setError(String(reason.message)); });
    return () => { active = false; };
  }, [jobId]); // The page keys this component by job ID.
  async function refresh() {
    setBusy(true); setError("");
    try { setView(await load()); } catch (reason) { setView(null); setError(reason instanceof Error ? reason.message : "Retention records unavailable. Sign in and refresh."); }
    finally { setBusy(false); }
  }
  async function send(record?: unknown) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!pending.current) pending.current = JSON.stringify({ version: "retention-record-command.v1", commandId: crypto.randomUUID(), jobId, record });
      const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: await sessionHeaders(), body: pending.current });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) { pending.current = null; setUncertain(false); }
        const failure = await response.json() as { message?: string };
        throw new Error(failure.message ?? "Retention command unavailable.");
      }
      const data = await response.json() as View;
      pending.current = null; setUncertain(false); setView(data);
    } catch (reason) {
      setUncertain(pending.current !== null);
      setError(reason instanceof Error ? reason.message : "The result is unknown. Retry the same command.");
    } finally { setBusy(false); }
  }
  function resolve(event: FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send({ version: "retention.resolution.v1", reviewId, outcome: form.get("outcome"),
      conditionSatisfied: form.get("satisfied") === "on", humanSource: { inputId: crypto.randomUUID() },
      amount: { netPence: Number(form.get("net")), taxPence: Number(form.get("tax")) } });
  }
  const profile = view?.book.records.findLast(row => row.version === "retention.profile.v1");
  const reconciliation = view?.reconciliation;
  return <main className="workspace-page" style={{ overflowWrap: "anywhere", minWidth: 0 }}>
    <h1>Stored retention review</h1>
    <p>Simulation only. No notice or invoice is issued. These are synthetic records, not approval of a real contract profile.</p>
    <p>Retention release is not a fee-eligible recovery and adds no fee.</p>
    <button style={target} disabled={busy} onClick={() => void refresh()}>Refresh stored records</button>
    {error ? <p role="alert">{error}</p> : null}
    {uncertain ? <p>The result is uncertain. Retry the same command before recording anything else. <button style={target} disabled={busy} onClick={() => void send()}>Retry same command</button></p> : null}
    {busy ? <p role="status">Updating stored records…</p> : null}
    {reconciliation ? <section aria-label="Server reconciliation"><h2>Server reconciliation</h2>
      {([ ["Retained", reconciliation.retained], ["Released", reconciliation.released], ["Already billed", reconciliation.alreadyBilled], ["Remaining retention", reconciliation.remaining] ] as const).map(([label, value]) =>
        <p key={label}>{label}: net {pounds(value.netPence)}; tax {pounds(value.taxPence)}</p>)}
      <p>Received after reversals: {pounds(reconciliation.grossReceived.pence)}</p>
      <p>Released outstanding: {pounds(reconciliation.grossReleasedOutstanding.pence)}</p>
      <p>Fee-eligible recovery: {pounds(reconciliation.feeEligibleRecovery.pence)}</p>
    </section> : null}
    {profile?.version === "retention.profile.v1" ? <section aria-label="Current profile"><h2>Current profile revision {profile.revision}</h2>
      <p>Contract: {profile.contractProfileVersion}. Tax treatment: {profile.taxTreatmentVersion}. Fixture approval: {profile.fixtureApprovalId}</p>
      {profile.conditions.map(condition => <section key={condition.id} aria-label={condition.description}>
        <h3>{condition.description}</h3><p>{condition.milestone} · Due <time>{condition.dueDate}</time></p>
        <p>Condition source: {sourceText(condition.source)}</p><p>Due date source: {sourceText(condition.dateSource)}</p>
        <p>Cumulative limit: net {pounds(condition.cumulativeLimit.netPence)}; tax {pounds(condition.cumulativeLimit.taxPence)}</p>
      </section>)}
    </section> : view ? <p>No stored profile.</p> : null}
    <h2>Release reviews</h2>
    {view?.book.records.filter(row => row.version === "retention.review.v1").map(review => <section key={review.id} aria-label={`Review ${review.id}`}>
      <p>Raised by {review.trigger === "timer" ? `the timer (${review.owner})` : "a person"} on {review.raisedOn}. Profile {review.profileId}; condition {review.conditionId}.</p>
      <p>A review does not satisfy a condition.</p>
      {reconciliation?.pendingReviewIds.includes(review.id) ? <form onSubmit={event => resolve(event, review.id)}>
        <p>Open — awaiting human resolution.</p>
        <label>Resolution <select name="outcome" style={target} disabled={busy || uncertain}><option value="approved">Approve</option><option value="rejected">Reject</option><option value="deferred">Defer</option></select></label>
        <label style={{ display: "block", minHeight: 44 }}><input style={target} type="checkbox" name="satisfied" disabled={busy || uncertain} /> I confirm the condition is satisfied</label>
        <label>Net pence <input style={target} name="net" type="number" min="0" step="1" required defaultValue="0" disabled={busy || uncertain} /></label>
        <label>Tax pence <input style={target} name="tax" type="number" min="0" step="1" required defaultValue="0" disabled={busy || uncertain} /></label>
        <p>Enter exact amounts. Rejected or deferred resolutions require zero amounts.</p>
        <button style={target} disabled={busy || uncertain}>Record human resolution</button>
      </form> : <p>Closed or superseded — see the stored resolution and current profile.</p>}
    </section>)}
    {view?.book.records.filter(row => row.version === "retention.resolution.v1").map(resolution => <section key={resolution.id} aria-label={`Resolution ${resolution.id}`}>
      <p>Resolution {resolution.outcome} by person {resolution.humanSource.actorId}; condition satisfied: {resolution.conditionSatisfied ? "yes" : "no"}.</p>
      <p>Approved amount: net {pounds(resolution.amount.netPence)}; tax {pounds(resolution.amount.taxPence)}</p>
      {resolution.outcome === "approved" ? <button style={target} disabled={busy || uncertain} onClick={() => void send({ version: "retention.release.v1", resolutionId: resolution.id })}>Record release approval for this resolution</button> : null}
    </section>)}
    <h2>Stored movements</h2>
    {view?.book.records.map(row => row.version === "retention.release.v1" ? <p key={row.id}>Release {row.id}, resolution {row.resolutionId}. Stored approval only; no invoice issued.</p>
      : row.version === "retention.receipt.v1" ? <p key={row.id}>Synthetic received record {row.id}: {pounds(row.grossPence)}</p>
      : row.version === "retention.reversal.v1" ? <p key={row.id}>Synthetic reversal {row.id}: {pounds(row.grossPence)}</p> : null)}
  </main>;
}
