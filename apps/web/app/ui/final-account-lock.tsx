"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { finalAccountResponseV1, type FinalAccountResponse } from "@jobguard/api/final-account-contracts";
import {
  FINAL_ACCOUNT_DECLARATION, FINAL_ACCOUNT_DECLARATION_VERSION, FINAL_ACCOUNT_REVIEW_PROMPT,
  FINAL_CHECK_RUNNING_TEXT, FINAL_CHECK_TERMS_STATEMENTS, FINAL_CHECK_TERMS_VERSION, parsePoundsToPence,
} from "@jobguard/core";
import { CustomerInvoices } from "./customer-invoices";

const uuid = z.string().uuid();
const viewV1 = z.object({
  version: z.literal("final-account-lock.view.v1"), jobId: uuid,
  account: finalAccountResponseV1.shape.account,
  lock: z.object({ id: uuid, finalAccountRevisionId: uuid, sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), lockedAt: z.string() }).passthrough().nullable(),
  captures: z.array(z.object({id:uuid,description:z.string(),state:z.enum(["draft","priced","approved","rejected","withdrawn"]),origin:z.enum(["builder_logged","final_review"]),netPence:z.number().int().safe().nullable()})),
  dispositions: z.array(z.object({ scopeItemId: uuid, disposition: z.enum(["done", "removed", "deferred"]) }).passthrough()),
  termsAccepted: z.boolean(), checkStatus: z.enum(["pending", "failed", "completed"]).nullable(),
  invoiceGuard: z.enum(["FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED"]).nullable(),
}).strict();
type LockView = z.infer<typeof viewV1>;
const targetSize = { minHeight: 44, minWidth: 44 };

export function FinalAccountLock({ jobId, account, onChanged }: {
  jobId: string; account: NonNullable<FinalAccountResponse["account"]>; onChanged: () => Promise<void>;
}) {
  const [view, setView] = useState<LockView | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [description, setDescription] = useState(""), [amount, setAmount] = useState("");
  const errorTarget = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { if (error) errorTarget.current?.focus(); }, [error]);
  const writing = useRef(false), active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    try {
      const response = await fetch(`/api/jobs/${jobId}/final-account/lock`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) { const failure = await response.json(); throw new Error(String(failure.code)); }
      const next = viewV1.parse(await response.json());
      if (next.jobId !== jobId) throw new Error("WRONG_JOB_RESPONSE");
      if (!controller.signal.aborted) { setView(next); setError(""); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "DATABASE_UNAVAILABLE"); }
  }, [jobId]);
  useEffect(() => { void load(); return () => active.current?.abort(); }, [load, account.id]);
  async function command(route: string, body: unknown, after?: () => void) {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/final-account/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { const failure = await response.json(); throw new Error(String(failure.code)); }
      after?.(); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "DATABASE_UNAVAILABLE"); }
    finally { writing.current = false; setBusy(false); }
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
  const baseline = account.lines.filter(line => line.kind === "baseline");
  const allDisposed = baseline.every(line => view?.dispositions.some(item => item.scopeItemId === line.scopeItemId));
  return <section data-testid="final-account-lock" aria-label="Final-account completion" aria-busy={busy}>
    {!view && !error ? <p aria-live="polite">Loading final account…</p> : null}
    {view ? <>
      <p data-testid="lock-state" role="status">{view.lock ? "Final account completed" : "Final account review"}</p>
      {!view.lock ? <>
        <p>{FINAL_ACCOUNT_REVIEW_PROMPT}</p>
        <section aria-label="Captured variations">{view.captures.map(capture => <p key={capture.id}>{capture.description} · {capture.state} · {capture.netPence === null ? "Unpriced" : `£${(capture.netPence / 100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`}</p>)}</section>
        <fieldset disabled={busy} style={{ minWidth: 0, margin: 0, padding: 0, border: 0 }}>
          {baseline.map(line => <label key={line.scopeItemId} style={{ display: "block" }}>Disposition {line.description}
            <select style={targetSize} aria-label={`Disposition ${line.description}`} value={view.dispositions.find(item => item.scopeItemId === line.scopeItemId)?.disposition ?? ""}
              onChange={event => { if (event.target.value) void command("dispositions", { version: "final-account.disposition.v1", commandId: crypto.randomUUID(), scopeItemId: line.scopeItemId, disposition: event.target.value }); }}>
              <option value="">Choose disposition</option><option value="done">Done</option><option value="removed">Removed</option><option value="deferred">Deferred</option>
            </select>
          </label>)}
          <label style={{ display: "block" }}>Final-review extra description<input style={targetSize} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label style={{ display: "block" }}>Final-review extra price (£, optional)<input style={targetSize} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <button style={targetSize} disabled={!description.trim()} onClick={() => void addReviewExtra()}>Add final-review extra</button>
          <ul>{FINAL_CHECK_TERMS_STATEMENTS.map(statement => <li key={statement}>{statement}</li>)}</ul>
          <button style={targetSize} disabled={view.termsAccepted} onClick={() => void command("terms", { version: "final-check-terms.accept.v1", commandId: crypto.randomUUID(), termsVersion: FINAL_CHECK_TERMS_VERSION })}>Accept final check terms</button>
          <p>{FINAL_ACCOUNT_DECLARATION}</p>
          <button className="primary" style={targetSize} disabled={!allDisposed || !view.termsAccepted || account.issueBlocked}
            onClick={() => void command("lock", { version: "final-account.lock.v1", commandId: crypto.randomUUID(), finalAccountRevisionId: account.id, expectedRevision: account.revision, declarationVersion: FINAL_ACCOUNT_DECLARATION_VERSION })}>Complete final account</button>
        </fieldset>
      </> : <p data-testid="final-check-state" role="status">{FINAL_CHECK_RUNNING_TEXT}</p>}
      <CustomerInvoices jobId={jobId} finalAccount={account} lockGuard={{ code: view.invoiceGuard, kind: "final", ...(view.lock ? {lockedRevision:{id:view.lock.finalAccountRevisionId,sourceHash:view.lock.sourceHash,issueBlocked:false}} : {}) }} />
    </> : null}
    {error ? <p ref={errorTarget} tabIndex={-1} data-testid="final-account-lock-error" role="alert">{error}</p> : null}
  </section>;
}
