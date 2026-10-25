"use client";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
// CH6-C's barrel is coordinator-owned; consume the same public module as A/P.
import { canonicalCommercialIntegritySnapshot, commercialIntegrityFamilyV1Schema, commercialIntegrityReviewV3Schema, commercialIntegrityV3ResultSchema } from "../../../../packages/core/dist/commercial-integrity-v3.js";
import { pounds } from "../lib/pounds";

const uuid = z.string().uuid().transform(v => v.toLowerCase());
const feedbackSchema = commercialIntegrityReviewV3Schema.extend({ commandId: uuid, jobId: uuid, recordedAt: z.string().datetime({ precision: 6 }) }).strict();
const viewSchema = z.object({ version: z.literal("commercial-integrity-view.v3"), advisory: z.literal(true), result: commercialIntegrityV3ResultSchema,
 feedback: z.array(feedbackSchema), availability: z.array(z.string()), published: z.unknown(), environment: z.literal("synthetic_demo"), jobId: uuid,
 notice: z.literal("Practice sandbox — synthetic data; nothing is sent or charged"), decisionRecord: z.object({ id: z.literal("D11"), status: z.literal("proposed"), approvalEvidence: z.null() }).strict(), realExternalActions: z.literal(0) }).strict();
const legacyFinding = z.object({ key: z.string(), kind: z.string(), reason: z.string(), policyVersion: z.string(), sourceReferences: z.array(z.string()), timeWindow: z.string().optional(), citedNumbers: z.record(z.number().int().safe()), dismissed: z.boolean() });
const legacySchema = z.object({ version: z.literal("commercial-integrity-view.v1"), environment: z.literal("synthetic_demo"), decisionRecord: z.object({ status: z.string() }), profile: z.object({ version: z.string(), label: z.string() }), acceptedCapPence: z.number().int().safe().nonnegative(), capBasisPence: z.number().int().safe().nonnegative(), findings: z.array(legacyFinding) });
export type LegacyIntegrityView = z.infer<typeof legacySchema>;
export type IntegrityV3View = z.infer<typeof viewSchema> & { snapshotHashes: Record<string, string> };
export type IntegrityState = { status: "loading" } | { status: "error"; message: string } | { status: "v1"; view: LegacyIntegrityView } | { status: "v3"; view: IntegrityV3View };
export type ReviewTarget = { key: string; reason: string; snapshotHash?: string };
type ReviewBody = { version: string; commandId: string; findingKey: string; explanation: string; outcome: "dismissed_false_positive"; findingSnapshotHash?: string };
export async function integritySnapshotHash(snapshot: IntegrityV3View["result"]["findings"][number]["sourceSnapshot"]): Promise<string> {
 const bytes = new TextEncoder().encode(canonicalCommercialIntegritySnapshot(snapshot));
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
class ReviewSaveError extends Error {}
const failure = "Recorded checks are unavailable. Reload to check current access and saved sources.";
async function responseJSON(response: Response) {
 if (!response.ok) throw new ReviewSaveError(response.status === 409 ? "The sources changed or this request conflicts. Reload before reviewing again." : failure);
 return response.json() as Promise<unknown>;
}
/** One mount owns one job/session generation. No storage, evaluator or optimistic feedback. */
export class IntegrityJourney {
 private generation = 0;
 private state: IntegrityState = { status: "loading" };
 private pending: { target: ReviewTarget; body: ReviewBody } | null = null;
 private saving = false;
 readonly jobId: string;
 constructor(jobId: string, private readonly publish: (state: IntegrityState) => void, private readonly request: typeof fetch = fetch) { this.jobId = jobId.toLowerCase(); }
 private set(state: IntegrityState) { this.state = state; this.publish(state); }
 clear() { ++this.generation; this.pending = null; this.saving = false; this.set({ status: "loading" }); }
 async load() {
  this.clear(); const generation = this.generation;
  try {
   uuid.parse(this.jobId);
   const family = commercialIntegrityFamilyV1Schema.parse(await responseJSON(await this.request(`/api/jobs/${this.jobId}/commercial-integrity/family`, { cache: "no-store" })));
   if (generation !== this.generation) return;
   if (family.jobId.toLowerCase() !== this.jobId) throw new Error(failure);
   const raw = await responseJSON(await this.request(`/api/jobs/${this.jobId}/commercial-integrity${family.family === "v3" ? "/v3" : ""}`, { cache: "no-store" }));
   if (generation !== this.generation) return;
   if (family.family === "v1") this.set({ status: "v1", view: legacySchema.parse(raw) });
   else {
    const view = viewSchema.parse(raw);
    if (view.jobId !== this.jobId || view.feedback.some(f => f.jobId !== this.jobId) || view.result.findings.some(f => f.sourceSnapshot.jobId.toLowerCase() !== this.jobId || f.sourceSnapshot.family !== "v3" || f.sourceSnapshot.findingKey !== f.key || f.sourceSnapshot.kind !== f.kind || f.window.start !== f.sourceSnapshot.window.start || f.window.end !== f.sourceSnapshot.window.end || f.sourceSnapshot.profile.version !== view.result.profileVersion || f.sourceReferences.some(s => s.tenantId.toLowerCase() !== f.sourceSnapshot.tenantId.toLowerCase() || s.scopeId !== f.sourceSnapshot.scopeId || (f.kind !== "related_sub2000_quotes_90_days" && s.jobId.toLowerCase() !== this.jobId)))) throw new Error(failure);
    const snapshotHashes = Object.fromEntries(await Promise.all(view.result.findings.map(async f => [f.key, await integritySnapshotHash(f.sourceSnapshot)])));
    if (generation === this.generation) this.set({ status: "v3", view: { ...view, snapshotHashes } });
   }
  } catch { if (generation === this.generation) this.set({ status: "error", message: failure }); }
 }
 async save(target: ReviewTarget, explanation: string): Promise<boolean> {
  if (this.saving || (this.state.status !== "v1" && this.state.status !== "v3")) return false;
  const family = this.state.status, generation = this.generation;
  if (!this.pending) {
   if (this.state.status === "v3" && (!this.state.view.result.findings.some(f => f.key === target.key) || this.state.view.snapshotHashes[target.key] !== target.snapshotHash)) throw new ReviewSaveError("Review the recorded sources before saving.");
   const body: ReviewBody = { version: family === "v3" ? "commercial-integrity-review.v3" : "commercial-integrity-review.v1", commandId: crypto.randomUUID().toLowerCase(), findingKey: target.key, explanation: explanation.trim(), outcome: "dismissed_false_positive", ...(family === "v3" ? { findingSnapshotHash: target.snapshotHash } : {}) };
   if (!body.explanation || body.explanation.length > 500 || (family === "v3" && !commercialIntegrityReviewV3Schema.safeParse(body).success)) throw new ReviewSaveError("Review the recorded sources before saving.");
   this.pending = { target, body };
  }
  // Retry the exact request after an unknown result. Editing requires an explicit reload.
  if (this.pending.target.key !== target.key || this.pending.body.explanation !== explanation.trim() || this.pending.target.snapshotHash !== target.snapshotHash) throw new ReviewSaveError("Reload before changing an uncertain review.");
  this.saving = true;
  try {
   const body = this.pending.body;
   const raw = await responseJSON(await this.request(`/api/jobs/${this.jobId}/commercial-integrity${family === "v3" ? "/v3" : ""}/reviews`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
   if (generation !== this.generation) return false;
   if (family === "v3") {
    const feedback = feedbackSchema.parse(raw);
    if (feedback.jobId !== this.jobId || Object.entries(body).some(([k, v]) => feedback[k as keyof typeof feedback] !== v)) throw new Error(failure);
   } else legacySchema.parse(raw);
   this.pending = null;
   await this.load(); // No client-side dismissed flag; re-read persisted state through family selection.
   return generation + 1 === this.generation && (this.state.status === "v1" || this.state.status === "v3");
  } finally { if (generation === this.generation || generation + 1 === this.generation) this.saving = false; }
 }
}
const targetStyle = { minHeight: 44, minWidth: 44 };
export function useIntegrityJourney(jobId: string) {
 const [state, setState] = useState<IntegrityState>({ status: "loading" });
 const [review, setReview] = useState<ReviewTarget | null>(null), [explanation, setExplanation] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const journey = useRef<IntegrityJourney | null>(null), epoch = useRef(0), textarea = useRef<HTMLTextAreaElement>(null), trigger = useRef<HTMLButtonElement | null>(null);
 const reset = () => { ++epoch.current; setReview(null); setExplanation(""); setError(""); setBusy(false); };
 useEffect(() => {
  const current = new IntegrityJourney(jobId, setState); journey.current = current;
  const reload = () => { reset(); void current.load(); };
  const invalidate = () => { reset(); current.clear(); };
  const visibility = () => { reset(); if (document.hidden) current.clear(); else void current.load(); };
  reload(); window.addEventListener("focus", reload); window.addEventListener("pageshow", reload); document.addEventListener("visibilitychange", visibility);
  // Explicit hook for the shell's session reset; HttpOnly session handles never enter this component.
  window.addEventListener("jg:session-changing", invalidate); window.addEventListener("jg:session-changed", reload);
  return () => { reset(); current.clear(); window.removeEventListener("focus", reload); window.removeEventListener("pageshow", reload); window.removeEventListener("jg:session-changing", invalidate); window.removeEventListener("jg:session-changed", reload); document.removeEventListener("visibilitychange", visibility); };
 }, [jobId]);
 useEffect(() => { if (review) textarea.current?.focus(); }, [review]);
 async function open(target: ReviewTarget, button: HTMLButtonElement, snapshot?: IntegrityV3View["result"]["findings"][number]["sourceSnapshot"]) {
  const generation = ++epoch.current; trigger.current = button; setError("");
  try { const snapshotHash = snapshot ? await integritySnapshotHash(snapshot) : undefined;
   if (generation === epoch.current) { setReview({ ...target, ...(snapshotHash ? { snapshotHash } : {}) }); setExplanation(""); }
  } catch { if (generation === epoch.current) setError("Source verification is unavailable. Reload before reviewing."); }
 }
 function close() { setReview(null); trigger.current?.focus(); }
 async function save() {
  if (!review || busy) return; const generation = epoch.current; setBusy(true); setError("");
  try { if (await journey.current?.save(review, explanation)) { if (generation === epoch.current) close(); }
   else if (generation === epoch.current) setError("Save could not be confirmed. Reload to inspect the saved review.");
  } catch (e) { if (generation === epoch.current) { setError(e instanceof ReviewSaveError ? e.message : "Save is unconfirmed. Retry the same review or reload."); textarea.current?.focus(); } }
  finally { if (generation === epoch.current) setBusy(false); }
 }
 const dialog = review && <aside role="dialog" aria-label="Review or dismiss" className="inbox-detail" onKeyDown={e => { if (e.key === "Escape" && !busy) close(); }}><h3>Review or dismiss</h3><p>{review.reason}</p><label>Explain why this may be a false positive<textarea ref={textarea} aria-label="False-positive explanation" value={explanation} maxLength={500} disabled={busy} onChange={e => setExplanation(e.target.value)} /></label><p>This saves advisory feedback only.</p><button style={targetStyle} disabled={busy || !explanation.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Dismiss as false positive"}</button><button style={targetStyle} disabled={busy} onClick={close}>Close</button></aside>;
 return { state, open, dialog, error, reload: () => { reset(); void journey.current?.load(); } };
}
export function IntegrityV3Results({ view, open }: { view: IntegrityV3View; open: (target: ReviewTarget, button: HTMLButtonElement, snapshot: IntegrityV3View["result"]["findings"][number]["sourceSnapshot"]) => Promise<void> }) {
 const [filter, setFilter] = useState<"open" | "dismissed" | "all">("open");
 const dismissed = (f: IntegrityV3View["result"]["findings"][number]) => view.feedback.some(r => r.findingKey === f.key && r.findingSnapshotHash === view.snapshotHashes[f.key]);
 const findings = view.result.findings.filter(f => filter === "all" || dismissed(f) === (filter === "dismissed"));
 return <><p>Recorded advisory checks · v3</p><p>Example thresholds — not a judgement or billing rule</p><p>Profile: {view.result.profileVersion}. Some source rules are unavailable; this is not a complete assessment.</p><div className="filter-row" aria-label="Things-to-check filter">{(["open", "dismissed", "all"] as const).map(f => <button style={targetStyle} key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "open" ? "Things to check" : f === "dismissed" ? "Dismissed" : "All"}</button>)}</div>
 {findings.length === 0 && <p>No recorded ordinary findings in this filter. Unavailable sources have not been assessed.</p>}
 {findings.map((f, index) => <article className="inbox-card" key={index}><h3>{f.reason}</h3><p>Rule/version: {f.kind} · {f.sourceSnapshot.profile.ruleVersion}</p><p>Time window: {f.window.start} to {f.window.end} (UTC)</p><details><summary>Inspect recorded sources and plain reason</summary><p>Plain reason: {f.reason}</p><ul>{f.sourceReferences.map((s, i) => <li key={i}>{s.jobId.toLowerCase() === view.jobId ? "This job" : "Authorised related job"} · {sourceLabel(s.sourceType)} · recorded {s.recordedAt} (UTC) · {s.provenance === "builder_attested" ? "Builder attestation; not settlement proof" : s.provenance === "synthetic_settled" ? "Synthetic settled record" : s.provenance === "published_final_check" ? "Published Final Check record" : "Server record"}</li>)}</ul><p>Source navigation is unavailable for these record types.</p>{Object.entries(f.sourceSnapshot.compared).map(([key, value]) => comparedText(key, value)).filter((text): text is string => text !== null).map((text, i) => <p key={i}>{text}</p>)}</details>{dismissed(f) ? <p>Dismissed as a possible false positive; the saved feedback remains append-only.</p> : <button style={targetStyle} onClick={e => void open({ key: f.key, reason: f.reason }, e.currentTarget, f.sourceSnapshot)}>Review or dismiss</button>}</article>)}
 <p>Available ordinary records only. Missing source rules remain unavailable.</p></>;
}
function sourceLabel(type: string) { return ({ customer_invoice: "Invoice record", customer_payment: "Payment record", quote: "Quote record", work_event: "Work activity record" } as Record<string, string>)[type] ?? "Recorded source"; }
function comparedText(key: string, value: unknown): string | null {
 const money: Record<string, string> = { receiptPence: "Recorded receipts", accountPence: "Recorded account", firstPence: "First quote", secondPence: "Second quote", maximumPenceExclusive: "Quote threshold (exclusive)", pence: "Recorded correction" };
 if (money[key]) {
  const number = typeof value === "string" && /^\d{1,13}$/u.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000_000_000 ? `${money[key]}: ${pounds(number)}` : null;
 }
 const labels: Record<string, string> = { acceptedAt: "Recorded acceptance (UTC)", delayMicroseconds: "Reference delay (microseconds)", activation: "Recorded activation", lockState: "Recorded lock", activityKind: "Activity", basis: "Amount basis", distanceMicroseconds: "Quote separation (microseconds)", endpoint: "Window endpoint", cycles: "Linked cycles", minimumCycles: "Reference minimum cycles", payments: "Explicit payments", minimumPayments: "Reference minimum payments", disposition: "Published disposition", evidenceState: "Evidence state", correctionKind: "Correction type", cutoff: "Published cutoff (UTC)" };
 return labels[key] && (typeof value === "string" || typeof value === "number") ? `${labels[key]}: ${value}` : null;
}
/** Standalone seam for future page composition; the installed wrapper uses the same journey. */
export function CommercialIntegrityV3({ jobId }: { jobId: string }) { return <V3Panel key={jobId.toLowerCase()} jobId={jobId.toLowerCase()} />; }
function V3Panel({ jobId }: { jobId: string }) {
 const journey = useIntegrityJourney(jobId);
 return <section aria-label="Recorded advisory checks"><h2>Recorded advisory checks</h2>{journey.state.status === "v3" ? <IntegrityV3Results view={journey.state.view} open={journey.open} /> : journey.state.status === "loading" ? <p role="status">Loading recorded sources…</p> : <p role="alert">Recorded v3 checks are unavailable.</p>}{journey.error && <p role="alert">{journey.error}</p>}{journey.dialog}</section>;
}
