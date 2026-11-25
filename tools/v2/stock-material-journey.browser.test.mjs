import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { expect as playwrightExpect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { launchV2Browser, signInOnce, v2Context } from "./test/browser-session.mjs";

// The cold embedded web app compiles several work-screen routes before refreshing a saved row.
const expect = playwrightExpect.configure({ timeout: 30_000 });

test("real contractor replaces receipted tiles, then explicitly confirms packs of oak", { timeout: 180_000 }, async t => {
  const browser = await launchV2Browser();
  t.after(() => browser.close());
  const { origin, jobId, storageState, csrfToken } = await signInOnce(browser);
  const context = await v2Context(browser, storageState, 360);
  const page = await context.newPage();
  await page.goto(origin + "/jobs/" + jobId + "/work");
  const materials = page.locator("#work-materials");
  const scopeName = "Fit and grout kitchen splashback tiles";
  const measured = page.locator("#work-measurements").getByRole("article").filter({ has: page.getByRole("heading", { name: scopeName }) });
  await measured.getByRole("button", { name: /^(Confirm|Change) measurement /u }).click();
  await measured.getByLabel("Measured quantity").fill("6");
  await measured.getByLabel("Unit", { exact: true }).fill("m2");
  async function submit(button, endpoint) {
    const [response] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === "POST"),
      button.click(),
    ]);
    assert.ok(response.ok(), endpoint + " returned " + response.status() + ": " + (await response.text()).slice(0, 300));
  }
  await submit(measured.getByRole("button", { name: "Confirm measurement", exact: true }), "/api/v2-backend/jobs/" + jobId + "/measurements");
  await page.reload();
  await expect(measured.getByText("Confirmed", { exact: true })).toBeVisible();
  async function api(url, body) {
    const response = await page.evaluate(async ({url, body, csrfToken}) => {
      const r = await fetch(url, body === undefined ? { cache: "no-store" } : {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(body),
      });
      return { status: r.status, value: await r.json() };
    }, {url, body, csrfToken});
    assert.ok(response.status >= 200 && response.status < 300, url + " " + response.status + " " + (response.value.code ?? ""));
    return response.value;
  }
  const d3 = "/api/v2-backend/jobs/" + jobId + "/materials";
  const stock = "/api/jobs/" + jobId + "/stock";
  const scopeItemId = (await api(d3)).scope.find(item => item.description === scopeName).scopeItemId;
  const tiles = "Fictional tiles " + randomUUID();
  const oak = "Fictional oak " + randomUUID();
  const row = product => materials.getByRole("article").filter({ has: page.getByRole("heading", { name: product, exact: true }) });
  await materials.getByLabel("Add product for").selectOption(scopeItemId);
  await materials.getByLabel("Product", { exact: true }).fill(tiles);
  await materials.getByLabel("Pack size", { exact: true }).fill("1");
  await materials.getByLabel("Pack unit", { exact: true }).fill("m2");
  await materials.getByLabel(/Firm's wastage multiplier/u).fill("1");
  await materials.getByLabel(/Confirmed usable whole packs/u).fill("2");
  await materials.getByLabel("Supplier", { exact: true }).fill("Fictional merchant");
  await materials.getByLabel("Needed by", { exact: true }).fill("2026-12-01");
  await submit(materials.getByRole("button", { name: "Save material", exact: true }), d3);
  await expect(row(tiles)).toContainText("6 packs including allowance · 2 on site · 4 short");
  const {lineKey} = (await api(d3)).lines.find(line => line.product === tiles);
  const deliveryId = randomUUID();
  const version = "v2-stock-command.v1";
  await api(stock, { version, action: "add_forecast", commandId: randomUUID(), deliveryId, scopeItemId, lineKey,
    expectedVersion: 0, supplier: "Fictional merchant", packsExpected: "4", forecastDate: "2026-12-07" });
  await api(stock, { version, action: "record_receipt", commandId: randomUUID(), deliveryId, expectedVersion: 1, packsReceived: "4" });
  async function checkStock(product, setAside, received, available, short) {
    const view = await api(stock);
    const line = view.lines.find(line => line.lineKey === lineKey && line.scopeItemId === scopeItemId);
    assert.equal(line.product, product);
    assert.deepEqual([line.setAsidePacks, line.receivedPacks, line.availablePacks, line.shortPacks], [setAside, received, available, short]);
    assert.equal(view.deliveries.find(row => row.deliveryId === deliveryId).packsReceived, "4");
  }
  await checkStock(tiles, "2", "4", "6", "0");
  async function save(product, replacement) {
    const article = row(product);
    await article.getByRole("button", { name: "Edit material " + product }).click();
    if (replacement) await article.getByLabel("Product", { exact: true }).fill(replacement);
    await submit(article.getByRole("button", { name: "Save material", exact: true }), d3);
    await expect(row(replacement ?? product).getByRole("button", {name: "Edit material " + (replacement ?? product)})).toBeVisible();
  }
  await save(tiles, oak);
  await page.reload();
  await expect(row(oak)).toContainText("6 packs including allowance · 0 on site · 6 short");
  await checkStock(oak, "0", "0", "0", "6");
  await save(oak);
  await page.reload();
  await checkStock(oak, "0", "0", "0", "6");
  async function generate(expected) {
    await submit(materials.getByRole("button", { name: /^(View|Regenerate) enquiry$/u }), d3);
    await expect(materials.getByRole("region", {name: "Stock enquiry"}).getByText(oak, { exact: false })).toContainText(expected + " packs requested");
  }
  await generate("6");
  const shots = process.env.V2_TEST_SCREENSHOTS;
  if (shots) await page.screenshot({path: join(shots, "replacement-360.png"), fullPage: true});
  await row(oak).getByRole("button", {name: "Confirm set-aside packs"}).click();
  await row(oak).getByLabel("Whole packs set aside for this product").fill("2");
  await submit(row(oak).getByRole("button", {name: "Confirm pack count"}), d3);
  await expect(row(oak)).toContainText("6 packs including allowance · 2 on site · 4 short");
  await page.setViewportSize({width: 1280, height: 900});
  await page.reload();
  await checkStock(oak, "2", "0", "2", "4");
  await generate("4");
  await page.reload();
  await materials.getByRole("button", {name: "View saved enquiry"}).click();
  await expect(materials.getByRole("region", {name: "Stock enquiry"}).getByText(oak, { exact: false })).toContainText("4 packs requested");
  await expect(row(oak)).toContainText("6 packs including allowance · 2 on site · 4 short");
  if (shots) await page.screenshot({path: join(shots, "confirmed-1280.png"), fullPage: true});
});
