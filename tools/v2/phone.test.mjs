import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

const origin = process.env.V2_TEST_ORIGIN;
const screenshots = process.env.V2_TEST_SCREENSHOTS;
assert.ok(origin && new URL(origin).protocol === "https:", "Set V2_TEST_ORIGIN to the launcher's HTTPS origin");

let browser;
before(async () => {
  if (screenshots) await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
});
after(async () => browser?.close());

for (const width of [360, 1280]) {
  test(`V2 phone origin signs in and persists across reload at ${width}px`, { timeout: 120_000 }, async () => {
    const context = await browser.newContext({ viewport: { width, height: 800 }, ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      const foreignRequests = [];
      const apiRequests = [];
      page.on("request", request => {
        const url = new URL(request.url());
        if (url.origin !== origin) foreignRequests.push(url.href);
        if (url.pathname.startsWith("/api/")) apiRequests.push(url.pathname);
      });
      await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Sign in to JobGuard" })).toBeVisible();
      const health = await page.evaluate(async () => {
        const response = await fetch("/api/v2-backend/healthz");
        return [response.status, await response.json()];
      });
      assert.deepEqual(health, [200, { status: "ok" }]);
      await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
      // The pinned base has an empty seed hook. The 360px run can create the
      // fictional owner through the normal form; the 1280px run signs in again.
      await page.getByLabel("What do you want to do?").selectOption(width === 360 ? "signup" : "signin");
      await page.getByRole("button", { name: "Request code" }).click();
      const code = page.getByTestId("fixture-code");
      await expect(code).toHaveText(/^[0-9]{8}$/u);
      await page.getByLabel("Eight-digit code").fill(await code.textContent());
      const [verified] = await Promise.all([
        page.waitForResponse(`${origin}/api/auth/verify`),
        page.getByRole("button", { name: "Verify code" }).click(),
      ]);
      assert.equal(verified.status(), 200);
      await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "You're signed in." })).toBeVisible();
      const identity = await page.getByTestId("identity-id").textContent();
      assert.ok(identity);
      await page.reload();
      await expect(page.getByRole("heading", { name: "You're signed in." })).toBeVisible();
      await expect(page.getByTestId("identity-id")).toHaveText(identity);
      assert.equal(await page.evaluate(() => innerWidth), width);
      for (const path of ["/api/v2-backend/healthz", "/api/auth/request", "/api/auth/verify", "/api/auth/session"]) {
        assert.ok(apiRequests.includes(path), `Missing browser request to ${path}`);
      }
      assert.deepEqual(foreignRequests, []);
      if (screenshots) await page.screenshot({ path: join(screenshots, `v2-signed-in-${width}.png`), fullPage: true });
    } finally {
      await context.close();
    }
  });
}
