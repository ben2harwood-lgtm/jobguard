"use client";
import { useEffect, useRef, useState } from "react";
import { pounds } from "../../lib/pounds";
type Extra = { requestId: string; description: string; revision: number; revisionHash: string; netPence: number; doneWithoutRequiredPreapproval: boolean | "uncertain" | "not_derived" };
type Past = { requestId: string; decision: string; recordedAt: string };
export default function ExtraApprovals() {
  const [job, setJob] = useState(""), [items, setItems] = useState<Extra[]>([]), [past, setPast] = useState<Past[]>([]), [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  async function call(jobId: string, fields: Record<string, unknown>) {
    const response = await fetch("/api/customer-portal/extra-approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: "extra-customer.v1", jobId, ...fields }), cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.code);
    return body;
  }
  async function refresh(jobId: string) {
    const queue = await call(jobId, { action: "queue" });
    const history = await call(jobId, { action: "history" });
    setItems(queue.items); setPast(history.items);
  }
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("jobId") ?? "";
    setJob(jobId); void refresh(jobId).catch(() => setError("Access refused. Sign in with your invitation and check that your job grant is still active."));
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
      setError(code === "STALE_REVISION" ? "This revision is stale. Ask the contractor for a new request." : code === "HASH_MISMATCH" ? "The revision or amount did not match. No decision was recorded." : "Decision could not be confirmed. Retry the same decision or sign in again.");
      setBusy(false); return;
    }
    try { await refresh(job); } catch {
      setError("Your decision is recorded, but the list could not be reloaded. Reload the page.");
    } finally { setBusy(false); }
  }
  return <main style={{overflowWrap:"anywhere"}}><h1>Client extra approvals</h1><p>Fictional practice only. Your own current job grant controls access. Nothing is sent to a real recipient or charged.</p>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {items.map(extra => <section key={extra.requestId} aria-label="Extra awaiting your decision"><h2>{extra.description}</h2>
      <p>Revision {extra.revision} · Net {pounds(extra.netPence)}</p><p style={{overflowWrap:"anywhere"}}>Content hash: {extra.revisionHash}</p>
      <p>{extra.doneWithoutRequiredPreapproval === true ? "Work was done without required client preapproval. Later approval does not erase this breach." : extra.doneWithoutRequiredPreapproval === false ? "No required client preapproval breach was found from the visit times." : "Whether work preceded required preapproval is uncertain or has not been derived."}</p>
      <button disabled={busy || !!pending.current && pending.current.decision !== "approve"} onClick={() => void decide(extra, "approve")}>Approve this exact revision and net</button>
      <button disabled={busy || !!pending.current && pending.current.decision !== "reject"} onClick={() => void decide(extra, "reject")}>Decline this extra</button></section>)}
    <h2>Your past decisions on this job</h2>{past.map(p => <p key={p.requestId}>{p.requestId}: {p.decision} · {p.recordedAt}</p>)}
  </main>;
}
