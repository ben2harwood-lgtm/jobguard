import { expect, test } from "@playwright/test";

// CI ONLY, both configured projects. These are actual existing CH9-B held routes.
// This does not claim fresh multi-job, meter, trial or settled-money acceptance.
test("CH9-B10 held business view survives reload, preserves job access and exposes no money", async ({ page, browser }) => {
 const issued = await page.request.post("/api/session");
 expect(issued.ok()).toBe(true);
 const result = await page.request.get("/api/value");
 expect(result.status()).toBe(503);
 expect(result.headers()["cache-control"]).toBe("private, no-store");
 expect(await result.json()).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "BUSINESS_VALUE_BINDING_HELD" });
 await page.goto("/value");
 await expect(page.getByRole("heading", { name: "Business value", exact: true })).toBeVisible();
 await expect(page.getByTestId("business-value-status")).toContainText("Business value is unavailable");
 await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toBeVisible();
 await expect(page.getByRole("heading", { name: "Subscription by billing period" })).toBeVisible();
 await expect(page.getByText("Existing job receipts and exports remain available from each job.", { exact: true })).toBeVisible();
 expect(await page.locator("main").innerText()).not.toMatch(/£|saved you|would have forgotten/u);
 await expect(page.locator("a[download]")).toHaveCount(0);
 await page.reload();
 await expect(page.getByTestId("business-value-status")).toContainText("Business value is unavailable");
 const refresh = page.getByRole("button", { name: "Refresh availability", exact: true });
 await refresh.focus(); await expect(refresh).toBeFocused();
 const box = await refresh.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
 await refresh.click();
 await expect(page.getByTestId("business-value-status")).toContainText("Business value is unavailable");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
 await expect(page.getByRole("link", { name: "Back to jobs" })).toHaveAttribute("href", "/");
 const foreign = await browser.newContext();
 try {
  const tab = await foreign.newPage(); await tab.goto(new URL("/value", page.url()).href);
  await expect(tab.getByTestId("business-value-status")).toContainText("Sign in to your practice session");
  const denied = await tab.request.get(new URL("/api/value?tenantId=foreign", page.url()).href);
  expect(denied.status()).toBe(401);
  expect(await denied.json()).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "UNAUTHENTICATED" });
 } finally { await foreign.close(); }
 await page.screenshot({ path: `test-results/CH9-B-held-${test.info().project.name}.png`, fullPage: true });
});

test("CH-9 composed job v3 read authenticates each session and never discloses producer money", async ({ page, browser }) => {
 expect((await page.request.post("/api/session")).ok()).toBe(true);
 const session = await (await page.request.get("/api/session")).json();
 const jobs = await (await page.request.get(`/api/jobs?tenantId=${session.tenants[0].id}`)).json();
 expect(jobs.jobs.length).toBeGreaterThan(0);
 const path = `/api/jobs/${jobs.jobs[0].id}/value/v3`;
 for (let n = 0; n < 2; n++) {
  const result = await page.request.get(path);
  expect(result.status()).toBe(200);
  expect(result.headers()["cache-control"]).toBe("private, no-store");
  expect(await result.json()).toMatchObject({ version: "job-value.v3", jobId: jobs.jobs[0].id, status: "incomplete", receipt: null, asOf: null });
 }
 const invalid = await page.request.get(`${path}?allocation=999999999`);
 expect(invalid.status()).toBe(400);
 const foreign = await browser.newContext();
 try {
  const tab = await foreign.newPage();
  const url = new URL(path, test.info().project.use.baseURL!).href;
  expect((await tab.request.get(url)).status()).toBe(401);
  expect((await tab.request.post(new URL("/api/session", url).href)).ok()).toBe(true);
  const denied = await tab.request.get(url);
  expect(denied.status()).toBe(404);
  expect(await denied.json()).toEqual({ version: "job-value-error.v3", status: "incomplete", code: "NOT_FOUND" });
 } finally { await foreign.close(); }
});
