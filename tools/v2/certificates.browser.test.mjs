import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin && new URL(origin).protocol === "https:", "V2_TEST_ORIGIN must be the launcher's HTTPS phone origin");
let browser, storageState, jobId;

// K5A #929 sign-in pattern, with the navigation wait required by rule 22.
// BH1's shared helper is not on this base. Run against a production build (dev indicator off).
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
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
    const [verified] = await Promise.all([
      page.waitForResponse(`${origin}/api/auth/verify`),
      page.getByRole("button", { name: "Verify code" }).click(),
    ]);
    assert.equal(verified.status(), 200);
    const { csrfToken } = await verified.json();
    assert.ok(csrfToken);
    await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
    await page.waitForLoadState("networkidle");
    const practice = await context.request.post(`${origin}/api/auth/practice`, {
      headers: { "x-csrf-token": csrfToken, origin },
      data: { version: "linked-practice-company.v1", action: "enter" },
    });
    assert.equal(practice.status(), 200);
    const { DEMO_TENANT_ID } = await import("../../packages/db/dist/index.js");
    const response = await context.request.get(`${origin}/api/jobs?tenantId=${DEMO_TENANT_ID}`);
    assert.equal(response.status(), 200);
    const { jobs } = await response.json();
    jobId = jobs.find(job => job.title.includes("Occupied-home kitchen splashback and hall decorating"))?.id;
    assert.ok(jobId, "The seeded job must appear in Jobs");
    storageState = await context.storageState();
    if (process.env.V2_TEST_SCREENSHOTS) await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
  } finally { await context.close(); }
});
after(async () => browser?.close());

for (const width of [360, 1280]) {
  test(`Q30 certificates keep valid device drafts after reload at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await browser.newContext({ storageState, ignoreHTTPSErrors: true, viewport: { width, height: 800 } });
    try {
      const page = await context.newPage();
      const foreign = [], writes = [];
      page.on("request", request => {
        if (new URL(request.url()).origin !== origin) foreign.push(request.url());
        if (request.method() === "POST") writes.push(request.url());
      });
      await page.goto(`${origin}/jobs/${jobId}/records`);
      // Fail setup on a dev overlay; never count its content as part of this screen.
      await expect(page.locator("nextjs-portal")).toHaveCount(0);
      const main = page.getByRole("main");
      const panel = main.getByRole("region", { name: "Certificates and product records" });
      await expect(panel.getByText("Saved on this device only. The handover pack (coming later) keeps the final list")).toBeVisible();
      const electrical = panel.getByRole("group", { name: "Minor Electrical Installation Works Certificate (BS 7671)" });
      const select = electrical.getByLabel("Your record", { exact: true });
      await expect(select).toBeEnabled();
      await select.selectOption("not_needed");
      await expect(electrical.getByRole("alert")).toContainText("Add a reason");
      await page.reload();
      await expect(select).toBeEnabled();
      await expect(select).toHaveValue("still_needed");
      await select.selectOption("not_needed");
      const reason = electrical.getByLabel("Why is it not needed? (up to 200 characters)");
      await expect(reason).toHaveAttribute("maxlength", "200");
      await reason.fill("No socket or spur moved or added.");
      await expect(electrical.getByRole("alert")).toHaveCount(0);
      const tile = panel.getByRole("group", { name: "Manufacturer's tile adhesive and grout data sheets" });
      await tile.getByLabel("Your record", { exact: true }).selectOption("got_it");
      await page.reload();
      await expect(select).toBeEnabled();
      await expect(select).toHaveValue("not_needed");
      await expect(reason).toHaveValue("No socket or spur moved or added.");
      await expect(tile.getByLabel("Your record", { exact: true })).toHaveValue("got_it");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(foreign, []);
      assert.deepEqual(writes, [], "Certificate ticks must not write business state");
      if (process.env.V2_TEST_SCREENSHOTS) await page.screenshot({
        path: join(process.env.V2_TEST_SCREENSHOTS, `v2-g0-certificates-${width}.png`), fullPage: true,
      });
    } finally { await context.close(); }
  });

  test(`Q30 a fresh device and unavailable storage stay honest at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await browser.newContext({ storageState, ignoreHTTPSErrors: true, viewport: { width, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/jobs/${jobId}/records`);
      const panel = page.getByRole("main").getByRole("region", { name: "Certificates and product records" });
      const selects = panel.getByLabel("Your record", { exact: true });
      await expect(selects.first()).toBeEnabled();
      for (const select of await selects.all()) await expect(select).toHaveValue("still_needed");
      await page.addInitScript(() => {
        const getItem = Storage.prototype.getItem, setItem = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) {
          if (key.startsWith("jobguard:v2-certificates:")) throw new Error("Storage blocked for this proof");
          return getItem.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith("jobguard:v2-certificates:")) throw new Error("Storage blocked for this proof");
          return setItem.call(this, key, value);
        };
      });
      await page.reload();
      await expect(panel.getByRole("alert")).toContainText("could not be read");
      await selects.first().selectOption("got_it");
      await expect(panel.getByRole("alert")).toContainText("could not be saved");
    } finally { await context.close(); }
  });
}
