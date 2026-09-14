import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Keep every job on track." })).toBeVisible();
  await page.getByRole("button", { name: "Continue with demo code" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

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
  await expect(live).toContainText("Q-1007 · Delivered");
  await expect(live).toContainText("Customer payment not due");
  await expect(live).toContainText("Pilot no-charge · no JobGuard fee paid");
  await expect(page.getByRole("article").filter({ hasText: "Loft conversion" })).toContainText("Queued — not delivered");
});

test("tenant switching re-keys data and shows the empty state", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Kitchen extension")).toBeVisible();
  await page.getByLabel("Select workspace").selectOption({ label: "Empty Workshop" });
  await expect(page.getByRole("heading", { name: "No jobs yet" })).toBeVisible();
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
