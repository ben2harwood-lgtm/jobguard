import { expect, test, type Page } from "@playwright/test";

const ordinary = "Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.";
const fiveItems = `JOB: Practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves`;
async function click(page: Page, name: string) {
 const control = page.getByRole("button", { name, exact: true }); await expect(control).toBeEnabled(); await control.click();
}
async function saved(page: Page, jobId: string, suffix: string) {
 const response = await page.request.get(`/api/jobs/${jobId}/${suffix}`); expect(response.ok(), await response.text()).toBe(true); return response.json();
}
async function start(page: Page, text = ordinary) {
 await page.goto("/jobs");
 await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
 await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
 await click(page, "＋ Start a new job"); await page.getByLabel("Work details").fill(text);
 await click(page, "Make my draft"); await click(page, "Check and edit my draft");
 const jobId = (await page.getByTestId("workspace-job-id").getAttribute("data-job-id"))!;
 const proposal = await saved(page, jobId, "proposal");
 expect(proposal.source.text).toBe(text);
 const lines = page.locator(".review-line");
 await expect(lines).toHaveCount(proposal.proposal.lines.length);
 if (text === ordinary) {
  expect(proposal.proposal.lines.map((line: { description: { value: string } }) => line.description.value)).toEqual(["Paint the hall, stairs and landing, two coats", "woodwork in gloss"]);
  expect(proposal.proposal.questions.map((question: { question: { value: string } }) => question.question.value).join(" ")).toContain("900 quid");
 }
 for (const line of await lines.all()) {
  const description = await line.getByRole("textbox", { name: /^Description /u }).inputValue();
  if (description === "Replace shelves") { await click(page, "Dismiss Replace shelves"); await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional job"); continue; }
  await line.getByRole("textbox", { name: /^Quantity /u }).fill("1");
  await line.getByRole("textbox", { name: /^Unit /u }).fill("item");
  await click(page, `Accept ${description}`);
 }
 for (const answer of await page.getByRole("textbox", { name: /^Answer /u }).all()) await answer.fill("Fictional agreed work is £900 net, four days. Builder removes fictional waste.");
 await page.getByLabel("Customer name", { exact: true }).fill("Mr Example");
 await page.getByLabel("Premises address", { exact: true }).fill("9 Notreal Road");
 await page.getByLabel("Town", { exact: true }).fill("Exampleton"); await page.getByLabel("UK postcode", { exact: true }).fill("SW1A 1AA");
 await click(page, "Save customer and site"); await expect(page.getByTestId("party-customer")).toHaveText("Mr Example");
 await click(page, "Confirm scope"); await click(page, "Price the work");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
 const rates = page.getByRole("textbox", { name: /^Unit rate /u });
 for (let i = 0; i < await rates.count(); i++) await rates.nth(i).fill(text === ordinary ? i === 0 ? "900.00" : "0.00" : i === 4 ? "100.00" : "200.00");
 await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
 await click(page, "Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await click(page, "Preview immutable quote"); await click(page, "Simulate sending this quote");
 await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
 expect((await saved(page, jobId, "quotes/delivery")).status).toBe("simulated_delivery");
 await expect(page.getByRole("button", { name: "Continue fake worker", exact: true })).toHaveCount(0);
 await click(page, "Record practice acceptance");
 await page.getByTestId("uiwire15-journey").scrollIntoViewIfNeeded();
 const onward = page.getByTestId("uiwire15-continue"); await expect(onward).toHaveText("Start this practice job"); await onward.click();
 const editor = page.locator(`.quote-editor[data-job-id="${jobId}"]`);
 await expect(editor.getByRole("region", { name: "Accepted terms", exact: true })).toBeVisible();
 const button = editor.getByRole("button", { name: "Start this practice job", exact: true }).filter({ visible: true });
 await expect(button).toBeFocused();
 const bounds = await button.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThan(page.viewportSize()!.height - 60);
 await button.click();
 await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
 return jobId;
}
async function proof(page: Page) {
 const no = page.getByRole("button", { name: "No", exact: true }); if (await no.count()) await no.click();
 await click(page, "Attach generated practice image"); await click(page, "Check file integrity"); await click(page, "Complete this stage");
 await expect(page.getByTestId("stage-status")).toHaveText("Complete");
 await click(page, "Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
}
for (const scenario of [ordinary, fiveItems]) test(scenario === ordinary ? "walk 2: own job continues to the real control and finishes paid" : "walk 2: five-item Practice decorating still finishes paid", async ({ page, browser }, info) => {
 test.setTimeout(420_000);
 if (info.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
 const jobId = await start(page, scenario);
 const onward = page.getByTestId("uiwire15-continue"); await expect(onward).toHaveText("Finish the work and required proof"); await onward.click();
 await proof(page);
 await expect(onward).toHaveText("Build and complete the final account"); await onward.click();
 await click(page, "Build final account");
 const panel = page.getByTestId("final-account-lock"); await expect(panel).toBeVisible();
 const mounted = await panel.elementHandle();
 const note = page.getByTestId("job-diary").getByLabel("Note", { exact: true });
 await note.fill("Fictional unfinished draft — keep this edit");
 for (const name of ["Scope", "Quote", "Final account and invoices"]) {
  await page.getByRole("navigation", { name: "Saved job sections" }).getByRole("link", { name, exact: true }).click();
  expect(await mounted!.evaluate(element => element.isConnected && element === document.querySelector('[data-testid="final-account-lock"]'))).toBe(true);
  await expect(note).toHaveValue("Fictional unfinished draft — keep this edit");
 }

 await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
 const dispositions = panel.getByRole("combobox");
 for (let i = 0; i < await dispositions.count(); i++) { await dispositions.nth(i).selectOption("done"); await expect(panel).toHaveAttribute("aria-busy", "false"); }
 const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true }); if (await terms.isEnabled()) await terms.click();
 await expect(panel).toHaveAttribute("aria-busy", "false");
 const complete = panel.getByRole("button", { name: "Complete final account", exact: true }); if (!(await complete.isEnabled())) await click(page, "Rebuild from approved sources");
 await expect(complete).toBeEnabled(); await complete.click();
 await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
 // Locking records pending work; the synthetic worker requires an explicit request.
 await click(page, "Load the saved final check");
 await expect(page.getByTestId("final-check-reveal")).toHaveAttribute("aria-busy", "false");
 const initialCheck = await saved(page, jobId, "final-check");
 expect(initialCheck.state).not.toBe("failed");
 if (initialCheck.state === "pending") await click(page, "Run the final check (practice)");
 await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.", { timeout: 180_000 });
 await expect(onward).toHaveText("Issue the customer invoice"); await onward.click();
 await click(page, "Issue and simulate this invoice"); await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,080.00");
 await expect(onward).toHaveText("Record the next customer payment"); await onward.click();
 await expect(page.getByTestId("uiwire12-receipt-amount")).toBeFocused();
 await expect(page.getByTestId("uiwire12-receipt-amount")).toHaveValue("1080.00");
 const date = await page.getByTestId("uiwire12-receipt-date").inputValue(); expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
 await page.getByTestId("uiwire12-receipt-reference").fill("Fictional customer receipt"); await click(page, "Record practice receipt");
 await expect(page.getByRole("heading", { name: "You finished this practice job" })).toBeVisible();
 await page.reload();
 await expect(page.getByTestId("journey-customer-paid")).toHaveText("GBP 1,080.00");
 await expect(page.getByTestId("journey-customer-balance")).toHaveText("GBP 0.00");
 await expect(page.getByRole("heading", { name: "You finished this practice job" })).toBeVisible();
 await expect(page.getByTestId("uiwire15-continue")).toHaveCount(0);
 await expect(page.locator("#captured-job-workspace > header .status")).toHaveText("Complete — customer paid");
 await page.getByRole("navigation", { name: "Saved job sections" }).getByRole("link", { name: "Final account and invoices", exact: true }).click();
 await expect(page.getByTestId("uiwire12-receipt-history")).toContainText(date);
 await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
 await expect(page.getByRole("button", { name: "Issue and simulate this invoice", exact: true })).toHaveCount(0);
 const foreign = await browser.newContext({ baseURL: new URL(page.url()).origin });
 try {
  const visitor = await foreign.newPage(); await visitor.goto("/practice-company");
  // Navigation finishes before the client creates this visitor's separate session.
  await expect(visitor.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  const refused = await visitor.request.get(`/api/jobs/${jobId}/customer-invoices`); expect(refused.status()).toBe(404);
 } finally { await foreign.close(); }
});
test("walk 2: Continue opens the pending extra approval", async ({ page }, info) => {
 test.setTimeout(240_000);
 if (info.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
 const jobId = await start(page); await proof(page);
 const extra = page.locator(".variation-entry");
 await extra.getByLabel("Description", { exact: true }).fill("Fictional ceiling extra"); await extra.getByLabel("Variation price (£, optional)").fill("150.00");
 const proposed = page.waitForResponse(response => response.url().endsWith(`/api/jobs/${jobId}/variations`) && response.request().method() === "POST");
 await click(page, "Add proposed variation");
 const proposalResponse = await proposed; expect(proposalResponse.ok(), await proposalResponse.text()).toBe(true);
 await expect(extra.getByLabel("Description", { exact: true })).toHaveValue("");
 const view = await saved(page, jobId, "variations"); const pending = view.variations.find((item: { description: string }) => item.description === "Fictional ceiling extra"); expect(pending).toBeTruthy();
 const article = page.getByTestId(`variation-${pending.id}`);
 await article.evaluate(element => { for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = false; });
 await page.getByTestId("uiwire15-journey").scrollIntoViewIfNeeded();
 await expect(page.getByTestId("uiwire15-continue")).toHaveAttribute("href", `#variation-${pending.id}`);
 await page.getByTestId("uiwire15-continue").click();
 await expect(article.getByRole("button", { name: "Approve exact revision", exact: true })).toBeFocused();
 await expect(article).toContainText("£150.00");
 // Repeat the same navigation: a matching hash must still open and focus the control.
 await page.getByTestId("uiwire15-journey").scrollIntoViewIfNeeded(); await page.getByTestId("uiwire15-continue").click();
 await expect(article.getByRole("button", { name: "Approve exact revision", exact: true })).toBeFocused();
});
