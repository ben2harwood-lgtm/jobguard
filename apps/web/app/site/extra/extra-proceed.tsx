"use client";
import { useEffect, useRef, useState } from "react";
import styles from "../../northside/northside.module.css";
import { extraProceedViewV1 } from "@jobguard/core";
type View = ReturnType<typeof extraProceedViewV1.parse>;

export function ExtraProceed({ jobId, extraId, canRecord }: { jobId: string; extraId: string; canRecord: boolean }) {
 const [view, setView] = useState<View | null>(null), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
 const attempt = useRef<string | null>(null), pending = useRef(false);
 const url = `/api/contractor/jobs/${jobId}/site-extras/${extraId}/proceed`;
 useEffect(() => {
  const controller = new AbortController();
  void fetch(url, { cache: "no-store", signal: controller.signal }).then(async r => {
   if (!r.ok) throw new Error("Proceed history unavailable.");
   const body = extraProceedViewV1.parse(await r.json());
   if (body.jobId !== jobId || body.extraId !== extraId) throw new Error("Extra response mismatch.");
   if (!controller.signal.aborted) setView(body);
  }).catch(() => { if (!controller.signal.aborted) setError("Proceed history unavailable."); });
  return () => controller.abort();
 }, [url, jobId, extraId]);
 async function record() {
  if (!view?.requestId || !reason.trim() || pending.current) return;
  pending.current = true; setBusy(true); setError("");
  attempt.current ??= JSON.stringify({ version: "record-extra-proceed.v1", commandId: crypto.randomUUID(), requestId: view.requestId, reason: reason.trim() });
  try {
   const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: attempt.current });
   const body = await r.json();
   if (!r.ok) throw new Error(body.code ?? "Proceed statement refused.");
   const result = extraProceedViewV1.parse(body);
   if (result.jobId !== jobId || result.extraId !== extraId) throw new Error("Extra response mismatch.");
   setView(result); setReason(""); attempt.current = null;
  } catch (cause) { setError(cause instanceof Error ? cause.message : "Proceed statement unavailable. Retry the same statement."); }
  finally { pending.current = false; setBusy(false); }
 }
 return <div>
  <div role="log" aria-label="Extra proceed history">{view?.history.map(fact => <p key={fact.statementId}>Proceeding before approval — statement by {fact.actorMembershipId}, recorded {fact.recordedAt}: {fact.reason}. Priced request {fact.requestId}, revision {fact.revisionHash}. Later approval does not erase this statement.</p>)}</div>
  {canRecord && view?.requestId && <fieldset disabled={busy}>
   <legend>Record proceeding before approval</legend>
   <p>This records what you are doing. It grants no approval or permission to proceed.</p>
   <div className={styles.row}><label htmlFor={`proceed-${extraId}`}>Reason</label>
   <textarea id={`proceed-${extraId}`} maxLength={1000} value={reason} disabled={attempt.current !== null} onChange={e => setReason(e.target.value)} /></div>
   <button type="button" disabled={!reason.trim()} onClick={() => void record()}>Record proceed statement</button>
  </fieldset>}
  {error && <p role="alert">{error}</p>}
 </div>;
}
