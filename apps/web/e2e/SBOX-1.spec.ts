import { expect, test } from "@playwright/test";
test.setTimeout(90_000);

const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/"); await page.getByRole("button", { name: "Start the demo" }).click();
  const skip = page.getByRole("button", { name: "Skip tour" }); await skip.waitFor({ state: "visible" }); await skip.click();
}
async function noOverflow(page: import("@playwright/test").Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }

test("persistent workspace survives reload and a second authorized context", async ({ page, browser }) => {
  await signIn(page); await expect(page.getByText(banner, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open this job" }).click(); await page.waitForURL(/\/jobs\//u);
  await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Practice kitchen", exact: true })).toBeVisible();
  const id = await page.getByTestId("job-id").textContent(), revision = await page.getByTestId("job-revision").textContent(), url = page.url();
  expect(id).toBeTruthy(); await page.reload(); await expect(page.getByTestId("job-id")).toHaveText(id!); await expect(page.getByTestId("job-revision")).toHaveText(revision!);
  await expect(page.getByText("Illustration — not yet connected to this job", { exact: true })).toHaveCount(4); await noOverflow(page);
  const second = await browser.newContext(); const secondPage = await second.newPage(); await signIn(secondPage); await secondPage.goto(url); await expect(secondPage.getByTestId("job-id")).toHaveText(id!); await expect(secondPage.getByTestId("job-revision")).toHaveText(revision!); await second.close();
});

test("tenant selection and foreign jobs fail closed without disclosure", async ({ page, request }) => {
  await signIn(page); const jobLink = page.getByRole("link", { name: "Open this job" }); const href = await jobLink.getAttribute("href"); expect(href).toBeTruthy();
  const foreign = await page.request.get(`/api${href}?requested_tenant_id=22222222-2222-4222-8222-222222222222`); expect(foreign.status()).toBe(403); expect(await foreign.text()).not.toContain("Practice kitchen");
  await page.goto("/jobs/cccccccc-cccc-4ccc-8ccc-cccccccccccc"); await expect(page.getByText("You cannot open this job", { exact: true })).toBeVisible(); await expect(page.getByText("Practice kitchen", { exact: true })).toHaveCount(0); await noOverflow(page);
  const unauthenticated = await request.get(`/api${href}`); expect(unauthenticated.status()).toBe(401); expect(await unauthenticated.text()).not.toContain("Practice kitchen");
});

test("an unavailable read is recoverable and never replaced with fixture success", async ({ page }) => {
  await signIn(page); const href = await page.getByRole("link", { name: "Open this job" }).getAttribute("href");
  // Fault-only transport abort: no JobGuard success API is intercepted or fulfilled.
  await page.route(`**/api/jobs/*`, route => route.abort("connectionfailed")); await page.goto(href!);
  await expect(page.getByText("Your job could not load", { exact: true })).toBeVisible(); const retry = page.getByRole("button", { name: "Try again" }); await expect(retry).toBeVisible();
  await retry.focus(); await expect(retry).toBeFocused(); await page.unroute(`**/api/jobs/*`); await retry.click();
  await expect(page.getByRole("heading", { name: "Practice kitchen", exact: true })).toBeVisible(); await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared"); await noOverflow(page);
});
