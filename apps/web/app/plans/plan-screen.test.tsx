import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { subscriptionPlanView } from "@jobguard/core";
import { loadSubscriptionPlan, PlanDetails, PlanScreen } from "./plan-screen";
vi.stubGlobal("React", React);
afterEach(() => vi.useRealTimers());
const session = { csrfToken: "company-csrf", memberships: [{ tenantId: "00000000-0000-4000-8000-000000000001" }] };
const empty = { version: "subscription-persisted-read.v1", environment: "synthetic_demo", hypothetical: true,
  agreements: [], periods: [], statements: [], work: [], attempts: [], results: [] };
it("loads only C1's exact read route with company credentials and no cache", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-04-30T23:30:00Z"));
  const read = { ...empty, agreements: [{ tenant_id: "00000000-0000-4000-8000-000000000001",
    id: "00000000-0000-4000-8000-000000000002", revision: 1, plan: "Builder", cadence: "monthly",
    anchor_day: 1, maximum_pence: 16900, effective_date: "2026-05-01" }] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json(read));
  const loaded = await loadSubscriptionPlan(fetcher);
  expect(loaded).toEqual(subscriptionPlanView(read, "2026-05-01"));
  expect(loaded.agreement?.plan).toBe("Builder");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenNthCalledWith(1, "/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  expect(fetcher).toHaveBeenNthCalledWith(2, "/api/subscriptions/current", { cache: "no-store", credentials: "same-origin",
    headers: { "x-csrf-token": session.csrfToken, "x-tenant-id": session.memberships[0]!.tenantId } });
});
it.each([401, 403, 500, 503])("refuses HTTP %s without using any returned company details", async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({ ...empty, privateDetail: "must not display" }, { status }));
  await expect(loadSubscriptionPlan(fetcher)).rejects.toThrow(status < 500 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
});
it("refuses malformed or production reads and propagates network failure", async () => {
  for (const body of [{ ...empty, environment: "production" }, { version: "unknown" }]) {
    await expect(loadSubscriptionPlan(vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json(body)))).rejects.toThrow();
  }
  await expect(loadSubscriptionPlan(vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))).rejects.toThrow("offline");
});
it("renders a loading state and synthetic notice before authenticated figures arrive", () => {
  const html = renderToStaticMarkup(createElement(PlanScreen));
  expect(html).toContain('role="status"'); expect(html).toContain("No real payments are taken");
  expect(html).not.toContain("£");
});
it("renders only Solo/Builder monthly options, with explicit empty agreement and periods", () => {
  const html = renderToStaticMarkup(createElement(PlanDetails, { view: subscriptionPlanView(empty, "2026-04-30") }));
  for (const label of ["Solo", "Builder", "£29.00", "£69.00", "£49.00", "£169.00", "No accepted subscription agreement", "No issued subscription periods", "excluding VAT"]) expect(html).toContain(label);
  for (const label of ["Firm", "Contractor", "per year", "<button", "<form"]) expect(html).not.toContain(label);
});
it("renders the engine's exact amount, period maximum and simulated redirect wording", () => {
  const tenant_id = "00000000-0000-4000-8000-000000000001";
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const view = subscriptionPlanView({ ...empty,
    agreements: [{ tenant_id, id: id(2), revision: 1, plan: "Builder", cadence: "monthly", anchor_day: 31, maximum_pence: 16900, effective_date: "2026-03-31" }],
    periods: [{ tenant_id, id: id(3), period_start: "2026-03-31", period_end: "2026-04-30", agreement_revision: 1, principal_pence: 7900, maximum_pence: 16900 }],
    statements: [{ tenant_id, id: id(4), period_id: id(3), amount_pence: 7900, currency: "GBP", namespace: "subscription.synthetic.v1", hypothetical: true }],
    work: [{ tenant_id, id: id(5), statement_id: id(4), amount_pence: 7900, environment: "synthetic_demo" }],
    attempts: [{ tenant_id, id: id(6), work_id: id(5) }],
    results: [{ tenant_id, id: id(7), work_id: id(5), outcome: "redirect", environment: "synthetic_demo" }],
  }, "2026-04-20");
  const html = renderToStaticMarkup(createElement(PlanDetails, { view }));
  for (const label of ["£79.00", "£169.00", "day 31", "2026-03-31", "2026-04-30", "end date excluded", "Simulated redirect — not settled"]) expect(html).toContain(label);
});

it("does not request company data without a valid current session and membership", async () => {
  for (const response of [Response.json({}, { status: 401 }), Response.json({ csrfToken: "csrf", memberships: [] }), Response.json({ memberships: session.memberships })]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response);
    await expect(loadSubscriptionPlan(fetcher)).rejects.toThrow("SIGN_IN_REQUIRED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
