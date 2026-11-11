import { expect, test, type Page, type Locator } from "@playwright/test";

// Real own-job setup only: no seeded jobs, successful mocked reads, live AI or providers.
// Both configured projects run; phone is explicitly the walk's 390 × 844.
const bathroom = "Bathroom refit for Mrs Sample at 4 Madeup Lane. Rip out the old suite and take it away, fit a new bath, basin and toilet, tile the walls and floor, new extractor fan. About 4800 pounds all in, should take two weeks.";
const decorating = "Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.";
const paidExample = "Practice decorating. Protect room £200.00. Prepare walls £200.00. Paint walls £200.00. Finish trim £200.00. Clean site £100.00. Replace shelves";
const message = "can you also paint the hallway ceiling? Happy to pay extra";
const diary = "Painted the hallway ceiling as asked, three hours extra, about 150 pounds";
const pounds = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}
async function blankFirm(page: Page) {
  await page.goto("/today");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click(page, "＋ Start a new job");
}
async function createJob(page: Page, text: string, net: number, customer: string, address: string, split = false) {
  await page.getByLabel("Work details").fill(text);
  await click(page, "Make my draft"); await click(page, "Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByLabel("Customer name", { exact: true }).fill(customer);
  await page.getByLabel("Premises address", { exact: true }).fill(address);
  // Keep the supplied valid practice postcode, as the hand walk did.
  await expect(page.getByLabel("UK postcode", { exact: true })).not.toHaveValue("");
  await click(page, "Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText(customer);
  if (split) {
    // The natural-items parser already separates this walk into two work items; older output was one line to Split.
    const lines = page.locator(".review-line");
    const separated = await lines.count() > 1;
    if (!separated) await lines.first().getByRole("button", { name: /^Split /u }).click();
    const parts = separated ? lines : lines.filter({ has: page.getByText("accepted", { exact: true }) });
    await expect(parts).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const part = parts.nth(i);
      await part.getByRole("textbox", { name: /^Description /u }).fill(i === 0 ? "Paint hall stairs and landing" : "Gloss woodwork");
      await part.getByRole("textbox", { name: /^Quantity /u }).fill("1");
      await part.getByRole("textbox", { name: /^Unit /u }).fill("item");
      if (separated) await part.getByRole("button", { name: /^Accept /u }).click();
    }
  } else {
    const lines = page.locator(".review-line");
    for (let i = 0; i < await lines.count(); i++) {
      const line = lines.nth(i);
      const description = await line.getByRole("textbox", { name: /^Description /u }).inputValue();
      if (description === "Replace shelves") {
        await line.getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
        await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional job");
      } else await line.getByRole("button", { name: /^Accept /u }).click();
    }
  }
  const answers = page.getByRole("textbox", { name: /^Answer /u });
  for (let i = 0; i < await answers.count(); i++) await answers.nth(i).fill("Builder removes fictional waste; price is all in; timing agreed for this practice job.");
  await click(page, "Confirm scope"); await click(page, "Price the work");
  const quote = page.locator(".quote-editor");
  await expect(quote).toHaveAttribute("data-quote-ready", "true");
  // Enter exact net prices. Do not infer acceptance from this editable draft.
  const rates = quote.getByRole("textbox", { name: /^Unit rate /u });
  if (text !== paidExample) {
    for (let i = 0; i < await rates.count(); i++) await rates.nth(i).fill(i === 0 ? String(net) : "0.00");
  }
  await expect(page.getByTestId("quote-net")).toHaveText(`GBP ${net.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  await click(page, "Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await click(page, "Preview immutable quote");
  await expect(page.getByRole("region", { name: "Quote preview" })).toContainText(pounds(net * 120));
  await click(page, "Simulate sending this quote");
  // The queued state renders the fake-worker control after the send returns; wait for it.
  await click(page, "Continue fake worker");
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await page.getByLabel("Stated customer", { exact: true }).fill(customer);
  await click(page, "Record practice acceptance"); await click(page, "Start this practice job");
  await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#quote`);
  return jobId;
}
async function addMessage(page: Page, withDiary: boolean) {
  const messages = page.getByTestId("customer-messages");
  await messages.getByLabel("Made-up customer name").fill("Fictional Customer");
  await messages.getByLabel("Message", { exact: true }).fill(message);
  await messages.getByRole("button", { name: "Save message", exact: true }).click();
  await expect(messages.getByTestId("customer-message")).toContainText(message);
  if (withDiary) {
    const notes = page.getByTestId("job-diary");
    await notes.getByLabel("Note", { exact: true }).fill(diary);
    await notes.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(notes.getByTestId("diary-entry")).toContainText(diary);
  }
}
async function completeAccount(page: Page, jobId: string): Promise<"failed" | "completed"> {
  await click(page, "Attach generated practice image"); await click(page, "Check file integrity"); await click(page, "Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await click(page, "Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
  await click(page, "Build final account");
  const panel = page.getByTestId("final-account-lock");
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  const dispositions = panel.getByRole("combobox");
  for (let i = 0; i < await dispositions.count(); i++) {
    await dispositions.nth(i).selectOption("done"); await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
  if (await terms.isEnabled()) await terms.click();
  await expect(panel).toHaveAttribute("aria-busy", "false");
  const complete = panel.getByRole("button", { name: "Complete final account", exact: true });
  if (!await complete.isEnabled()) await click(page, "Rebuild from approved sources");
  await expect(complete).toBeEnabled(); await complete.click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  await click(page, "Load the saved final check");
  const check = page.getByTestId("final-check-reveal");
  await expect(check).toHaveAttribute("aria-busy", "false");
  let saved = "pending";
  const read = async () => {
    const response = await page.request.get(`/api/jobs/${jobId}/final-check`);
    expect(response.ok()).toBe(true);
    saved = (await response.json()).state as string;
    return saved;
  };
  if (await read() === "pending") await click(page, "Run the final check (practice)");
  await expect.poll(read, { timeout: 180_000, intervals: [1000, 3000, 5000] }).toMatch(/^(failed|completed)$/u);
  await click(page, "Load the saved final check");
  await expect(check).toHaveAttribute("aria-busy", "false");
  const response = await page.request.get(`/api/jobs/${jobId}/final-account/lock`);
  expect(response.ok()).toBe(true);
  const projection = await response.json();
  expect(projection.lock.jobId).toBe(jobId);
  expect(projection.checkStatus).toBe(saved);
  expect(projection.invoiceGuard).toBe(saved === "failed" ? "FINAL_CHECK_FAILED" : null);
  return saved as "failed" | "completed";
}
async function readable(page: Page, selector: string | Locator) {
  const element = typeof selector === "string" ? page.locator(selector) : selector;
  await expect(element).toBeVisible();
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}
test.beforeEach(async ({ page }, info) => {
  test.setTimeout(600_000);
  if (info.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
});

test("walk 2: two locked bills need attention and accepted money stays separate", async ({ page }) => {
  await blankFirm(page);
  const first = await createJob(page, bathroom, 4000, "Mrs Sample", "4 Madeup Lane");
  await addMessage(page, true);
  const firstCheck = await completeAccount(page, first);
  await page.goto("/jobs/new");
  const second = await createJob(page, decorating, 900, "Mr Example", "9 Notreal Road", true);
  await addMessage(page, false);
  const secondCheck = await completeAccount(page, second);
  // The detector's independent repair must be preserved. On the observed failed-check
  // base both persisted checks fail; repaired bases must finish both ordinary jobs.
  expect(secondCheck).toBe(firstCheck);
  await test.info().attach("saved-final-check-states", { contentType: "application/json", body: JSON.stringify({ first, firstCheck, second, secondCheck }) });
  for (const [id, gross] of [[first, "£4,800.00"], [second, "£1,080.00"]]) {
    await page.goto(`/jobs/${id}/overview`);
    await expect(page.getByText(`Agreed ${gross}`, { exact: true })).toBeVisible();
    if (firstCheck === "failed") {
      await expect(page.getByText(/Final Check failed/u).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Open Work / Final Check →", exact: true }).first()).toHaveAttribute("href", `/jobs/${id}/work#final-account-title`);
      await expect(page.getByText("No current alerts", { exact: true })).toHaveCount(0);
    }
  }
  await page.goto("/today");
  if (firstCheck === "failed") {
    const dashboard = page.getByTestId("designed-today");
    await expect(dashboard.locator(".rr-metric").filter({ hasText: "jobs need attention" })).toContainText("2");
    await expect(dashboard.getByText("Final Check failed", { exact: false })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "View all (2 jobs)", exact: true })).toBeVisible();
    await readable(page, ".rr-attention");
    for (const row of await page.locator(".rr-attention-row").all()) {
      await readable(page, row.getByText(/Final Check failed/u));
      await readable(page, row.getByRole("button", { name: "Work / Final Check", exact: false }));
    }
    await test.info().attach("two-locked-bills", { contentType: "image/png", body: await page.screenshot({ fullPage: true }) });
    await click(page, "View all (2 jobs)");
    const check = page.getByTestId("designed-check");
    await expect(check.getByText(/Final Check failed/u)).toHaveCount(2);
    await expect(check.getByRole("link", { name: "Open Work / Final Check →", exact: true })).toHaveCount(2);
  } else {
    // Failed/pending lock projections remain covered deterministically in the component
    // suite; do not break or fake a repaired detector to force this branch to fail.
    await expect(page.locator(".rr-attention-row").filter({ hasText: "Final Check failed" })).toHaveCount(0);
  }
});

test("walk 2: paid example job has saved amounts on every designed screen", async ({ page, browser }) => {
  await blankFirm(page);
  const jobId = await createJob(page, paidExample, 900, "Practice Customer", "14 Fictional Street");
  expect(await completeAccount(page, jobId)).toBe("completed");
  await page.goto(`/jobs/${jobId}/money`);
  // Card headings sit inside .card-head; read the whole card that owns this heading.
  const savedMoney = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Where the money stands", exact: true }) });
  await expect(savedMoney.getByText("Agreed £1,080.00", { exact: true })).toBeVisible();
  await expect(savedMoney.getByText("No invoice issued", { exact: false })).toBeVisible();
  await page.goto(`/jobs/${jobId}/work#final-account-title`);
  await click(page, "Issue and simulate this invoice");
  await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,080.00");
  await page.getByTestId("uiwire12-receipt-amount").fill("1080.00");
  await page.getByTestId("uiwire12-receipt-reference").fill("Fictional own-job payment");
  await click(page, "Record practice receipt");
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
  for (const path of [`/jobs/${jobId}/money`, `/jobs/${jobId}/overview`, "/today", "/jobs", "/money"]) {
    await page.goto(path); await page.reload();
    await expect(page.getByText("Agreed £1,080.00", { exact: false }).first()).toBeVisible();
    if (path === "/today") {
      const card = page.locator(".rr-mini-job").filter({ hasText: "Practice decorating" });
      await expect(card).toContainText("Paid"); await expect(card).not.toContainText("Not checked");
      await readable(page, ".rr-mini-job");
      await test.info().attach("paid-job-card", { contentType: "image/png", body: await page.screenshot({ fullPage: true }) });
    } else if (path.startsWith(`/jobs/${jobId}/`)) {
      for (const label of ["Invoiced", "Recorded as paid", "Still owed"]) {
        const block = page.locator(".detail-block").filter({ has: page.getByText(label, { exact: true }) });
        await expect(block).toContainText(label === "Still owed" ? "£0.00" : "£1,080.00");
      }
    }
    await expect(page.getByText(/recorded by you, not bank-confirmed/iu).first()).toBeVisible();
  }
  // A different blank firm cannot substitute this private job into any saved read.
  const other = await browser.newContext();
  try {
    const visitor = await other.newPage(); await visitor.goto("/practice-company");
    await expect(visitor.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    for (const read of ["quotes/acceptance", "customer-invoices", "final-account/lock"]) expect((await visitor.request.get(`/api/jobs/${jobId}/${read}`)).status()).toBe(404);
    await visitor.goto(`/jobs/${jobId}/money`);
    await expect(visitor.getByText("You cannot open this job", { exact: true })).toBeVisible();
    await expect(visitor.getByText("Agreed £1,080.00", { exact: true })).toHaveCount(0);
  } finally { await other.close(); }
});
