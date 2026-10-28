"use client";
import { useEffect, useState } from "react";
import { subscriptionPlanView, type SubscriptionPlanView } from "@jobguard/core";

export async function loadSubscriptionPlan(fetcher: typeof fetch = fetch): Promise<SubscriptionPlanView> {
  const sessionResponse = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!sessionResponse.ok) throw new Error(sessionResponse.status === 401 || sessionResponse.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  const session = await sessionResponse.json() as { csrfToken: string; memberships: { tenantId: string }[] };
  const tenantId = session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenantId) throw new Error("SIGN_IN_REQUIRED");
  const response = await fetcher("/api/subscriptions/current", { cache: "no-store", credentials: "same-origin",
    headers: { "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId } });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return subscriptionPlanView(await response.json(), date);
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
  useEffect(() => {
    let active = true;
    void loadSubscriptionPlan().then(next => { if (active) setView(next); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error && reason.message === "SIGN_IN_REQUIRED" ? "sign-in" : "unavailable"); });
    return () => { active = false; };
  }, []);
  return <main className="workspace-page"><h1>Plans and subscription</h1>
    <p>Synthetic demonstration with made-up company data. Figures are hypothetical. No real payments are taken.</p>
    {error ? <p role="alert">{error === "sign-in" ? <>Sign in to an authorised company to read its subscription. <a href="/sign-in">Company sign-in</a></>
      : "Subscription details are unavailable. Reload to try again."}</p>
      : view ? <PlanDetails view={view} /> : <p role="status">Loading subscription…</p>}
  </main>;
}
