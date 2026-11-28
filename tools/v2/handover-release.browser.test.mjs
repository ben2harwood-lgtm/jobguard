// V2-G3 (Q57): release a handover version and acknowledge it as the customer, at 360px. Run against the
// checked V2 seed, using the launcher's web or HTTPS phone origin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { migrationUrl } from "./settings.mjs";

const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin, "Set V2_TEST_ORIGIN to the V2 launcher's web or HTTPS phone origin");
let browser, ownerState, admin;
before(async () => {
  admin = new Pool({ connectionString: migrationUrl, max: 1 });
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  const owner = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    // Copied from the G2 browser test until BH1's shared helper is on this base.
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
after(async () => { await browser?.close(); await admin?.end(); });

test("V2-G3 at 360px: release v1, the customer acknowledges, release v2, and v1's link says a newer version is available", { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
  const customer = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true });
  try {
    const jobId = (await (await context.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json()).jobs[0].id;
    await context.request.post(`${origin}/api/jobs/${jobId}/quotes/activation`, { headers: { origin },
      data: { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" } });
    // No V2 command completes site work yet; the fixture marks every scope item complete.
    await admin.query("UPDATE app.scope_progress SET stage='complete', revision=revision+1 WHERE job_id=$1 AND stage<>'complete'", [jobId]);
    const save = async () => {
      const versions = (await (await context.request.get(`${origin}/api/jobs/${jobId}/handover`)).json()).versions;
      const response = await context.request.post(`${origin}/api/jobs/${jobId}/handover`, { headers: { origin }, data: {
        version: "v2-handover-save-command.v1", commandId: randomUUID(), expectedVersion: versions.at(-1)?.version ?? 0,
        choice: { sections: ["contacts"], lineIds: [], variationIds: [], photoIds: [], snagIds: [], certificates: [] } } });
      assert.equal(response.status(), 200);
      return (await response.json()).saved.version;
    };
    const v1 = await save();
    const page = await context.newPage();
    await page.goto(`${origin}/jobs/${jobId}/handover`);
    const releases = page.getByTestId("handover-releases");
    await expect(releases).toContainText("Release is independent of the financial lock.");
    await releases.getByRole("button", { name: `Release this version · version ${v1}` }).click();
    const first = await releases.getByTestId("handover-link").getAttribute("href");
    await expect(releases).toContainText(`Version ${v1} released to customer@jobguard-v2.invalid`);
    await expect(releases).toContainText("acknowledgement pending");

    const pack = await customer.newPage();
    await pack.goto(first);
    const view = pack.getByTestId("handover-pack-page");
    await expect(view).toContainText("Receipt only: acknowledging this pack does not agree the account or sign off any snag.");
    await view.getByRole("button", { name: "Acknowledge receipt" }).click();
    await expect(view.getByRole("status")).toContainText("Receipt acknowledged");
    for (const button of await view.getByRole("button").all()) assert.ok((await button.boundingBox()).height >= 44, "44px buttons");
    assert.ok(await pack.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 360px");

    const v2 = await save();
    await page.reload();
    await page.getByTestId("handover-releases").getByRole("button", { name: `Release this version · version ${v2}` }).click();
    await expect(page.getByTestId("handover-releases")).toContainText("a newer version was released");
    await pack.reload();
    await expect(pack.getByTestId("handover-pack-page")).toContainText("Newer version available");
    await expect(pack.getByTestId("handover-pack-page")).toContainText(`version ${v1}`);
    if (process.env.V2_TEST_SCREENSHOTS) {
      await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
      await pack.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, "g3-handover-pack-360.png"), fullPage: true });
    }
  } finally { await customer.close(); await context.close(); }
});

test("V2-G4 at 360px: stop the latest link, and the customer's reload shows the refusal page", { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
  const customer = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true });
  try {
    const jobId = (await (await context.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json()).jobs[0].id;
    const page = await context.newPage();
    await page.goto(`${origin}/jobs/${jobId}/handover`);
    const releases = page.getByTestId("handover-releases");
    await releases.getByRole("button", { name: /^Release this version · version \d+$/u }).click();
    const link = await releases.getByTestId("handover-link").getAttribute("href");
    const pack = await customer.newPage();
    await pack.goto(link);
    await expect(pack.getByTestId("handover-pack-page")).toContainText("Receipt only");
    await releases.getByRole("button", { name: "Stop this link" }).last().click();
    await releases.getByLabel("Why are you stopping it? (only you see this)").fill("Sent before the final snag was checked");
    await releases.getByRole("button", { name: "Stop this link" }).last().click();
    await expect(releases).toContainText("link stopped");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 360px");
    await pack.reload();
    await expect(pack.locator("body")).toContainText("This link can’t be opened");
    await expect(pack.locator("body")).not.toContainText("Receipt only");
  } finally { await customer.close(); await context.close(); }
});

test("V2-G8 at 360px: switch the review request on after a release; it waits a week and shows what the customer gets", { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
  try {
    const jobId = (await (await context.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json()).jobs[0].id;
    const page = await context.newPage();
    await page.goto(`${origin}/jobs/${jobId}/handover`);
    await page.getByTestId("handover-releases").getByRole("button", { name: /^Release this version · version \d+$/u }).click();
    await expect(page.getByTestId("handover-link")).toBeVisible();
    const review = page.getByTestId("review-request");
    const toggle = review.getByLabel("Ask the customer for a review a week after the handover release");
    if (await toggle.isChecked()) { await toggle.uncheck(); await expect(review.getByRole("status")).toContainText("Off."); }
    await page.reload();
    await review.getByLabel("Ask the customer for a review a week after the handover release").check();
    // The shared seed job may already hold money rows, so only the switch itself is asserted here; the rule is in the seed cases.
    await expect(review.getByRole("status")).not.toContainText("Off.");
    await expect(review).toContainText("a short review would help");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 360px");
  } finally { await context.close(); }
});

test("V2-G9 at 360px: switch aftercare on after a release; the next offer date shows", { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
  try {
    const jobId = (await (await context.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json()).jobs[0].id;
    const page = await context.newPage();
    await page.goto(`${origin}/jobs/${jobId}/handover`);
    await page.getByTestId("handover-releases").getByRole("button", { name: /^Release this version · version \d+$/u }).click();
    await expect(page.getByTestId("handover-link")).toBeVisible();
    const aftercare = page.getByTestId("aftercare");
    const toggle = aftercare.getByLabel("Offer the customer a check-up visit 6 and 12 months after the handover release");
    if (await toggle.isChecked()) { await toggle.uncheck(); await expect(aftercare.getByRole("status")).toContainText("Off."); }
    await toggle.check();
    // A release made just now: the first offer is six months away.
    await expect(aftercare.getByRole("status")).toContainText(/Next offer due|Both offers are done/u);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 360px");
  } finally { await context.close(); }
});
