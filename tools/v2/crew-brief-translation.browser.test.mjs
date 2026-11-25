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
    await page.waitForLoadState("networkidle");
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

// V2-D4B: copied D5B-B's Q22 sign-in pattern, including its navigation wait.
// Run on the HTTPS phone origin using a production web build (or devIndicators: false).
// Three passes, each with fresh bootstrap + seed and browser, are required evidence.
const origin = v2Origin();
let browser, storageState, jobId;
before(async () => {
  browser = await launchV2Browser();
  ({ storageState, jobId } = await signInOnce(browser));
  if (process.env.V2_TEST_SCREENSHOTS) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
  }
});
after(async () => browser?.close());
for (const width of [360, 1280]) {
  test(`D4B Polish, English original, reload, cached language and new version at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await v2Context(browser, storageState, width);
    try {
      const page = await context.newPage();
      const path = `/api/v2-backend/jobs/${jobId}/crew-briefs`;
      const translationPosts = [];
      page.on("request", request => {
        if (request.method() === "POST" && new URL(request.url()).pathname === path + "/translation") {
          translationPosts.push(request.postDataJSON());
        }
      });
      await page.goto(`${origin}/jobs/${jobId}/work`);
      const section = page.getByRole("main").getByRole("region", { name: "Crew briefs", exact: true });
      const card = section.getByRole("article", { name: "tiler brief", exact: true });
      const access = card.getByLabel("Access window");
      await expect(access).toBeVisible();
      // Precondition, not a page-content leak assertion: a dev overlay invalidates this run.
      assert.equal(await page.locator("nextjs-portal").count(), 0, "Use a production build or disable dev indicators for browser evidence");
      const original = `Weekday mornings ${width}px ${Date.now()}`;
      await access.fill(original);
      const versionBefore = await card.locator(".tag").innerText();
      await card.getByRole("button", { name: versionBefore === "No brief yet" ? "Make brief" : "Make a new version", exact: true }).click();
      await expect(card.getByRole("status")).toContainText("Brief saved");
      const language = card.getByLabel("Language", { exact: true });
      await language.selectOption("pl");
      await expect(card.getByText(`[pl] ${original}`, { exact: false })).toBeVisible();
      await expect(card.getByRole("button", { name: "Show the English original", exact: true })).toBeVisible();
      await expect(card).toContainText("Fake service");
      assert.equal(translationPosts.length, 1);
      const firstVersion = translationPosts[0].expectedVersion;
      assert.deepEqual(Object.keys(translationPosts[0]).sort(), ["version", "commandId", "trade", "expectedVersion", "lang"].sort());
      await card.getByRole("button", { name: "Show the English original", exact: true }).click();
      await expect(language).toHaveValue("");
      await expect(card).not.toContainText(`[pl] ${original}`);
      await language.selectOption("pl");
      await expect(card).toContainText(`[pl] ${original}`);
      assert.equal(translationPosts.length, 1, "choosing a cached language does not translate again");
      await page.reload();
      await language.selectOption("pl");
      await expect(card).toContainText(`[pl] ${original}`);
      assert.equal(translationPosts.length, 1, "reload reads the saved translation");
      assert.doesNotMatch(await section.innerText(), /£|hidden financial|success fee/iu);
      for (const src of await section.locator("img").evaluateAll(images => images.map(image => image.src))) assert.equal(new URL(src).origin, origin);
      assert.equal(await section.evaluate(element => element.scrollWidth > element.clientWidth), false);
      if (process.env.V2_TEST_SCREENSHOTS) await section.screenshot({ path: `${process.env.V2_TEST_SCREENSHOTS}/v2-d4b-polish-${width}.png` });
      await access.fill(`${original} afternoons`);
      await card.getByRole("button", { name: "Make a new version", exact: true }).click();
      await expect(card.locator(".tag")).toHaveText(`Version ${firstVersion + 1}`);
      await expect(language).toHaveValue("");
      await language.selectOption("pl");
      await expect(card).toContainText(`[pl] ${original} afternoons`);
      assert.equal(translationPosts.length, 2);
      assert.equal(translationPosts[1].expectedVersion, firstVersion + 1);
    } finally { await context.close(); }
  });
  test(`D4B hides language on stale briefs and preserves English on translation failure at ${width}px`, async () => {
    const context = await v2Context(browser, storageState, width);
    try {
      const page = await context.newPage();
      const path = `/api/v2-backend/jobs/${jobId}/crew-briefs`;
      const response = await context.request.get(origin + path);
      assert.equal(response.status(), 200);
      const data = await response.json();
      const source = data.briefs.find(brief => brief.trade === "tiler");
      assert.ok(source);
      let current = false;
      await page.route(`**${path}`, route => route.fulfill({ contentType: "application/json",
        body: JSON.stringify({ ...data, briefs: data.briefs.map(brief => brief.trade === "tiler" ? { ...brief, current } : brief) }) }));
      await page.goto(`${origin}/jobs/${jobId}/work`);
      const card = page.getByRole("main").getByRole("region", { name: "Crew briefs", exact: true }).getByRole("article", { name: "tiler brief", exact: true });
      await expect(card).toContainText("Out of date");
      await expect(card.getByLabel("Language", { exact: true })).toHaveCount(0);
      current = true;
      await page.route(`**${path}/translation*`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "CREW_BRIEF_TRANSLATION_UNAVAILABLE" }) }));
      await page.reload();
      await card.getByLabel("Language", { exact: true }).selectOption("pl");
      await expect(card.getByRole("alert")).toContainText("The English original is shown");
      await expect(card).toContainText(source.content.accessWindow);
      await expect(card.getByRole("button", { name: "Show the English original", exact: true })).toHaveCount(0);
    } finally { await context.close(); }
  });
}
