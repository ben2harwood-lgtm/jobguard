import { expect, test, type Page } from "@playwright/test";
import { seedSubscriptionPeriod } from "./subscription-period-fixture";

async function catalogue(page: Page) {
  const plans = page.getByRole("region", { name: "Plans", exact: true });
  await expect(plans).toHaveCount(1);
  await expect(plans.getByRole("heading", { name: "Solo", exact: true })).toBeVisible();
  await expect(plans.getByRole("heading", { name: "Builder", exact: true })).toBeVisible();
  for (const text of ["£29.00 per month · 4 jobs on the go included", "£69.00 per month · 7 jobs on the go included", "Monthly maximum: £49.00", "Monthly maximum: £169.00"]) {
    await expect(plans).toContainText(text);
  }
  await expect(page.getByRole("main")).toContainText("excluding VAT");
  await expect(page.getByRole("main")).toContainText("Figures are hypothetical. No real payments are taken.");
  await expect(plans).not.toContainText("per year");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
async function privateAbsent(page: Page) {
  for (const name of ["Your subscription", "Subscription periods", "Manage subscription", "Plan suggestion"]) {
    await expect(page.getByRole("region", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("No accepted subscription agreement.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No issued subscription periods.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Plan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
}

test("unsigned visitor can compare practice plans without company access", async ({ page }) => {
  const subscriptionRequests: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/subscriptions/")) subscriptionRequests.push(request.url());
  });
  await page.goto("/plans");
  await catalogue(page);
  const signIn = page.getByRole("link", { name: "Company sign-in", exact: true });
  await expect(signIn).toHaveAttribute("href", "/sign-in");
  await privateAbsent(page);
  await expect(page.getByRole("combobox", { name: "Company", exact: true })).toHaveCount(0);
  await expect(page.getByRole("note", { name: "Practice sandbox notice" })).toBeVisible();
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await catalogue(page);
    await signIn.focus();
    await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    await expect(signIn).toBeFocused();
    expect(await signIn.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    const box = await signIn.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.reload(); await catalogue(page); await privateAbsent(page);
  expect(subscriptionRequests).toEqual([]);
});

test("public catalogue survives failed reads and lost company access without previous private figures", async ({ page, context }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Fictional email address").fill(`plan-preview-${crypto.randomUUID()}@practice.invalid`);
  await page.getByRole("button", { name: "Request code", exact: true }).click();
  const code = await page.getByTestId("fixture-code").textContent();
  await page.getByLabel("Eight-digit code").fill(code!);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You're signed in.", exact: true })).toBeVisible();
  const tenant = await page.getByTestId("identity-tenant").textContent();
  const currentResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/subscriptions/current" && response.ok());
  await page.goto("/plans");
  const { billingDay } = await (await currentResponse).json() as { billingDay: number };
  const expectedDays = [
    "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th",
    "11th", "12th", "13th", "14th", "15th", "16th", "17th", "18th", "19th", "20th",
    "21st", "22nd", "23rd", "24th", "25th", "26th", "27th", "28th", "29th", "30th", "31st",
  ];
  expect(Number.isInteger(billingDay)).toBe(true);
  expect(billingDay).toBeGreaterThanOrEqual(1);
  expect(billingDay).toBeLessThanOrEqual(31);
  const billingSentence = `Your billing day: the ${expectedDays[billingDay - 1]}`;
  const subscription = page.getByRole("region", { name: "Your subscription", exact: true });
  const billingParagraph = subscription.locator("p").filter({ hasText: "Your billing day:" });
  await expect(billingParagraph).toHaveText(billingSentence);
  await expect(billingParagraph).toBeVisible();
  await expect(subscription).toContainText("No accepted subscription agreement.");
  await catalogue(page);
  const originalViewport = page.viewportSize()!;
  try {
    await page.setViewportSize({ width: 390, height: originalViewport.height });
    await expect(billingParagraph).toHaveText(billingSentence);
    await expect(billingParagraph).toBeVisible();
    await catalogue(page);
  } finally {
    await page.setViewportSize(originalViewport);
  }
  const consent = page.getByRole("checkbox", { name: /I accept these monthly terms/ });
  const accept = page.getByRole("button", { name: "Accept monthly terms", exact: true });
  await expect(accept).toBeDisabled();
  await consent.check(); await accept.click();
  await expect(subscription).toContainText("Solo · monthly");
  await expect(billingParagraph).toHaveText(billingSentence);
  await expect(billingParagraph).toBeVisible();
  await page.getByRole("combobox", { name: "Plan", exact: true }).selectOption("Builder");
  await consent.check(); await page.getByRole("button", { name: "Approve upgrade to Builder", exact: true }).click();
  await expect(subscription).toContainText("Builder · monthly");
  const cookie = (await context.cookies()).find(value => value.name === "jobguard_session")!;
  await seedSubscriptionPeriod(tenant!, cookie.value);
  await page.reload();
  const periods = page.getByRole("region", { name: "Subscription periods", exact: true });
  await expect(periods).toContainText("Hypothetical subscription: £69.00");
  // The fixture backdates the agreement to the 1st of last month, and the page shows the agreement's anchor day.
  await expect(billingParagraph).toHaveText("Your billing day: the 1st");
  await expect(billingParagraph).toBeVisible();
  await catalogue(page);
  // Abort transport only; all successful identity/subscription responses above use real PostgreSQL.
  let releaseRead!: () => void;
  const readBlocked = new Promise<void>(resolve => { releaseRead = resolve; });
  await page.route("**/api/subscriptions/current", async route => { await readBlocked; await route.abort("failed"); });
  await page.getByRole("combobox", { name: "Company", exact: true }).selectOption(tenant!);
  await expect(page.getByRole("status").filter({ hasText: "Loading subscription" })).toBeVisible();
  await catalogue(page); await privateAbsent(page);
  releaseRead();
  await expect(page.getByRole("alert").filter({ hasText: "Subscription details are unavailable" })).toBeVisible();
  await catalogue(page); await privateAbsent(page);
  await page.unroute("**/api/subscriptions/current");
  await page.reload();
  await expect(subscription).toContainText("Builder · monthly");
  await expect(periods).toContainText("Hypothetical subscription: £69.00");
  // Loss of the real session must remove earlier private agreement, period and action displays.
  await context.clearCookies();
  let reads = 0, commands = 0;
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/subscriptions/current") reads++;
    if (path === "/api/subscriptions/commands") commands++;
  });
  await page.getByRole("combobox", { name: "Company", exact: true }).selectOption(tenant!);
  await expect(page.getByRole("alert").filter({ hasText: "Subscription details are unavailable" })).toBeVisible();
  await catalogue(page); await privateAbsent(page);
  await page.reload();
  await expect(page.getByRole("link", { name: "Company sign-in", exact: true })).toBeVisible();
  await catalogue(page); await privateAbsent(page);
  expect(reads).toBe(0); expect(commands).toBe(0);
});
