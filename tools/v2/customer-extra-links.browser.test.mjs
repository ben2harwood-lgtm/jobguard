// Run against the checked V2 seed, using either web or HTTPS phone-mode origin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { customerPhoto } from "./test/customer-photo.fixture.mjs";
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
// Browser fetch preserves secure local-session cookies on loopback HTTP too.
const requestPages = new WeakMap();
async function request(context, path, data) {
  let page = requestPages.get(context);
  if (!page) {
    page = await context.newPage();
    await page.goto(origin + "/practice-company");
    requestPages.set(context, page);
  }
  const result = await page.evaluate(async ({ path, data }) => {
    const r = await fetch(path, { cache: "no-store", ...(data && { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
    return { status: r.status, text: await r.text() };
  }, { path, data });
  return { status: () => result.status, ok: () => result.status >= 200 && result.status < 300,
    text: async () => result.text, json: async () => JSON.parse(result.text) };
}
async function post(context, path, data) {
  const response = await request(context, path, data);
  assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function get(context, path) {
  const response = await request(context, path);
  const body = await response.text();
  assert.equal(response.status(), 200, `GET ${path}: ${response.status()} ${body}`);
  return JSON.parse(body);
}
async function screenshot(page, state, width) {
  if (!process.env.V2_TEST_SCREENSHOTS) return;
  await mkdir(process.env.V2_TEST_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: join(process.env.V2_TEST_SCREENSHOTS, `f6-${state}-${width}.png`), fullPage: true });
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
      const jobs = await get(owner, "/api/jobs?tenantId=11111111-1111-4111-8111-111111111111");
      const job = jobs.jobs.find(job => /Occupied-home kitchen splashback and hall decorating/u.test(job.title));
      assert.ok(job, "Run the checked V2 fictional job seed first");
      const jobId = job.id;
      await post(owner, `/api/jobs/${jobId}/quotes/activation`, { version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" });
      const description = `F6 browser splashback ${width} ${randomUUID()}`;
      const privateNote = `Builder-only note ${randomUUID()}`;
      const result = await post(owner, `/api/jobs/${jobId}/variations`, { version: "variation-command.v1", action: "propose",
        proposalId: randomUUID(), scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null,
        description, captureText: privateNote, price: { quantity: "1", unit: "item", unitRatePence: 12500, direction: "addition" } });
      const baseline = result.approvedAdditionsPence;
      // Check the legacy GET before ever reading scopeItemId: a 404 body has
      // no scope ID and previously caused the misleading POST INVALID_COMMAND.
      const proofResponse = await request(owner, `/api/jobs/${jobId}/proof`);
      const proofBody = await proofResponse.text();
      assert.ok([200, 404].includes(proofResponse.status()), `proof GET: ${proofResponse.status()} ${proofBody}`);
      const proofView = JSON.parse(proofBody);
      if (proofResponse.status() === 404) {
        assert.equal(proofView.code, "NOT_FOUND", proofBody);
        console.info(`Legacy proof GET: 404 ${proofBody}; using authenticated V2 evidence fixture`);
      } else assert.ok(proofView.scopeItemId, `proof GET missing scopeItemId: ${proofBody}`);
      const photoId = await customerPhoto(owner, jobId, result.parentScopeItemId);
      const linksState = await get(owner, `/api/jobs/${jobId}/extra-links`);
      assert.ok(linksState.photos.some(photo => photo.id === photoId));
      const page = await owner.newPage();
      await page.goto(`${origin}/v2/jobs/${jobId}/extra-links`);
      const section = page.getByRole("heading", { name: description }).locator("..");
      const photoIndex = linksState.photos.findIndex(photo => photo.id === photoId);
      await page.getByRole("checkbox").nth(photoIndex).check();
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
      await expect(customerPage.getByText(privateNote, { exact: false })).toHaveCount(0);
      await expect(customerPage.locator("main strong")).toHaveText(["£125.00"]);
      assert.ok(await customerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await expect(customerPage.getByRole("heading", { level: 2 })).toHaveCount(1);
      await expect(customerPage.getByRole("img")).toHaveCount(1);
      await expect(customerPage.getByText("Variation version 1", { exact: true })).toBeVisible();
      const customerView = await get(customer, link.replace("/customer/change/", "/api/v2/extra-links/"));
      assert.deepEqual(customerView.photoIds, [photoId]);
      assert.deepEqual(Object.keys(customerView).sort(), ["version", "environment", "jobId", "revisionId", "variationVersion", "amount", "description", "photoIds", "expectedVersion", "agreedAt"].sort());
      await screenshot(customerPage, "review", width);
      await customerPage.getByLabel("Your name").fill("Fictional customer");
      await customerPage.getByRole("button", { name: "I agree", exact: true }).click();
      await expect(customerPage.getByRole("status")).toContainText("Agreement recorded");
      await customerPage.reload();
      await expect(customerPage.getByRole("status")).toContainText("Agreement recorded");
      assert.ok(await customerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await screenshot(customerPage, "agreed", width);
      const pending = await get(owner, `/api/jobs/${jobId}/variations`);
      assert.equal(pending.approvedAdditionsPence, baseline);
      await page.reload();
      await section.getByRole("button", { name: /Customer agreed by link at .*: approve/u }).click();
      await expect(section.getByRole("button", { name: /Customer agreed by link at .*: approve/u })).toHaveCount(0);
      const committed = await get(owner, `/api/jobs/${jobId}/variations`);
      assert.equal(committed.approvedAdditionsPence, baseline + 12500);
      // A second extra is superseded while its customer page remains open.
      const staleId = randomUUID(), staleDescription = `F6 stale ${width} ${randomUUID()}`;
      const proposed = await post(owner, `/api/jobs/${jobId}/variations`, { version: "variation-command.v1", action: "propose",
        proposalId: staleId, scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null,
        description: staleDescription, captureText: "Fictional customer request",
        price: { quantity: "1", unit: "item", unitRatePence: 25000, direction: "addition" } });
      const oldRevision = proposed.variations.find(v => v.id === staleId).currentRevisionId;
      await page.reload();
      const staleSection = page.getByRole("heading", { name: staleDescription }).locator("..");
      await staleSection.getByRole("button", { name: "Make customer link for version 1" }).click();
      await expect(localInbox.getByRole("link", { name: "Open customer link" })).toHaveCount(1);
      const staleLink = await localInbox.getByRole("link", { name: "Open customer link" }).getAttribute("href");
      assert.ok(staleLink);
      await customerPage.goto(origin + staleLink);
      await expect(customerPage.getByText("£250.00", { exact: true })).toBeVisible();
      await customerPage.getByLabel("Your name").fill("Fictional stale customer");
      const newRevision = randomUUID();
      await post(owner, `/api/jobs/${jobId}/variations`, { version: "variation-command.v1", action: "revise",
        variationId: staleId, revisionId: newRevision, expectedRevisionId: oldRevision,
        description: staleDescription, price: { quantity: "1", unit: "item", unitRatePence: 35000, direction: "addition" } });
      await customerPage.getByRole("button", { name: "I agree", exact: true }).click();
      await expect(customerPage.getByRole("alert")).toHaveText("Agreement refused. Ask the builder for a fresh link.");
      await expect(customerPage.getByRole("status")).toHaveCount(0);
      await expect(customerPage.getByText("£350.00", { exact: true })).toHaveCount(0);
      await screenshot(customerPage, "stale-refused", width);
      const saved = await get(owner, `/api/jobs/${jobId}/extra-links`);
      const staleLinks = saved.links.filter(l => l.variationId === staleId);
      assert.equal(staleLinks.length, 1, "Only the expected local link was created");
      assert.equal(staleLinks[0].agreedAt, null, "Superseded old version was not agreed");
      assert.equal(staleLinks[0].agreedBy, null);
      const changed = saved.variations.variations.find(v => v.id === staleId);
      assert.equal(changed.currentRevisionId, newRevision);
      assert.ok(changed.revisions.every(r => !r.approved), "Neither price version is approved");
      assert.equal(saved.variations.approvedAdditionsPence, baseline + 12500);
      await page.reload();
      await expect(staleSection.getByRole("button", { name: /Customer agreed by link at .*: approve/u })).toHaveCount(0);
      assert.deepEqual(foreign, []);
    } finally { await owner.close(); await customer.close(); }
  });
}
