import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { expect } from "../../../apps/web/node_modules/@playwright/test/index.mjs";
import { launchV2Browser, signInOnce, v2Context, v2Origin } from "./browser-session.mjs";

// Run against the seeded HTTPS phone launcher with devIndicators:false, or a production build.
v2Origin();
const jobTitle = "Occupied-home kitchen splashback and hall decorating";
const signInRequests = { request: 0, verify: 0 };
const screenshots = process.env.V2_TEST_SCREENSHOTS;
let browser, countedBrowser, session;
before(async () => {
  if (screenshots) await mkdir(screenshots, { recursive: true });
  browser = await launchV2Browser();
  // Observe setup and reused contexts without introducing another sign-in flow.
  countedBrowser = {
    async newContext(options) {
      const context = await browser.newContext(options);
      context.on("request", request => {
        const path = new URL(request.url()).pathname;
        if (request.method() !== "POST") return;
        if (path === "/api/auth/request") signInRequests.request++;
        if (path === "/api/auth/verify") signInRequests.verify++;
      });
      return context;
    },
  };
  session = await signInOnce(countedBrowser);
  assert.ok(session.jobId, "signInOnce must find the seeded job");
  assert.ok(session.csrfToken, "signInOnce must return the verification CSRF token");
  assert.deepEqual(signInRequests, { request: 1, verify: 1 });
});
after(async () => browser?.close());

for (const width of [360, 1280]) {
  test(`BH1 reuses one sign-in on the money page at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await v2Context(countedBrowser, session.storageState, width);
    try {
      const page = await context.newPage();
      const url = `${session.origin}/jobs/${session.jobId}/money`;
      await page.goto(url);
      const main = page.getByRole("main");
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        await expect(page).toHaveURL(url);
        await expect(main.getByRole("heading", { name: jobTitle, exact: true, level: 1 })).toBeVisible();
        await expect(main.getByRole("heading", { name: "Follow every pound.", exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => innerWidth), width);
        assert.deepEqual(signInRequests, { request: 1, verify: 1 }, "Reusing a session must not sign in again");
      }
      if (screenshots) await page.screenshot({ path: join(screenshots, `v2-bh1-money-${width}.png`), fullPage: true });
    } finally {
      await context.close();
    }
  });
}

test("BH1 signs in ten times on one stack without a navigation race", { timeout: 1_200_000 }, async t => {
  for (let run = 1; run <= 10; run++) {
    // Respect the real 60-second resend and ten-requests-per-ten-minutes limits
    // (per address and per IP), never bypassing or retrying a failed sign-in.
    // 67 s keeps at most eight earlier codes in any ten-minute window, leaving
    // room for the setup sign-in and the launcher's own seeded request.
    await setTimeout(67_000);
    await t.test(`signInOnce run ${run}/10`, { timeout: 120_000 }, async () => {
      const result = await signInOnce(countedBrowser);
      assert.equal(result.origin, session.origin);
      assert.equal(result.jobId, session.jobId, "Each sign-in must find the seeded job");
      assert.ok(result.csrfToken, "Each sign-in must return a verification CSRF token");
      assert.ok(result.storageState.cookies.length, "Each sign-in must save its session cookies");
      assert.deepEqual(signInRequests, { request: run + 1, verify: run + 1 });
    });
  }
});
