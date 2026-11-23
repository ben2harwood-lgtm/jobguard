"use client";
import { JOB_SAVED_EVENT, jobPageFetch as fetch } from "./job-page-fetch";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { finalAccountResponseV1, type FinalAccountResponse } from "@jobguard/api/final-account-contracts";
import {
  FINAL_ACCOUNT_DECLARATION, FINAL_ACCOUNT_DECLARATION_VERSION, FINAL_ACCOUNT_REVIEW_PROMPT,
  FINAL_CHECK_RUNNING_TEXT, FINAL_CHECK_TERMS_STATEMENTS, FINAL_CHECK_TERMS_VERSION, parsePoundsToPence,
} from "@jobguard/core";
import { CustomerInvoices, invoiceGuardMessages } from "./customer-invoices";

import { INVOICE_CHANGED_EVENT } from "./customer-payment-status";
import { FINAL_CHECK_CHANGED_EVENT } from "./final-check-reveal-view";

const uuid = z.string().uuid();
export const finalAccountLockViewV1 = z.object({
  version: z.literal("final-account-lock.view.v1"), jobId: uuid,
  account: finalAccountResponseV1.shape.account,
  lock: z.object({ id: uuid, finalAccountRevisionId: uuid, sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), lockedAt: z.string() }).passthrough().nullable(),
  captures: z.array(z.object({id:uuid,description:z.string(),state:z.enum(["draft","priced","approved","rejected","withdrawn"]),origin:z.enum(["builder_logged","final_review"]),netPence:z.number().int().safe().nullable()})),
  dispositions: z.array(z.object({ scopeItemId: uuid, disposition: z.enum(["done", "removed", "deferred"]) }).passthrough()),
  termsAccepted: z.boolean(), checkStatus: z.enum(["pending", "failed", "completed"]).nullable(),
  invoiceGuard: z.enum(["FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED"]).nullable(),
}).strict();
type LockView = z.infer<typeof finalAccountLockViewV1>;
export function lockBoundInvoiceProps(view: LockView, account: NonNullable<FinalAccountResponse["account"]>) {
  return {
    finalAccount: view.account ?? { ...account, issueBlocked: true },
    lockGuard: {
      code: view.invoiceGuard,
      kind: "final" as const,
      ...(view.lock ? { lockedRevision: { id: view.lock.finalAccountRevisionId, sourceHash: view.lock.sourceHash, issueBlocked: false } } : {}),
    },
  };
}
const targetSize = { minHeight: 44, minWidth: 44 };
const pounds = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function isWaiting(capture: LockView["captures"][number]) {
  return capture.state === "draft" || capture.state === "priced";
}

export function FinalAccountLock({ jobId, account, onChanged, onRebuild, designed = false }: {
  jobId: string; account: NonNullable<FinalAccountResponse["account"]>; onChanged: () => Promise<void>; onRebuild?: () => Promise<void>; designed?: boolean;
}) {
  const [view, setView] = useState<LockView | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [description, setDescription] = useState(""), [amount, setAmount] = useState("");
  const [leftOff, setLeftOff] = useState<string[]>([]);
  const errorTarget = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { if (error) errorTarget.current?.focus(); }, [error]);
  const writing = useRef(false), active = useRef<AbortController | null>(null), lifetime = useRef(0), readGeneration = useRef(0), currentJob = useRef(jobId);
  currentJob.current = jobId;
  const load = useCallback(async () => {
    const request = ++readGeneration.current;
    const controller = new AbortController(); active.current = controller;
    const isCurrent = () => request === readGeneration.current && currentJob.current === jobId && !controller.signal.aborted;
    try {
      const response = await fetch(`/api/jobs/${jobId}/final-account/lock`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) { const failure = await response.json(); throw new Error(String(failure.code)); }
      const next = finalAccountLockViewV1.parse(await response.json());
      if (next.jobId !== jobId) throw new Error("WRONG_JOB_RESPONSE");
      if (isCurrent()) { setView(next); setError(""); }
    } catch (failure) { if (isCurrent()) { setView(null); setError(failure instanceof Error ? failure.message : "DATABASE_UNAVAILABLE"); } }
  }, [jobId]);
  useEffect(() => {
    setView(null); setError(""); writing.current = false; setBusy(false); setDescription(""); setAmount(""); setLeftOff([]);
    const changed = (event: Event) => { if ((event as CustomEvent<{jobId?: string}>).detail?.jobId === jobId) void load(); };
    window.addEventListener(FINAL_CHECK_CHANGED_EVENT, changed); window.addEventListener(JOB_SAVED_EVENT, changed); window.addEventListener(INVOICE_CHANGED_EVENT, changed);
    const focus = () => { void load(); };
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visible);
    void load();
    return () => { lifetime.current++; readGeneration.current++; window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visible); if (currentJob.current !== jobId) active.current?.abort(); window.removeEventListener(FINAL_CHECK_CHANGED_EVENT, changed); window.removeEventListener(JOB_SAVED_EVENT, changed); window.removeEventListener(INVOICE_CHANGED_EVENT, changed); };
  }, [load, account.id, jobId]);
  useEffect(() => {
    if (!view) return;
    const stillWaiting = leftOff.filter(id => view.captures.some(capture => capture.id === id && isWaiting(capture)));
    if (stillWaiting.length !== leftOff.length) setLeftOff(stillWaiting);
  }, [view, leftOff]);
  async function command(route: string, body: unknown, after?: () => void) {
    if (writing.current) return;
    const generation = lifetime.current;
    writing.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/final-account/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (currentJob.current !== jobId || lifetime.current !== generation) return;
      if (!response.ok) { const failure = await response.json(); throw new Error(String(failure.code)); }
      after?.(); await load();
    } catch (failure) { if (currentJob.current === jobId && lifetime.current === generation) setError(failure instanceof Error ? failure.message : "DATABASE_UNAVAILABLE"); }
    finally { if (currentJob.current === jobId && lifetime.current === generation) { writing.current = false; setBusy(false); } }
  }
  async function rebuild() {
    if (!onRebuild || writing.current) return;
    const generation = lifetime.current;
    writing.current = true; setBusy(true);
    try { await onRebuild(); }
    finally { if (lifetime.current === generation) { writing.current = false; setBusy(false); } }
  }
  async function addReviewExtra() {
    let price: number | null = null;
    try { if (amount.trim()) price = parsePoundsToPence(amount.trim()); }
    catch { setError("INVALID_FINAL_ACCOUNT_LOCK_INPUT"); return; }
    await command("review-extras", {
      version: "final-review-extra.v1", commandId: crypto.randomUUID(), scopeItemId: crypto.randomUUID(),
      description: description.trim(), captureText: description.trim(),
      price: price === null ? null : { quantity: "1", unit: "item", unitRatePence: price, direction: "addition" },
    }, () => { setDescription(""); setAmount(""); void onChanged(); });
  }
  const waiting = view?.captures.filter(isWaiting) ?? [];
  const hasUntickedExtra = waiting.some(capture => !leftOff.includes(capture.id));
  const baseline = account.lines.filter(line => line.kind === "baseline");
  const allDisposed = baseline.every(line => view?.dispositions.some(item => item.scopeItemId === line.scopeItemId));
  return <section className={designed ? "card card-body designed-account-lock" : undefined} data-testid="final-account-lock" aria-label="Final-account completion" aria-busy={busy}>
    {!view && !error ? <p aria-live="polite">Loading final account…</p> : null}
    {view?.jobId === jobId ? <>
      <p data-testid="lock-state" role="status">{view.lock ? "Final account completed" : "Final account review"}</p>
      {!view.lock ? <>
        <p>{FINAL_ACCOUNT_REVIEW_PROMPT}</p>
        <section aria-label="Captured variations">{view.captures.map(capture => <p key={capture.id}>{capture.description} · {capture.state} · {capture.netPence === null ? "Unpriced" : `£${(capture.netPence / 100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`}</p>)}</section>
        <fieldset disabled={busy} style={{ minWidth: 0, margin: 0, padding: 0, border: 0 }}>
          {baseline.map(line => <label key={line.scopeItemId} style={designed ? undefined : { display: "block" }}>Disposition {line.description}
            <select style={targetSize} aria-label={`Disposition ${line.description}`} value={view.dispositions.find(item => item.scopeItemId === line.scopeItemId)?.disposition ?? ""}
              onChange={event => { if (event.target.value) void command("dispositions", { version: "final-account.disposition.v1", commandId: crypto.randomUUID(), scopeItemId: line.scopeItemId, disposition: event.target.value }); }}>
              <option value="">Choose disposition</option><option value="done">Done</option><option value="removed">Removed</option><option value="deferred">Deferred</option>
            </select>
          </label>)}
          <label style={designed ? undefined : { display: "block" }}>Final-review extra description<input style={targetSize} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label style={designed ? undefined : { display: "block" }}>Final-review extra price (£, optional)<input style={targetSize} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <button className={designed ? "btn" : undefined} style={targetSize} disabled={!description.trim()} onClick={() => void addReviewExtra()}>Add final-review extra</button>
          <ul>{FINAL_CHECK_TERMS_STATEMENTS.map(statement => <li key={statement}>{statement}</li>)}</ul>
          {busy && <p role="status">Saving your final-account review. Wait for this to finish before continuing.</p>}
          {view.termsAccepted && <p>Final check terms accepted.</p>}
          <button className={designed ? "btn" : undefined} style={targetSize} disabled={view.termsAccepted} onClick={() => void command("terms", { version: "final-check-terms.accept.v1", commandId: crypto.randomUUID(), termsVersion: FINAL_CHECK_TERMS_VERSION })}>Accept final check terms</button>
          <p>{FINAL_ACCOUNT_DECLARATION}</p>
          {!allDisposed && <p>Choose Done, Removed or Deferred for every accepted line before completing the final account.</p>}
          {!view.termsAccepted && <p>Press “Accept final check terms” before completing the final account.</p>}
          {account.issueBlocked && <p>Complete the required proof, then press “Rebuild from approved sources” to include the saved proof in this bill. You can then complete the final account.</p>}
          {waiting.length > 0 && <section aria-label="Extras not on this bill yet">
            <h3>Extras not on this bill yet</h3>
            <ul>
              {waiting.map(capture => <li key={capture.id}>
                <p>{capture.description} · {capture.state === "draft" || capture.netPence === null
                  ? "Needs a price" : `${pounds.format(capture.netPence / 100)} — not approved yet`}</p>
                <a href={`#variation-${capture.id}`}>Price or approve it</a>
                <label style={designed ? undefined : { display: "block" }}>
                  <input type="checkbox" checked={leftOff.includes(capture.id)}
                    onChange={event => setLeftOff(event.target.checked ? [...leftOff, capture.id] : leftOff.filter(id => id !== capture.id))} />
                  {`Leave "${capture.description}" off this bill on purpose`}
                </label>
              </li>)}
            </ul>
          </section>}
          {hasUntickedExtra && <p>Approve or price each extra above, or tick to leave it off this bill on purpose, before completing the final account.</p>}
          <button className={designed ? "btn primary" : "primary"} style={targetSize} disabled={!allDisposed || !view.termsAccepted || account.issueBlocked || hasUntickedExtra}
            onClick={() => void command("lock", { version: "final-account.lock.v1", commandId: crypto.randomUUID(), finalAccountRevisionId: account.id, expectedRevision: account.revision, declarationVersion: FINAL_ACCOUNT_DECLARATION_VERSION })}>Complete final account</button>
        </fieldset>
      </> : <>
        {/* Lock-check rows certify reconciliation, not the current run state. The
            FinalCheckReveal panel reads that state and owns failure/retry UI. */}
        <p data-testid="final-check-state" role="status">{view.checkStatus === "completed" ? "JobGuard's final check is complete." : FINAL_CHECK_RUNNING_TEXT}</p>
      </>}
      {!designed && <CustomerInvoices jobId={jobId} {...lockBoundInvoiceProps(view, account)}/>}
    </> : null}
    {error && <p ref={errorTarget} tabIndex={-1} data-testid="final-account-lock-error" role="alert" data-error-code={error}>{
      error === "STALE_REVISION"
        ? "You approved a change after this bill was built. Update the bill, check the new total, then press Complete final account again."
        : Object.hasOwn(invoiceGuardMessages, error) ? invoiceGuardMessages[error as keyof typeof invoiceGuardMessages] : error
    }</p>}
    {error === "STALE_REVISION" && onRebuild && <button className={designed ? "btn" : undefined} style={targetSize} disabled={busy} onClick={() => void rebuild()}>Update the bill with approved extras</button>}
  </section>;
}
