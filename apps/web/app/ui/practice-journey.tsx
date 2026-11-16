"use client";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { feeIllustrationResponseV1 } from "@jobguard/api/fee-illustration-contracts";
import { practiceInvoiceResponseV1 } from "@jobguard/api/customer-invoice-contracts";
import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { quoteWorkspaceResponseV1 } from "@jobguard/api/quote-contracts";
import { finalAccountResponseV1 } from "@jobguard/api/final-account-contracts";
import { finalCheckReadV1 } from "./final-check-reveal-view";
import { derivePracticeNextStep } from "./practice-next-step";
import { variationWorkspaceResponseV1 } from "@jobguard/api/variation-contracts";

const proofView = z.object({
 version: z.literal("practice-proof-view.v1"), environment: z.literal("synthetic_demo"), jobId: z.string().uuid(),
 completion: z.object({ id: z.string().uuid(), reviewRequired: z.boolean() }).nullable(), realExternalActions: z.literal(0),
});
type Facts = Parameters<typeof derivePracticeNextStep>[0] & { variations: { jobId: string; variations: import("@jobguard/api/variation-contracts").VariationWorkspaceResponse["variations"] } };
type Snapshot = { facts: Facts; realExternalActions: 0 };
// These endpoints expose no exported response parser. Select only their documented fields.
const lockView = z.object({ version: z.literal("final-account-lock.view.v1"), jobId: z.string().uuid(), lock: z.object({ id: z.string().uuid() }).nullable() });
const deliveryView = z.object({ documentId: z.string().uuid(), quoteRevision: z.number().int(), status: z.enum(["previewed", "queued", "simulated_delivery", "outcome_unknown", "cancelled"]) }).nullable();
type ReadState = { jobId: string; status: string } & (
 { phase: "loading" } | { phase: "failed"; userInitiated: boolean } | { phase: "ready"; snapshot: Snapshot }
);

// Absence is allowed only for the named endpoint's documented lifecycle response.
async function readJson(path: string, signal: AbortSignal, absent?: { status: number; code: string }) {
 const response = await fetch(path, { cache: "no-store", signal });
 const body: unknown = await response.json();
 if (response.ok) return body;
 if (absent && response.status === absent.status && z.object({ code: z.literal(absent.code) }).strict().safeParse(body).success) return undefined;
 throw new Error("Practice progress unavailable");
}

/** Persisted read models decide the next step; this component never advances a job locally. */
export function PracticeJourney({ jobId, status, onSavedLabel, onNavigate }: { jobId: string; status: string; onSavedLabel?: (label: string | null) => void; onNavigate?: (target: string) => void }) {
 const [state, setState] = useState<ReadState>({ jobId, status, phase: "loading" });
 const navigationCleanup = useRef<(() => void) | null>(null);
 const generation = useRef(0), activeRequest = useRef<AbortController | null>(null);
 const currentJob = useRef({ jobId, status }); currentJob.current = { jobId, status };
 const errorHeading = useRef<HTMLHeadingElement>(null), retryButton = useRef<HTMLButtonElement>(null);
 const load = useCallback(async (userInitiated = false) => {
  const request = ++generation.current;
  activeRequest.current?.abort();
  const controller = new AbortController(); activeRequest.current = controller;
  const isCurrent = () => request === generation.current && !controller.signal.aborted && currentJob.current.jobId === jobId && currentJob.current.status === status;
  setState({ jobId, status, phase: "loading" });
  try {
   const path = `/api/jobs/${jobId}`, beforeActivation = ["draft", "quoting", "accepted", "lost"].includes(status);
   const [proposalRaw, quoteRaw, deliveryRaw, proofRaw, variationsRaw, accountRaw, lockRaw, checkRaw, invoicesRaw, feeRaw] = await Promise.all([
    readJson(`${path}/proposal`, controller.signal),
    readJson(`${path}/quotes`, controller.signal, status === "draft" ? { status: 404, code: "NOT_FOUND" } : undefined),
    readJson(`${path}/quotes/delivery`, controller.signal),
    readJson(`${path}/proof`, controller.signal, beforeActivation ? { status: 404, code: "NOT_FOUND" } : undefined),
    readJson(`${path}/variations`, controller.signal, beforeActivation ? { status: 400, code: "ACTIVATION_REQUIRED" } : undefined),
    readJson(`${path}/final-account`, controller.signal),
    readJson(`${path}/final-account/lock`, controller.signal),
    readJson(`${path}/final-check`, controller.signal, beforeActivation ? { status: 403, code: "FINAL_CHECK_FORBIDDEN" } : undefined),
    readJson(`${path}/customer-invoices`, controller.signal),
    readJson(`${path}/fee-illustration`, controller.signal, { status: 404, code: "NOT_FOUND" }),
   ]);
   const proposal = captureWorkspaceResponseV1.parse(proposalRaw);
   if ((variationsRaw === undefined && !["draft", "quoting", "accepted", "lost"].includes(proposal.status)) || (proofRaw === undefined && !["draft", "quoting", "accepted", "lost"].includes(proposal.status)) || (quoteRaw === undefined && proposal.status !== "draft")) throw new Error("Unexpected projection absence");
   const quote = quoteRaw === undefined ? { jobId, draft: null } : quoteWorkspaceResponseV1.parse(quoteRaw);
   const delivery = deliveryView.parse(deliveryRaw);
   const proof = proofRaw === undefined ? { jobId, completion: null } : proofView.parse(proofRaw);
   const variations = variationsRaw === undefined ? { jobId, variations: [] } : variationWorkspaceResponseV1.parse(variationsRaw);
   const account = finalAccountResponseV1.parse(accountRaw);
   const lock = lockView.parse(lockRaw);
   const check = checkRaw === undefined ? undefined : finalCheckReadV1.parse(checkRaw);
   const invoices = practiceInvoiceResponseV1.parse(invoicesRaw);
   // Preserve the existing read-health check; an illustration never decides payment completion.
   if (feeRaw !== undefined) feeIllustrationResponseV1.parse(feeRaw);
   if (proposal.jobId !== jobId || [quote, proof, variations, account, lock, invoices].some(view => view.jobId !== jobId)) throw new Error("Wrong job projection");
   const facts: Facts = {
    job: { id: proposal.jobId, status: proposal.status, scopeIdentityIds: proposal.review?.lines.filter(line => line.disposition === "accepted").map(line => line.scopeItemId) ?? [] },
    quote, delivery: delivery && "revision" in (quote.draft ?? {}) && delivery.quoteRevision !== (quote.draft as { revision: number }).revision ? null : delivery, proof, variations, account, lock, check, invoices,
   };
   if (derivePracticeNextStep(facts).nextStep === "unavailable") throw new Error("Incomplete saved facts");
   if (isCurrent()) setState({ jobId, status, phase: "ready", snapshot: { facts, realExternalActions: 0 } });
  } catch {
   if (isCurrent()) setState({ jobId, status, phase: "failed", userInitiated });
  }
 }, [jobId, status]);
 useEffect(() => { void load(); return () => { generation.current++; activeRequest.current?.abort(); navigationCleanup.current?.(); }; }, [load]);
 useEffect(() => {
  if (typeof window === "undefined") return;
  const changed = (event: Event) => {
   const detail: unknown = (event as CustomEvent).detail;
   const id = event.type === "job-lifecycle-changed" ? detail : (detail as { jobId?: unknown } | null)?.jobId;
   if (id === jobId) void load();
  };
  const focus = () => { void load(); };
  const names = ["job-saved", "job-lifecycle-changed", "jobguard:invoice-changed", "jobguard:final-check-changed"];
  names.forEach(name => window.addEventListener(name, changed)); window.addEventListener("focus", focus);
  return () => { names.forEach(name => window.removeEventListener(name, changed)); window.removeEventListener("focus", focus); };
 }, [jobId, load]);
 const pending = state.phase === "ready" && state.jobId === jobId && state.snapshot.facts.check?.state === "pending";
 const polls = useRef(0);
 useEffect(() => {
  if (!pending) { if (state.phase === "ready" && state.snapshot.facts.check?.state !== "pending") polls.current = 0; return; }
  if (polls.current >= 90) return;
  const timer = window.setTimeout(() => { polls.current++; void load(); }, 2000);
  return () => window.clearTimeout(timer);
 }, [pending, state, load]);
 useEffect(() => {
  if (state.phase !== "ready" || state.jobId !== jobId) { onSavedLabel?.(null); return; }
  const result = derivePracticeNextStep(state.snapshot.facts);
  onSavedLabel?.(result.nextStep === "complete" ? result.completion === "paid" ? "Complete — customer paid" : result.completion === "credit_assisted" ? "Complete — payments and credits" : result.completion === "credit_only" ? "Complete — settled by credit" : "Complete — no payment due" : null);
 }, [state, jobId, onSavedLabel]);
 const phase = state.jobId === jobId && state.status === status ? state.phase : "loading";
 useEffect(() => {
  // Automatic reads announce through the alert without taking focus. A requested
  // check owns focus only while the user has not moved to another control.
  if (phase === "failed" && state.phase === "failed" && state.userInitiated &&
   (document.activeElement === retryButton.current || document.activeElement === document.body)) errorHeading.current?.focus();
 }, [phase, state]);
 const retry = <button ref={retryButton} type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={() => void load(true)}>{phase === "failed" ? "Try checking saved progress again" : "Check saved progress"}</button>;
 if (phase !== "ready" || state.phase !== "ready") return <section className="journey-progress" aria-label="Practice journey progress" data-testid="uiwire15-journey">
  <p className="eyebrow">One persisted practice job</p>
  {phase === "failed" ? <div role="alert"><h2 ref={errorHeading} tabIndex={-1}>Saved progress could not be checked</h2><p>Earlier progress may be out of date. Balance, next step and completion are unavailable until a fresh check succeeds.</p></div> : <p role="status">Checking saved progress… Balance and completion are not yet known.</p>}
  {retry}
 </section>;
 const snapshot = state.snapshot, result = derivePracticeNextStep(snapshot.facts);
 const step = result.nextStep;
 const extras = snapshot.facts.variations?.variations.find(item => !["withdrawn", "rejected"].includes(item.state) && !(item.state === "approved" && item.revisions.some(revision => revision.id === item.currentRevisionId && revision.approved)));
 const invoice = snapshot.facts.invoices?.invoices.find(item => item.balancePence > 0);
 const destinations = {
  confirm_scope: ["Review and confirm the captured work", "#scope"], prepare_quote: ["Prepare and send this quote", "#quote"],
  record_acceptance: ["Record customer acceptance", "#quote"], activate_job: ["Start this practice job", "#quote"], review_quote: ["Review saved quote history", "#scope"],
  complete_proof: ["Finish the work and required proof", "#work-proof"], resolve_extras: ["Resolve the pending extra", "#variations-title"],
  review_account: ["Build and complete the final account", "#final-account-title"], final_check: ["Finish JobGuard’s final check", "#final-check"],
  issue_invoice: ["Issue the customer invoice", "#final-account-title"], record_payment: ["Record the next customer payment", `#invoice-${invoice?.id}`],
  complete: ["Complete", "#scope"], unavailable: ["Saved progress unavailable", "#scope"],
 } as const;
 const [label, fallback] = destinations[step];
 // Only validated saved identities enter fragments; never build a CSS selector from a fragment.
 const target = step === "resolve_extras" && extras && "id" in extras ? `#variation-${extras.id}` : fallback;
 const navigate = (event: React.MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  navigationCleanup.current?.();
  // Mount the account first when its saved invoice is not rendered yet. Do not
  // pretend a different invoice's receipt input belongs to this debt.
  const firstTarget = step === "record_payment" && !document.getElementById(target.slice(1)) ? "#final-account-title" : target;
  if (onNavigate) onNavigate(firstTarget);
  else {
   history.replaceState(null, "", `${location.pathname}${location.search}${firstTarget}`);
   window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
  const root = document.getElementById("captured-job-workspace");
  if (!root) return;
  let observer: MutationObserver | undefined, timer: number | undefined;
  navigationCleanup.current = () => { observer?.disconnect(); if (timer !== undefined) window.clearTimeout(timer); };
  const focus = () => {
   if (currentJob.current.jobId !== jobId) { navigationCleanup.current?.(); return false; }
   const base = document.getElementById(target.slice(1));
   if (!base || !root.contains(base)) return false;
   const panel = base.closest?.(".job-final-account") ?? base;
   const buttons = (within: Element) => Array.from(within.querySelectorAll<HTMLButtonElement>("button")).filter(button => !button.disabled && !button.matches?.(":disabled"));
   let action: HTMLElement | undefined;
   if (step === "activate_job") {
    const accepted = root.querySelector('[aria-label="Accepted terms"]');
    action = accepted ? buttons(accepted).find(button => button.textContent === "Start this practice job") : undefined;
    // The current quote screen places its start control beside its accepted
    // history. Bind that explicit region to the same job's accepted editor.
    const editor = accepted?.closest?.<HTMLElement>('.quote-editor');
    if (!action && editor?.dataset.jobId === jobId) {
     const start = editor.querySelector('[aria-label="Start accepted practice job"]');
     action = start ? buttons(start).find(button => button.textContent === "Start this practice job") : undefined;
    }
   } else if (step === "resolve_extras") action = buttons(base).find(button => button.textContent === (extras?.currentRevisionId ? "Approve exact revision" : "Change price"));
   else if (step === "record_payment") action = base.querySelector<HTMLElement>('[data-testid="uiwire12-receipt-amount"]') ?? undefined;
   else if (step === "review_account") {
    const review = panel.querySelector('[data-testid="final-account-lock"]');
    action = !snapshot.facts.account?.account || snapshot.facts.account.account.issueBlocked
     ? buttons(panel).find(button => button.textContent === (!snapshot.facts.account?.account ? "Build final account" : "Rebuild from approved sources"))
     : Array.from(review?.querySelectorAll<HTMLSelectElement>("select") ?? []).find(select => !select.matches(":disabled") && !select.value) ?? (review ? buttons(review).find(button => ["Accept final check terms", "Complete final account"].includes(button.textContent ?? "")) : undefined);
   }
   else action = buttons(panel).find(button => step === "record_acceptance" ? button.textContent === "Record practice acceptance" : step === "issue_invoice" ? button.textContent === "Issue and simulate this invoice" : true) ?? (step === "issue_invoice" ? undefined : base);
   if (!action || (step === "record_payment" && !document.getElementById(`invoice-${invoice?.id}`))) return false;
   for (let parent = action.parentElement; parent && root.contains(parent); parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
   if (firstTarget !== target) history.replaceState(null, "", `${location.pathname}${location.search}${target}`);
   action.style.scrollMarginTop = "96px"; action.style.scrollMarginBottom = "96px";
   if (!action.matches("button,input,select,textarea,a")) action.tabIndex = -1;
   action.focus({ preventScroll: true }); action.scrollIntoView({ block: "center" });
   observer?.disconnect(); if (timer !== undefined) window.clearTimeout(timer); return true;
  };
  if (focus()) return;
  observer = new MutationObserver(() => { focus(); }); observer.observe(root, { childList: true, subtree: true, attributes: true });
  timer = window.setTimeout(() => observer?.disconnect(), 15000);
 };
 const completed = step === "complete";
 const invoices = snapshot.facts.invoices?.invoices ?? [];
 const balancePence = invoices.reduce((sum, item) => sum + BigInt(item.balancePence), 0n);
 const paidPence = invoices.reduce((sum, item) => sum + BigInt(item.paidPence ?? 0), 0n);
 const money = (pence: bigint) => `GBP ${(pence / 100n).toLocaleString("en-GB")}.${(pence % 100n).toString().padStart(2, "0")}`;
 return <section className="journey-progress" aria-label="Practice journey progress" data-testid="uiwire15-journey">
  <p className="eyebrow">One persisted practice job</p>
  {completed ? <><h2>You finished this practice job</h2><p>{result.completion === "paid" ? "Customer paid. The saved receipts settle every invoice." : result.completion === "credit_assisted" ? "Customer payments and credits settle every invoice." : result.completion === "credit_only" ? "Settled by credit; no customer cash payment recorded." : "Zero-value job complete; no customer payment due."}</p><a className="primary" href={`/jobs/${jobId}/value`}>How JobGuard helps protect your money</a></> : <><h2>Continue this job</h2><a className="primary" data-testid="uiwire15-continue" href={target} onClick={navigate}>{label}</a></>}
  <dl><div><dt>Customer balance</dt><dd data-testid="journey-customer-balance">{money(balancePence)}</dd></div><div><dt>Recorded customer payments</dt><dd data-testid="journey-customer-paid">{money(paidPence)}</dd></div><div><dt>Real external actions</dt><dd data-testid="journey-real-external-actions">{snapshot.realExternalActions}</dd></div></dl>{retry}
 </section>;
}
