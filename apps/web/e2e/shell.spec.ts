import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Keep every job and every pound on track." })).toBeVisible();
  await page.getByRole("button", { name: "Start the demo" }).click();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

test("first visit explains the journey and the help button reopens it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start the demo" })).toBeVisible();
  await expect(page.getByText("A safe demo, nothing is really sent, charged, or saved to a real customer.")).toBeVisible();
  await page.getByRole("button", { name: "Start the demo" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to JobGuard" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "1. These are your jobs" })).toBeVisible();
  await expect(page.locator('[data-tour="jobs-list"]')).toHaveClass(/tour-target/);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to JobGuard" })).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to JobGuard" })).toHaveCount(0);
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to JobGuard" })).toBeVisible();
});

test("sign-in opens the accessible shell without horizontal overflow", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("navigation", { name: /navigation/i }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByLabel("Search jobs").focus();
  await expect(page.getByLabel("Search jobs")).toBeFocused();
});

test("live job has exact document, payment and pilot provenance", async ({ page }) => {
  await signIn(page);
  const live = page.getByRole("article").filter({ hasText: "Kitchen extension" });
  await expect(live).toContainText("Live");
  await expect(live).toContainText("Q-1007 · Sent");
  await expect(live).toContainText("No payment due yet");
  await expect(live).toContainText("No-charge pilot · no JobGuard fee paid");
  await expect(page.getByRole("article").filter({ hasText: "Loft conversion" })).toContainText("Queued — not delivered");
});

test("tenant switching re-keys data and shows the empty state", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Kitchen extension")).toBeVisible();
  await page.getByLabel("Select workspace").selectOption({ label: "Empty Workshop" });
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await expect(page.getByText("Kitchen extension")).toHaveCount(0);
});

test("typed failure retries in place without creating anything", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/jobs?**", async (route) => {
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "UPSTREAM_UNAVAILABLE" }) });
    else await route.continue();
  });
  await signIn(page);
  await expect(page.locator("section.error[role=alert]")).toContainText("Error: UNAVAILABLE");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Kitchen extension")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Kitchen extension")).toHaveCount(1);
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test("server boundary hides unauthorized tenant and cross-tenant job IDs", async ({ page, request }) => {
  await signIn(page);
  const cookies = await page.context().cookies();
  const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  const forbidden = await request.get("/api/jobs?tenantId=99999999-9999-4999-8999-999999999999", { headers: { cookie } });
  expect(forbidden.status()).toBe(403);
  const hidden = await request.get("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111&jobId=cccccccc-cccc-4ccc-8ccc-cccccccccccc", { headers: { cookie } });
  expect(hidden.status()).toBe(404);
  await expect(hidden.text()).resolves.not.toContain("Never disclose");
});
