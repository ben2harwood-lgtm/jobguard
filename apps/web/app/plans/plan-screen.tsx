"use client";
import { useEffect, useState, type ReactNode } from "react";
import { subscriptionPlanView, type SubscriptionPlanView } from "@jobguard/core";

type CompanyMembership = { tenantId: string; name?: string };
export async function loadSubscriptionWorkspace(fetcher: typeof fetch = fetch, selectedTenantId?: string,
  onCompanies?: (memberships: CompanyMembership[], selected: string) => void) {
  const sessionResponse = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!sessionResponse.ok) throw new Error(sessionResponse.status === 401 || sessionResponse.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  const session = await sessionResponse.json() as { csrfToken: string; memberships: { tenantId: string; name?: string }[] };
  const tenantId = selectedTenantId ?? session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenantId || !session.memberships?.some(m => m.tenantId === tenantId)) throw new Error("SIGN_IN_REQUIRED");
  onCompanies?.(session.memberships, tenantId);
  const response = await fetcher("/api/subscriptions/current", { cache: "no-store", credentials: "same-origin",
    headers: { "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId } });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { view: subscriptionPlanView(await response.json(), date), tenantId, memberships: session.memberships };
}
export async function loadSubscriptionPlan(fetcher: typeof fetch = fetch): Promise<SubscriptionPlanView> {
  return (await loadSubscriptionWorkspace(fetcher)).view;
}
/** Refresh CSRF from the real company session, retaining the company whose terms were displayed. */
export async function submitSubscriptionAction(tenantId: string, commandId: string, command: unknown, fetcher: typeof fetch = fetch) {
  const sessionResponse = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!sessionResponse.ok) throw new Error("Sign in again before changing the subscription.");
  const session = await sessionResponse.json() as { csrfToken: string; memberships: { tenantId: string; name?: string }[] };
  if (!session.csrfToken || !session.memberships?.some(m => m.tenantId === tenantId)) throw new Error("Company access changed. Reload before continuing.");
  const response = await fetcher("/api/subscriptions/commands", { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId },
    body: JSON.stringify({ version: "subscription-http-command.v1", commandId, command }) });
  if (!response.ok) throw new Error("The subscription action could not be completed. Reload to check the saved result before trying again.");
  return await response.json() as { status?: string; effectiveDate?: string; paymentStatus?: string; executionStatus?: "unavailable" };
}
export function PlanDetails({ view }: { view: SubscriptionPlanView }) {
  return <>
    <p>Prices and period amounts are principal, excluding VAT.</p>
    <section aria-label="Plans"><h2>Solo and Builder</h2>{view.plans.map(plan => <article key={plan.plan}>
      <h3>{plan.plan}</h3><p>{plan.monthlyLabel} per month · {plan.includedPlaces} jobs on the go included</p>
      <p>Monthly maximum: {plan.maximumLabel}</p>{view.annualAvailable && plan.annualLabel && <p>{plan.annualLabel} per year</p>}
    </article>)}</section>
    <section aria-label="Your subscription"><h2>Your subscription</h2>{view.billingDay !== null && <p>Your billing day: the {view.billingDay}</p>}{view.agreement ? <>
      <p>{view.agreement.plan} · {view.agreement.cadence} · effective {view.agreement.effectiveDate}</p>
      <p>Monthly maximum: {view.agreement.maximumLabel}.</p>
    </> : <p>No accepted subscription agreement.</p>}</section>
    <section aria-label="Subscription periods"><h2>Subscription periods</h2>{view.periods.length === 0 ? <p>No issued subscription periods.</p>
      : view.periods.map(period => <article key={period.id}>
        <h3>{period.startDate} to {period.endDateExclusive} (end date excluded)</h3>
        <p>Plan at issue: {period.plan}. Hypothetical subscription: <strong>{period.amountLabel}</strong>.</p>
        <p>Period maximum: {period.maximumLabel}</p><p>{period.paymentLabel}</p>
      </article>)}</section>
  </>;
}
export function subscriptionActionMessage(result: { status?: string; effectiveDate?: string; paymentStatus?: string }) {
  if (result.paymentStatus === "pending") return "Approval saved. Simulated payment is pending. Reload to check its progress; do not approve it again.";
  return result.status === "pending" ? `Downgrade requested for ${result.effectiveDate}; capacity and approval are checked again when due.` : "Subscription action saved. Figures remain hypothetical.";
}
export function PlanScreen({ consentTerms, consentText }: { consentTerms?: ReactNode; consentText?: string }) {
  const [view, setView] = useState<SubscriptionPlanView | null>(null);
  const [error, setError] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [plan, setPlan] = useState<"Solo" | "Builder">("Solo");
  const [consent, setConsent] = useState(false);
  async function act(command: unknown) {
    if (busy) return;
    setBusy(true); setActionError(""); setMessage("");
    let saved = false;
    try {
      const result = await submitSubscriptionAction(tenantId, crypto.randomUUID(), command);
      saved = true;
      setConsent(false);
      setMessage(subscriptionActionMessage(result));
      if (result.executionStatus === "unavailable") setActionError("The simulation executor could not complete or confirm its result. Your approval is saved. Reload to check progress; do not approve it again.");
      const next = await loadSubscriptionWorkspace(fetch, tenantId);
      if (next.tenantId !== tenantId) throw new Error("Company access changed. Reload before continuing.");
      setView(next.view);
    } catch (reason) {
      if (saved) { setView(null); setError("unavailable"); }
      else setActionError(reason instanceof Error ? reason.message : "Subscription action unavailable.");
    }
    finally { setBusy(false); }
  }
  async function switchCompany(selected: string) {
    setTenantId(selected);
    setBusy(true); setView(null); setConsent(false); setMessage(""); setActionError(""); setError("");
    try {
      const next = await loadSubscriptionWorkspace(fetch, selected);
      setView(next.view); setTenantId(next.tenantId); setMemberships(next.memberships); setPlan("Solo");
    } catch { setError("unavailable"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    void loadSubscriptionWorkspace(fetch, undefined, (companies, selected) => {
      if (active) { setMemberships(companies); setTenantId(selected); }
    }).then(next => { if (active) { setView(next.view); setTenantId(next.tenantId); setMemberships(next.memberships); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error && reason.message === "SIGN_IN_REQUIRED" ? "sign-in" : "unavailable"); });
    return () => { active = false; };
  }, []);
  return <main className="workspace-page"><h1>Plans and subscription</h1>
    <p><a href="/meter">Jobs on the go</a></p>
    <p>Synthetic demonstration with made-up company data. Figures are hypothetical. No real payments are taken.</p>
    {memberships.length > 0 && <label>Company <select aria-label="Company" value={tenantId} disabled={busy} onChange={e => void switchCompany(e.target.value)}>
      {memberships.map(m => <option key={m.tenantId} value={m.tenantId}>{m.name ?? m.tenantId}</option>)}
    </select></label>}
    {error ? <p role="alert">{error === "sign-in" ? <>Sign in to an authorised company to read its subscription. <a href="/sign-in">Company sign-in</a></>
      : "Subscription details are unavailable. Reload to try again."}</p>
      : view ? <><PlanDetails view={view} />
        <section aria-label="Manage subscription"><h2>Manage subscription</h2>
          {consentTerms}
          <label>Plan <select aria-label="Plan" value={plan} disabled={busy} onChange={e => { setPlan(e.target.value as "Solo" | "Builder"); setConsent(false); }}><option>Solo</option><option>Builder</option></select></label>
          <label><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />I accept these monthly terms and the selected plan's monthly maximum for this made-up company.</label>
          <button type="button" disabled={busy || !consentTerms || !consentText || !consent || view.billingDay === null || view.agreement?.plan === plan}
            onClick={() => void act({ version: "subscription-command.v1", kind: view.agreement ? "change" : "accept", plan, cadence: "monthly",
              anchorDay: view.billingDay, termsVersion: "subscription_terms_v1", catalogueVersion: "subscription_pricing_policy_v4",
              consentText, maximumPence: plan === "Solo" ? 4900 : 16900, expectedRevision: view.revision })}>
            {!view.agreement ? "Accept monthly terms" : plan === "Builder" ? "Approve upgrade to Builder" : "Request downgrade to Solo"}
          </button>
          {view.periods.filter(p => p.payment === "not_started" && p.contentHash).map(period => <p key={period.id}>
            <button type="button" disabled={busy} onClick={() => void act({ version: "subscription-command.v1", kind: "approve_simulation",
              statementId: period.statementId, contentHash: period.contentHash, amountPence: period.amount.pence, expectedRevision: view.revision })}>
              Approve simulated payment of {period.amountLabel} for {period.startDate}
            </button></p>)}
          {busy && <p role="status">Saving subscription action…</p>}
        </section></> : <p role="status">Loading subscription…</p>}
    {message && <p role="status">{message}</p>}{actionError && <p role="alert">{actionError}</p>}
  </main>;
}
