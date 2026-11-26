import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

// Q32: K5A sign-in pattern copied until Q20 is present on this base, with the navigation wait.
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

const origin = v2Origin();
let browser, storageState, jobId, csrfToken;
before(async () => {
  browser = await launchV2Browser();
  const setup = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    // F6T #928: disable Next's dev indicator before opening any pages.
    const disabled = await setup.request.post(`${origin}/__nextjs_disable_dev_indicator`);
    assert.equal(disabled.status(), 204, "The test stack must disable the Next.js dev indicator");
  } finally { await setup.close(); }
  ({ storageState, jobId, csrfToken } = await signInOnce(browser));
  if (process.env.V2_TEST_SCREENSHOTS) await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
});
after(async () => browser?.close());

// Each invocation runs all three contexts. The router must run this file three times,
// each after a fresh bootstrap + seed. An individual pass is not acceptance.
for (const [width, phone] of [[360, false], [1280, false], [390, true]]) {
  test(`B1B saved walk and exact retry at ${width}px${phone ? " phone mode" : ""}`, { timeout: 120_000 }, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true,
      storageState, isMobile: phone, hasTouch: phone });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/jobs/${jobId}/work`);
      const main = page.getByRole("main");
      await main.getByRole("link", { name: "Walk the job", exact: true }).click();
      const walk = main.getByRole("region", { name: "Walk the job", exact: true });
      const start = walk.getByRole("button", { name: /^(Start a walk|Start another walk)$/u });
      await expect(start).toBeEnabled();
      await start.click();
      await expect(walk.getByLabel("New room", { exact: true })).toBeEnabled();
      await walk.getByLabel("New room", { exact: true }).fill("Kitchen");
      await walk.getByRole("button", { name: "Add room", exact: true }).click();
      const saved = walk.getByRole("list", { name: "Saved walk entries" });
      await expect(saved.getByTestId("walk-entry")).toHaveCount(1);
      await expect(walk.getByRole("button", { name: "Take photo", exact: true })).toBeDisabled();
      // V2-B1E: the seeded job is accepted but not live, so the shared upload rule keeps photos off.
      await expect(walk.getByText("Photos can be added once the job is live (practice limit)", { exact: true })).toBeVisible();
      assert.equal(await walk.locator('input[type="file"],audio,video').count(), 0);

      // Let the server commit, then lose the response. Retry must replay the exact command.
      const attempts = [];
      let first = true;
      await page.route("**/api/v2-backend/jobs/*/walk", async route => {
        if (route.request().method() !== "POST") return route.continue();
        const payload = route.request().postDataJSON();
        if (payload.action !== "record" || payload.entry.kind !== "note") return route.continue();
        attempts.push(payload);
        if (first) {
          first = false;
          const committed = await route.fetch();
          assert.equal(committed.status(), 200);
          return route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"WALK_UNAVAILABLE"}' });
        }
        return route.continue();
      });
      await walk.getByPlaceholder("Dictate or type what you see").fill("Keep the existing cupboard");
      await walk.getByRole("button", { name: "Add note", exact: true }).click();
      await expect(walk.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
      await expect(walk.getByRole("button", { name: "Finish walk", exact: true })).toBeDisabled();
      await expect(walk.getByText("Not saved yet", { exact: true })).toBeVisible();
      await walk.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(saved.getByTestId("walk-entry")).toHaveCount(2);
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[1], attempts[0]);
      assert.equal(attempts[0].captureOrder, 2);
      await walk.getByRole("button", { name: "Next room", exact: true }).click();
      await expect(walk.getByLabel("New room", { exact: true })).toBeFocused();
      await walk.getByLabel("New room", { exact: true }).fill("Hall");
      await walk.getByRole("button", { name: "Add room", exact: true }).click();
      await expect(saved.getByTestId("walk-entry")).toHaveCount(3);
      await walk.getByLabel("Quantity", { exact: true }).fill("14.5");
      await walk.getByLabel("Unit", { exact: true }).fill("m²");
      await walk.getByRole("button", { name: "Add measurement", exact: true }).click();
      await expect(saved.getByTestId("walk-entry")).toHaveCount(4);
      const before = await saved.innerText();
      const sessionId = await walk.getByLabel("Walk session", { exact: true }).inputValue();
      await page.reload();
      await expect(saved.getByTestId("walk-entry")).toHaveCount(4);
      assert.equal(await saved.innerText(), before);
      assert.deepEqual(await saved.locator("strong").allTextContents(),
        ["1. Kitchen", "2. Keep the existing cupboard", "3. Hall", "4. 14.5 m²"]);
      await expect(saved.getByText("Saved", { exact: true })).toHaveCount(4);
      await expect(saved.getByText(/phone time/u)).toHaveCount(4);
      const read = await page.request.get(`${origin}/api/v2-backend/jobs/${jobId}/walk?sessionId=${sessionId}`);
      assert.equal(read.status(), 200);
      const { sessions } = await read.json();
      assert.equal(sessions[0].entries.length, 4);
      assert.equal(sessions[0].entries.filter(entry => entry.commandId === attempts[0].commandId).length, 1);
      assert.deepEqual(sessions[0].entries.map(entry => [entry.captureOrder, entry.linkedRoom]),
        [[1, "Kitchen"], [2, "Kitchen"], [3, "Hall"], [4, "Hall"]]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.V2_TEST_SCREENSHOTS) await page.screenshot({
        path: `${process.env.V2_TEST_SCREENSHOTS}/v2-b1b-walk-${width}${phone ? "-phone" : ""}.png`, fullPage: true });
      await walk.getByLabel("Pick a room", { exact: true }).selectOption("Kitchen");
      await expect(saved.getByTestId("walk-entry")).toHaveCount(5);
      await expect(walk.getByRole("heading", { name: "So far in Kitchen", exact: true })).toBeVisible();
      await expect(walk.getByText("Keep the existing cupboard", { exact: true })).toHaveCount(1);
      await walk.getByRole("button", { name: "Finish walk", exact: true }).click();
      await page.waitForURL(`${origin}/jobs/${jobId}/work`);
    } finally { await context.close(); }
  });
}

// B1C uses this file's existing one-time K5A sign-in and fresh contexts.
for (const [width, phone] of [[360, false], [1280, false], [390, true]]) {
  test(`B1C needs-room filing persists at ${width}px${phone ? " phone mode" : ""}`, { timeout: 120_000 }, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true,
      storageState, isMobile: phone, hasTouch: phone });
    try {
      const page = await context.newPage();
      const endpoint = `${origin}/api/v2-backend/jobs/${jobId}/walk`;
      const sessionId = crypto.randomUUID();
      const post = async command => {
        const response = await context.request.post(endpoint, { headers: { origin }, data: command });
        assert.equal(response.status(), 200, await response.text());
      };
      await post({ action: "start", version: "v2-walk-session-command.v1", sessionId, deviceStartedAt: new Date().toISOString() });
      for (const [captureOrder, entry] of [[1, { kind: "photo", photoId: crypto.randomUUID() }],
        [2, { kind: "room", room: "Hall" }], [3, { kind: "room", room: "Kitchen" }]]) {
        await post({ action: "record", version: "v2-walk-entry-command.v1", sessionId, commandId: crypto.randomUUID(),
          captureOrder, expectedVersion: 0, deviceCapturedAt: new Date().toISOString(), entry });
      }
      await page.goto(`${origin}/jobs/${jobId}/walk`);
      const walk = page.getByRole("main").getByRole("region", { name: "Walk the job", exact: true });
      await walk.getByLabel("Walk session", { exact: true }).selectOption(sessionId);
      const trayPhoto = walk.getByRole("article", { name: "Photo 1 needs room", exact: true });
      await expect(trayPhoto).toBeVisible();
      if (process.env.V2_TEST_SCREENSHOTS) await page.screenshot({
        path: `${process.env.V2_TEST_SCREENSHOTS}/v2-b1c-needs-room-${width}${phone ? "-phone" : ""}.png`, fullPage: true });
      await trayPhoto.getByLabel("File under…", { exact: true }).selectOption("2");
      await trayPhoto.getByRole("button", { name: "File photo 1", exact: true }).click();
      await expect(trayPhoto).toHaveCount(0);
      const saved = walk.getByRole("list", { name: "Saved walk entries" });
      await expect(saved.getByText("Filed under Hall (taken in no room)", { exact: true })).toBeVisible();
      await page.reload();
      await expect(saved.getByText("Filed under Hall (taken in no room)", { exact: true })).toBeVisible();
      if (process.env.V2_TEST_SCREENSHOTS) await page.screenshot({
        path: `${process.env.V2_TEST_SCREENSHOTS}/v2-b1c-filed-${width}${phone ? "-phone" : ""}.png`, fullPage: true });
      await saved.getByRole("button", { name: "Move to another room", exact: true }).click();
      await saved.getByLabel("File under…", { exact: true }).selectOption("3");
      await saved.getByRole("button", { name: "File photo 1", exact: true }).click();
      await expect(saved.getByText("Filed under Kitchen (taken in no room)", { exact: true })).toBeVisible();
      const read = await context.request.get(`${endpoint}?sessionId=${sessionId}`);
      assert.equal(read.status(), 200);
      const { sessions } = await read.json();
      assert.equal(sessions[0].entries[0].filingVersion, 2);
      assert.equal(sessions[0].entries[0].originalRoomCaptureOrder, null);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    } finally { await context.close(); }
  });
}

// V2-B1E runs last: it switches the seeded job live (practice, no charge), then takes a practice photo.
for (const [width, phone] of [[360, false], [1280, false], [390, true]]) {
  test(`B1E Take photo files a verified practice photo at ${width}px${phone ? " phone mode" : ""}`, { timeout: 120_000 }, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true,
      storageState, isMobile: phone, hasTouch: phone });
    try {
      const page = await context.newPage();
      const endpoint = `${origin}/api/v2-backend/jobs/${jobId}/walk`;
      if (!(await (await context.request.get(endpoint)).json()).jobLive) {
        const live = await context.request.post(`${origin}/api/jobs/${jobId}/quotes/activation`, {
          headers: { origin, "x-csrf-token": csrfToken },
          data: { version: "practice-activation-command.v1", commandId: crypto.randomUUID(), scenario: "no_charge" } });
        assert.equal(live.status(), 200, await live.text());
      }
      const sessionId = crypto.randomUUID();
      for (const command of [{ action: "start", version: "v2-walk-session-command.v1", sessionId, deviceStartedAt: new Date().toISOString() },
        { action: "record", version: "v2-walk-entry-command.v1", sessionId, commandId: crypto.randomUUID(), captureOrder: 1,
          expectedVersion: 0, deviceCapturedAt: new Date().toISOString(), entry: { kind: "room", room: "Kitchen" } }]) {
        const response = await context.request.post(endpoint, { headers: { origin }, data: command });
        assert.equal(response.status(), 200, await response.text());
      }
      await page.goto(`${origin}/jobs/${jobId}/walk`);
      const walk = page.getByRole("main").getByRole("region", { name: "Walk the job", exact: true });
      await walk.getByLabel("Walk session", { exact: true }).selectOption(sessionId);
      await expect(walk.getByText("Takes a generated practice photo. Real camera photos come later.", { exact: true })).toBeVisible();
      await walk.getByRole("button", { name: "Take photo", exact: true }).click();
      const saved = walk.getByRole("list", { name: "Saved walk entries" });
      await expect(saved.getByTestId("walk-photo-state")).toHaveText("Photo verified · file integrity checked");
      await page.reload();
      await walk.getByLabel("Walk session", { exact: true }).selectOption(sessionId);
      await expect(saved.getByTestId("walk-photo-state")).toHaveText("Photo verified · file integrity checked");
      if (process.env.V2_TEST_SCREENSHOTS) await page.screenshot({
        path: `${process.env.V2_TEST_SCREENSHOTS}/v2-b1e-photo-${width}${phone ? "-phone" : ""}.png`, fullPage: true });
      assert.equal(await walk.locator('input[type="file"],audio,video').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    } finally { await context.close(); }
  });
}
