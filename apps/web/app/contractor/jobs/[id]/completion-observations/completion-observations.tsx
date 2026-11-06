"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { completionObservationBodyV1 } from "@jobguard/core";

const evidence = z.object({ evidenceId: z.guid(), sha256: z.string().regex(/^[a-f0-9]{64}$/u), objectVersion: z.string().min(1),
 mediaKind: z.enum(["completion_photo", "completion_note"]), photoTags: z.array(z.string()), capturedAt: z.string().nullable() }).strict();
const list = z.object({ version: z.literal("observation-evidence.v1"), items: z.array(evidence) }).strict();
type Evidence = z.infer<typeof evidence>;
type Command = z.infer<typeof completionObservationBodyV1>;
type Fields = { tag: string; work: string; sourceText: string; quote: string; start: string; end: string };
const empty: Fields = { tag: "", work: "", sourceText: "", quote: "", start: "", end: "" };
const control = { minHeight: 44, minWidth: 44, width: "100%", maxWidth: "100%", boxSizing: "border-box" as const, font: "inherit" };
/** Only binds a human's explicit selection; all source verification/evaluation remains on the server. */
export function observationBody(source: Evidence, fields: Fields, commandId: string): Command {
 const body: Command = { version: "completion-observation.v1", commandId,
  evidenceId: source.evidenceId, sha256: source.sha256, objectVersion: source.objectVersion, workIdentity: fields.work,
  ...(source.mediaKind === "completion_photo" ? { locator: { kind: "photo_tag", tag: fields.tag } } : {
   sourceText: fields.sourceText, locator: { kind: "text_span", start: /^\d+$/u.test(fields.start) ? Number(fields.start) : NaN,
    end: /^\d+$/u.test(fields.end) ? Number(fields.end) : NaN, quote: fields.quote } }) };
 completionObservationBodyV1.parse(body);
 return body;
}
const refusals: Record<string, string> = {
 EXTRA_FORBIDDEN: "This job is not available to your account.", NOT_FOUND: "This job is not available to your account.",
 UNAUTHENTICATED: "Sign in again to continue.", MODE_FORBIDDEN: "Completion observations are available only in practice mode.",
 PROMPT_SOURCE_INVALID: "The server refused this evidence or its citation. Check your selection and exact text.",
 INVALID_PROMPT_COMMAND: "The server refused the observation. Check the fields.", PROMPT_CONFLICT: "The server refused a conflicting observation.",
 JOB_NOT_LIVE: "This job is not open for completion observations.", PROMPT_PRACTICE_ONLY: "Completion observations are available only in practice mode.",
};
/** Exported request helper also lets unit tests exercise retries without a browser renderer. */
export async function sendObservation(url: string, body: Command, request: typeof fetch = fetch) {
 try {
  const response = await request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (response.status >= 500 || [408, 429].includes(response.status)) return { uncertain: true, saved: false, message: "The result is uncertain. Retry the same observation." };
  const raw: unknown = await response.json();
  if (!response.ok) {
   const error = z.object({ code: z.string() }).safeParse(raw);
   return { uncertain: false, saved: false, message: error.success ? (refusals[error.data.code] ?? "The server refused this observation.") : "The server refused this observation." };
  }
  const result = z.object({ observationId: z.guid() }).safeParse(raw);
  if (!result.success) return { uncertain: true, saved: false, message: "The result is uncertain. Retry the same observation." };
  return { uncertain: false, saved: true, message: `Observation recorded. Reference: ${result.data.observationId}` };
 } catch { return { uncertain: true, saved: false, message: "The result is uncertain. Retry the same observation." }; }
}
export function CompletionObservations({ jobId }: { jobId: string }) {
 const [items, setItems] = useState<Evidence[]>([]), [selected, setSelected] = useState("");
 const [fields, setFields] = useState<Fields>(empty), [message, setMessage] = useState("Loading evidence…");
 const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [saved, setSaved] = useState(false);
 const pending = useRef<Command | null>(null), sending = useRef(false);
 const base = `/api/contractor/jobs/${encodeURIComponent(jobId)}/possible-extras`;
 useEffect(() => {
  const abort = new AbortController();
  void (async () => {
   try {
    const response = await fetch(`${base}/evidence`, { cache: "no-store", signal: abort.signal });
    if (!response.ok) throw new Error("Evidence is not available for this job. Check your access and try again.");
    const result = list.parse(await response.json()); setItems(result.items);
    setMessage(result.items.length ? "Choose evidence for your observation." : "No usable completion evidence is available for this job.");
   } catch { if (!abort.signal.aborted) setMessage("Evidence is not available for this job. Check your access and try again."); }
  })();
  return () => abort.abort();
 }, [base]);
 const source = items.find(item => item.evidenceId === selected);
 const field = (name: keyof Fields) => ({ value: fields[name], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFields({ ...fields, [name]: e.target.value }), style: control });
 async function submit(event: React.FormEvent) {
  event.preventDefault(); if (sending.current || !source || saved) return;
  try { pending.current ??= observationBody(source, fields, crypto.randomUUID()); }
  catch { setMessage("Enter a work identity and a stored photo tag, or source text with an exact quote and valid offsets."); return; }
  sending.current = true; setBusy(true);
  const result = await sendObservation(`${base}/observations`, pending.current);
  setMessage(result.message); setUncertain(result.uncertain); setSaved(result.saved);
  if (!result.uncertain) pending.current = null;
  sending.current = false; setBusy(false);
 }
 return <main style={{ maxWidth: 640, margin: "0 auto", padding: 16, color: "#171717", background: "#fff" }}>
  <h1>Completion observations</h1>
  <p>Record what the evidence says. The server checks the source and work identity.</p>
  <p role="status" aria-live="polite">{message}</p>
  <form onSubmit={submit}>
   <fieldset disabled={busy || uncertain || saved} style={{ minWidth: 0, border: 0, padding: 0 }}>
    <legend>Observation details</legend>
    <label htmlFor="evidence">Completion evidence</label>
    <select id="evidence" style={control} required value={selected} onChange={e => { setSelected(e.target.value); setFields(empty); }}>
     <option value="">Choose evidence</option>
     {items.map(item => <option key={item.evidenceId} value={item.evidenceId}>{item.mediaKind === "completion_photo" ? "Photo" : "Text note"} · {item.capturedAt ?? "Capture time unknown"} · {item.evidenceId}</option>)}
    </select>
    {source?.mediaKind === "completion_photo" && <><label htmlFor="tag">Stored photo tag</label><select id="tag" required {...field("tag")}>
     <option value="">Choose a stored tag</option>{source.photoTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
    </select>{!source.photoTags.length && <p>This photo has no stored completion tags.</p>}</>}
    {source?.mediaKind === "completion_note" && <>
     <label htmlFor="source">Exact source text</label><textarea id="source" required maxLength={100000} {...field("sourceText")}/>
     <label htmlFor="quote">Exact quote</label><textarea id="quote" required maxLength={1000} {...field("quote")}/>
     <p id="offset-help">Offsets count UTF-16 code units from zero. The end is exclusive.</p>
     <label htmlFor="start">Start offset</label><input id="start" required inputMode="numeric" aria-describedby="offset-help" {...field("start")}/>
     <label htmlFor="end">End offset</label><input id="end" required inputMode="numeric" aria-describedby="offset-help" {...field("end")}/>
    </>}
    <label htmlFor="work">Work identity</label><input id="work" required maxLength={200} {...field("work")}/>
   </fieldset>
   <button type="submit" style={control} disabled={busy || saved || !source || (source.mediaKind === "completion_photo" && !source.photoTags.length)}>{uncertain ? "Retry same observation" : "Record observation"}</button>
  </form>
  {saved && <button type="button" style={control} onClick={() => { setSaved(false); setSelected(""); setFields(empty); setMessage("Choose evidence for your observation."); }}>Record another observation</button>}
 </main>;
}
