import { expect, test, type Page } from "@playwright/test";

// Release testing only: real local synthetic routes, no provider or load traffic.
// The existing config runs every case at mobile-360 and desktop in headless CI.
test.setTimeout(420_000);
const journey = "/practice-company/walkthrough";
const tour = (page: Page) => page.getByRole("region", { name: "Guided walkthrough" });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function read(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok(), `Read saved ${path}: ${response.status()}`).toBe(true);
  return response.json();
}
async function open(page: Page) {
  await page.goto(journey);
  if ((page.viewportSize()?.width ?? 1280) <= 480) await tour(page).getByRole("button", { name: "More", exact: true }).click();
  await expect(tour(page)).toContainText("Step 1 of 9");
  await expect(page.getByLabel("Work details")).toHaveValue("Practice decorating. Protect room £200.00. Prepare walls £200.00. Paint walls £200.00. Finish trim £200.00. Clean site £100.00. Replace shelves");
}
async function showUntil(page: Page, step: number) {
  for (let current = 1; current < step; current++) {
    await expect(tour(page)).toContainText(`Step ${current} of 9`, { timeout: 300_000 });
    await tour(page).getByRole("button", { name: "Show me", exact: true }).click();
  }
  await expect(tour(page)).toContainText(`Step ${step} of 9`, { timeout: 300_000 });
}
async function ownJob(page: Page) {
  const href = await page.getByRole("link", { name: "Open your saved job", exact: true }).getAttribute("href");
  expect(href).toMatch(/^\/jobs\/[\da-f-]+$/u);
  return href!.split("/").at(-1)!;
}
async function double(page: Page, name: string) {
  const control = button(page, name);
  await expect(control).toBeEnabled();
  // A real pointer double-click, including the second activation while saving.
  await control.dblclick({ delay: 40 });
}
async function reviewAndPrice(page: Page) {
  await expect(page.locator(".review-line").first()).toBeVisible();
  for (const input of await page.locator('.review-line input[aria-label^="Description "]').all()) {
    await double(page, `Accept ${await input.inputValue()}`);
  }
  for (const input of await page.locator('input[aria-label^="Answer "]').all()) {
    await input.fill("Builder removes fictional waste");
  }
  await double(page, "Save review");
  await expect(page.locator(".review").filter({ hasText: "Review saved." })).toContainText("Review saved. Your source and choices will be here after reload.");
  await double(page, "Confirm scope");
  await double(page, "Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await double(page, "Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await expect(page.locator(".quote-notice").filter({ hasText: "Draft revision 1 saved" })).toBeVisible();
}
async function preparedJob(page: Page) {
  const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/jobs/capture"));
  await double(page, "Use the prepared example job");
  const captured = await (await response).json();
  expect(captured.jobId).toEqual(expect.any(String));
  return captured.jobId as string;
}
async function receiptPath(page: Page, jobId: string) {
  const view = await read(page, `/api/jobs/${jobId}/customer-invoices`);
  expect(view.invoices).toHaveLength(1);
  return `/api/jobs/${jobId}/customer-invoices/${view.invoices[0].id}/receipts`;
}

test.beforeEach(async ({ page, baseURL }) => {
  // Refuse a shared demo/test host even if a caller overrides baseURL.
  expect(baseURL).toBe("http://127.0.0.1:3000");
  // Keep saves in flight through the second click; responses still come from
  // the real application and database. This is latency injection, not load.
  await page.route("**/api/**", async route => {
    if (route.request().method() === "POST") await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
});

test("steps 1–9: double-click every save/send without duplicate commercial records", async ({ page }) => {
  await open(page);
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  await page.getByLabel("Work details").fill("JOB: Fictional stress room\nITEM: Paint fictional walls | £200.00");
  await double(page, "Make my draft");
  await expect(tour(page)).toContainText("Step 2 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  const own = await ownJob(page);
  await reviewAndPrice(page);
  await expect(tour(page)).toContainText("Step 3 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  const prepared = await preparedJob(page);
  expect(prepared).not.toBe(own);
  await reviewAndPrice(page);
  await double(page, "Save customer and site");
  await expect(page.getByTestId("party-customer")).not.toBeEmpty();
  await double(page, "Preview immutable quote");
  await expect(page.getByLabel("Quote preview")).toContainText("Document version 1");
  await double(page, "Simulate sending this quote");
  await expect(page.getByTestId("quote-delivery")).toHaveText("Queued — not sent");
  await double(page, "Continue fake worker");
  await expect(tour(page)).toContainText("Step 4 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  await double(page, "Record practice acceptance");
  await double(page, "Start this practice job");
  await expect(tour(page)).toContainText("Step 5 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  await double(page, "Attach generated practice image");
  await double(page, "Check file integrity");
  await double(page, "Complete this stage");
  await expect(tour(page)).toContainText("Step 6 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  await page.locator(".variation-entry").getByLabel("Description", { exact: true }).fill("Extra preparation");
  await page.getByLabel("Variation price (£, optional)").fill("125.00");
  await double(page, "Add proposed variation");
  await double(page, "Approve exact revision");
  await expect(tour(page)).toContainText("Step 7 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  await double(page, "Build final account");
  const dispositions = page.locator('select[aria-label^="Disposition "]');
  await expect(dispositions.first()).toBeVisible();
  for (const select of await dispositions.all()) {
    await select.selectOption("done");
    await expect(page.getByTestId("final-account-lock")).toHaveAttribute("aria-busy", "false");
  }
  await expect(page.getByTestId("final-account-lock")).toHaveAttribute("aria-busy", "false");
  // Terms acceptance belongs to the tenant and may precede this practice job.
  if (await button(page, "Accept final check terms").isEnabled()) {
    await double(page, "Accept final check terms");
  }
  await double(page, "Complete final account");
  await expect(page.getByTestId("lock-state")).toHaveText("Final account completed");
  await button(page, "Load the saved final check").click();
  await double(page, "Run the final check (practice)");
  await expect.poll(async () => {
    await button(page, "Load the saved final check").click();
    return page.getByTestId("final-check-status").textContent();
  }, { timeout: 300_000, intervals: [3000] }).toBe("JobGuard's final check found nothing missing from your bill.");
  await expect(tour(page)).toContainText("Step 8 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  await double(page, "Issue and simulate this invoice");
  await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,230.00");
  await expect(page.getByTestId("uiwire12-receipt-amount")).toBeEnabled();
  await page.getByTestId("uiwire12-receipt-amount").fill("1230.00");
  await page.getByTestId("uiwire12-receipt-reference").fill("Fictional stress receipt");
  await double(page, "Record practice receipt");
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
  await expect(tour(page)).toContainText("Step 9 of 9");
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  await button(page, "Open the saved end report").click();
  await expect(tour(page)).toContainText("That's the whole job");
  await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
  await expect(page.getByTestId("value-outstanding-gross")).toHaveText("£0.00");

  // Durable counts catch duplicates hidden by a UI that displays only the last row.
  const session = await read(page, "/api/session");
  const jobs = await read(page, `/api/jobs?tenantId=${session.tenants[0].id}`);
  expect(jobs.jobs.map((job: { id: string }) => job.id).sort()).toEqual([own, prepared].sort());
  for (const id of [own, prepared]) {
    expect((await read(page, `/api/jobs/${id}/quotes`)).revisions).toHaveLength(1);
  }
  const delivery = await read(page, `/api/jobs/${prepared}/quotes/delivery`);
  expect(delivery.documentVersion).toBe(1);
  expect(delivery.status).toBe("simulated_delivery");
  expect(delivery.receiptCount).toBe(1);
  expect(delivery.attempts).toBe(1);
  expect(delivery.effects).toEqual({ platformDebt: 0, chargeAttempts: 0, realExternalActions: 0 });
  const extras = await read(page, `/api/jobs/${prepared}/variations`);
  expect(extras.variations).toHaveLength(1);
  expect(extras.variations[0].revisions).toHaveLength(1);
  expect(extras.approvedAdditionsPence).toBe(12500);
  const receipts = await read(page, await receiptPath(page, prepared));
  expect(receipts.receipts).toHaveLength(1);
  expect(receipts.receipts[0].amountPence).toBe(123000);
  expect(receipts.eligibleRecoveryPrincipalPence).toBe(0);
  expect((await read(page, `/api/jobs/${own}/proposal`)).status).toBe("quoting");
});

test("step 1: empty and overlong work details explain refusal and keep the entered text", async ({ page }) => {
  await open(page);
  for (const value of ["", "Fictional work ".repeat(4000)]) {
    await page.getByLabel("Work details").fill(value);
    await button(page, "Make my draft").click();
    await expect(page.locator(".result-message")).toContainText("We could not make the draft");
    await expect(page.locator(".result-message")).toContainText("Your original text is still here");
    await expect(page.getByLabel("Work details")).toHaveValue(value);
    await expect(tour(page)).toContainText("Step 1 of 9");
  }
  const session = await read(page, "/api/session");
  expect((await read(page, `/api/jobs?tenantId=${session.tenants[0].id}`)).jobs).toHaveLength(0);
});

test("step 2: invalid quote rates block sending without overwriting the saved quote", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await showUntil(page, 3);
  await tour(page).getByRole("button", { name: "I'll do it", exact: true }).click();
  const id = await preparedJob(page);
  await reviewAndPrice(page);
  const path = `/api/jobs/${id}/quotes`;
  const before = await read(page, path);
  await button(page, "Save customer and site").click();
  await expect(page.getByTestId("party-customer")).not.toBeEmpty();
  const preview = button(page, "Preview immutable quote");
  await expect(preview).toBeEnabled();
  const rate = page.getByLabel(/^Unit rate /u).first();
  const original = await rate.inputValue();
  for (const value of ["", "-1", "999999999999999", "bananas"]) {
    await rate.fill(value);
    await expect(page.locator(".quote-blockers")).toContainText("needs a confirmed unit rate before issue");
    await expect(preview).toBeDisabled();
    await expect(button(page, "Simulate sending this quote")).toHaveCount(0);
    expect(await read(page, path)).toEqual(before);
    await rate.fill(original);
    await expect(preview).toBeEnabled();
  }
});

test("step 6: invalid extra prices and overlong text leave saved work intact", async ({ page }) => {
  await open(page);
  await showUntil(page, 6);
  const jobId = (await page.getByRole("link", { name: "Open your saved job", exact: true }).getAttribute("href"))!.split("/").at(-1)!;
  const proposalBefore = await read(page, `/api/jobs/${jobId}/proposal`);
  const entry = page.locator(".variation-entry");
  await expect(entry).toBeVisible();
  await expect(button(page, "Add proposed variation")).toBeDisabled();
  await entry.getByLabel("Description", { exact: true }).fill("Fictional invalid extra");
  for (const value of ["-1", "999999999999999", "bananas"]) {
    await page.getByLabel("Variation price (£, optional)").fill(value);
    await button(page, "Add proposed variation").click();
    await expect(page.locator(".variation-workspace .quote-notice")).toHaveText("Enter pounds and pence, for example 125.00");
    await expect(page.locator(".variation-list article")).toHaveCount(0);
    await expect(tour(page)).toContainText("Step 6 of 9");
  }
  // Empty price is deliberately allowed as an unpriced proposal, never billable.
  await page.getByLabel("Variation price (£, optional)").fill("");
  await button(page, "Add proposed variation").click();
  await expect(page.locator(".variation-list article")).toHaveCount(1);
  await expect(button(page, "Approve exact revision")).toHaveCount(0);
  await expect(page.getByTestId("approved-additions")).toHaveText("£0.00");
  await entry.getByLabel("Description", { exact: true }).fill("Fictional extra ".repeat(500));
  await page.getByLabel("Variation price (£, optional)").fill("125.00");
  await button(page, "Add proposed variation").click();
  await expect(page.locator(".variation-workspace .quote-notice")).toContainText("This variation could not be changed");
  await expect(page.locator(".variation-list article")).toHaveCount(1);
  expect(await read(page, `/api/jobs/${jobId}/proposal`)).toEqual(proposalBefore);
});

test("step 8: invalid receipt values never create a payment or change the balance", async ({ page }) => {
  await open(page);
  await showUntil(page, 8);
  await button(page, "Issue and simulate this invoice").click();
  await expect(page.getByTestId("uiwire12-receipt-amount")).toBeEnabled();
  const invoiceLink = page.getByRole("link", { name: "Download synthetic invoice PDF", exact: true });
  const path = `${await invoiceLink.getAttribute("href")}/receipts`;
  for (const value of ["", "-1", "99999999999.99", "bananas"]) {
    await page.getByTestId("uiwire12-receipt-amount").fill(value);
    await button(page, "Record practice receipt").click();
    await expect(page.getByRole("region", { name: "Customer receipts and balance history" }).getByRole("alert")).toContainText("Enter a positive amount in pounds");
    expect((await read(page, path)).receipts).toHaveLength(0);
    await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 1,230.00");
    await expect(tour(page)).toContainText("Step 8 of 9");
  }
  await page.getByTestId("uiwire12-receipt-reference").fill("x".repeat(121));
  await expect(page.getByTestId("uiwire12-receipt-reference")).toHaveValue("x".repeat(120));
  expect((await read(page, path)).receipts).toHaveLength(0);
});

for (const navigation of ["refresh", "browser Back"] as const) {
  test(`step 2: ${navigation} mid-save keeps the committed draft without another quote`, async ({ page }) => {
    await page.goto("/practice-company");
    await open(page);
    await showUntil(page, 3);
    const id = await ownJob(page);
    const path = `/api/jobs/${id}/quotes`;
    const before = await read(page, path);
    let committed!: () => void;
    let release!: () => void;
    const saved = new Promise<void>(resolve => { committed = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    // The DB commits a real save, but its response has not reached the browser.
    // This deliberately exercises the dangerous unknown-result navigation window.
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      committed();
      await gate;
      await route.fulfill({ response }).catch(() => { /* Navigation may cancel the response. */ });
    });
    try {
      await button(page, "Save draft revision").click();
      await saved;
      await expect(page.locator(".quote-editor")).toHaveAttribute("aria-busy", "true");
      if (navigation === "refresh") await page.reload();
      else { await page.goBack(); await page.goForward(); }
    } finally { release(); }
    const after = await read(page, path);
    expect(after.revisions).toHaveLength(before.revisions.length + 1);
    // Line row ids change with each revision; all saved content must survive.
    const withoutIds = (lines: { id: string }[]) => lines.map(({ id: _id, ...line }) => line);
    expect(withoutIds(after.revisions.at(-1).lines)).toEqual(withoutIds(before.revisions.at(-1).lines));
    await page.goto(`/jobs/${id}`);
    await button(page, "Price the work").click();
    await expect(page.getByTestId("quote-revision")).toHaveText(String(after.revisions.at(-1).revision));
    expect((await read(page, path)).revisions).toEqual(after.revisions);
  });
}

test("step 2: expired session refuses save and retains entered prices and the earlier saved draft", async ({ page, context }) => {
  await open(page);
  await showUntil(page, 3);
  const id = await ownJob(page);
  const path = `/api/jobs/${id}/quotes`;
  const before = await read(page, path);
  const rate = page.getByLabel(/^Unit rate /u).first();
  await rate.fill("45.67");
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === "jg_session")!;
  expect(sessionCookie).toBeDefined();
  // Expire the actual browser credential; do not fabricate a 401 response.
  await context.addCookies([{ ...sessionCookie, expires: Math.floor(Date.now() / 1000) - 60 }]);
  const refused = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(path));
  await double(page, "Save draft revision");
  expect((await refused).status()).toBe(401);
  await expect(page.locator(".quote-notice")).toHaveText("This draft could not be saved. Your entered prices are still here.");
  await expect(rate).toHaveValue("45.67");
  await expect(tour(page)).toContainText("Step 3 of 9");
  expect((await page.request.get(path)).status()).toBe(401);
  // Restore only this test's synthetic credential to inspect durable facts.
  await context.addCookies([sessionCookie]);
  expect(await read(page, path)).toEqual(before);
});

// WALK-resume restores the saved job and step from authorized server reads.
test("saved walkthrough resumes or explains its saved step after refresh", async ({ page }) => {
  await open(page);
  await showUntil(page, 3);
  const id = await ownJob(page);
  const before = await read(page, `/api/jobs/${id}/quotes`);
  await page.reload();
  await expect(tour(page)).toContainText("Step 3 of 9");
  await expect(page.getByRole("link", { name: "Open your saved job", exact: true })).toHaveAttribute("href", `/jobs/${id}`);
  expect(await read(page, `/api/jobs/${id}/quotes`)).toEqual(before);
});
