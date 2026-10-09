"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { jobAssignmentsV1, workOrderRevisionsV1 } from "@jobguard/core";
import { pounds } from "../lib/pounds";
import styles from "./work-orders.module.css";

type Revisions = ReturnType<typeof workOrderRevisionsV1.parse>;
type Assignments = ReturnType<typeof jobAssignmentsV1.parse>;
const fieldLabels: Record<string, string> = { status: "status", issuedOn: "issue date", dueOn: "due date", priority: "priority", teamId: "team", assignedMembershipIds: "assigned operatives" };

export function WorkOrderRevisions({ workOrderId }: { workOrderId: string }) {
  const [view, setView] = useState<Revisions | null>(null), [assignments, setAssignments] = useState<Assignments | null>(null), [code, setCode] = useState(""), [status, setStatus] = useState("Loading the persisted order…");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/contractor/work-orders/${workOrderId}/revisions`, { cache: "no-store" }), body = await response.json();
      if (!response.ok) { setCode(body.code ?? "DATABASE_UNAVAILABLE"); setStatus("The order could not be loaded."); return; }
      const parsed = workOrderRevisionsV1.parse(body); setView(parsed); setCode(""); setStatus("Persisted order loaded");
      const scheduling = await fetch(`/api/contractor/jobs/${parsed.jobId}/assignments`, { cache: "no-store" });
      setAssignments(scheduling.ok ? jobAssignmentsV1.parse(await scheduling.json()) : null);
    } catch { setCode("DATABASE_UNAVAILABLE"); setStatus("The order could not be loaded."); }
  }, [workOrderId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (code) errorRef.current?.focus(); }, [code]);
  const newestFirst = view ? [...view.revisions].reverse() : [];
  return <main className={styles.main}>
    <Link href="/contractor/work-orders">Back to work orders</Link>
    <h1>{view ? `Order ${view.reference}` : "Order"}</h1>
    <p role="status">{status}</p>
    {code && <p role="alert" tabIndex={-1} ref={errorRef}>{code === "NOT_FOUND" ? "This order is not available to you." : code === "UNAUTHENTICATED" ? "Start the generated contractor practice first." : `The request was refused (${code}).`}</p>}
    {view && <>
      <dl className={styles.facts}>
        <div><dt>Job</dt><dd data-testid="job-state">{view.jobStatus === "live" ? "Live" : view.jobStatus}</dd></div>
        <div><dt>Current revision</dt><dd data-testid="current-revision">{view.currentRevision}</dd></div>
        <div><dt>Team</dt><dd data-testid="job-team">{assignments === null ? "Not shown to your role" : assignments.team?.name ?? "No team named"}</dd></div>
        <div><dt>Operatives assigned</dt><dd data-testid="job-operatives">{assignments === null ? "Not shown to your role" : assignments.operatives.length}</dd></div>
      </dl>
      <p className={styles.muted}>Job <code className={styles.ident} data-testid="job-id">{view.jobId}</code>. Every revision below is permanent; a cancellation is a revision. Resident contact details are not shown here.</p>
      {newestFirst.map(revision => <section key={revision.id} className={styles.revision} data-testid={`revision-${revision.revision}`} aria-label={`Revision ${revision.revision}`}>
        <h2>Revision {revision.revision} {revision.status === "cancelled" ? <span className={`${styles.badge} ${styles.cancelled}`}>Cancelled</span> : null}</h2>
        <p>Issued {revision.issuedOn}{revision.dueOn ? ` · due ${revision.dueOn}` : ""} · {revision.priority} · net {pounds(revision.netTotalPence)} · import row {revision.rowNumber}</p>
        <p data-testid={`diff-${revision.revision}`}>{revision.revision === 1 ? `First revision: ${revision.diff.added.length} line${revision.diff.added.length === 1 ? "" : "s"} added.`
          : `Changed since revision ${revision.revision - 1}: ${revision.diff.fields.length ? revision.diff.fields.map(f => fieldLabels[f] ?? f).join(", ") : "no order details"}; lines added ${revision.diff.added.length}, removed ${revision.diff.removed.length}, changed ${revision.diff.changed.length}.`}</p>
        <div className={styles.scroll}><table><thead><tr><th>#</th><th>Line ref</th><th>Code</th><th>Quantity</th><th>Unit</th><th>Rate</th><th>Net</th><th>Line identity</th><th>Since last revision</th></tr></thead><tbody>
          {revision.lines.map(line => <tr key={line.scopeItemId}><td>{line.position + 1}</td><td>{line.clientLineReference ?? "-"}</td><td>{line.sorCode}</td><td>{line.quantity}</td><td>{line.unit}</td><td>{pounds(line.ratePence)}</td><td>{pounds(line.netPence)}</td>
            <td><code className={styles.ident} title={line.scopeItemId}>{line.scopeItemId.slice(0, 8)}</code></td>
            <td>{revision.diff.added.includes(line.scopeItemId) ? <span className={`${styles.badge} ${styles.added}`}>Added</span> : revision.diff.changed.includes(line.scopeItemId) ? <span className={`${styles.badge} ${styles.changed}`}>Changed</span> : revision.revision > 1 ? "Same line" : ""}</td></tr>)}
        </tbody></table></div>
        {revision.diff.removed.length > 0 && <p>Removed lines: {revision.diff.removed.map(id => <code key={id} className={styles.ident} title={id}>{id.slice(0, 8)} </code>)}</p>}
      </section>)}
    </>}
    {!view && <button type="button" onClick={() => void load()}>Reload persisted order</button>}
  </main>;
}
