import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);
const bathroom = "Bathroom refit for Mrs Sample at 4 Madeup Lane. Rip out the old suite and take it away, fit a new bath, basin and toilet, tile the walls and floor, new extractor fan. About 4800 pounds all in, should take two weeks.";
const decorating = "Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.";
const postcodeError = "Check UK postcode. Use a valid-format practice postcode, such as SW1A 1AA. Nothing was saved.";
async function draft(page: Page, text: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "＋ Start a new job", exact: true }).click();
  await page.getByLabel("Work details").fill(text);
  const captured = page.waitForResponse(r => r.url().endsWith("/api/jobs/capture") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  const response = await captured; expect(response.status()).toBe(201);
  const result = await response.json(); expect(result.source.text).toBe(text);
  await page.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
  await expect(page.getByText("Suggested from your words — check before saving", { exact: true })).toBeVisible();
  return result.jobId as string;
}
const panel = (page: Page) => page.getByRole("form", { name: "Customer and site details", exact: true });
async function view(page: Page, id: string) {
  const response = await page.request.get(`/api/jobs/${id}/parties`); expect(response.ok(), await response.text()).toBe(true); return response.json();
}
async function noOverflow(page: Page) {
  await panel(page).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await panel(page).evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  for (const label of ["Customer name", "Premises address", "UK postcode"]) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
}
async function save(page: Page, id: string) {
  const response = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${id}/parties`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save customer and site", exact: true }).click();
  const saved = await response; expect(saved.ok(), await saved.text()).toBe(true);
  expect(saved.request().postDataJSON().action).toBe("save_form");
  await expect(page.getByTestId("party-customer")).toBeVisible();
}
test("walk 2 invalid postcode leaves no customer", async ({ page, browser }, testInfo) => {
  if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
  const id = await draft(page, bathroom), before = await view(page, id);
  expect(before.customers).toEqual([]); expect(before.current).toBeNull();
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Mrs Sample");
  await expect(page.getByLabel("Premises address", { exact: true })).toHaveValue("4 Madeup Lane");
  for (const label of ["Town", "UK postcode", "Customer email (fictional, optional)"]) await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  await page.getByLabel("Town", { exact: true }).fill("London");
  await page.getByLabel("Customer email (fictional, optional)").fill("sample@example.invalid");
  await page.getByLabel("UK postcode", { exact: true }).fill("ZZ1 1ZZ");
  for (let n = 0; n < 2; n++) {
    await page.getByRole("button", { name: "Save customer and site", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: postcodeError })).toContainText("INVALID_PARTIES");
    await expect(page.getByLabel("UK postcode", { exact: true })).toBeFocused();
    await expect(page.getByLabel("UK postcode", { exact: true })).toHaveValue("ZZ1 1ZZ");
  }
  const invalid = await page.request.post(`/api/jobs/${id}/parties`, { data: {
    version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "save_form", expectedJobRevision: before.jobRevision, expectedBindingId: null,
    customer: { version: "customer.v1", name: "Mrs Sample", type: "person", email: "sample@example.invalid" }, customerRef: null,
    site: { version: "site.v1", addressLines: ["4 Madeup Lane"], town: "London", postcode: "ZZ1 1ZZ" }, savedSiteRevisionId: null,
    reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false, payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
  } });
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toEqual({ code: "INVALID_PARTIES", recoverable: false, fields: [{ field: "postcode", message: postcodeError }] });
  await noOverflow(page); expect((await view(page, id)).customers).toEqual(before.customers);
  await page.reload(); await expect(page.getByText("Suggested from your words — check before saving", { exact: true })).toBeVisible();
  expect((await view(page, id)).customers).toEqual(before.customers); expect((await view(page, id)).current).toBeNull();
  await expect(page.getByLabel("Choose a customer").locator("option")).toHaveCount(1);
  await page.getByLabel("Town", { exact: true }).fill("London");
  await page.getByLabel("Customer email (fictional, optional)").fill("sample@example.invalid");
  await page.getByLabel("UK postcode", { exact: true }).fill("SW1A 1AA");
  await save(page, id); const saved = await view(page, id); expect(saved.customers).toHaveLength(1); expect(saved.sites).toHaveLength(1);
  await page.reload(); await expect(page.getByTestId("party-customer")).toHaveText("Mrs Sample");
  await expect(page.getByTestId("party-site")).toContainText("4 Madeup Lane, London, SW1A 1AA");
  expect((await view(page, id)).current.bindingId).toBe(saved.current.bindingId);
  expect((await view(page, id)).customers).toHaveLength(1); await noOverflow(page);
  // A separate blank firm uses the real routes. Ownership precedes source/form validation.
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize()! });
  try {
    const other = await context.newPage(), otherId = await draft(other, decorating);
    for (const suffix of ["proposal", "parties"]) {
      const denied = await other.request.get(`/api/jobs/${id}/${suffix}`); expect(denied.status()).toBe(404); expect(await denied.json()).toEqual({ code: "NOT_FOUND" });
    }
    const denied = await other.request.post(`/api/jobs/${id}/parties`, { data: { action: "save_form", site: { postcode: "ZZ1 1ZZ" } } });
    expect(denied.status()).toBe(404); expect(await denied.json()).toEqual({ code: "NOT_FOUND" });
    expect((await view(other, otherId)).customers).toEqual([]);
    const foreign = await other.request.post(`/api/jobs/${otherId}/parties`, { data: {
      version: "job-parties-command.v1", commandId: crypto.randomUUID(), action: "save_form", expectedJobRevision: 0, expectedBindingId: null,
      customer: saved.current.customer, customerRef: { id: saved.currentIds.customerId, revisionId: saved.current.customerRevisionId, expectedRevision: 1 },
      site: saved.current.site, savedSiteRevisionId: saved.current.siteRevisionId, reuseSiteId: null, expectedReuseRevisionId: null,
      confirmSamePlace: false, payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
    } });
    expect(foreign.status()).toBe(404); expect(await foreign.json()).toEqual({ code: "NOT_FOUND", recoverable: false });
    expect((await view(other, otherId)).customers).toEqual([]);
  } finally { await context.close(); }
});
test("walk 2 decorating words suggest editable parties", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
  const id = await draft(page, decorating);
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Mr Example");
  await expect(page.getByLabel("Premises address", { exact: true })).toHaveValue("9 Notreal Road");
  expect((await view(page, id)).customers).toEqual([]);
  await page.getByLabel("Customer name", { exact: true }).fill("Mr Example edited");
  await page.getByLabel("Premises address", { exact: true }).fill("9 Notreal Road Annex");
  await page.getByLabel("Town", { exact: true }).fill("London");
  await page.getByLabel("UK postcode", { exact: true }).fill("SW1A 1AA");
  await noOverflow(page); await save(page, id); await page.reload();
  await expect(page.getByTestId("party-customer")).toHaveText("Mr Example edited");
  await expect(page.getByTestId("party-site")).toContainText("9 Notreal Road Annex, London, SW1A 1AA");
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Mr Example edited");
  expect((await view(page, id)).customers).toHaveLength(1); await noOverflow(page);
});
