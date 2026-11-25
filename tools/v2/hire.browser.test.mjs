import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { DEMO_TENANT_ID } from "../../packages/db/dist/index.js";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

// Run after the full seed suite, on its existing HTTPS V2 stack with devIndicators:false
// (or a production build). One sign-in is reused at both widths; no new OTP per test.
const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin && new URL(origin).protocol === "https:", "V2_TEST_ORIGIN must be the phone-mode HTTPS origin");
// Shared setup copied from V2-K5 at 7560b597 (01-RULES rule 22).
let browser, storageState, jobId;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/sign-in`);
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", {name:"Request code"}).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.textContent());
    const [verified] = await Promise.all([page.waitForResponse(`${origin}/api/auth/verify`), page.getByRole("button",{name:"Verify code"}).click()]);
    const {csrfToken} = await verified.json();
    // Reuse one signed-in session across both viewports and reloads.
    await page.evaluate(async token => {
      const response = await fetch("/api/auth/practice", {method:"POST", headers:{"content-type":"application/json","x-csrf-token":token},
        body:JSON.stringify({version:"linked-practice-company.v1",action:"enter"})});
      if (!response.ok) throw new Error(`practice:${response.status}`);
    }, csrfToken);
    const jobs = await page.evaluate(async tenantId => {
      const response = await fetch(`/api/jobs?tenantId=${tenantId}`);
      if (!response.ok) throw new Error(`jobs:${response.status}`);
      return (await response.json()).jobs;
    }, DEMO_TENANT_ID);
    jobId = jobs.find(job => job.title.includes("Occupied-home kitchen splashback and hall decorating"))?.id;
    assert.ok(jobId, "The seeded job must appear in Jobs");
    storageState = await context.storageState();
  } finally { await context.close(); }
});
after(async () => browser?.close());
test("V2-K8: off-hire journey persists at 360 and 1280px on the phone origin", { timeout: 120_000 }, async () => {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ storageState, ignoreHTTPSErrors: true, viewport: { width, height: 800 } });
    try {
      const page = await context.newPage();
      const external = [];
      page.on("request", request => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
      await page.goto(`${origin}/jobs/${jobId}/work`);
      const hires = page.getByRole("main").getByTestId("v2-hire-items");
      await expect(hires).toBeVisible();
      await expect(hires.getByText("Practice sandbox — synthetic data; nothing is sent or charged. Builder only.")).toBeVisible();
      const add = hires.getByRole("button", { name: "Add hire item", exact: true });
      await expect(add).toBeEnabled();
      const supplier = `Fictional hire ${width} ${Date.now()}`;
      await hires.getByLabel("Fictional hire supplier").fill(supplier);
      await hires.getByLabel("Booked from", { exact: true }).fill("2026-01-01");
      await hires.getByLabel("Weekly cost (£)", { exact: true }).fill("125.01");
      await hires.getByLabel("Needed until (optional)").fill("2026-01-02");
      await add.focus(); await expect(add).toBeFocused();
      const box = await add.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44);
      await add.click();
      const item = hires.getByRole("article", { name: `scaffold from ${supplier}` });
      await expect(item.getByText("scaffold not needed after 2026-01-02: off-hire it?", { exact: true })).toBeVisible();
      await expect(item.getByText(/About £[0-9]+\.[0-9]{2} so far/u)).toBeVisible();
      if (process.env.V2_TEST_SCREENSHOTS) {
        await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k8-reminder-${width}.png`), fullPage: true });
      }
      await page.reload();
      await expect(item).toBeVisible();
      await item.getByRole("button", { name: "Edit hire item", exact: true }).click();
      await hires.getByLabel("Weekly cost (£)", { exact: true }).fill("130.02");
      await hires.getByRole("button", { name: "Save hire changes", exact: true }).click();
      await expect(item.getByText(/£130.02 per week/u)).toBeVisible();
      const checkbox = item.getByRole("checkbox").first();
      await expect(checkbox).toBeVisible();
      await checkbox.check(); await expect(checkbox).toBeChecked();
      await item.getByRole("button", { name: "Mark off-hire requested", exact: true }).click();
      await expect(item.getByText("Off-hire requested — contact the supplier yourself", { exact: true })).toBeVisible();
      await item.getByRole("button", { name: "Mark off hire", exact: true }).click();
      await page.reload();
      await expect(item.getByText("Off hire", { exact: true })).toBeVisible();
      await expect(item.getByText(/off-hire it\?/u)).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(external, []);
      const rejected = await page.evaluate(async id => {
        const response = await fetch(`/api/jobs/${id}/hires`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        return response.status;
      }, jobId);
      assert.equal(rejected, 400);
      if (process.env.V2_TEST_SCREENSHOTS) {
        await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k8-${width}.png`), fullPage: true });
      }
    } finally { await context.close(); }
  }
});
