"use client";
import { useEffect, useRef, useState } from "react";
import { pounds } from "../../lib/pounds";
type Extra = { requestId: string; description: string; revision: number; revisionHash: string; netPence: number; doneWithoutRequiredPreapproval: boolean | "uncertain" | "not_derived" };
type Past = { requestId: string; decision: string; recordedAt: string };
const accessRefused = "Access refused. Sign in with your invitation and check that your job grant is still active.";
function queueFailure(code: string) {
  if (code === "STALE_REVISION") return "This revision is stale. Ask the contractor for a new request.";
  if (code === "LINK_EXPIRED") return "This invitation has expired. Ask the contractor for a new invitation.";
  if (code === "ALREADY_DECIDED") return "This request has already been decided.";
  return "The approval queue could not be loaded. Reload the page.";
}
function authorityRefused(code: string) {
  return ["CUSTOMER_REFUSED", "LINK_REVOKED"].includes(code);
}
export default function ExtraApprovals() {
  const [job, setJob] = useState(""), [items, setItems] = useState<Extra[]>([]), [past, setPast] = useState<Past[]>([]), [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const load = useRef(0);
  const pending = useRef<Record<string, unknown> | null>(null);
  async function call(jobId: string, fields: Record<string, unknown>) {
    const response = await fetch("/api/customer-portal/extra-approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: "extra-customer.v1", jobId, ...fields }), cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.code);
    return body;
  }
  async function refresh(jobId: string) {
    const current = ++load.current;
    setItems([]); setPast([]); setError(""); setHistoryError("");
    const [queue, history] = await Promise.allSettled([
      call(jobId, { action: "queue" }), call(jobId, { action: "history" }),
    ]);
    if (current !== load.current) return;
    // A current access refusal wins over any concurrently returned content.
    if ([queue, history].some(result => result.status === "rejected" && authorityRefused((result.reason as Error).message))) {
      setError(accessRefused); return;
    }
    if (queue.status === "fulfilled") setItems(queue.value.items);
    else setError(queueFailure((queue.reason as Error).message));
    if (history.status === "fulfilled") setPast(history.value.items);
    else setHistoryError("Your past decisions could not be loaded. Reload the page.");
  }
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("jobId") ?? "";
    setItems([]); setPast([]); pending.current = null;
    setJob(jobId); void refresh(jobId);
    return () => { ++load.current; };
  }, []);
  async function decide(extra: Extra, decision: "approve" | "reject") {
    if (busy) return;
    pending.current ??= { action: "decide", commandId: crypto.randomUUID(), requestId: extra.requestId, revisionHash: extra.revisionHash, netPence: extra.netPence, decision };
    setBusy(true); setError("");
    try {
      await call(job, pending.current); pending.current = null;
      setStatus("Your decision is recorded.");
    } catch (e) {
      const code = (e as Error).message;
      if (["STALE_REVISION", "HASH_MISMATCH", "ALREADY_DECIDED", "LINK_REPLAYED"].includes(code)) pending.current = null;
      if (authorityRefused(code)) {
        ++load.current; setItems([]); setPast([]); setHistoryError("");
        setError(accessRefused); setBusy(false); return;
      }
      if (code === "LINK_EXPIRED") setItems([]);
      setError(["STALE_REVISION", "LINK_EXPIRED", "ALREADY_DECIDED"].includes(code) ? queueFailure(code) : code === "HASH_MISMATCH" ? "The revision or amount did not match. No decision was recorded." : "Decision could not be confirmed. Retry the same decision or sign in again.");
      setBusy(false); return;
    }
    try { await refresh(job); } finally { setBusy(false); }
  }
  return <main style={{overflowWrap:"anywhere"}}><h1>Client extra approvals</h1><p>Fictional practice only. Your own current job grant controls access. Nothing is sent to a real recipient or charged.</p>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {items.map(extra => <section key={extra.requestId} aria-label="Extra awaiting your decision"><h2>{extra.description}</h2>
      <p>Revision {extra.revision} · Net {pounds(extra.netPence)}</p><p style={{overflowWrap:"anywhere"}}>Content hash: {extra.revisionHash}</p>
      <p>{extra.doneWithoutRequiredPreapproval === true ? "Work was done without required client preapproval. Later approval does not erase this breach." : extra.doneWithoutRequiredPreapproval === false ? "No required client preapproval breach was found from the visit times." : "Whether work preceded required preapproval is uncertain or has not been derived."}</p>
      <button disabled={busy || !!pending.current && pending.current.decision !== "approve"} onClick={() => void decide(extra, "approve")}>Approve this exact revision and net</button>
      <button disabled={busy || !!pending.current && pending.current.decision !== "reject"} onClick={() => void decide(extra, "reject")}>Decline this extra</button></section>)}
    <h2>Your past decisions on this job</h2>{historyError && <p role="alert">{historyError}</p>}{past.map(p => <p key={p.requestId}>{p.requestId}: {p.decision} · {p.recordedAt}</p>)}
  </main>;
}
