import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
import { validateSettings } from "./settings.mjs";
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
// V2-F1: copied K5A sign-in pattern with rule-22 navigation wait; no per-test sign-ins.
// Run on a fresh HTTPS phone stack with production Next, or devIndicators:false.
// Acceptance requires three separate fresh bootstrap/seed + browser runs in lane B/CI.
const origin = v2Origin();
let browser, storageState, jobId, pool, brief;
before(async () => {
  browser = await launchV2Browser();
  ({ storageState, jobId } = await signInOnce(browser));
  process.env.JOBGUARD_LOCAL_V2 = "1";
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const { settings } = validateSettings({});
  pool = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
  const sessionId = storageState.cookies.find(cookie => cookie.name === "jg_session")?.value;
  assert.ok(sessionId);
  const app = createWorkspaceApplication({ pool, sessionId });
  await app.workPlan.read(jobId, { version: "work-plan-query.v1" });
  await app.quote.activate(jobId, { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" });
  const briefs = await app.crewBriefs.read(jobId, { version: "v2-crew-brief-query.v1", trade: "tiler" });
  brief = await app.crewBriefs.generate(jobId, { version: "v2-crew-brief-command.v1", commandId: randomUUID(),
    trade: "tiler", expectedVersion: briefs[0]?.version ?? 0, accessWindow: "F1 fictional mornings", photoIds: [] });
  if (process.env.V2_TEST_SCREENSHOTS) await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
});
after(async () => { await pool?.end(); await browser?.close(); });
for (const width of [360, 1280]) {
  test(`F1 builder records Done, Blocked and Changed through the HTTPS phone origin at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await v2Context(browser, storageState, width);
    const foreign = [];
    try {
      const page = await context.newPage();
      page.on("request", request => { if (!request.url().startsWith("data:") && new URL(request.url()).origin !== origin) foreign.push(request.url()); });
      await page.goto(`${origin}/jobs/${jobId}/brief-progress`);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: "Brief progress", exact: true })).toBeVisible();
      const trade = main.getByRole("region", { name: "tiler brief", exact: true });
      const task = trade.getByRole("region", { name: brief.content.tasks.find(task => task.taskKey === "tile-splashback").title, exact: true });
      const note = task.getByRole("textbox");
      // The list loads after the page; count only once it shows, or the 1280 run
      // reads 0 while the 360 run's three presses are still to appear.
      await expect(task).toBeVisible();
      await expect(main.getByText("Loading brief progress…")).toHaveCount(0);
      const recordedBefore = await task.getByRole("listitem").count();
      const photosBefore = await task.getByRole("img", { name: "Generated practice progress photo" }).count();
      await expect(task.getByRole("button", { name: "Blocked", exact: true })).toBeDisabled();
      await expect(task.getByRole("button", { name: "Changed", exact: true })).toBeDisabled();
      for (const kind of ["Done", "Blocked", "Changed"]) {
        if (kind !== "Changed") await task.getByRole("checkbox", { name: "Attach generated practice photo" }).check();
        if (kind !== "Done") await note.fill(`F1 ${width} fictional ${kind.toLowerCase()} reason${kind === "Blocked" ? ": no power" : ""}`);
        const [response] = await Promise.all([
          page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/brief-progress`) && response.request().method() === "POST"
            && response.request().postDataJSON().version !== "v2-brief-progress-photo-command.v1"),
          task.getByRole("button", { name: kind, exact: true }).click(),
        ]);
        assert.equal(response.status(), 200, await response.text());
        await expect(task.getByRole("listitem")).toHaveCount(recordedBefore + ["Done", "Blocked", "Changed"].indexOf(kind) + 1);
      }
      await expect(task).toContainText("Recorded by you");
      await expect(task).toContainText(`F1 ${width} fictional blocked reason`);
      await expect(task).toContainText(`F1 ${width} fictional changed reason`);
      await page.reload();
      await expect(task.getByRole("listitem")).toHaveCount(recordedBefore + 3);
      await expect(task).toContainText(": no power");
      await expect(main).toContainText("does not verify completion");
      await expect(task.getByRole("img", { name: "Generated practice progress photo" })).toHaveCount(photosBefore + 2);
      await expect(task.getByText("Photo verified · file integrity checked", { exact: true })).toHaveCount(photosBefore + 2);
      for (const image of await task.getByRole("img").all()) expect(await image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(main.locator("input[type=file]")).toHaveCount(0);
      assert.doesNotMatch(await main.innerText(), /£|success fee|shadow signal|hidden finding/iu);
      assert.equal(await main.evaluate(element => element.scrollWidth > element.clientWidth), false);
      const another = await v2Context(browser, storageState, width);
      try {
        const reopened = await another.newPage();
        await reopened.goto(`${origin}/jobs/${jobId}/brief-progress`);
        await expect(reopened.getByRole("main")).toContainText(`F1 ${width} fictional changed reason`);
      } finally { await another.close(); }
      assert.deepEqual(foreign, []);
      if (process.env.V2_TEST_SCREENSHOTS) await main.screenshot({ path: `${process.env.V2_TEST_SCREENSHOTS}/v2-f1p-brief-progress-${width}.png` });
    } finally { await context.close(); }
  });
}
