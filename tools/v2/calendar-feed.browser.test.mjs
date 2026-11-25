import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { DEMO_TENANT_ID } from "../../packages/db/dist/index.js";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

// Run on a fresh HTTPS V2 stack, before the seed suite, with devIndicators:false
// (or a production build). One sign-in is reused at both widths; no new OTP per test.
const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin && new URL(origin).protocol === "https:", "V2_TEST_ORIGIN must be the phone-mode HTTPS origin");
// signInOnce copied from V2-BH1 at 3e9fad3b via K8's browser test (BH1 not on v2/main yet; 01-RULES rule 22).
// Uses this file's HTTPS origin and DEMO_TENANT_ID import; waits for navigation
// after verification before any page.evaluate.
async function signInOnce(browser, { jobTitle = "Occupied-home kitchen splashback and hall decorating" } = {}) {
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

let browser, storageState, jobId;
// Each command click waits for its own POST to come back.
const saved = (page, click) => Promise.all([
  page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/calendar-feeds")),
  click(),
]).then(([response]) => assert.equal(response.status(), 200, `calendar command: ${response.status()}`));
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  ({ storageState, jobId } = await signInOnce(browser));
});
after(async () => browser?.close());
test("V2-K2A: make, use and turn off the builder calendar link at 360 and 1280px on the phone origin", { timeout: 300_000 }, async () => {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ storageState, ignoreHTTPSErrors: true, viewport: { width, height: 800 } });
    try {
      const page = await context.newPage();
      const external = [];
      page.on("request", request => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
      await page.goto(`${origin}/jobs/${jobId}/work`);
      // The work page loads ~25 panels and reflows for several seconds; act only once it is quiet.
      await page.waitForLoadState("networkidle", { timeout: 120_000 });
      const panel = page.getByRole("main").getByTestId("v2-calendar-feed");
      await expect(panel).toBeVisible();
      await expect(panel.getByText("Practice sandbox — synthetic data; nothing is sent or charged. Builder only.")).toBeVisible();
      const make = panel.getByRole("button", { name: "Make calendar link", exact: true });
      const turnOff = panel.getByRole("button", { name: "Turn off calendar link", exact: true });
      // Start from no live link: an earlier run on this stack may have left one on.
      await expect(make.or(turnOff)).toBeVisible({ timeout: 30_000 });
      if (await turnOff.isVisible()) await saved(page, () => turnOff.click());
      await expect(make).toBeEnabled({ timeout: 30_000 });
      const box = await make.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44);
      await saved(page, () => make.click());
      const address = panel.getByLabel("Calendar link address");
      await expect(address).toHaveValue(new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/api/v2/calendar/[A-Za-z0-9_-]{43}\\.ics$`, "u"));
      const link = await address.inputValue();
      await expect(panel.getByRole("button", { name: "Copy calendar link", exact: true })).toBeVisible();
      await expect(panel.getByText(/^Calendar link on\./u)).toBeVisible({ timeout: 30_000 });
      if (process.env.V2_TEST_SCREENSHOTS) {
        await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k2a-link-${width}.png`) });
      }
      // A calendar app fetches without any cookie.
      const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        const feed = await anonymous.request.get(link);
        assert.equal(feed.status(), 200);
        assert.equal(feed.headers()["content-type"], "text/calendar; charset=utf-8");
        assert.equal(feed.headers()["cache-control"], "no-store");
        const text = await feed.text();
        assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n") && text.endsWith("END:VCALENDAR\r\n"));
        assert.doesNotMatch(text, /£/u);
        // Shown once only: after a reload the link is on, but its address is not shown again.
        await page.reload();
        await page.waitForLoadState("networkidle", { timeout: 120_000 });
        await expect(panel.getByText(/^Calendar link on\./u)).toBeVisible({ timeout: 30_000 });
        await expect(panel.getByLabel("Calendar link address")).toHaveCount(0);
        await saved(page, () => panel.getByRole("button", { name: "Update calendar now", exact: true }).click());
        await expect(panel.getByText("Calendar updated from the work plan.")).toBeVisible({ timeout: 30_000 });
        await saved(page, () => panel.getByRole("button", { name: "Turn off calendar link", exact: true }).click());
        await expect(panel.getByText("Calendar link turned off. It no longer works anywhere.")).toBeVisible({ timeout: 30_000 });
        await expect(panel.getByRole("button", { name: "Make calendar link", exact: true })).toBeVisible();
        const gone = await anonymous.request.get(link);
        assert.equal(gone.status(), 404);
        assert.equal(await gone.text(), "Not found");
      } finally { await anonymous.close(); }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(external, []);
      if (process.env.V2_TEST_SCREENSHOTS) {
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k2a-off-${width}.png`) });
      }
    } finally { await context.close(); }
  }
});
