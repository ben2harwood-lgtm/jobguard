"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FINAL_ACCOUNT_DECLARATION, FINAL_ACCOUNT_DECLARATION_VERSION, FINAL_ACCOUNT_REVIEW_PROMPT, FINAL_CHECK_TERMS_STATEMENTS, FINAL_CHECK_TERMS_VERSION } from "@jobguard/core";
import { finalCheckReadV1, revealStatus, type FinalCheckRead } from "../../../ui/final-check-reveal-view";
import { companyAccountV1, type CompanyAccount } from "./view";
const target = { minHeight: 44, minWidth: 44, maxWidth: "100%", padding: 10 };
const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
type Session = { csrfToken: string; memberships: { tenantId: string }[] };
type Binding = { session: Session; tenantId: string; jobId: string; runId: string };
export function TrialFinalAccount() {
 const [binding, setBinding] = useState<Binding | null>(null), [account, setAccount] = useState<CompanyAccount | null>(null);
 const [check, setCheck] = useState<FinalCheckRead | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
 const writing = useRef(false), pending = useRef<{ action: "acceptTerms" | "disposition" | "lock" | "requestRun"; input: Record<string, unknown> } | null>(null);
 const [retry, setRetry] = useState(false);
 const call = useCallback(async (b: Binding, action: string, extra: Record<string, unknown> = {}) => {
  const response = await fetch("/demo-s/trial/final-account/commands", { method: "POST", cache: "no-store", headers: { "content-type": "application/json", "x-tenant-id": b.tenantId, "x-csrf-token": b.session.csrfToken }, body: JSON.stringify({ action, input: { version: "company-final-check.v1", jobId: b.jobId, ...extra } }) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.code ?? "FINAL_CHECK_UNAVAILABLE"), { definitive: [400, 401, 403, 404, 409].includes(response.status) });
  return result;
 }, []);
 const load = useCallback(async (b: Binding) => {
  const saved = companyAccountV1.parse(await call(b, "read"));
  // No shadow read before lock, even when terms have already been accepted.
  const revealed = saved.lock ? finalCheckReadV1.parse(await call(b, "reveal")) : null;
  setAccount(saved); setCheck(revealed);
 }, [call]);
 useEffect(() => {
  let active = true;
  void (async () => {
   const response = await fetch("/api/auth/session", { cache: "no-store" });
   if (!response.ok) throw new Error("Sign in to the fictional owning company.");
   const session: Session = await response.json(), query = new URLSearchParams(location.search);
   const tenantId = query.get("tenantId") ?? "", jobId = query.get("jobId") ?? "", runId = query.get("runId") ?? "";
   if (!session.memberships.some(member => member.tenantId === tenantId)) throw new Error("Choose your fictional company in the practice chooser.");
   const b = { session, tenantId, jobId, runId };
   if (active) { setBinding(b); await load(b); }
  })().catch(reason => { if (active) setError(reason.message); });
  return () => { active = false; };
 }, [load]);
 async function command(action: "acceptTerms" | "disposition" | "lock" | "requestRun", input: Record<string, unknown>, replay = false) {
  if (!binding || writing.current || (pending.current && !replay)) return;
  writing.current = true; setBusy(true); setError("");
  pending.current = { action, input }; setRetry(true);
  try {
   await call(binding, action, input); pending.current = null; setRetry(false); await load(binding);
  } catch (reason) {
   if ((reason as { definitive?: boolean }).definitive) { pending.current = null; setRetry(false); }
   setError((reason as Error).message); setAccount(null); setCheck(null);
  } finally { writing.current = false; setBusy(false); }
 }
 const baseline = account?.lines.filter(line => line.line_kind === "baseline") ?? [];
 const disposed = baseline.length > 0 && baseline.every(line => account?.dispositions.some(d => d.scope_item_id === line.scope_item_id));
 return <main style={{ maxWidth: 760, margin: "auto", padding: 24, overflowWrap: "anywhere" }}>
  {binding && <a style={{ ...target, display: "inline-block" }} href={`/demo-s/trial?${new URLSearchParams({ tenantId: binding.tenantId, runId: binding.runId })}`}>Back to guided trial</a>}
  <h1>First job final account</h1><p>Prepared fictional job only · no live provider or money.</p>
  {error && <p role="alert">{error}</p>}
  {retry && <button style={target} disabled={busy} onClick={() => { if (pending.current) void command(pending.current.action, pending.current.input, true); }}>Retry exact saved request</button>}
  {account && !account.draft && <p>A prepared final account is needed for this fictional job. Return to the trial guide; no lock or successful check has been recorded here.</p>}
  {account?.draft && <section aria-label="Final-account completion">
   <p data-testid="trial-final-net">Final net {pounds(account.draft.net_pence)} · VAT {pounds(account.draft.tax_pence)} · Gross {pounds(account.draft.total_pence)}</p>
   <p>Saved revision {account.draft.revision}</p>
   {account.lock ? <p>Final account completed · Lock {account.lock.id}</p> : <>
    <p>{FINAL_ACCOUNT_REVIEW_PROMPT}</p>
    <fieldset disabled={busy || retry} style={{ minWidth: 0, padding: 0, border: 0 }}>
     {baseline.map(line => <label key={line.scope_item_id} style={{ display: "block" }}>Disposition {line.description}
      <select style={target} aria-label={`Disposition ${line.description}`} value={account.dispositions.find(d => d.scope_item_id === line.scope_item_id)?.disposition ?? ""} onChange={event => { if (event.target.value) void command("disposition", { commandId: crypto.randomUUID(), scopeItemId: line.scope_item_id, disposition: event.target.value }); }}>
       <option value="">Choose disposition</option><option value="done">Done</option><option value="removed">Removed</option><option value="deferred">Deferred</option>
      </select>
     </label>)}
     <ul>{FINAL_CHECK_TERMS_STATEMENTS.map(statement => <li key={statement}>{statement}</li>)}</ul>
     <button style={target} disabled={account.termsAccepted} onClick={() => void command("acceptTerms", { commandId: crypto.randomUUID(), termsVersion: FINAL_CHECK_TERMS_VERSION })}>Accept final check terms</button>
     <p>{FINAL_ACCOUNT_DECLARATION}</p>
     <button style={target} disabled={!disposed || !account.termsAccepted || account.draft.issue_blocked} onClick={() => void command("lock", { commandId: crypto.randomUUID(), finalAccountRevisionId: account.draft!.id, expectedRevision: account.draft!.revision, declarationVersion: FINAL_ACCOUNT_DECLARATION_VERSION })}>Complete final account</button>
    </fieldset>
   </>}
  </section>}
  {check && <section aria-label="Saved final check"><h2>JobGuard's final check</h2><p data-testid="final-check-status">{revealStatus(check)}</p>
   {check.state === "pending" && <button style={target} disabled={busy || retry} onClick={() => void command("requestRun", {})}>Run the final check (practice)</button>}
   {check.items.map(item => <article key={item.signalId}><h3>{item.description}</h3>{item.evidence?.map(evidence => <p key={evidence.id}>{evidence.source} · received {evidence.receivedAt}</p>)}</article>)}
  </section>}
  {binding && <button style={target} disabled={busy} onClick={() => { setError(""); void load(binding).catch(reason => { setAccount(null); setCheck(null); setError(reason.message); }); }}>Load saved final account and check</button>}
 </main>;
}
