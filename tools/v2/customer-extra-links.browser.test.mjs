// Run against the checked V2 seed, using either web or HTTPS phone-mode origin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin, "Set V2_TEST_ORIGIN to the V2 launcher's web or HTTPS phone origin");
let browser, ownerState;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  const owner = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await signIn(owner);
    ownerState = await owner.storageState();
  } finally { await owner.close(); }
});
after(async () => browser?.close());
async function post(context, path, data, csrf) {
  const response = await context.request.post(origin + path, { data, headers: { origin, ...(csrf && { "x-csrf-token": csrf }) } });
  assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function signIn(context) {
  // Use the browser's sign-in and practice-entry path, including secure-cookie
  // handling. APIRequestContext does not send secure cookies over local HTTP.
  const page = await context.newPage();
  try {
    await page.goto(origin + "/sign-in");
    await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code", exact: true }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.textContent());
    await page.getByRole("button", { name: "Verify code", exact: true }).click();
    await expect(page).toHaveURL(origin + "/practice-company");
    assert.ok((await context.cookies()).some(cookie => cookie.name === "jg_session"));
  } finally { await page.close(); }
}
for (const width of [360, 1280]) {
  test(`V2-F6 customer agreement at ${width}px, including local catcher and builder approval`, { timeout: 120000 }, async () => {
    const owner = await browser.newContext({ viewport: { width, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
    const customer = await browser.newContext({ viewport: { width, height: 800 }, ignoreHTTPSErrors: true });
    try {
      const response = await owner.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111");
      const jobId = (await response.json()).jobs[0].id;
      await post(owner, `/api/jobs/${jobId}/quotes/activation`, { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" });
      const description = `F6 browser splashback ${width} ${randomUUID()}`;
      const result = await post(owner, `/api/jobs/${jobId}/variations`, { version: "variation-command.v1", action: "propose",
        proposalId: randomUUID(), scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null,
        description, captureText: description, price: { quantity: "1", unit: "item", unitRatePence: 12500, direction: "addition" } });
      const baseline = result.approvedAdditionsPence;
      const proofView = await (await owner.request.get(`${origin}/api/jobs/${jobId}/proof`)).json();
      const upload = await post(owner, `/api/jobs/${jobId}/proof`, { version: "practice-proof-command.v1",
        action: "select_generated", commandId: randomUUID(), scopeItemId: proofView.scopeItemId, fixture: "completion-photo" });
      await post(owner, `/api/jobs/${jobId}/proof`, { version: "practice-proof-command.v1", action: "finalize",
        commandId: randomUUID(), uploadId: upload.upload.id, objectVersionId: upload.upload.objectVersionId });
      const page = await owner.newPage();
      await page.goto(`${origin}/v2/jobs/${jobId}/extra-links`);
      const section = page.getByRole("heading", { name: description }).locator("..");
      await page.getByRole("checkbox").last().check();
      await section.getByRole("button", { name: "Make customer link for version 1" }).click();
      const localInbox = page.getByRole("region", { name: "Local test inbox" });
      const link = await localInbox.getByRole("link", { name: "Open customer link" }).getAttribute("href");
      assert.ok(link);
      const customerPage = await customer.newPage(), foreign = [];
      customerPage.on("request", req => { if (new URL(req.url()).origin !== new URL(origin).origin) foreign.push(req.url()); });
      await customerPage.goto(origin + link);
      await expect(customerPage.getByRole("heading", { name: description })).toBeVisible();
      await expect(customerPage.getByText("£125.00", { exact: true })).toBeVisible();
      const photo = customerPage.getByRole("img", { name: "Photo 1 of this extra" });
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
      await expect(customerPage.getByText(/margin|hidden finding|other job/iu)).toHaveCount(0);
      await customerPage.getByLabel("Your name").fill("Fictional customer");
      await customerPage.getByRole("button", { name: "I agree", exact: true }).click();
      await expect(customerPage.getByRole("status")).toContainText("Agreement recorded");
      await customerPage.reload();
      await expect(customerPage.getByRole("status")).toContainText("Agreement recorded");
      assert.ok(await customerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      if (process.env.V2_TEST_SCREENSHOTS) {
        await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
        await customerPage.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `f6-agreed-${width}.png`), fullPage: true });
      }
      const pending = await owner.request.get(`${origin}/api/jobs/${jobId}/variations`);
      assert.equal((await pending.json()).approvedAdditionsPence, baseline);
      await page.reload();
      await section.getByRole("button", { name: /Customer agreed by link at .*: approve/u }).click();
      await expect(section.getByRole("button", { name: /Customer agreed by link at .*: approve/u })).toHaveCount(0);
      const committed = await owner.request.get(`${origin}/api/jobs/${jobId}/variations`);
      assert.equal((await committed.json()).approvedAdditionsPence, baseline + 12500);
      assert.deepEqual(foreign, []);
    } finally { await owner.close(); await customer.close(); }
  });
}

// V2-F3 (Q55): at 360px, draft the splashback change, confirm it, send it for approval, agree as the customer,
// approve, and add the extra time to the plan.
test("V2-F3 change draft at 360px: price, time and materials together, agreed by link, then time on the plan", { timeout: 120000 }, async () => {
  const { Pool } = await import("../../packages/db/node_modules/pg/esm/index.mjs");
  const { validateSettings } = await import("./settings.mjs");
  const { createWorkspaceApplication } = await import("../../apps/api/dist/workspace/index.js");
  const pool = new Pool({ connectionString: validateSettings({}).settings.DATABASE_URL, max: 1 });
  const owner = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true, storageState: ownerState });
  const customer = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true });
  try {
    const jobId = (await (await owner.request.get(origin + "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111")).json()).jobs[0].id;
    await post(owner, `/api/jobs/${jobId}/quotes/activation`, { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" });
    const sessionId = ownerState.cookies.find(cookie => cookie.name === "jg_session").value;
    // The plan screen is not on this base; open the plan the way it does.
    const plan = await createWorkspaceApplication({ pool, sessionId }).workPlan.read(jobId, { version: "work-plan-query.v1" });
    const grout = plan.tasks.find(task => task.key === "tile-splashback");
    const page = await owner.newPage();
    await page.goto(`${origin}/v2/jobs/${jobId}/extra-links`);
    await page.getByRole("link", { name: "Change a quantity" }).click();
    const main = page.getByTestId("change-drafts");
    await main.getByLabel("Quote line").selectOption({ label: "Fit and grout kitchen splashback tiles · 6 m2" });
    await main.getByLabel("New total quantity").fill("7.5");
    await expect(main.getByLabel("Rate per m2 (£)")).toHaveValue("95.00");
    await main.getByRole("button", { name: "Draft the change" }).click();
    const drafted = main.getByRole("region", { name: "Drafted change" });
    await expect(drafted).toContainText("Extra 1.5 m2 at £95.00 per m2 = £142.50 (you confirm the rate)");
    await expect(drafted).toContainText("Extra time: Fit and grout the splashback +60 min");
    await expect(drafted).toContainText("Will need more:");
    await expect(drafted).toContainText("Tiles, Adhesive, Grout");
    await drafted.getByRole("button", { name: "Confirm the price" }).click();
    const pending = main.getByRole("region", { name: "Pending changes" }).getByRole("article").last();
    await expect(pending.getByTestId("change-state")).toHaveText("Waiting to send for approval");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (process.env.V2_TEST_SCREENSHOTS) {
      await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, "f3-change-draft-360.png"), fullPage: true });
    }
    await pending.getByRole("link", { name: "Send for approval" }).click();
    const section = page.getByRole("heading", { name: "Change Fit and grout kitchen splashback tiles to 7.5 m2" }).last().locator("..");
    await section.getByRole("button", { name: "Make customer link for version 1" }).click();
    const link = await page.getByRole("region", { name: "Local test inbox" }).getByRole("link", { name: "Open customer link" }).last().getAttribute("href");
    const customerPage = await customer.newPage();
    await customerPage.goto(origin + link);
    await expect(customerPage.getByText("£142.50", { exact: true })).toBeVisible();
    await customerPage.getByLabel("Your name").fill("Fictional customer");
    await customerPage.getByRole("button", { name: "I agree", exact: true }).click();
    await expect(customerPage.getByRole("status")).toContainText("Agreement recorded");
    await page.reload();
    await section.getByRole("button", { name: /Customer agreed by link at .*: approve/u }).click();
    await expect(section.getByRole("button", { name: /Customer agreed by link at .*: approve/u })).toHaveCount(0);
    await page.goto(`${origin}/v2/jobs/${jobId}/changes`);
    const agreed = page.getByTestId("change-drafts").getByRole("region", { name: "Pending changes" }).getByRole("article").last();
    await expect(agreed.getByTestId("change-state")).toHaveText("Agreed. Extra time not on the plan yet");
    await agreed.getByRole("button", { name: "Add the extra time to the plan" }).click();
    await expect(agreed.getByTestId("change-state")).toHaveText("Agreed. Extra time is on the plan");
    const after = await createWorkspaceApplication({ pool, sessionId }).workPlan.read(jobId, { version: "work-plan-query.v1" });
    assert.equal(after.tasks.find(task => task.key === "tile-splashback").durationMinutes, grout.durationMinutes + 60);
  } finally { await owner.close(); await customer.close(); await pool.end(); }
});
