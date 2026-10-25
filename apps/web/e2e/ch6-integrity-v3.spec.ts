import { expect, test } from "@playwright/test";
import { expectInstalledV1Panel, openOrdinaryAdvisoryJob } from "./ch6-integrity-v3-helpers";
test.setTimeout(240_000);
// The family-first v3 seam is not installed until its facade is composed.
// Protect the existing v1 page against that independent composition hold.
// Persisted v3 source/dismissal and application-process restart proof remain HELD.
test("CH6-J installed v1 stays independent of family composition across reload and a new browser context", async ({ page, browser, baseURL }) => {
 const requests: string[] = [];
 const trackRequests = (target: typeof page) => target.on("request", request => {
  const path = new URL(request.url()).pathname;
  if (/\/commercial-integrity(?:\/|$)/u.test(path)) requests.push(path);
 });
 trackRequests(page);
 const jobId = await openOrdinaryAdvisoryJob(page);
 await expectInstalledV1Panel(page);
 const family = await page.request.get(`/api/jobs/${jobId}/commercial-integrity/family`);
 expect(family.headers()["cache-control"]).toBe("no-store");
 if (family.status() === 503) expect(await family.json()).toEqual({ code: "INTEGRITY_UNAVAILABLE" });
 else {
  expect(family.ok(), await family.text()).toBe(true);
  expect((await family.json()).jobId).toBe(jobId);
 }
 await expectInstalledV1Panel(page);
 await page.reload(); await expectInstalledV1Panel(page);
 await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged", { exact: true })).toHaveCount(1);
 const reopened = await browser.newContext({ storageState: await page.context().storageState(), viewport: page.viewportSize()!, ...(baseURL ? { baseURL } : {}) });
 try {
  const second = await reopened.newPage(); trackRequests(second); await second.goto(`/jobs/${jobId}`);
  await expectInstalledV1Panel(second);
 } finally { await reopened.close(); }
 expect(requests).toContain(`/api/jobs/${jobId}/commercial-integrity`);
 expect(requests.every(path => /^\/api\/jobs\/[a-f0-9-]+\/commercial-integrity$/u.test(path))).toBe(true);
 await page.screenshot({ path: `test-results/CH6-J-${test.info().project.name}.png`, fullPage: true });
});
