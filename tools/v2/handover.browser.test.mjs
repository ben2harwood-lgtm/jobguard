// V2-G2 (Q56): the Handover screen at 360px. Run against the checked V2 seed, using the launcher's web or HTTPS phone origin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { validateSettings } from "./settings.mjs";

const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin, "Set V2_TEST_ORIGIN to the V2 launcher's web or HTTPS phone origin");
let browser, ownerState, pool;
before(async () => {
  pool = new Pool({ connectionString: validateSettings({}).settings.DATABASE_URL, max: 1 });
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  const owner = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    // Copied from the F6 browser test until BH1's shared helper is on this base.
    const page = await owner.newPage();
    await page.goto(origin + "/sign-in");
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code", exact: true }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.textContent());
    await page.getByRole("button", { name: "Verify code", exact: true }).click();
    await expect(page).toHaveURL(origin + "/practice-company");
    ownerState = await owner.storageState();
  } finally { await owner.close(); }
});
after(async () => { await browser?.close(); await pool?.end(); });

test("V2-G2 handover at 360px: tick, preview, save, then version 1 in the history after reload", { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
  try {
    const jobId = (await (await context.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json()).jobs[0].id;
    await context.request.post(`${origin}/api/jobs/${jobId}/quotes/activation`, { headers: { origin },
      data: { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" } });
    const page = await context.newPage();
    await page.goto(`${origin}/jobs/${jobId}/records`);
    await page.getByRole("link", { name: "Handover", exact: true }).click();
    const screen = page.getByTestId("handover");
    await expect(screen).toContainText("Choose what goes in. No amounts go in the customer’s pack.");
    const before = (await (await context.request.get(`${origin}/api/jobs/${jobId}/handover`)).json()).versions.length;
    await screen.getByLabel("What was done").check();
    const firstLine = screen.locator("fieldset").first().locator("label").nth(1);
    await firstLine.locator("input").check();
    const line = (await firstLine.textContent()).trim();
    await screen.getByLabel("Manuals and certificates").check();
    await screen.getByRole("button", { name: "Add a manual or certificate" }).click();
    await screen.getByLabel("Manual or certificate").fill("Electrical certificate");
    await screen.getByLabel("Status").selectOption("still_needed");
    await screen.getByRole("button", { name: "Preview as the customer sees it" }).click();
    const preview = screen.getByRole("region", { name: "Customer preview" });
    await expect(preview).toContainText(line);
    await expect(preview).toContainText("Still needed: Electrical certificate. Your builder will supply it separately.");
    assert.doesNotMatch(await preview.innerText(), /£|pence/u);
    await screen.getByRole("button", { name: "Save this version" }).click();
    await expect(screen.getByRole("status")).toContainText(`Version ${before + 1} saved.`);
    await page.reload();
    const history = page.getByTestId("handover");
    await expect(history).toContainText(`Version ${before + 1} · saved`);
    await history.getByRole("button", { name: `Open version ${before + 1}` }).click();
    await expect(history).toContainText("Still needed: Electrical certificate.");
    for (const button of await history.getByRole("button").all()) assert.ok((await button.boundingBox()).height >= 44, "44px buttons");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 360px");
    if (process.env.V2_TEST_SCREENSHOTS) {
      await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, "g2-handover-360.png"), fullPage: true });
    }
  } finally { await context.close(); }
});
