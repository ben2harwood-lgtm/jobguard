import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

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
    const { DEMO_TENANT_ID } = await import("../../packages/db/dist/index.js");
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

async function v2Context(browser, storageState, width) {
  return browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true, storageState });
}

const origin = v2Origin();
let browser, storageState, jobId;
before(async () => {
  browser = await launchV2Browser();
  ({ storageState, jobId } = await signInOnce(browser));
});
after(async () => browser?.close());
for (const width of [360,1280]) {
  test(`K5A payment schedule persists on the phone origin at ${width}px`, async () => {
    const context = await v2Context(browser, storageState, width);
    try {
      const page = await context.newPage();
      const invoices = [];
      page.on("request", request => { if(request.method() === "POST" && request.url().includes("customer-invoice"))invoices.push(request.url()); });
      await page.goto(`${origin}/jobs/${jobId}/money`);
      const section = page.getByRole("main").getByRole("region",{name:"Payment schedule"});
      await expect(section.getByText("Accepted quote total:",{exact:false})).toBeVisible();
      const save = section.getByRole("button",{name:"Set payment schedule"});
      if(await save.count()) {
        const fields = section.locator("fieldset");
        await fields.nth(1).getByLabel("Date",{exact:true}).fill("2099-01-01");
        await fields.nth(2).getByLabel("Date",{exact:true}).fill("2099-02-01");
        await save.click();
      }
      await expect(section.getByText("Due now",{exact:false})).toHaveCount(1);
      const saved = await section.innerText();
      await page.reload();
      await expect(section).toContainText("Extras approved before the schedule was set:");
      await expect(section).toContainText("Extras since the schedule was set:");
      assert.equal(await section.innerText(),saved);
      // Plan check (merge condition): every amount on screen is labelled ex-VAT.
      const amounts = saved.match(/£[^\s]*(?:\s+\S+)?/gu) ?? [];
      assert.ok(amounts.length >= 5, `expected the total, stages and extras lines: ${amounts}`);
      for (const amount of amounts) assert.match(amount, /^£[0-9][0-9,]*\.[0-9]{2} ex-VAT$/u, `amount without ex-VAT label: ${amount}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      assert.deepEqual(invoices,[]);
      if(process.env.V2_TEST_SCREENSHOTS)await page.screenshot({path:`${process.env.V2_TEST_SCREENSHOTS}/v2-k5-payment-schedule-${width}.png`,fullPage:true});
    } finally { await context.close(); }
  });
}
