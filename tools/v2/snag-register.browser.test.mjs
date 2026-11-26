// V2-G1 (Q53): the Snags screen at 360px. Run against the checked V2 seed, using the launcher's web or HTTPS phone origin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createWorkspaceApplication } from "../../apps/api/dist/workspace/index.js";
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

test("V2-G1 snags at 360px: crew owner, fixed by one person, the fixer refused as checker, checked by another, both after reload", { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
  try {
    const jobId = (await (await context.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json()).jobs[0].id;
    await context.request.post(`${origin}/api/jobs/${jobId}/quotes/activation`, { headers: { origin },
      data: { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" } });
    const sessionId = ownerState.cookies.find(cookie => cookie.name === "jg_session").value;
    const crew = createWorkspaceApplication({ pool, sessionId }).crewContacts;
    const record = (displayName, trade, phone) => crew.record({ version: "crew-contact.v1", commandId: randomUUID(), crewId: randomUUID(),
      expectedRevision: 0, displayName, trade, phone, email: null });
    const suffix = randomUUID().slice(0, 4);
    const jordan = `Jordan ${suffix}`, sam = `Sam ${suffix}`;
    await record(jordan, "joiner", "07700 900611"); await record(sam, "decorator", "07700 900612");
    const page = await context.newPage();
    await page.goto(`${origin}/jobs/${jobId}/records`);
    await page.getByRole("link", { name: "Snags", exact: true }).click();
    const screen = page.getByTestId("snag-register");
    const form = screen.getByRole("article", { name: "Record another snag" });
    const title = `Refit the hall door stop ${suffix}`;
    await form.getByLabel("What needs doing").fill(title);
    await form.getByLabel("Owner").selectOption({ label: `${jordan} · joiner` });
    await form.getByLabel("Due").fill("2026-12-04");
    await form.getByRole("button", { name: "Add a snag" }).click();
    const card = screen.getByRole("article", { name: title });
    await expect(card).toContainText(`Owner: ${jordan} · due 4 Dec`);
    await card.getByLabel("Who fixed it").selectOption({ label: jordan });
    await card.getByRole("button", { name: "Mark fixed" }).click();
    await expect(card).toContainText(`Fixed: ${jordan}`);
    await card.getByLabel("Checked by a second person").selectOption({ label: `${jordan} · fixed this snag` });
    await expect(card.getByRole("alert")).toHaveText("Choose someone other than the person who fixed it.");
    await expect(card.getByRole("button", { name: "Mark checked" })).toBeDisabled();
    await card.getByLabel("Checked by a second person").selectOption({ label: `${sam} · second person` });
    await card.getByRole("button", { name: "Mark checked" }).click();
    await expect(card).toContainText(`Checked: ${sam} · second person`);
    await expect(card).toContainText("Checking a snag does not approve the final account.");
    await page.reload();
    const reloaded = page.getByTestId("snag-register").getByRole("article", { name: title });
    await expect(reloaded).toContainText(`Fixed: ${jordan}`);
    await expect(reloaded).toContainText(`Checked: ${sam} · second person`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 360px");
    if (process.env.V2_TEST_SCREENSHOTS) {
      await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, "g1-snags-360.png"), fullPage: true });
    }
  } finally { await context.close(); }
});
