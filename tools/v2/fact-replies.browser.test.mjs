import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { validateSettings } from "./settings.mjs";

// Copied from V2-BH1 browser-session.mjs at 3e9fad3b until that helper merges.
function v2Origin() {
  const origin = process.env.V2_TEST_ORIGIN;
  assert.ok(origin, "V2_TEST_ORIGIN must name the launcher's HTTPS phone origin");
  const url = new URL(origin);
  assert.equal(url.protocol, "https:", "V2_TEST_ORIGIN must use HTTPS for Secure session cookies");
  return url.origin;
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

const origin = v2Origin();
const { settings } = validateSettings({});
const runtime = new Pool({ connectionString: settings.DATABASE_URL, max: 2 });
let browser, storageState, jobId, openFacts;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  ({ storageState, jobId } = await signInOnce(browser));
  // E1 has no screen yet, so the open question is logged through E1's own command as this builder.
  const sessionId = storageState.cookies.find(cookie => cookie.name === "jg_session")?.value;
  assert.ok(sessionId, "The signed-in browser must hold a session cookie");
  ({ openFacts } = createWorkspaceApplication({ pool: runtime, sessionId }));
});
after(async () => { await browser?.close(); await runtime.end(); });

// The dev server compiles each route on first use, so waits after an action allow for that.
const slow = { timeout: 30_000 };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

for (const width of [360, 1280]) {
  test(`E2 asks the customer by link, records the reply and applies it at ${width}px`, { timeout: 240_000 }, async () => {
    const need = `Is the side gate open on the day? (${width}px run)`;
    await openFacts.command(jobId, { version: "v2-open-fact-command.v1", action: "log", commandId: randomUUID(),
      owner: { kind: "customer" }, detail: { kind: "access", need }, neededBy: "2026-12-10", scopeItemId: null, planTask: null });
    const builder = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true, storageState });
    const customer = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
    try {
      const page = await builder.newPage();
      const foreign = [];
      for (const each of [page]) each.on("request", request => { if (new URL(request.url()).origin !== origin) foreign.push(request.url()); });
      await page.goto(`${origin}/jobs/${jobId}/work`);
      const section = page.getByRole("main").getByTestId("v2-fact-replies");
      await expect(section.getByRole("heading", { name: "Replies received: apply?" })).toBeVisible(slow);
      const ask = section.getByRole("article", { name: `Ask: ${need}` });
      await expect(ask).toContainText("waiting on the customer", slow);
      const [sentLink] = await Promise.all([
        page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/fact-replies`) && response.request().method() === "POST"),
        ask.getByRole("button", { name: /^Send link to customer@jobguard-v2\.invalid$/u }).click(),
      ]);
      assert.equal(sentLink.status(), 200, await sentLink.text());
      const link = ask.getByRole("link", { name: "open the reply page" });
      await expect(link).toBeVisible(slow);
      const path = await link.getAttribute("href");
      assert.match(path, /^\/reply\/[A-Za-z0-9_-]{43}$/u);
      assert.equal(await noSideways(page), false);
      if (process.env.V2_TEST_SCREENSHOTS) await page.screenshot({ path: `${process.env.V2_TEST_SCREENSHOTS}/v2-e2-builder-ask-${width}.png`, fullPage: true });

      // The customer opens the link without signing in and answers the one question.
      const reply = await customer.newPage();
      reply.on("request", request => { if (new URL(request.url()).origin !== origin) foreign.push(request.url()); });
      await reply.goto(`${origin}${path}`);
      const main = reply.getByRole("main");
      await expect(main).toContainText(need, slow);
      await expect(main.getByRole("heading", { name: "One question from your builder" })).toBeVisible();
      await expect(main).toContainText("This link answers this one question only.");
      const text = await main.innerText();
      for (const hidden of ["builder@", "Occupied-home", "Replies received"]) assert.ok(!text.includes(hidden), hidden);
      await main.getByRole("textbox").fill("Yes, the gate code is 1234");
      await main.getByRole("button", { name: /send/iu }).click();
      await expect(main).toContainText(/thank/iu, slow);
      assert.equal(await noSideways(reply), false);
      if (process.env.V2_TEST_SCREENSHOTS) await reply.screenshot({ path: `${process.env.V2_TEST_SCREENSHOTS}/v2-e2-reply-page-${width}.png`, fullPage: true });
      // Single use: the same link now shows the answer and offers no second send.
      await reply.reload();
      await expect(main).toContainText("Yes, the gate code is 1234", slow);
      await expect(main.getByRole("button", { name: /send/iu })).toHaveCount(0);

      // The builder sees the reply and applies it once.
      await page.reload();
      const entry = section.getByRole("list", { name: "Replies" }).getByRole("listitem").filter({ hasText: need });
      await expect(entry).toContainText("Reply: “Yes, the gate code is 1234” · by link", slow);
      await entry.getByRole("button", { name: "Apply this reply" }).click();
      await expect(entry).toContainText("Applied to the question.", slow);
      await page.reload();
      await expect(entry).toContainText("Applied to the question.", slow);
      await expect(entry.getByRole("button", { name: "Apply this reply" })).toHaveCount(0);
      await expect(section.getByRole("article", { name: `Ask: ${need}` })).toHaveCount(0);
      assert.equal(await noSideways(page), false);
      assert.deepEqual(foreign, []);
      if (process.env.V2_TEST_SCREENSHOTS) await page.screenshot({ path: `${process.env.V2_TEST_SCREENSHOTS}/v2-e2-builder-applied-${width}.png`, fullPage: true });
    } finally {
      await builder.close();
      await customer.close();
    }
  });
}
