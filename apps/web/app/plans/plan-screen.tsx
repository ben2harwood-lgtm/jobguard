"use client";
import { useEffect, useState } from "react";
import { subscriptionPlanView, type SubscriptionPlanView } from "@jobguard/core";

export async function loadSubscriptionWorkspace(fetcher: typeof fetch = fetch) {
  const sessionResponse = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!sessionResponse.ok) throw new Error(sessionResponse.status === 401 || sessionResponse.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  const session = await sessionResponse.json() as { csrfToken: string; memberships: { tenantId: string }[] };
  const tenantId = session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenantId) throw new Error("SIGN_IN_REQUIRED");
  const response = await fetcher("/api/subscriptions/current", { cache: "no-store", credentials: "same-origin",
    headers: { "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId } });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { view: subscriptionPlanView(await response.json(), date), tenantId };
}
export async function loadSubscriptionPlan(fetcher: typeof fetch = fetch): Promise<SubscriptionPlanView> {
  return (await loadSubscriptionWorkspace(fetcher)).view;
}
/** Refresh CSRF from the real company session, retaining the company whose terms were displayed. */
export async function submitSubscriptionAction(tenantId: string, commandId: string, command: unknown, fetcher: typeof fetch = fetch) {
  const sessionResponse = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!sessionResponse.ok) throw new Error("Sign in again before changing the subscription.");
  const session = await sessionResponse.json() as { csrfToken: string; memberships: { tenantId: string }[] };
  if (!session.csrfToken || !session.memberships?.some(m => m.tenantId === tenantId)) throw new Error("Company access changed. Reload before continuing.");
  const response = await fetcher("/api/subscriptions/commands", { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId },
    body: JSON.stringify({ version: "subscription-http-command.v1", commandId, command }) });
  if (!response.ok) throw new Error("The subscription action could not be completed. Reload to check the saved result before trying again.");
  return await response.json() as { status?: string; effectiveDate?: string };
}
export function PlanDetails({ view }: { view: SubscriptionPlanView }) {
  return <>
    <p>Prices and period amounts are principal, excluding VAT.</p>
    <section aria-label="Plans"><h2>Solo and Builder</h2>{view.plans.map(plan => <article key={plan.plan}>
      <h3>{plan.plan}</h3><p>{plan.monthlyLabel} per month · {plan.includedPlaces} jobs on the go included</p>
      <p>Monthly maximum: {plan.maximumLabel}</p>{view.annualAvailable && plan.annualLabel && <p>{plan.annualLabel} per year</p>}
    </article>)}</section>
    <section aria-label="Your subscription"><h2>Your subscription</h2>{view.agreement ? <>
      <p>{view.agreement.plan} · {view.agreement.cadence} · effective {view.agreement.effectiveDate}</p>
      <p>Original billing anchor: day {view.agreement.anchorDay}. Monthly maximum: {view.agreement.maximumLabel}.</p>
    </> : <p>No accepted subscription agreement.</p>}</section>
    <section aria-label="Subscription periods"><h2>Subscription periods</h2>{view.periods.length === 0 ? <p>No issued subscription periods.</p>
      : view.periods.map(period => <article key={period.id}>
        <h3>{period.startDate} to {period.endDateExclusive} (end date excluded)</h3>
        <p>Plan at issue: {period.plan}. Hypothetical subscription: <strong>{period.amountLabel}</strong>.</p>
        <p>Period maximum: {period.maximumLabel}</p><p>{period.paymentLabel}</p>
      </article>)}</section>
  </>;
}
export function PlanScreen() {
  const [view, setView] = useState<SubscriptionPlanView | null>(null);
  const [error, setError] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [plan, setPlan] = useState<"Solo" | "Builder">("Solo");
  const [anchorDay, setAnchorDay] = useState(1);
  const [consent, setConsent] = useState(false);
  async function act(command: unknown) {
    if (busy) return;
    setBusy(true); setActionError(""); setMessage("");
    try {
      const result = await submitSubscriptionAction(tenantId, crypto.randomUUID(), command);
      const next = await loadSubscriptionWorkspace();
      if (next.tenantId !== tenantId) throw new Error("Company access changed. Reload before continuing.");
      setView(next.view); setConsent(false);
      setMessage(result.status === "pending" ? `Downgrade requested for ${result.effectiveDate}; capacity and approval are checked again when due.` : "Subscription action saved. Figures remain hypothetical.");
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Subscription action unavailable."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    void loadSubscriptionWorkspace().then(next => { if (active) { setView(next.view); setTenantId(next.tenantId); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error && reason.message === "SIGN_IN_REQUIRED" ? "sign-in" : "unavailable"); });
    return () => { active = false; };
  }, []);
  return <main className="workspace-page"><h1>Plans and subscription</h1>
    <p>Synthetic demonstration with made-up company data. Figures are hypothetical. No real payments are taken.</p>
    {error ? <p role="alert">{error === "sign-in" ? <>Sign in to an authorised company to read its subscription. <a href="/sign-in">Company sign-in</a></>
      : "Subscription details are unavailable. Reload to try again."}</p>
      : view ? <><PlanDetails view={view} />
        <section aria-label="Manage subscription"><h2>Manage subscription</h2>
          <p>The monthly prices and maximums shown above form these demonstration terms. Principal excluding VAT. Annual plans are unavailable.</p>
          <p>Upgrades apply today. Downgrades are requested for the next billing boundary and depend on available capacity. Issued periods cannot be changed.</p>
          <label>Plan <select value={plan} disabled={busy} onChange={e => { setPlan(e.target.value as "Solo" | "Builder"); setConsent(false); }}><option>Solo</option><option>Builder</option></select></label>
          {!view.agreement && <label>Billing anchor day <input type="number" min="1" max="31" value={anchorDay} disabled={busy} onChange={e => { setAnchorDay(Number(e.target.value)); setConsent(false); }} /></label>}
          <label><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />I accept these monthly terms and the selected plan's monthly maximum for this made-up company.</label>
          <button type="button" disabled={busy || !consent || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31 || view.agreement?.plan === plan}
            onClick={() => void act({ version: "subscription-command.v1", kind: view.agreement ? "change" : "accept", plan, cadence: "monthly",
              anchorDay: view.agreement?.anchorDay ?? anchorDay, termsVersion: "subscription_terms_v1", catalogueVersion: "subscription_pricing_policy_v4",
              maximumPence: plan === "Solo" ? 4900 : 16900, expectedRevision: view.revision })}>
            {!view.agreement ? "Accept monthly terms" : plan === "Builder" ? "Approve upgrade to Builder" : "Request downgrade to Solo"}
          </button>
          {view.periods.filter(p => p.payment === "not_started" && p.contentHash).map(period => <p key={period.id}>
            <button type="button" disabled={busy} onClick={() => void act({ version: "subscription-command.v1", kind: "approve_simulation",
              statementId: period.statementId, contentHash: period.contentHash, amountPence: period.amount.pence, expectedRevision: view.revision })}>
              Approve simulated payment of {period.amountLabel} for {period.startDate}
            </button></p>)}
          {busy && <p role="status">Saving subscription action…</p>}
          {message && <p role="status">{message}</p>}{actionError && <p role="alert">{actionError}</p>}
        </section></> : <p role="status">Loading subscription…</p>}
  </main>;
}
