"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type Stage = { snapshot: {completionId: string; stage: string; scopeItemId: string; completedAt: string; evidenceLinkId: string; evidenceId: string; evidenceType: string; evidenceHash: string; objectVersionId: string; statement: string}; hash: string; reviewRequired: boolean; acknowledgement: {id: string} | null };
const labels: Record<string,string> = {completionId:"Completion reference",scopeItemId:"Work item reference",completedAt:"Recorded completion time",evidenceLinkId:"Evidence link reference",evidenceId:"Evidence reference",evidenceType:"Evidence type",evidenceHash:"Evidence fingerprint",objectVersionId:"Original file version"};
export default function CustomerStages({jobId}: {jobId: string}) {
  const [stages,setStages] = useState<Stage[]>([]), [message,setMessage] = useState("Loading recorded stages…"), [busy,setBusy] = useState(false);
  const pending = useRef(false), commands = useRef(new Map<string,string>());
  const load = useCallback(async (signal?: AbortSignal) => {
    const r = await fetch("/api/customer-portal/stages", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:"customer-stages-read.v1",jobId}),cache:"no-store",signal:signal ?? null});
    if (!r.ok) throw new Error("unavailable");
    const view = await r.json() as {stages: Stage[]};
    if (!signal?.aborted) { setStages(view.stages); setMessage(view.stages.length ? "Review the exact recorded completion before acknowledging." : "No recorded stage completion is available."); }
  }, [jobId]);
  useEffect(() => {
    const controller = new AbortController(); setStages([]);
    void load(controller.signal).catch(() => { if (!controller.signal.aborted) setMessage("Stages are unavailable. Sign in again or ask your builder for a fresh review."); });
    return () => controller.abort();
  }, [load]);
  async function acknowledge(stage: Stage) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    const commandId = commands.current.get(stage.hash) ?? crypto.randomUUID(); commands.current.set(stage.hash,commandId);
    try {
      const r = await fetch("/api/customer-portal/stage-acknowledge", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:"customer-stage-acknowledge.v1",jobId,commandId,completionId:stage.snapshot.completionId,snapshotHash:stage.hash}),cache:"no-store"});
      if (!r.ok) throw new Error("unavailable"); await load();
    } catch { setStages([]); setMessage("Acknowledgement could not be confirmed. Refresh and review the current stage before trying again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section><h1>Recorded stages — synthetic practice</h1><p role="status">{message}</p>{stages.map(s => <article key={s.snapshot.completionId}>
    <h2>{s.snapshot.stage}</h2><p>{s.snapshot.statement}</p>
    <dl>{Object.entries(s.snapshot).filter(([key]) => labels[key]).map(([key,value]) => <div key={key}><dt>{labels[key]}</dt><dd style={{overflowWrap:"anywhere"}}>{value}</dd></div>)}<dt>Snapshot fingerprint</dt><dd style={{overflowWrap:"anywhere"}}>{s.hash}</dd></dl>
    {s.acknowledgement && <p>Historical acknowledgement recorded.</p>}
    {s.reviewRequired ? <p>Fresh review required. The supporting proof is invalidated or this completion has been replaced. Ask your builder to review it.</p> : !s.acknowledgement && <button disabled={busy} onClick={() => void acknowledge(s)}>Acknowledge this recorded completion</button>}
  </article>)}</section>;
}
