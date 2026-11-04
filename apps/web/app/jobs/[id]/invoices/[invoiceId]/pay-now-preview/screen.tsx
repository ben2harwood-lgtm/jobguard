"use client";
import React, { useEffect, useRef, useState } from "react";
import type { PayNowAttemptApplication } from "@jobguard/api/workspace";
import type { PayNowRail } from "@jobguard/core";
import { payNowLabels, payNowPounds, payNowTransferWording, payNowFeeWording, payNowPreviewTitle, payNowNoPayment, payNowInvoiceWording, payNowSettlementWording } from "../../../../../ui/pay-now-synthetic";
type View = Awaited<ReturnType<PayNowAttemptApplication["read"]>>;
type Pending = { commandId: string; rail: PayNowRail };
const target = { minHeight: 44, minWidth: 44 };
export function StoredPayNowOptions({ view, busy = false, pendingRail, simulate }: {
  view: View; busy?: boolean; pendingRail?: PayNowRail; simulate: (rail: PayNowRail) => void;
}) {
  return <section aria-label="Synthetic invoice payment options">
    <h2>{payNowPreviewTitle}</h2>
    <p>{payNowInvoiceWording(view.balancePence)}</p>
    <ul style={{ listStyle: "none", padding: 0 }}>
      {view.options.map(option => <li key={option.rail} style={{ padding: 12 }}>
        <strong>{payNowLabels[option.rail]}</strong> · {payNowPounds(option.customerTotal.pence)}
        {option.rail === "bank_transfer" ? <p>{payNowTransferWording}</p> : null}
        <button type="button" style={target} disabled={busy || (!!pendingRail && pendingRail !== option.rail)} onClick={() => simulate(option.rail)}>
          Simulate {payNowLabels[option.rail].toLowerCase()} payment
        </button>
      </li>)}
    </ul>
    {view.balancePence === 0 ? <p>Nothing due. No practice payment available.</p> : null}
    <aside aria-label="Builder fee preview"><h3>Builder fee preview</h3><p>{payNowFeeWording}</p>
      {view.options.map(option => <p key={option.rail}>{payNowLabels[option.rail]}: builder pays {payNowPounds(option.builderFee.pence)} separately.</p>)}
    </aside>
    <div role="status">{view.attempts.length === 0 ? payNowNoPayment : view.attempts.map(attempt => <p key={attempt.commandId}>
      {payNowSettlementWording(attempt.result)}
    </p>)}</div>
  </section>;
}
async function companyHeaders() {
  const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Sign in to your company.");
  const session = await response.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
  const tenant = session.memberships?.[0]?.tenantId;
  if (!tenant || !session.csrfToken) throw new Error("Sign in to your company.");
  return { "x-tenant-id": tenant, "x-csrf-token": session.csrfToken };
}
export function PayNowAttemptScreen({ jobId, invoiceId }: { jobId: string; invoiceId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [pending, setPending] = useState<Pending | null>(null);
  const inFlight = useRef(false);
  const url = `/api/jobs/${encodeURIComponent(jobId)}/invoices/${encodeURIComponent(invoiceId)}/pay-now-preview`;
  const key = `pay-now-preview:${jobId}:${invoiceId}`;
  async function load() {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: await companyHeaders() });
    if (!response.ok) throw new Error("Practice preview unavailable. Sign in and refresh.");
    return response.json() as Promise<View>;
  }
  useEffect(() => {
    let active = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Pending | null;
      if (saved && /^[a-f0-9-]{36}$/iu.test(saved.commandId) && ["bank_transfer", "card", "pay_by_bank"].includes(saved.rail)) setPending(saved);
    } catch { /* Storage unavailable: keep the in-memory command for this visit. */ }
    void load().then(value => { if (active) setView(value); }).catch(() => { if (active) setError("Practice preview unavailable. Sign in and refresh."); });
    return () => { active = false; };
  }, [url]); // The keyed page gives each invoice its own state.
  async function refresh() {
    if (inFlight.current) return;
    setBusy(true); setError("");
    try { setView(await load()); } catch { setView(null); setError("Practice preview unavailable. Sign in and refresh."); }
    finally { setBusy(false); }
  }
  async function simulate(rail: PayNowRail) {
    if (inFlight.current || (pending && pending.rail !== rail)) return;
    inFlight.current = true; setBusy(true); setError("");
    const command = pending ?? { commandId: crypto.randomUUID(), rail };
    setPending(command);
    try { sessionStorage.setItem(key, JSON.stringify(command)); } catch { /* In-memory retry remains available. */ }
    try {
      const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { ...await companyHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (!response.ok) throw new Error("Practice attempt unconfirmed. Retry the same option or refresh; no real money moves.");
      await response.json();
      setView(await load());
      setPending(null);
      try { sessionStorage.removeItem(key); } catch { /* Confirmed by server. */ }
    } catch (reason) { setView(null); setError(reason instanceof Error ? reason.message : "Practice attempt unconfirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <h1>Builder practice preview</h1><p>Practice preview only. The customer does not see this page. No money moves.</p>
    <button style={target} disabled={busy} onClick={() => void refresh()}>Reload stored invoice</button>
    {error ? <p role="alert">{error}</p> : null}
    {!view && !error ? <p role="status">Loading stored invoice…</p> : null}
    {pending ? <button style={target} disabled={busy} onClick={() => void simulate(pending.rail)}>Retry same practice attempt</button> : null}
    {view ? <StoredPayNowOptions view={view} busy={busy} {...(pending ? { pendingRail: pending.rail } : {})} simulate={rail => void simulate(rail)} /> : null}
  </main>;
}
