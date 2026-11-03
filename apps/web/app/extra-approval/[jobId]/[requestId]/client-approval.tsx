"use client";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { NorthsidePractice } from "../../../northside/northside-practice";
import { pounds } from "../../../lib/pounds";
import styles from "../../../northside/northside.module.css";

type View = { description: string; netPence: number; revisionHash: string; expiresAt: string; requestRevision: number; companyApprovals: Array<{ stepIndex: number; role: string }>;
  doneWithoutRequiredPreapproval: boolean | "uncertain" | "not_derived";
  workTiming: { startedAt: string; finishedAt: string | null } | null;
  approvalTimings: Array<{ stepIndex: number; timing: "before_work" | "after_work" | "uncertain" | "not_derived" }> };
const timingLabels = { before_work: "before work", after_work: "after work", uncertain: "cannot be told from the visit times", not_derived: "not derived" };
const refusals: Record<string, string> = { LINK_REPLAYED: "This link has already been used. The decision is recorded.", LINK_EXPIRED: "This link has expired.", LINK_REVOKED: "This link was withdrawn.", LINK_INVALID: "This link is not valid for you.", EMAIL_MISMATCH: "That email address does not match this link.", PERMISSION_DENIED: "You are not allowed to decide this.", UNAUTHENTICATED: "Sign in to the practice first." };

/** The client's approval page, reached by the practice link. The secret part of the link stays after the # so it is never sent in a web address. */
export function ClientApproval({ jobId, requestId }: { jobId: string; requestId: string }) {
  const [token, setToken] = useState(""), [email, setEmail] = useState(""), [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [decided, setDecided] = useState(""), [busy, setBusy] = useState(false);
  const commandId = useRef(crypto.randomUUID());
  useEffect(() => { setToken(new URLSearchParams(window.location.hash.slice(1)).get("t") ?? ""); }, []);
  async function call(body: Record<string, unknown>) {
    const r = await fetch("/api/northside/client", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "northside-command.v1", jobId, requestId, token, email, ...body }) });
    return { ok: r.ok, body: await r.json().catch(() => ({})) };
  }
  async function show() {
    setBusy(true); setError("");
    try { const r = await call({ action: "view" }); if (!r.ok) { setView(null); setError(refusals[r.body.code] ?? `Refused (${r.body.code}).`); if (r.body.code === "LINK_REPLAYED") setDecided("already"); return; } setView(r.body.view); } finally { setBusy(false); }
  }
  async function decide(decision: "approve" | "reject") {
    if (!view) return; setBusy(true); setError("");
    try {
      const r = await call({ action: "decide", commandId: commandId.current, decision, ...(decision === "reject" ? { reasonCode: "not_agreed" } : {}), revisionHash: view.revisionHash, netPence: view.netPence });
      if (!r.ok) { setError(refusals[r.body.code] ?? `Refused (${r.body.code}).`); return; }
      setDecided(decision === "approve" ? "approved" : "declined");
    } finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <NorthsidePractice />
    <h1>Approve an extra</h1>
    <p className={styles.note}>Practice page for a fictional client. Nothing is sent or charged. This link is for one decision.</p>
    {!token && <p role="alert" className={styles.error}>This page needs the practice link you were given.</p>}
    {error && <p role="alert" className={styles.error} data-testid="client-error">{error}</p>}
    {decided === "approved" || decided === "declined" ? <p role="status" className={styles.ok} data-testid="client-decided">Decision recorded: {decided}. Thank you.</p> : decided === "already" ? null : <>
      <section className={styles.card}>
        <div className={styles.row}><label htmlFor="email">The email address this link was sent to</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className={styles.actions}><button disabled={busy || !token || !email} onClick={() => void show()}>Show the extra</button></div>
      </section>
      {view && <section className={styles.card} aria-label="The extra">
        <h2 data-testid="client-description">{view.description}</h2>
        <p>Amount to approve: <strong data-testid="client-amount">{pounds(view.netPence)}</strong> (version {view.requestRevision})</p>
        <p data-testid="client-company-approvals">Approved by the contractor first: {view.companyApprovals.length ? view.companyApprovals.map(a => a.role).join(", ") : "nobody yet"}</p>
        <p>Fictional client approver. The persisted practice owner and switch are recorded with this decision.</p>
        <ClientWorkTiming view={view} />
        <div className={styles.actions}><button disabled={busy} onClick={() => void decide("approve")}>Approve this extra</button><button disabled={busy} onClick={() => void decide("reject")}>Decline this extra</button></div>
      </section>}
    </>}
    {decided === "already" && <p role="status" className={styles.ok} data-testid="client-already">This link has already been used. The decision is recorded.</p>}
  </main>;
}

/** Shows the server-derived result without treating the visit bounds as exact extra times. */
export function ClientWorkTiming({ view }: { view: Pick<View, "workTiming" | "doneWithoutRequiredPreapproval" | "approvalTimings"> }) {
  return (<div data-testid="client-work-timing">
          {view.workTiming ? <p>Work was during this visit: {view.workTiming.startedAt} to {view.workTiming.finishedAt ?? "finish not recorded"}. Exact times for this extra are uncertain.</p> : <p>Work timing is unavailable; no linked visit.</p>}
          <p>{view.doneWithoutRequiredPreapproval === true ? "Work was done without required client preapproval. Later approval does not erase this breach." : view.doneWithoutRequiredPreapproval === false ? "No required client preapproval breach was found from the visit times." : view.doneWithoutRequiredPreapproval === "uncertain" ? "Whether work preceded required client preapproval cannot be told from the visit times." : "Approval-before-work has not been derived."}</p>
          {view.approvalTimings.map(a => <p key={a.stepIndex}>Approval step {a.stepIndex + 1}: {timingLabels[a.timing]}.</p>)}
        </div>);
}
