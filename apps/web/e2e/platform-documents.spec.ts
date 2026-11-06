import { test, expect } from "@playwright/test";
// Browser transport fixture only; database authority and no-write behavior have a real PostgreSQL suite.
test("simulation documents are read only, wrap at phone/desktop width and handle a refused session", async ({ page }) => {
  const hash = "a".repeat(64);
  const line = (kind: string) => ({ id: kind, kind, policyVersion: "subscription_pricing_policy_v4",
    references: [{ name: "statement", id: "10000000-0000-4000-8000-000000000001", hash }] });
  const documents = [{ issuerId: "fictional", invoice: { number: "SIM-PLATFORM-1", lines: [line("subscription"), line("success_fee"), line("future_kind")] },
    credits: [{ number: "SIM-PLATFORM-2", lines: [line("subscription")] }],
    account: { principalPence: 2900, taxPence: 580, grossPence: 3480, alreadyPaidPence: 0, remainingCashDuePence: 3480, refundDuePence: 0, collectionStarted: false } }];
  const methods: string[] = [];
  await page.route("**/api/plans/platform-documents", route => {
    methods.push(route.request().method());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: "platform-documents.v1", documents, collectionStarted: false }) });
  });
  await page.goto("/plans/platform-documents");
  const main = page.getByRole("main");
  await expect(main.getByText("SIM-PLATFORM-1", { exact: true })).toBeVisible();
  await expect(main.getByText("Linked credit notes")).toBeVisible();
  await expect(main.getByText("Kind: future_kind")).toBeVisible();
  await expect(main.getByText("No payment is linked to these simulated documents yet.")).toBeVisible();
  await expect(main.getByRole("button")).toHaveCount(0); await expect(main.getByRole("link")).toHaveCount(0);
  expect(methods).toEqual(["GET"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // There are no interactive targets on this read-only screen, so no sub-44px targets.
  await page.route("**/api/plans/platform-documents", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "UNAUTHENTICATED" }) }));
  await page.reload(); await expect(main.getByRole("alert")).toContainText("Sign in with your company session");
  await expect(main.getByText("SIM-PLATFORM-1", { exact: true })).toHaveCount(0);
});
