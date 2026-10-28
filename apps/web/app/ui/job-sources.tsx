"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LINKED_JOB_COPY, customerMessageInputV1, customerMessageReadV1, diaryInputV1, diaryReadV1, type CustomerMessageRead, type DiaryRead } from "@jobguard/core";
import styles from "./practice-receipts.module.css";

const when = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
type Kind = "diary" | "customer-messages";
const refusal = (status: number, code: string | undefined) =>
 code === "POST_LOCK_WORK_REQUIRES_LINKED_JOB" ? `${LINKED_JOB_COPY}. This job's final account is locked.` :
 code === "JOB_NOT_LIVE" ? "Notes and messages can only be added while the job is live." :
 status === 409 ? "That save conflicted with an earlier one. The saved list has been reloaded." :
 "It was not saved. Nothing was changed.";

/** Shared load/save for one source list; the server picks actor, tenant, time and hashes. */
function useSource<T>(jobId: string, kind: Kind, parse: (raw: unknown) => T) {
 const [view, setView] = useState<T | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState("");
 const currentJob = useRef(jobId), epoch = useRef(0), pending = useRef<Record<string, unknown> | null>(null);
 currentJob.current = jobId;
 const load = useCallback(async () => {
  const requestEpoch = ++epoch.current; setBusy(true);
  try {
   const response = await fetch(`/api/jobs/${jobId}/${kind}`, { cache: "no-store" });
   if (!response.ok) throw new Error("Could not load. Try again.");
   const saved = parse(await response.json());
   if (currentJob.current === jobId && epoch.current === requestEpoch) setView(saved);
  } catch (e) { if (currentJob.current === jobId && epoch.current === requestEpoch) setError(e instanceof Error ? e.message : "Could not load."); }
  finally { if (epoch.current === requestEpoch) setBusy(false); }
 // parse wraps a module-level schema; only the job and kind select the request.
 }, [jobId, kind]);
 useEffect(() => { pending.current = null; setView(null); setError(""); void load(); return () => { epoch.current++; }; }, [load]);
 // A retry after an unknown outcome resends the same command id.
 const save = async (command: Record<string, unknown>) => {
  pending.current = command; setBusy(true); setError("");
  try {
   const response = await fetch(`/api/jobs/${jobId}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
   if (!response.ok) { const body = await response.json().catch(() => ({})) as { code?: string }; pending.current = null; setError(refusal(response.status, body.code)); }
   else pending.current = null;
  } catch { setError("The result is unknown. Retry the same save, or reload the list first."); }
  await load();
  return pending.current === null;
 };
 return { view, busy, error, load, save, pending };
}

export function JobDiary({ jobId }: { jobId: string }) {
 const { view, busy, error, save, pending } = useSource<DiaryRead>(jobId, "diary", raw => diaryReadV1.parse(raw));
 const [text, setText] = useState(""), [mode, setMode] = useState<"typed" | "dictated_text">("typed");
 const submit = async (retry: boolean) => {
  const command = retry && pending.current ? pending.current : diaryInputV1.parse({ version: "job-diary-input.v1", commandId: crypto.randomUUID(), entryMode: mode, onSite: false, text });
  if (await save(command)) setText("");
 };
 return <section id="job-diary" className={styles.panel} aria-labelledby="job-diary-title" aria-busy={busy} data-testid="job-diary">
  <h2 id="job-diary-title">Job diary</h2>
  {view && <p data-testid="diary-notice">{view.notice}</p>}
  {error && <p role="alert">{error}</p>}
  <div className={styles.field}><label htmlFor="diary-text">Note</label><textarea id="diary-text" value={text} maxLength={8000} disabled={busy} onChange={e => setText(e.target.value)}/></div>
  <div className={styles.actions}>
   <div className={styles.field}><label htmlFor="diary-mode">How it was written</label><select id="diary-mode" value={mode} disabled={busy} onChange={e => setMode(e.target.value as "typed" | "dictated_text")}><option value="typed">Typed</option><option value="dictated_text">Dictated, then checked</option></select></div>
   <label><input type="checkbox" disabled checked={false} readOnly/> Written on site (arrives with the jobs-on-the-go meter)</label>
   <button type="button" disabled={busy || text.trim() === ""} onClick={() => void submit(false)}>Save note</button>
   {pending.current && !busy && <button type="button" onClick={() => void submit(true)}>Retry the same save</button>}
  </div>
  <ol>{view?.entries.map(entry => <li key={entry.id} data-testid="diary-entry" data-entry-id={entry.id}><p style={{ whiteSpace: "pre-wrap" }}>{entry.text}</p><small>{entry.entryMode === "typed" ? "Typed" : "Dictated"} · {when(entry.evidence.serverReceivedAt)}</small></li>)}</ol>
 </section>;
}

export function CustomerMessages({ jobId }: { jobId: string }) {
 const { view, busy, error, save, pending } = useSource<CustomerMessageRead>(jobId, "customer-messages", raw => customerMessageReadV1.parse(raw));
 const [text, setText] = useState(""), [name, setName] = useState("");
 const submit = async (retry: boolean) => {
  const command = retry && pending.current ? pending.current : customerMessageInputV1.parse({ version: "customer-message-input.v1", commandId: crypto.randomUUID(), fictionalCustomer: { kind: "named_fictional_customer", name }, text });
  if (await save(command)) setText("");
 };
 return <section id="customer-messages" className={styles.panel} aria-labelledby="customer-messages-title" aria-busy={busy} data-testid="customer-messages">
  <h2 id="customer-messages-title">Customer messages</h2>
  <p>Practice sandbox: you type a message as a made-up customer. Nothing is sent to anyone.</p>
  {error && <p role="alert">{error}</p>}
  <div className={styles.actions}>
   <div className={styles.field}><label htmlFor="message-name">Made-up customer name</label><input id="message-name" value={name} maxLength={160} disabled={busy} onChange={e => setName(e.target.value)}/></div>
   <div className={styles.field}><label htmlFor="message-text">Message</label><textarea id="message-text" value={text} maxLength={8000} disabled={busy} onChange={e => setText(e.target.value)}/></div>
   <button type="button" disabled={busy || text.trim() === "" || name.trim() === ""} onClick={() => void submit(false)}>Save message</button>
   {pending.current && !busy && <button type="button" onClick={() => void submit(true)}>Retry the same save</button>}
  </div>
  <ol>{view?.messages.map(message => <li key={message.id} data-testid="customer-message" data-message-id={message.id}><strong>{message.fictionalCustomer.name}</strong><p style={{ whiteSpace: "pre-wrap" }}>{message.text}</p><small>{when(message.evidence.serverReceivedAt)}</small></li>)}</ol>
 </section>;
}
