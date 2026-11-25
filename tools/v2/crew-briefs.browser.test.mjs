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

// Run against a fresh bootstrap + seed on the HTTPS phone origin, with the
// Next dev indicator disabled (or a production build). Repeat on three fresh
// stacks; this file neither starts a server nor treats a skipped run as proof.
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
  test(`D5B-B makes, reloads, revises and exports the tiling brief at ${width}px on the phone origin`, { timeout: 120_000 }, async () => {
    const context = await v2Context(browser, storageState, width);
    try {
      const page = await context.newPage();
      const path = `/api/v2-backend/jobs/${jobId}/crew-briefs`;
      const attempts = [];
      // The first command commits but its response is lost: retry must keep the
      // exact command ID and payload, and D4 returns the one recorded revision.
      await page.route(`**${path}`, async route => {
        if (route.request().method() !== "POST") return route.continue();
        attempts.push(route.request().postDataJSON());
        if (attempts.length === 1) {
          const result = await route.fetch();
          assert.equal(result.status(), 200, await result.text());
          return route.abort("failed");
        }
        return route.continue();
      });
      await page.goto(`${origin}/jobs/${jobId}/work`);
      const section = page.getByRole("main").getByRole("region", { name: "Crew briefs", exact: true });
      const tiler = section.getByRole("article", { name: "tiler brief", exact: true });
      const access = tiler.getByLabel("Access window");
      await expect(access).toBeVisible();
      const versionText = await tiler.locator(".tag").innerText();
      const initialVersion = versionText === "No brief yet" ? 0 : Number(versionText.replace("Version ", ""));
      const initialButton = initialVersion ? "Make a new version" : "Make brief";
      const window = `Weekday mornings · ${width}px · ${Date.now()}`;
      await access.fill(window);
      await tiler.getByRole("button", { name: initialButton, exact: true }).click();
      await expect(tiler.getByRole("alert")).toContainText("Could not confirm the save");
      await tiler.getByRole("button", { name: initialButton, exact: true }).click();
      await expect(tiler.locator(".tag")).toHaveText(`Version ${initialVersion + 1}`);
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[1], attempts[0]);
      await page.unroute(`**${path}`);
      await page.reload();
      await expect(tiler.locator(".tag")).toHaveText(`Version ${initialVersion + 1}`);
      await expect(access).toHaveValue(window);
      await expect(tiler).toContainText("Proof needed");
      const revisedWindow = `${window} · afternoons by agreement`;
      await access.fill(revisedWindow);
      await tiler.getByRole("button", { name: "Make a new version", exact: true }).click();
      await expect(tiler.locator(".tag")).toHaveText(`Version ${initialVersion + 2}`);
      await page.reload();
      await expect(tiler.locator(".tag")).toHaveText(`Version ${initialVersion + 2}`);
      await expect(access).toHaveValue(revisedWindow);
      const [download] = await Promise.all([
        page.waitForEvent("download"), tiler.getByRole("button", { name: "Internal copy", exact: true }).click(),
      ]);
      const { readFile } = await import("node:fs/promises");
      const exported = await readFile(await download.path(), "utf8");
      assert.doesNotMatch(exported, /£/u);
      function noFinancialFields(value) {
        if (!value || typeof value !== "object") return;
        for (const [key, entry] of Object.entries(value)) {
          assert.doesNotMatch(key, /amount|price|pence|fee|finding|netValue|grossValue/iu);
          noFinancialFields(entry);
        }
      }
      const copy = JSON.parse(exported);
      noFinancialFields(copy);
      assert.equal(copy.version, "v2-crew-brief-export.v1");
      assert.equal(copy.brief.trade, "tiler");
      assert.equal(copy.brief.accessWindow, revisedWindow);
      assert.ok(copy.brief.tasks.length > 0);
      assert.doesNotMatch(await section.innerText(), /£|hidden financial|success fee/iu);
      for (const src of await section.locator("img").evaluateAll(images => images.map(image => image.src))) {
        assert.equal(new URL(src).origin, origin);
      }
      assert.equal(await section.evaluate(element => element.scrollWidth > element.clientWidth), false);
      if (process.env.V2_TEST_SCREENSHOTS) await section.screenshot({
        path: `${process.env.V2_TEST_SCREENSHOTS}/v2-d5b-b-briefs-${width}.png`,
      });
    } finally { await context.close(); }
  });

  test(`D5B-B empty, planned-only, dropped-trade and problem screen states at ${width}px`, async () => {
    const context = await v2Context(browser, storageState, width);
    try {
      const page = await context.newPage();
      let body = { trades: [], briefs: [], code: "QUOTE_REVISION_NOT_FOUND" };
      let status = 200;
      await page.route(`**/api/v2-backend/jobs/${jobId}/crew-briefs`, route => route.fulfill({
        status, contentType: "application/json", body: JSON.stringify(body),
      }));
      await page.goto(`${origin}/jobs/${jobId}/work`);
      const section = page.getByRole("main").getByRole("region", { name: "Crew briefs", exact: true });
      await expect(section).toContainText("Accept a quote to plan the work first");
      body = { trades: ["tiler", "decorator"], briefs: [] };
      await page.reload();
      await expect(section.getByText("No brief yet", { exact: true })).toHaveCount(2);
      await expect(section.getByRole("button", { name: "Make brief", exact: true })).toHaveCount(2);
      body = { trades: [], briefs: [{ trade: "plumber", version: 1, current: false, content: {
        accessWindow: "Mornings", tasks: [], photos: [], proofNeeded: [],
      } }] };
      await page.reload();
      await expect(section).toContainText("No longer in the plan");
      await expect(section.getByRole("button", { name: "Make a new version", exact: true })).toHaveCount(0);
      await expect(section.getByRole("button", { name: "Internal copy", exact: true })).toBeVisible();
      status = 503; body = { code: "CREW_BRIEFS_UNAVAILABLE" };
      await page.reload();
      await expect(section.getByRole("alert")).toContainText("Briefs could not open. The job is unchanged.");
      status = 200; body = { trades: [], briefs: [] };
      await section.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(section).toContainText("Assign a planned task to a trade first.");
    } finally { await context.close(); }
  });
}

