"use client";
import { useRef, useState, type FormEvent } from "react";

export function sourceAnswer(action: "materials" | "evaluate", result: Record<string, unknown>): string {
  if (typeof result.quarantinedComparisons === "number" && result.quarantinedComparisons > 0)
    return "A return, correction or conflicting stores fact has put a comparison on hold. The movement is kept; quantities are not subtracted.";
  if (action === "materials") return "Materials movement saved. Check for possible extras to see the server’s answer.";
  return Array.isArray(result.promptIds) && result.promptIds.length > 0
    ? "A possible extra was raised. The supervisor can read it in Possible extras."
    : "Nothing was raised. Some comparisons may need more source information.";
}
export function sourceRefusal(code: unknown): string {
  const messages: Record<string, string> = {
    NOT_FOUND: "This job or action is not available to your current access.",
    UNAUTHENTICATED: "Sign in to contractor practice again.",
    PROMPT_CONFLICT: "This reference or command was already used with different details. Check the original movement.",
    INVALID_PROMPT_COMMAND: "The server refused the movement details. Check the fields.",
    PROMPT_SOURCE_INVALID: "The source could not be verified for this job.",
    MODE_FORBIDDEN: "Materials practice is unavailable here.",
    JOB_NOT_LIVE: "This job is not live.",
  };
  return typeof code === "string" ? `${messages[code] ?? "The server refused this request."} (${code})` : "The server is unavailable. Try the same request again.";
}
export function MaterialsIssues({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [refused, setRefused] = useState(false);
  // Preserve a command on an uncertain network outcome; changed details use a new command.
  const pending = useRef<{ signature: string; commandId: string } | null>(null);
  async function send(action: "materials" | "evaluate", fields: Record<string, string>) {
    const signature = JSON.stringify({ action, fields });
    if (pending.current?.signature !== signature) pending.current = { signature, commandId: crypto.randomUUID() };
    setBusy(true); setAnswer(""); setRefused(false);
    try {
      const response = await fetch(`/api/contractor/jobs/${encodeURIComponent(jobId)}/possible-extras/${action}`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ version: action === "materials" ? "materials-issue.v1" : "evaluate-live-prompts.v1", commandId: pending.current.commandId, ...fields }),
      });
      const result = await response.json();
      setRefused(!response.ok);
      setAnswer(response.ok ? sourceAnswer(action, result) : sourceRefusal(result.code));
      // A completed evaluation can be requested afresh. Imports retain their command for double submits.
      if (response.ok && action === "evaluate") pending.current = null;
    } catch { setRefused(true); setAnswer(sourceRefusal(undefined)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));
    const millis = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isSafeInteger(millis) || millis < 0) { setRefused(true); setAnswer("Choose a date from 1970 onwards."); return; }
    void send("materials", {
      sourceId: String(form.get("sourceId")), eventId: String(form.get("eventId")),
      workIdentity: String(form.get("workIdentity")), unit: String(form.get("unit")),
      quantity: String(form.get("quantity")), occurredAtMicros: (BigInt(millis) * 1000n).toString(), kind: String(form.get("kind")),
    });
  }
  const target = { minHeight: 44, width: "100%", boxSizing: "border-box" as const };
  return <section aria-label="Stores movement" style={{ maxWidth: 520, padding: 16 }}>
    <p>Record one movement from stores. The server compares the work code and unit with the order. Returns and corrections stay on record for review.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}><legend>One stores movement</legend>
        {([["sourceId", "Stores reference"], ["eventId", "Event reference"], ["workIdentity", "Work code"], ["unit", "Unit"], ["quantity", "Quantity"]] as const).map(([name, label]) => <label key={name} style={{ display: "block", marginBlock: 12 }} htmlFor={name}>{label}<input id={name} name={name} required maxLength={name === "quantity" ? 25 : 200} inputMode={name === "quantity" ? "decimal" : "text"} style={target} /></label>)}
        <label htmlFor="date">Date (UTC)<input id="date" name="date" type="date" min="1970-01-01" required style={target} /></label>
        <label htmlFor="kind">Movement<select id="kind" name="kind" style={target}><option value="issue">Issued to the job</option><option value="return">Returned to stores</option><option value="correction">Correction to a stores record</option></select></label>
        <button style={{ ...target, marginBlock: 16 }} type="submit">Save materials movement</button>
      </fieldset>
    </form>
    <button style={target} disabled={busy} onClick={() => void send("evaluate", {})}>Check for possible extras</button>
    <p role={refused ? "alert" : "status"} aria-live="polite">{busy ? "Waiting for the server…" : answer}</p>
  </section>;
}
