import { expect, test } from "@playwright/test";

// Browser interaction with fictional read fixtures; no subscription command is mocked or issued.
// Included by the existing CI suite in both mobile-360 and desktop projects (headless, one CI worker).
test("onboarding suggests both deals without selecting a plan, accepting terms or sending answers", async ({ page }) => {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  await page.route("**/api/auth/session", route => route.fulfill({ json: { csrfToken: "fictional-csrf", memberships: [{ tenantId }] } }));
  const emptySubscription = {
    version: "subscription-persisted-read.v1", environment: "synthetic_demo", hypothetical: true,
    billingDay: 15, agreements: [], periods: [], statements: [], work: [], attempts: [], results: [],
  };
  await page.route("**/api/subscriptions/current", route => route.fulfill({ json: emptySubscription }));
  await page.goto("/plans");
  const section = page.getByRole("region", { name: "Plan suggestion" });
  await expect(section).toBeVisible();
  const plan = page.getByRole("combobox", { name: "Plan", exact: true });
  await plan.selectOption("Builder");
  const accept = page.getByRole("button", { name: "Accept monthly terms", exact: true });
  const consent = page.getByRole("checkbox");
  const requests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url()); });
  const jobs = section.getByRole("textbox", { name: "How many jobs do you usually have on the go?" });
  const staff = section.getByRole("combobox", { name: "Do your site staff need to capture work themselves?" });
  for (const [count, capture, suggestion] of [
    ["7", "no", "Solo or Builder should fit."],
    ["8", "no", "The contractor deal may fit better."],
    ["1", "yes", "The contractor deal may fit better."],
  ] as const) {
    await jobs.fill(count); await staff.selectOption(capture);
    await section.getByRole("button", { name: "Show suggestion" }).click();
    await expect(section.getByRole("status")).toContainText(`Suggestion: ${suggestion}`);
    await expect(plan).toHaveValue("Builder");
    await expect(consent).not.toBeChecked(); await expect(accept).toBeDisabled();
  }
  await expect(section.getByRole("link", { name: "Contractor organisation practice" })).toHaveAttribute("href", "/admin/contractor");
  await expect(section).toContainText("Contractor capabilities require a contractor agreement.");
  await consent.check();
  await expect(accept).toBeEnabled();
  await section.getByRole("button", { name: "Show suggestion" }).click();
  await expect(section.getByRole("status")).toContainText("The contractor deal may fit better.");
  await expect(accept).toBeEnabled();
  await jobs.fill("-1");
  await expect(section.getByRole("status")).toHaveCount(0);
  await section.getByRole("button", { name: "Show suggestion" }).click();
  await expect(section.getByRole("alert")).toContainText("Enter a whole number of jobs");
  await expect(plan).toHaveValue("Builder");
  await expect(consent).toBeChecked();
  await expect(accept).toBeEnabled();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(jobs).toHaveValue(""); await expect(staff).toHaveValue("");
  await expect(section.getByRole("status")).toHaveCount(0);
  await page.route("**/api/subscriptions/current", route => route.fulfill({ json: {
    ...emptySubscription, agreements: [{ tenant_id: tenantId, id: "00000000-0000-4000-8000-000000000002",
      revision: 1, plan: "Solo", cadence: "monthly", anchor_day: 15, maximum_pence: 4900, effective_date: "2026-01-15" }],
  } }));
  await page.reload();
  await expect(page.getByRole("region", { name: "Your subscription" })).toContainText("Solo · monthly · effective 2026-01-15");
  await expect(section).toHaveCount(0);
});
