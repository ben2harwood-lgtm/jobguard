import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";

// Run after the full seed suite, on its existing HTTPS V2 stack with devIndicators:false
// (or a production build). One sign-in is reused at both widths; no new OTP per test.
const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin && new URL(origin).protocol === "https:", "V2_TEST_ORIGIN must be the phone-mode HTTPS origin");
test("V2-K8: off-hire journey persists at 360 and 1280px on the phone origin", { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  try {
    const auth = await browser.newContext({ ignoreHTTPSErrors: true });
    const login = await auth.newPage();
    await login.goto(origin + "/sign-in");
    await login.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await login.getByLabel("What do you want to do?").selectOption("signin");
    await login.getByRole("button", { name: "Request code" }).click();
    const code = login.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await login.getByLabel("Eight-digit code").fill(await code.textContent());
    const [verified] = await Promise.all([login.waitForResponse(origin + "/api/auth/verify"),
      login.getByRole("button", { name: "Verify code" }).click()]);
    const { csrfToken } = await verified.json();
    const jobId = await login.evaluate(async csrf => {
      const entered = await fetch("/api/auth/practice", { method: "POST", headers: {
        "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ version: "linked-practice-company.v1", action: "enter" }) });
      if (!entered.ok) throw new Error("Practice entry refused");
      const response = await fetch("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111");
      const { jobs } = await response.json();
      const seed = jobs.find(job => job.title.includes("Occupied-home kitchen splashback"));
      if (!seed) throw new Error("Run the full V2 seed suite first");
      return seed.id;
    }, csrfToken);
    const storageState = await auth.storageState();
    await auth.close();
    for (const width of [360, 1280]) {
      const context = await browser.newContext({ storageState, ignoreHTTPSErrors: true, viewport: { width, height: 800 } });
      try {
        const page = await context.newPage();
        const external = [];
        page.on("request", request => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
        await page.goto(`${origin}/jobs/${jobId}/work`);
        const hires = page.getByTestId("v2-hire-items");
        await expect(hires).toBeVisible();
        await expect(hires.getByText("Practice sandbox — synthetic data; nothing is sent or charged. Builder only.")).toBeVisible();
        const supplier = `Fictional hire ${width} ${Date.now()}`;
        await hires.getByLabel("Fictional hire supplier").fill(supplier);
        await hires.getByLabel("Booked from", { exact: true }).fill("2026-01-01");
        await hires.getByLabel("Weekly cost (£)", { exact: true }).fill("125.01");
        await hires.getByLabel("Needed until (optional)").fill("2026-01-02");
        const add = hires.getByRole("button", { name: "Add hire item", exact: true });
        await add.focus(); await expect(add).toBeFocused();
        const box = await add.boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44);
        await add.click();
        const item = hires.getByRole("article", { name: `scaffold from ${supplier}` });
        await expect(item.getByText("scaffold not needed after 2026-01-02: off-hire it?", { exact: true })).toBeVisible();
        await expect(item.getByText(/About £[0-9]+\.[0-9]{2} so far/u)).toBeVisible();
        if (process.env.V2_TEST_SCREENSHOTS) {
          await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k8-reminder-${width}.png`), fullPage: true });
        }
        await page.reload();
        await expect(item).toBeVisible();
        await item.getByRole("button", { name: "Edit hire item", exact: true }).click();
        await hires.getByLabel("Weekly cost (£)", { exact: true }).fill("130.02");
        await hires.getByRole("button", { name: "Save hire changes", exact: true }).click();
        await expect(item.getByText(/£130.02 per week/u)).toBeVisible();
        const checkbox = item.getByRole("checkbox").first();
        await expect(checkbox).toBeVisible();
        await checkbox.check(); await expect(checkbox).toBeChecked();
        await item.getByRole("button", { name: "Mark off-hire requested", exact: true }).click();
        await expect(item.getByText("Off-hire requested — contact the supplier yourself", { exact: true })).toBeVisible();
        await item.getByRole("button", { name: "Mark off hire", exact: true }).click();
        await page.reload();
        await expect(item.getByText("Off hire", { exact: true })).toBeVisible();
        await expect(item.getByText(/off-hire it\?/u)).toHaveCount(0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(external, []);
        const rejected = await page.evaluate(async id => {
          const response = await fetch(`/api/jobs/${id}/hires`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          return response.status;
        }, jobId);
        assert.equal(rejected, 400);
        if (process.env.V2_TEST_SCREENSHOTS) {
          await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `v2-k8-${width}.png`), fullPage: true });
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
