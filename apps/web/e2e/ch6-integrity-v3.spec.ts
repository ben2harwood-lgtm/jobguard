import { expect, test } from "@playwright/test";
import { expectNoLegacyFlash, openOrdinaryAdvisoryJob } from "./ch6-integrity-v3-helpers";
test.setTimeout(240_000);
// Base CH6-A deliberately returns unavailable until coordinator-owned composition is installed.
// This tests the real existing page/transport. Persisted source/dismissal journeys remain HELD;
// no route.fulfill, seeded advisory result, absent producer page or knowingly failing journey.
test("CH6-J current composition hold is truthful across reload and a new application context", async ({ page, browser }) => {
 const requests: string[] = [];
 page.on("request", request => { if (/\/commercial-integrity(?:\/|$)/u.test(new URL(request.url()).pathname)) requests.push(new URL(request.url()).pathname); });
 const jobId = await openOrdinaryAdvisoryJob(page);
 const family = await page.request.get(`/api/jobs/${jobId}/commercial-integrity/family`);
 expect(family.headers()["cache-control"]).toBe("no-store");
 const panel = page.locator("#commercial-integrity");
 if (family.status() === 503) {
  expect(await family.json()).toEqual({ code: "INTEGRITY_UNAVAILABLE" });
  await expect(panel.getByRole("alert")).toHaveText("Recorded checks are unavailable. Reload to check current access and saved sources.");
  expect(requests.every(path => path.endsWith("/family"))).toBe(true);
 } else {
  // The same test remains usable after the coordinator installs the facade. No success is mocked.
  expect(family.ok(), await family.text()).toBe(true); expect((await family.json()).family).toBe("v3");
  await expect(panel.getByText("Recorded advisory checks · v3", { exact: true })).toBeVisible();
  await expect(panel.getByText("No recorded ordinary findings in this filter. Unavailable sources have not been assessed.", { exact: true })).toBeVisible();
 }
 await expectNoLegacyFlash(page); await page.reload();
 await expect(panel.getByRole("heading", { name: "Check the recorded job values and activity" })).toBeVisible();
 await expect(panel.getByRole("status")).toHaveCount(0); await expectNoLegacyFlash(page);
 await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toHaveCount(1);
 const reopened = await browser.newContext({ storageState: await page.context().storageState(), viewport: page.viewportSize()!, baseURL: "http://127.0.0.1:3000" });
 try {
  const second = await reopened.newPage(); await second.goto(`/jobs/${jobId}`);
  await expect(second.locator("#commercial-integrity")).toBeVisible(); await expect(second.locator("#commercial-integrity").getByRole("status")).toHaveCount(0); await expectNoLegacyFlash(second);
 } finally { await reopened.close(); }
 await page.screenshot({ path: `test-results/CH6-J-${test.info().project.name}.png`, fullPage: true });
});
