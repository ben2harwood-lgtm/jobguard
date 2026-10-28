"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { answerLabels, dispositionCommand, dispositionLabels, finalCheckReadV1, referenceChoices, revealStatus, type FinalCheckRead, type RevealAnswer, type RevealItem } from "./final-check-reveal-view";
import styles from "./practice-receipts.module.css";

const when = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
const answers = Object.keys(answerLabels) as RevealAnswer[];

/** Reveal and non-confirming answers after the lock. "Yes, extra work" waits on SV-5 Q2. */
export function FinalCheckReveal({ jobId }: { jobId: string }) {
 const [read, setRead] = useState<FinalCheckRead | null>(null), [disputes, setDisputes] = useState(0), [busy, setBusy] = useState(true), [error, setError] = useState("");
 const currentJob = useRef(jobId), epoch = useRef(0);
 currentJob.current = jobId;
 const load = useCallback(async () => {
  const requestEpoch = ++epoch.current; setBusy(true);
  try {
   const [response, queue] = await Promise.all([fetch(`/api/jobs/${jobId}/final-check`, { cache: "no-store" }), fetch(`/api/jobs/${jobId}/final-check/disputes`, { cache: "no-store" })]);
   if (!response.ok) throw new Error("The final check could not load. Try again.");
   const saved = finalCheckReadV1.parse(await response.json()), open = queue.ok ? (await queue.json() as unknown[]).length : 0;
   if (currentJob.current === jobId && epoch.current === requestEpoch) { setRead(saved); setDisputes(open); setError(""); }
  } catch (e) { if (currentJob.current === jobId && epoch.current === requestEpoch) setError(e instanceof Error ? e.message : "The final check could not load."); }
  finally { if (epoch.current === requestEpoch) setBusy(false); }
 }, [jobId]);
 useEffect(() => { setRead(null); void load(); return () => { epoch.current++; }; }, [load]);
 const answer = async (revealed: RevealItem, choice: RevealAnswer, referenceId: string | null) => {
  if (!read || busy) return;
  setBusy(true); setError("");
  try {
   const response = await fetch(`/api/jobs/${jobId}/final-check/dispositions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dispositionCommand(read, revealed, choice, referenceId, crypto.randomUUID())) });
   if (!response.ok) setError(response.status === 409 ? "This item changed. The saved check has been reloaded; answer again." : "The answer was refused. Nothing was changed.");
  } catch { setError("The result is unknown. The saved check has been reloaded; check it before answering again."); }
  await load();
 };
 return <section id="final-check" className={styles.panel} aria-labelledby="final-check-title" aria-busy={busy} data-testid="final-check-reveal">
  <h2 id="final-check-title">JobGuard's final check</h2>
  {error && <p role="alert">{error}</p>}
  {read && <>
   <p role="status" data-testid="final-check-status">{revealStatus(read)}</p>
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

function Item({ revealed, read, busy, onAnswer }: { revealed: RevealItem; read: FinalCheckRead; busy: boolean; onAnswer: (revealed: RevealItem, choice: RevealAnswer, referenceId: string | null) => Promise<void> }) {
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
   <button type="button" disabled>Yes — this was extra work</button>
   <p>Turning a catch into extra work waits on a decision about when its case is created. Nothing is charged.</p>
   <div className={styles.actions}>
    <div className={styles.field}><label htmlFor={select}>Or answer</label><select id={select} value={choice} disabled={busy} onChange={e => { setChoice(e.target.value as RevealAnswer); setReference(""); }}>{answers.map(a => <option key={a} value={a}>{answerLabels[a]}</option>)}</select></div>
    {needsReference && <div className={styles.field}><label htmlFor={ref}>{choice === "already_included" ? "Which locked line?" : "Which original quote item?"}</label>
     <select id={ref} value={reference} disabled={busy} onChange={e => setReference(e.target.value)}><option value="">Choose one</option>{choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>}
    <button type="button" disabled={busy || (needsReference && reference === "")} onClick={() => void onAnswer(revealed, choice, needsReference ? reference : null)}>Save answer</button>
   </div>
  </>}
 </article>;
}
