"use client";
import { useRef, useState } from "react";
import { z } from "zod";
import { PossibleExtras } from "../../../../ui/possible-extras";
const resultSchema = z.object({ jobId: z.guid(), finishedAt: z.string(), checkRan: z.boolean(), promptsRaised: z.number().int().nonnegative() });
const failureSchema = z.object({ version: z.literal("enterprise-live-prompt-error.v1"), code: z.string() });
export function finishRefusalMessage(status: number, body: unknown): string {
 if (status === 401 || status === 403) return "This request is not permitted. Check your session and access, then reload.";
 const failure = failureSchema.safeParse(body);
 if (failure.success) {
  switch (failure.data.code) {
   case "UNAUTHENTICATED":
   case "EXTRA_FORBIDDEN":
   case "ORIGIN_FORBIDDEN":
   case "MODE_FORBIDDEN":
   case "PROMPT_PRACTICE_ONLY": return "This request is not permitted. Check your session and access, then reload.";
   case "JOB_NOT_LIVE": return "This job cannot be finished in its present state. Reload to check its current status.";
   // The server uses the same conflict code for an open visit, an existing finish or stale agreement state.
   case "PROMPT_CONFLICT": return "The job state has changed or a site visit is still open. Close any open visit first, then reload to check the recorded job state.";
  }
 }
 return "The server refused this finish request. Reload to check the current job state before continuing.";
}
export function FinishConfirmation({ busy, confirm, cancel }: { busy: boolean; confirm: () => void; cancel: () => void }) {
 return <section aria-label="Confirm job finish"><p>Finish this job? Any end-of-job check enabled by your agreement will run now.</p>
  <button type="button" disabled={busy} onClick={confirm}>Confirm finish</button>
  <button type="button" disabled={busy} onClick={cancel}>Cancel</button></section>;
}
export function JobFinish({ jobId, canFinish, initialFinish }: { jobId: string; canFinish: boolean; initialFinish: unknown }) {
 const parsed = resultSchema.safeParse(initialFinish);
 const [finish, setFinish] = useState(parsed.success && parsed.data.jobId === jobId ? parsed.data : null);
 const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const [refused, setRefused] = useState(false);
 const command = useRef<string | null>(null), lock = useRef(false);
 async function submit() {
  if (!canFinish || lock.current || finish || refused) return;
  lock.current = true; setBusy(true); setError("");
  command.current ??= crypto.randomUUID();
  try {
   const response = await fetch(`/api/contractor/jobs/${encodeURIComponent(jobId)}/finish`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "end-check.v1", commandId: command.current }) });
   if (response.status >= 400 && response.status < 500) {
    const body: unknown = await response.json().catch(() => null);
    setError(finishRefusalMessage(response.status, body)); setRefused(true); setConfirming(false); return;
   }
   const result = resultSchema.safeParse(await response.json());
   if (!response.ok || !result.success || result.data.jobId !== jobId) throw new Error("refused");
   setFinish(result.data); setConfirming(false);
  } catch { setError("The finish could not be confirmed. Retry checks the same request; reload to check the recorded job state."); }
  finally { lock.current = false; setBusy(false); }
 }
 return <>
  {canFinish && <section aria-label="Job completion">
   {finish ? <p role="status">Job finished · {finish.promptsRaised} possible extras raised{finish.checkRan ? "." : ". End-of-job check was not enabled."}</p>
    : refused ? null
    : confirming ? <FinishConfirmation busy={busy} confirm={() => void submit()} cancel={() => setConfirming(false)}/>
    : <button type="button" onClick={() => setConfirming(true)}>Finish job</button>}
   {error && <p role="alert">{error}</p>}
  </section>}
  <PossibleExtras key={finish?.finishedAt ?? "unfinished"} jobId={jobId}/>
 </>;
}
