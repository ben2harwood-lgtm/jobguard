// Run against the checked V2 seed, using either web or HTTPS phone-mode origin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin, "Set V2_TEST_ORIGIN to the V2 launcher's web or HTTPS phone origin");
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM }); });
after(async () => browser?.close());
async function post(context, path, data, csrf) {
  const response = await context.request.post(origin + path, { data, headers: { origin, ...(csrf && { "x-csrf-token": csrf }) } });
  assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function signIn(context) {
  const input = { email: "builder@jobguard-v2.invalid", purpose: "signin" };
  const { fixtureCode } = await post(context, "/api/auth/request", { version: "identity-request.v1", ...input });
  const { csrfToken } = await post(context, "/api/auth/verify", { version: "identity-verify.v1", ...input, code: fixtureCode });
  await post(context, "/api/auth/practice", { version: "linked-practice-company.v1", action: "enter" }, csrfToken);
}
for (const width of [360, 1280]) {
  test(`V2-F6 customer agreement at ${width}px, including local catcher and builder approval`, { timeout: 120000 }, async () => {
    const owner = await browser.newContext({ viewport: { width, height: 800 }, ignoreHTTPSErrors: true });
    const customer = await browser.newContext({ viewport: { width, height: 800 }, ignoreHTTPSErrors: true });
    try {
      await signIn(owner);
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
