import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { DEMO_TENANT_ID } from "../../packages/db/dist/index.js";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin && new URL(origin).protocol === "https:", "Use the launcher's HTTPS V2_TEST_ORIGIN");
// Run against a production build, or with devIndicators:false in the supplied test config.
assert.equal(process.env.V2_TEST_DEV_INDICATORS_OFF, "1", "Confirm production build or devIndicators:false");

test("K10 builder sees persisted costs at 360 and 1280px on the phone origin", { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/sign-in`);
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code" }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.textContent());
    const [verified] = await Promise.all([page.waitForResponse(`${origin}/api/auth/verify`),
      page.getByRole("button", { name: "Verify code" }).click()]);
    assert.equal(verified.status(), 200);
    // Enter the same linked practice company, once, then retain cookies for both widths.
    const { csrfToken } = await verified.json();
    await page.evaluate(async csrf => {
      const response = await fetch("/api/auth/practice", { method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ version: "linked-practice-company.v1", action: "enter" }) });
      if (!response.ok) throw new Error("Practice company unavailable");
    }, csrfToken);
    const job = await page.evaluate(async tenantId => {
      const response = await fetch(`/api/jobs?tenantId=${tenantId}`);
      if (!response.ok) throw new Error("Jobs unavailable");
      return (await response.json()).jobs[0];
    }, DEMO_TENANT_ID);
    assert.ok(job?.id, "Run the V2 seed first");
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${origin}/jobs/${job.id}/work`);
      const expected = await page.evaluate(async id => {
        const response = await fetch(`/api/jobs/${id}/profit-so-far`, { cache: "no-store" });
        if (!response.ok) throw new Error("Profit unavailable");
        return response.json();
      }, job.id);
      const panel = page.locator("#captured-job-workspace").getByRole("region", { name: "Job profit so far" });
      await expect(panel).toContainText(expected.summary);
      await expect(panel).toContainText("Costs recorded so far only.");
      await expect(panel).not.toContainText(/forecast|K10 hidden money canary/iu);
      await page.reload();
      await expect(panel).toContainText(expected.summary);
      assert.ok(await panel.evaluate(element => element.scrollWidth <= element.clientWidth));
      if (process.env.V2_TEST_SCREENSHOTS) {
        await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k10-${width}.png`), fullPage: true });
      }
    }
    const guest = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(`${origin}/sign-in`);
      const denied = await guestPage.evaluate(async id => {
        const response = await fetch(`/api/jobs/${id}/profit-so-far`);
        return { status: response.status, body: await response.text() };
      }, job.id);
      assert.equal(denied.status, 401);
      assert.doesNotMatch(denied.body, /quoted|recordedCosts|leftInBudget/u);
    } finally { await guest.close(); }
  } finally { await context.close(); await browser.close(); }
});
