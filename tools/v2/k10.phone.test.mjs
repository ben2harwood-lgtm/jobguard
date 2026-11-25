import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { DEMO_TENANT_ID } from "../../packages/db/dist/index.js";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

// Run against a production build, or with devIndicators:false in the supplied test config.
assert.equal(process.env.V2_TEST_DEV_INDICATORS_OFF, "1", "Confirm production build or devIndicators:false");

// Copied from V2-BH1 browser-session.mjs at 3e9fad3b until that helper merges.
function v2Origin() {
  const origin = process.env.V2_TEST_ORIGIN;
  assert.ok(origin, "V2_TEST_ORIGIN must name the launcher's HTTPS phone origin");
  const url = new URL(origin);
  assert.equal(url.protocol, "https:", "V2_TEST_ORIGIN must use HTTPS for Secure session cookies");
  return url.origin;
}

async function launchV2Browser() {
  return chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
}

// K5A #929 at 7560b597: one page sign-in, then enter practice with its CSRF token.
async function signInOnce(browser, { jobTitle = "Occupied-home kitchen splashback and hall decorating" } = {}) {
  const origin = v2Origin();
  let context;
  let step = "create context";
  try {
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    step = "open sign-in";
    await page.goto(`${origin}/sign-in`);
    step = "request code";
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code" }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.textContent());
    step = "verify code";
    const [verified] = await Promise.all([
      page.waitForResponse(`${origin}/api/auth/verify`),
      page.getByRole("button", { name: "Verify code" }).click(),
    ]);
    assert.equal(verified.status(), 200, "Code verification must succeed");
    const { csrfToken } = await verified.json();
    assert.ok(typeof csrfToken === "string" && csrfToken, "Verification must return a CSRF token");
    step = "finish sign-in navigation";
    await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
    await page.waitForLoadState("load");
    step = "enter practice";
    await page.evaluate(async token => {
      const response = await fetch("/api/auth/practice", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({ version: "linked-practice-company.v1", action: "enter" }),
      });
      if (!response.ok) throw new Error(`practice:${response.status}`);
    }, csrfToken);
    step = "find seeded job";
    const jobs = await page.evaluate(async tenantId => {
      const response = await fetch(`/api/jobs?tenantId=${tenantId}`);
      if (!response.ok) throw new Error(`jobs:${response.status}`);
      return (await response.json()).jobs;
    }, DEMO_TENANT_ID);
    const jobId = jobs.find(job => job.title.includes(jobTitle))?.id;
    assert.ok(jobId, `The seeded job must appear in Jobs: ${jobTitle}`);
    step = "save session";
    return { origin, storageState: await context.storageState(), csrfToken, jobId };
  } catch (cause) {
    const error = new Error(`V2 browser session failed at ${step}`, { cause });
    error.name = "V2BrowserSessionError";
    throw error;
  } finally {
    await context?.close();
  }
}

test("K10 builder sees persisted costs at 360 and 1280px on the phone origin", { timeout: 120_000 }, async () => {
  const browser = await launchV2Browser();
  const origin = v2Origin();
  let context;
  try {
    const session = await signInOnce(browser);
    const job = { id: session.jobId };
    context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: session.storageState });
    const page = await context.newPage();
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${origin}/jobs/${job.id}`);
      const expected = await page.evaluate(async id => {
        const response = await fetch(`/api/jobs/${id}/profit-so-far`, { cache: "no-store" });
        if (!response.ok) throw new Error("Profit unavailable");
        return response.json();
      }, job.id);
      const panel = page.locator("#captured-job-workspace").getByRole("region", { name: "Job profit so far" });
      await expect(panel).toContainText(expected.summary, { timeout: 30_000 });
      await expect(panel).toContainText("Costs recorded so far only.");
      await expect(panel).not.toContainText(/forecast|K10 hidden money canary/iu);
      await page.reload();
      await expect(panel).toContainText(expected.summary, { timeout: 30_000 });
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
  } finally { await context?.close(); await browser.close(); }
});
