"use client";
import { JOB_SAVED_EVENT, jobPageFetch as fetch } from "./job-page-fetch";
import {lateSourceReceiptV1} from "@jobguard/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { answerLabels, catchCommand, dispositionCommand, dispositionLabels, finalCheckReadV1, referenceChoices, revealStatus, type FinalCheckRead, type RevealAnswer, type RevealItem, FINAL_CHECK_CHANGED_EVENT } from "./final-check-reveal-view";
import styles from "./practice-receipts.module.css";

const when = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
const answers = Object.keys(answerLabels) as RevealAnswer[];

/** Reveal and non-confirming answers after the lock. "Yes, extra work" waits on SV-5 Q2. */
export function FinalCheckReveal({ jobId }: { jobId: string }) {
 const [snapshot, setSnapshot] = useState<{ jobId: string; read: FinalCheckRead } | null>(null), [disputes, setDisputes] = useState(0), [busy, setBusy] = useState(true), [error, setError] = useState(""), [requested, setRequested] = useState(false);
 const read = snapshot?.jobId === jobId ? snapshot.read : null;
 const lifetime = useRef(0);
 const currentJob = useRef(jobId), epoch = useRef(0), active = useRef<AbortController | null>(null);
 const writing = useRef(false), uncertain = useRef(false), state = useRef<FinalCheckRead["state"] | null>(null);
 currentJob.current = jobId;
 const load = useCallback(async () => {
  active.current?.abort();
  const controller = new AbortController(); active.current = controller;
  const requestEpoch = ++epoch.current; setBusy(true);
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
   const response = await fetch(`/api/jobs/${jobId}/final-check`, { cache: "no-store", signal: controller.signal });
   if (!response.ok) throw new Error("The saved final check is unavailable. Load the saved final check to try again.");
   const saved = finalCheckReadV1.parse(await response.json());
   // The authorised unlocked projection is fixed; do not read hidden diagnostics.
   const queue = saved.state === "unlocked" ? null : await fetch(`/api/jobs/${jobId}/final-check/disputes`, { cache: "no-store", signal: controller.signal });
   if (queue && (queue.status === 401 || queue.status === 403)) throw new Error("ACCESS_UNAVAILABLE");
   const open = queue?.ok ? (await queue.json() as unknown[]).length : 0;
   if (currentJob.current === jobId && epoch.current === requestEpoch && !controller.signal.aborted) {
    setSnapshot({ jobId, read: saved }); setDisputes(open); setError("");
    if (saved.state === "failed" || saved.state === "unlocked" || saved.state === "completed") uncertain.current = false;
    if (state.current !== saved.state) {
     state.current = saved.state;
     window.dispatchEvent(new CustomEvent(FINAL_CHECK_CHANGED_EVENT, { detail: { jobId } }));
    }
   }
  } catch {
   if (currentJob.current === jobId && epoch.current === requestEpoch) {
    setSnapshot(null); setDisputes(0);
    state.current = null; window.dispatchEvent(new CustomEvent(FINAL_CHECK_CHANGED_EVENT, { detail: { jobId } }));
    setError("The saved final check is unavailable. Load the saved final check to try again.");
   }
  } finally { clearTimeout(timeout); if (active.current === controller) active.current = null; if (epoch.current === requestEpoch) setBusy(false); }
 }, [jobId]);
 useEffect(() => {
  setSnapshot(null); setError(""); setRequested(false); state.current = null; uncertain.current = false; writing.current = false;
  const changed = (event: Event) => { if ((event as CustomEvent<{jobId?: string}>).detail?.jobId === jobId && !writing.current) void load(); };
  const focus = () => { void load(); };
  const visible = () => { if (document.visibilityState === "visible") void load(); };
  window.addEventListener(JOB_SAVED_EVENT, changed); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visible);
  void load();
  return () => { lifetime.current++; epoch.current++; active.current?.abort(); window.removeEventListener(JOB_SAVED_EVENT, changed); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visible); };
 }, [jobId, load]);
 useEffect(() => {
  if (read?.state !== "pending" || error.startsWith("Automatic refresh")) return;
  let count = 0;
  const timer = setInterval(() => {
   if (++count > 120) { clearInterval(timer); setError("Automatic refresh has paused. Load the saved final check to check its progress."); return; }
   if (!writing.current && !active.current) void load();
  }, 2000);
  return () => clearInterval(timer);
 }, [read?.state, error, load]);
 // A lost reply cannot permit another POST until a saved read establishes no admission.
 const requestRun = async () => {
  if (busy || writing.current || uncertain.current) return;
  const generation = lifetime.current;
  writing.current = true; uncertain.current = true; setBusy(true); setError("");
  let refusal = "";
  try {
   const response = await fetch(`/api/jobs/${jobId}/final-check/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "final-check-run.request.v1" }) });
   if (currentJob.current !== jobId || lifetime.current !== generation) return;
   if (response.ok) setRequested(true);
   else {
    if (response.status >= 500) throw new Error("UNKNOWN_REQUEST_OUTCOME");
    const body = await response.json();
    if (body.code !== "FINAL_CHECK_PENDING") refusal = "The server refused this restart. Some older checks cannot be restarted here. The saved bill is unchanged.";
   }
  } catch { refusal = "The request result is unknown. Check the saved final check before trying again."; }
  finally {
   if (currentJob.current === jobId && lifetime.current === generation) { writing.current = false; await load(); if (refusal && currentJob.current === jobId && lifetime.current === generation) setError(refusal); }
  }
 };
 const answer = async (revealed: RevealItem, choice: RevealAnswer | "extra_work", referenceId: string | null) => {
  if (!read || busy || writing.current) return;
  const generation = lifetime.current;
  writing.current = true; setBusy(true); setError("");
  let message = "";
  try {
   const [path, body] = choice === "extra_work" ? ["catches", catchCommand(read, revealed, crypto.randomUUID())] : ["dispositions", dispositionCommand(read, revealed, choice, referenceId, crypto.randomUUID())];
   const response = await fetch(`/api/jobs/${jobId}/final-check/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
   if (!response.ok) message = response.status === 409 ? "This item changed. The saved check has been reloaded; answer again." : "The answer was refused. Nothing was changed.";
  } catch { message = "The result is unknown. The saved check has been reloaded; check it before answering again."; }
  finally {
   if (currentJob.current === jobId && lifetime.current === generation) {
    writing.current = false; await load(); if (message && currentJob.current === jobId && lifetime.current === generation) setError(message);
   }
  }
 };
 return <section id="final-check" className={styles.panel} aria-labelledby="final-check-title" aria-busy={busy} data-testid="final-check-reveal">
  <h2 id="final-check-title">JobGuard's final check</h2>
  {error && <p role="alert">{error}</p>}
  {read && <>
   <p role="status" data-testid="final-check-status">{revealStatus(read)}</p>
   {(read.state === "pending" || read.state === "failed") && read.lockId && <p>
    <button type="button" disabled={busy || uncertain.current} onClick={() => void requestRun()}>Run the final check (practice)</button>
    {read.state === "failed" && <button type="button" disabled={busy || uncertain.current} onClick={() => void requestRun()}>Try again</button>}
    {requested && <span data-testid="final-check-run-requested"> Asked for. The saved final check will update here.</span>}
   </p>}
   {read.lockId && <HistoricalEvidence key={jobId} jobId={jobId} onSaved={load}/>}
   {read.items.map(revealed => <Item key={revealed.signalId} revealed={revealed} read={read} busy={busy} onAnswer={answer}/>)}
   {(read.postLockItems ?? []).length > 0 && <>
    <h3>Found after the lock</h3>
    <p>Evidence that arrived after you completed the final account. You can use it, but it never earns JobGuard a fee.</p>
    {read.postLockItems!.map(found => <article key={found.signalId} className={styles.movement} data-testid="final-check-post-lock" data-signal-id={found.signalId}><strong>{found.description}</strong>
     <ul>{(found.evidence ?? []).map(e => <li key={e.id}>{e.source ?? "Evidence"} received {when(e.receivedAt)}</li>)}</ul></article>)}
   </>}
   {disputes > 0 && <p data-testid="final-check-disputes">{disputes === 1 ? "1 answer is" : `${disputes} answers are`} disputed: paused with no fee until an independent review exists.</p>}
  </>}
  <button type="button" disabled={busy} onClick={() => void load()}>Load the saved final check</button>
 </section>;
}

function Item({ revealed, read, busy, onAnswer }: { revealed: RevealItem; read: FinalCheckRead; busy: boolean; onAnswer: (revealed: RevealItem, choice: RevealAnswer | "extra_work", referenceId: string | null) => Promise<void> }) {
 const [choice, setChoice] = useState<RevealAnswer>("already_included");
 const choices = referenceChoices(choice, read.lockedLines ?? []);
 const [reference, setReference] = useState("");
 const needsReference = choice === "already_included" || choice === "in_original_scope";
 const select = `answer-${revealed.signalId}`, ref = `reference-${revealed.signalId}`;
 return <article className={styles.movement} data-testid="final-check-item" data-signal-id={revealed.signalId}>
  <h3>{revealed.description}</h3>
  <ul aria-label="Evidence and dates">{(revealed.evidence ?? []).map(e => <li key={e.id}>{e.source ?? "Evidence"} received {when(e.receivedAt)}{e.evidenceAfterLock ? " (after the lock: not fee-eligible)" : ""}</li>)}</ul>
  <p>Checked against {revealed.comparisons.lockedLineIds.length} locked lines and {revealed.comparisons.baselineItemIds.length} original quote items: no match found.</p>
  {revealed.disposition ? <p data-testid="final-check-disposition">Your answer: {dispositionLabels[revealed.disposition] ?? revealed.disposition}</p> : <>
   <button type="button" disabled={busy} onClick={() => void onAnswer(revealed, "extra_work", null)}>Yes — this was extra work</button>
   <p>This adds it to your extras as a draft for you to price and approve. Nothing is charged until your customer approves.</p>
   <div className={styles.actions}>
    <div className={styles.field}><label htmlFor={select}>Or answer</label><select id={select} value={choice} disabled={busy} onChange={e => { setChoice(e.target.value as RevealAnswer); setReference(""); }}>{answers.map(a => <option key={a} value={a}>{answerLabels[a]}</option>)}</select></div>
    {needsReference && <div className={styles.field}><label htmlFor={ref}>{choice === "already_included" ? "Which locked line?" : "Which original quote item?"}</label>
     <select id={ref} value={reference} disabled={busy} onChange={e => setReference(e.target.value)}><option value="">Choose one</option>{choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>}
    <button type="button" disabled={busy || (needsReference && reference === "")} onClick={() => void onAnswer(revealed, choice, needsReference ? reference : null)}>Save answer</button>
   </div>
  </>}
 </article>;
}

/** Historical import is intentionally separate from the diary and customer-message controls. */
function HistoricalEvidence({jobId,onSaved}:{jobId:string;onSaved:()=>Promise<void>}) {
 const [name,setName]=useState(""),[text,setText]=useState(""),[date,setDate]=useState("");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [saved,setSaved]=useState<ReturnType<typeof lateSourceReceiptV1.parse>[]>([]);
 const loadHistory=useCallback(async()=>{
  const response=await fetch(`/api/jobs/${jobId}/historical-evidence`,{cache:"no-store"});
  if(!response.ok)throw new Error("Imported evidence could not load.");
  const raw:unknown=await response.json();
  if(!Array.isArray(raw))throw new Error("Imported evidence could not load.");
  setSaved(raw.map(row=>lateSourceReceiptV1.parse(row)));
 },[jobId]);
 useEffect(()=>{setSaved([]);void loadHistory().catch(()=>setMessage("Imported evidence could not load."));},[loadHistory]);
 const pending=useRef<{key:string;commandId:string}|null>(null);
 const save=async()=>{
  if(busy||!name.trim()||!text.trim()||!date)return;
  const statedSentAt=new Date(date).toISOString(),key=JSON.stringify([jobId,name,text,statedSentAt]);
  if(pending.current?.key!==key)pending.current={key,commandId:crypto.randomUUID()};
  setBusy(true);setMessage("");
  try {
   const response=await fetch(`/api/jobs/${jobId}/historical-evidence`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    version:"late-source-import.v1",commandId:pending.current.commandId,fictionalCustomer:{kind:"named_fictional_customer",name},text,statedSentAt})});
   if(!response.ok){setMessage("Import refused. Use an old message dated before the final-account lock.");return;}
   lateSourceReceiptV1.parse(await response.json());
   setMessage("Evidence saved. The practice worker will examine it; load the saved final check in about a minute. It can never earn JobGuard a fee.");
   setText("");pending.current=null;await loadHistory();await onSaved();
  } catch {setMessage("The result is unknown. Retry the same import to check its saved receipt.");}
  finally {setBusy(false);}
 };
 return <fieldset disabled={busy} data-testid="historical-evidence-import"><legend>Import old evidence (practice)</legend>
  <p>File an old fictional message as evidence only. Its stated date cannot change when JobGuard received it.</p>
  <label>Fictional sender<input value={name} maxLength={160} onChange={e=>setName(e.target.value)}/></label>
  <label>Stated message date<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></label>
  <label>Old fictional message<textarea value={text} maxLength={8000} onChange={e=>setText(e.target.value)}/></label>
  <button type="button" disabled={busy||!name.trim()||!text.trim()||!date} onClick={()=>void save()}>Import as evidence only</button>
  {message&&<p role="status">{message}</p>}
  {saved.map(source=><details key={source.record.id} data-testid="imported-historical-message"><summary>Old message from {source.record.fictionalCustomer.name}</summary>
   <p>{source.record.text}</p><p>Stated message date: {when(source.statedSentAt)}. Received by JobGuard: {when(source.record.evidence.serverReceivedAt)}.</p>
  </details>)}
 </fieldset>;
}
