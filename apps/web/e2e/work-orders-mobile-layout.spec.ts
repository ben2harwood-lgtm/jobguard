import { expect, test, type Locator, type Page } from "@playwright/test";
import { installContractorAgreementFixture } from "./contractor-agreement-fixture.js";

test.setTimeout(240_000);
test.beforeEach(async ({ page }) => { await installContractorAgreementFixture(page); });

async function expectDocumentFits(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))).toEqual({ document: page.viewportSize()!.width, viewport: page.viewportSize()!.width });
  // Root overflow clipping must not make an oversized main look like a passing page.
  const main = await page.getByRole("main").boundingBox();
  expect(main!.x).toBeGreaterThanOrEqual(0);
  expect(main!.x + main!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function expectBoundedTable(page: Page, table: Locator) {
  const region = table.locator("..");
  const bounds = await region.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await region.evaluate(el => getComputedStyle(el).overflowX)).toBe("auto");
  const sizes = await region.evaluate(el => ({
    available: el.clientWidth, content: el.scrollWidth,
    table: el.querySelector("table")!.getBoundingClientRect().width,
  }));
  // The complete table remains in the scrollable area, with no hidden columns.
  expect(sizes.content).toBeGreaterThanOrEqual(Math.floor(sizes.table));
  for (const header of await table.getByRole("columnheader").all()) await expect(header).toBeVisible();
  if (page.viewportSize()!.width === 360) expect(sizes.content).toBeGreaterThan(sizes.available);
  return region;
}

async function importSample(page: Page, label: RegExp, counts: string) {
  await page.getByLabel(label).check();
  await page.getByRole("button", { name: "Import selected file", exact: true }).click();
  await expect(page.getByTestId("import-counts")).toHaveText(counts);
  await expect(page.getByTestId("register-status")).toHaveText("Persisted register loaded");
  await expectDocumentFits(page);
  await expectBoundedTable(page, page.locator('section[aria-labelledby="results-heading"]').getByRole("table"));
}

async function expectNoResidentDetails(page: Page) {
  for (const text of ["Fictional Resident", "resident-canary", "@resident"]) {
    await expect(page.getByText(text)).toHaveCount(0);
  }
}

test("work-order tables stay bounded and every Revisions action is reachable after imports and reload", async ({ page }) => {
  // Use the same real generated practice and PostgreSQL authority fixture as ENT-2.
  // No work-order, receipt or revision response is intercepted or fabricated.
  await page.goto("/admin/contractor");
  await page.getByRole("button", { name: "Start generated contractor practice", exact: true }).click();
  await expect(page.getByTestId("contractor-revision")).toHaveText("0");
  await page.goto("/contractor/work-orders");
  await expect(page.getByTestId("register-status")).toHaveText("Persisted register loaded");
  await expect(page.getByTestId("orders-table")).toHaveCount(0);
  await expectDocumentFits(page);

  await importSample(page, /Starter orders/, "5 created · 0 revised · 0 unchanged · 0 refused (of 5 rows)");
  const table = page.getByTestId("orders-table");
  await expect(table.getByRole("columnheader")).toHaveText(["Order", "Client", "Status", "Revision", "Priority", "Issued", "Net", "Job", "Open"]);
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await expectBoundedTable(page, table);

  await importSample(page, /Revised orders/, "0 created · 3 revised · 1 unchanged · 0 refused (of 4 rows)");
  await expect(page.getByTestId("receipt-row-5")).toContainText("Unchanged (recorded)");
  await expect(page.getByTestId("order-WO-DEMO-0003")).toContainText("Cancelled");
  await expectBoundedTable(page, table);
  await importSample(page, /Orders with problems/, "2 created · 0 revised · 0 unchanged · 5 refused (of 7 rows)");
  await expect(page.getByTestId("receipt-row-3")).toContainText("UNKNOWN_SOR_CODE");
  await expect(page.getByTestId("receipt-row-5")).toContainText("CONTRACTOR_PARTIES_REQUIRED");
  await expect(table.locator("tbody tr")).toHaveCount(7);
  await expectNoResidentDetails(page);
  const persistedRows = await table.locator("tbody tr").allTextContents();
  await page.reload();
  await expect(page.getByTestId("register-status")).toHaveText("Persisted register loaded");
  await expect(table.locator("tbody tr")).toHaveText(persistedRows);
  await expectDocumentFits(page);
  const region = await expectBoundedTable(page, table);
  await expect(region).toHaveAccessibleName("Orders");
  await expect(region).toHaveAccessibleDescription(/Scroll horizontally.*Revisions/);
  await region.focus();
  await expect(region).toBeFocused();
  expect(await region.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
  if (page.viewportSize()!.width === 360) {
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    // Scroll to the last column, as a horizontal swipe would, without moving the page.
    await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const lastHeader = await table.getByRole("columnheader", { name: "Open", exact: true }).boundingBox();
    expect(lastHeader!.x + lastHeader!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expectDocumentFits(page);
  }

  // Native Tab navigation must bring each of the seven actions fully into view.
  const links = table.getByRole("link");
  await expect(links).toHaveCount(7);
  await region.focus();
  for (const link of await links.all()) {
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    const box = await link.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
    const row = link.locator("../..");
    await expect(row.getByRole("cell")).toHaveCount(9);
    await expect(link).toHaveAccessibleName(`Revisions of ${await row.getByRole("cell").first().innerText()}`);
  }

  const revisions = table.getByRole("link", { name: "Revisions of WO-DEMO-0002", exact: true });
  const destination = await revisions.getAttribute("href");
  await revisions.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(page.getByRole("heading", { name: "Order WO-DEMO-0002", exact: true })).toBeVisible();
  await expect(page.getByTestId("current-revision")).toHaveText("2");
  await expectDocumentFits(page);
  for (const revision of [1, 2]) {
    const lines = page.getByTestId(`revision-${revision}`).getByRole("table");
    await expect(lines.getByRole("columnheader")).toHaveText(["#", "Line ref", "Code", "Quantity", "Unit", "Rate", "Net", "Line identity", "Since last revision"]);
    const scroll = await expectBoundedTable(page, lines);
    await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const lastCell = await lines.locator("tbody tr").first().getByRole("cell").last().boundingBox();
    expect(lastCell!.x).toBeGreaterThanOrEqual(0);
    expect(lastCell!.x + lastCell!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await expectNoResidentDetails(page);
  await page.reload();
  await expect(page.getByTestId("current-revision")).toHaveText("2");
  await expectDocumentFits(page);
  await expectBoundedTable(page, page.getByTestId("revision-2").getByRole("table"));
});
