import { expect, test } from "@playwright/test";

// UI contract test only: all company/session/payment answers below are fictional route fakes.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenant_id = id(1);
const read = {
  version: "subscription-persisted-read.v1", environment: "synthetic_demo", hypothetical: true, billingDay: 1,
  agreements: [{ tenant_id, id: id(2), revision: 1, plan: "Solo", cadence: "monthly", anchor_day: 1,
    maximum_pence: 4900, effective_date: "2026-01-01" }],
  periods: [{ tenant_id, id: id(3), period_start: "2026-01-01", period_end: "2026-02-01",
    agreement_revision: 1, principal_pence: 2900, maximum_pence: 4900 }],
  statements: [{ tenant_id, id: id(4), period_id: id(3), amount_pence: 2900, currency: "GBP",
    namespace: "subscription.synthetic.v1", hypothetical: true, artifact_hash: "a".repeat(64) }],
  work: [], attempts: [], results: [],
};

for (const scenario of ["executor unavailable", "pending", "approval rejected"] as const) {
  test(`saved approval display: ${scenario}`, async ({ page }) => {
    let approved = false, submissions = 0;
    await page.route("**/api/auth/session", route => route.fulfill({ json: {
      csrfToken: "fictional-csrf", memberships: [{ tenantId: tenant_id }],
    } }));
    await page.route("**/api/subscriptions/current", route => route.fulfill({ json: {
      ...read, work: approved ? [{ tenant_id, id: id(5), statement_id: id(4), amount_pence: 2900, environment: "synthetic_demo" }] : [],
    } }));
    await page.route("**/api/subscriptions/commands", route => {
      submissions++;
      approved = scenario !== "approval rejected";
      return route.fulfill(approved ? { status: 201, json: {
        workId: id(5), paymentStatus: "pending", ...(scenario === "executor unavailable" ? { executionStatus: "unavailable" } : {}),
      } } : { status: 503, json: { code: "SUBSCRIPTION_UNAVAILABLE" } });
    });
    await page.goto("/plans");
    const main = page.getByRole("main");
    const payment = main.getByRole("button", { name: /Approve simulated payment of/ });
    await payment.click();
    if (scenario !== "approval rejected") {
      await expect(main.getByRole("status").filter({ hasText: "Approval saved." })).toContainText("Approval saved. Simulated payment is pending.");
      await expect(payment).toHaveCount(0);
      await expect(main.getByRole("region", { name: "Subscription periods" })).toContainText("Simulation approved");
      await expect(main).not.toContainText("Simulated settlement");
      if (scenario === "executor unavailable") {
        await expect(main.getByRole("alert")).toContainText("The simulation executor could not complete or confirm its result. Your approval is saved.");
        await expect(main.getByRole("alert")).toContainText("do not approve it again");
      } else await expect(main.getByRole("alert")).toHaveCount(0);
      // Reload reads the saved work without submitting or executing another approval.
      await page.reload();
      await expect(main.getByRole("region", { name: "Subscription periods" })).toContainText("Simulation approved");
      await expect(payment).toHaveCount(0);
    } else {
      await expect(main.getByRole("alert")).toContainText("Reload to check the saved result before trying again");
      await expect(main).not.toContainText("Approval saved.");
      await expect(payment).toBeEnabled();
    }
    expect(submissions).toBe(1);
  });
}
