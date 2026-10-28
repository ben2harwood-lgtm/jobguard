import { expect, test } from "@playwright/test";
import { expectInstalledV1Panel, expectInstalledV3Panel, openOrdinaryAdvisoryJob, openFreshAdvisoryJob } from "./ch6-integrity-v3-helpers";
test.setTimeout(240_000);

test("CH-6 saved v1 keeps its own pricing and recorded checks through family-first composition", async ({ page, browser, baseURL }) => {
 const requests: string[] = [];
 const trackRequests = (target: typeof page) => target.on("request", request => {
  const path = new URL(request.url()).pathname;
  if (/\/commercial-integrity(?:\/|$)/u.test(path)) requests.push(path);
 });
 trackRequests(page);
 const jobId = await openOrdinaryAdvisoryJob(page);
 await expectInstalledV1Panel(page);
 const family = await page.request.get(`/api/jobs/${jobId}/commercial-integrity/family`);
 expect(family.ok(), await family.text()).toBe(true);
 expect(family.headers()["cache-control"]).toBe("no-store");
 expect(await family.json()).toMatchObject({ jobId, family: "v1" });
 await page.reload(); await expectInstalledV1Panel(page);
 const reopened = await browser.newContext({ storageState: await page.context().storageState(), viewport: page.viewportSize()!, ...(baseURL ? { baseURL } : {}) });
 try {
  const second = await reopened.newPage(); trackRequests(second); await second.goto(`/jobs/${jobId}`);
  await expectInstalledV1Panel(second);
 } finally { await reopened.close(); }
 expect(requests).toContain(`/api/jobs/${jobId}/commercial-integrity/family`);
 expect(requests).toContain(`/api/jobs/${jobId}/commercial-integrity`);
 expect(requests.every(path => /^\/api\/jobs\/[a-f0-9-]+\/commercial-integrity(?:\/family)?$/u.test(path))).toBe(true);
 await page.screenshot({ path: `test-results/CH6-v1-${test.info().project.name}.png`, fullPage: true });
});

test("CH-6 fresh v3 shows saved advisory sources without v1 pricing or pre-lock hidden output", async ({ page, browser, baseURL }) => {
 const requests: string[] = [];
 page.on("request", request => {
  const path = new URL(request.url()).pathname;
  if (/\/commercial-integrity(?:\/|$)/u.test(path)) requests.push(path);
 });
 const jobId = await openFreshAdvisoryJob(page);
 await expectInstalledV3Panel(page);
 const read = await page.request.get(`/api/jobs/${jobId}/commercial-integrity/v3`);
 expect(read.ok(), await read.text()).toBe(true); expect(read.headers()["cache-control"]).toBe("no-store");
 const view = await read.json();
 expect(view).toMatchObject({ jobId, advisory: true, realExternalActions: 0, published: null });
 expect(view.result.advisory).toBe(true);
 for (const finding of view.result.findings) {
  expect(finding.advisory).toBe(true); expect(finding.sourceSnapshot.phase).toBe("pre_lock");
  expect(finding.sourceReferences.length).toBeGreaterThan(0); expect(finding.window).toEqual(finding.sourceSnapshot.window);
 }
 expect(JSON.stringify(view)).not.toMatch(/shadow_|postLockItems|hiddenCount|hiddenSignals/u);
 await page.reload(); await expectInstalledV3Panel(page);
 expect(requests).toContain(`/api/jobs/${jobId}/commercial-integrity/family`);
 expect(requests).toContain(`/api/jobs/${jobId}/commercial-integrity/v3`);
 expect(requests).not.toContain(`/api/jobs/${jobId}/commercial-integrity`);
 const reopened = await browser.newContext({ storageState: await page.context().storageState(), viewport: page.viewportSize()!, ...(baseURL ? { baseURL } : {}) });
 try {
  const second = await reopened.newPage(); await second.goto(`/jobs/${jobId}`); await expectInstalledV3Panel(second);
 } finally { await reopened.close(); }
 // A separate practice session cannot read the first customer's job or advisory output.
 const unrelated = await browser.newContext({ ...(baseURL ? { baseURL } : {}) });
 try {
  const other = await unrelated.newPage(); await other.goto("/");
  await other.getByRole("button", { name: "Start the demo", exact: true }).click();
  await other.getByRole("button", { name: "Skip tour", exact: true }).click();
  const denied = await other.request.get(`/api/jobs/${jobId}/commercial-integrity/v3`);
  expect(denied.status()).toBe(404); expect(await denied.json()).toEqual({ code: "NOT_FOUND" });
 } finally { await unrelated.close(); }
 await page.screenshot({ path: `test-results/CH6-v3-${test.info().project.name}.png`, fullPage: true });
});
