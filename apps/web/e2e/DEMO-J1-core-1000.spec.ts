import { expect, test, type Page, type Request } from "@playwright/test";
import { click, jsonResult, recordThroughUi } from "./helpers/customer-invoice-journey";

test.setTimeout(300_000);
const names = ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"];
async function read(page: Page, path: string) { return jsonResult(page.request.get(path), `Read ${path}`); }
async function post(page: Page, path: string, data: unknown) { return jsonResult(page.request.post(path, { data }), `Post ${path}`); }
async function add(page: Page, description: string, price: string, direction: string) {
  const form = page.locator(".variation-entry");
  await form.getByLabel("Description", { exact: true }).fill(description);
  await form.getByLabel("Change type").selectOption(direction);
  await form.getByLabel("Variation price (£, optional)").fill(price);
  await click(page, "Add proposed variation");
  await expect(form.getByLabel("Description", { exact: true })).toHaveValue("");
}

// No SQL setup, successful response mocking or fixture-completion insertion.
// Both configured browser projects run the real capture, command paths and Final Check worker.
test("DEMO-J1 fresh five-line job, completed worker check, receipts, reversal, correction and source links", async ({ page, browser }) => {
  await page.goto("/demo-s");
  await page.getByRole("link", { name: "Practise core-1000 with the guided job screens" }).click();
  await click(page, "Start core-1000 practice session");
  await click(page, "Make my draft");
  await expect(page.getByTestId("proposal-line-count")).toHaveText("5");
  await click(page, "Check and edit my draft");
  await page.waitForURL(/core-1000\?jobId=/);
  const guidedUrl = page.url(), jobId = new URL(guidedUrl).searchParams.get("jobId")!;
  const root = `/api/jobs/${jobId}`;
  await click(page, "Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  for (const name of names) {
    const item = page.locator(".review-line").filter({ has: page.getByLabel(`Description ${name}`, { exact: true }) });
    // Each accepted proposal keeps its original source excerpt.
    await expect(item.locator("blockquote")).toContainText(name);
    await click(page, `Accept ${name}`);
  }
  await page.getByLabel(/Answer Confirm disposal/).fill("Builder removes fictional waste");
  await click(page, "Confirm scope");
  const captured = await read(page, `${root}/proposal`);
  const scopeIds = captured.review.lines.filter((line: { disposition: string }) => line.disposition === "accepted").map((line: { scopeItemId: string }) => line.scopeItemId);
  expect(new Set(scopeIds).size).toBe(5);
  await click(page, "Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
  await click(page, "Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await page.getByLabel("Unit rate Clean site").fill("200.00");
  await click(page, "Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("2");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 1,000.00");
  for (const step of ["Preview immutable quote", "Simulate sending this quote", "Continue fake worker", "Record practice acceptance", "Start this practice job"]) await click(page, step);
  await expect(page.getByTestId("activation-policy")).toHaveText("reference_fee_policy_v3");
  const activation = await read(page, `${root}/quotes/activation`);
  expect(activation.activation.recoveryCapPence).toBeNull();
  expect(activation.effects).toMatchObject({ activations: 1, termsRows: 1, capSnapshots: 0, simulatedObligations: 0, settlements: 0, platformJournals: 0, realExternalActions: 0 });
  const replayActivation = { version: "practice-activation-command.v1", commandId: crypto.randomUUID(), scenario: "no_charge" };
  await post(page, `${root}/quotes/activation`, replayActivation);
  expect((await post(page, `${root}/quotes/activation`, replayActivation)).effects.activations).toBe(1);
  await add(page, "Extra preparation", "125.00", "addition");
  await add(page, "Omit cabinet painting", "25.00", "omission");
  await add(page, "Pending trim repair", "50.00", "addition");
  await page.getByRole("button", { name: "Approve exact revision", exact: true }).nth(0).click();
  await expect(page.getByTestId("approved-additions")).toHaveText("£125.00");
  await page.getByRole("button", { name: "Approve exact revision", exact: true }).nth(0).click();
  await expect(page.getByTestId("approved-omissions")).toHaveText("−£25.00");
  // Evaluate the ordinary Watchdog command, not a seeded finding or completion.
  const session = await read(page, "/api/session");
  await post(page, "/api/decisions", { version: "finding-evaluation-command.v1", commandId: crypto.randomUUID(), tenantId: session.tenants[0].id, jobId });
  await click(page, "Build final account");
  await expect(page.getByTestId("final-gross")).toHaveText("£1,320.00");
  await expect(page.getByRole("button", { name: "Issue and simulate this invoice", exact: true })).toBeDisabled();
  await click(page, "Attach generated practice image");
  await click(page, "Check file integrity");
  await click(page, "Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await click(page, "Rebuild from approved sources");
  await expect(page.getByText("Finish the required proof before issuing this bill", { exact: true })).toHaveCount(0);
  const account = (await read(page, `${root}/final-account`)).account;
  expect(account.lines.filter((line: { kind: string }) => line.kind === "baseline").map((line: { scopeItemId: string }) => line.scopeItemId).sort()).toEqual(scopeIds.sort());
  expect(account.pending).toHaveLength(1);
  const before = await read(page, `${root}/final-check`);
  expect(before).toMatchObject({ state: "unlocked", items: [] });
  expect(JSON.stringify(before)).not.toMatch(/signalCount|heldCount|shadowCount/);
  for (const name of names) {
    await page.getByLabel(`Disposition ${name}`, { exact: true }).selectOption("done");
    await expect(page.getByLabel(`Disposition ${name}`, { exact: true })).toBeEnabled();
  }
  await click(page, "Accept final check terms");
  await click(page, "Complete final account");
  const locked = await read(page, `${root}/final-account/lock`);
  const issue = { version: "practice-customer-invoice.issue.v1", commandId: crypto.randomUUID(), finalAccountRevisionId: account.id, expectedSourceHash: account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-10-29" };
  expect((await page.request.post(`${root}/customer-invoices`, { data: issue })).ok()).toBe(false);
  await page.reload();
  await click(page, "Run the final check (practice)");
  await expect.poll(async () => (await read(page, `${root}/final-check`)).state, { timeout: 180_000, intervals: [5_000] }).toBe("completed");
  await click(page, "Load the saved final check");
  await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
  // A fabricated source hash cannot substitute for the immutable locked bill.
  expect((await page.request.post(`${root}/customer-invoices`, { data: { ...issue, commandId: crypto.randomUUID(), expectedSourceHash: "0".repeat(64) } })).ok()).toBe(false);
  await page.goto(`${guidedUrl}#final-account-title`);
  await click(page, "Issue and simulate this invoice");
  await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,320.00");
  const issued = (await read(page, `${root}/customer-invoices`)).invoices[0];
  const receipts = `${root}/customer-invoices/${issued.id}/receipts`;
  // Negative, fractional, over-limit and invented allocation authority fail closed.
  const receipt = { version: "practice-customer-receipt.record.v1", commandId: crypto.randomUUID(), paidOn: "2026-10-29", amountPence: 50000, method: "bank_transfer", reference: "Fictional first payment" };
  for (const extra of [{ amountPence: -1 }, { amountPence: 1.5 }, { amountPence: 1_000_000_000_001 }, { allocationPence: 50000 }]) expect((await page.request.post(receipts, { data: { ...receipt, ...extra } })).status()).toBe(400);
  await recordThroughUi(page, "500.00");
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 820.00");
  // Replay the actual second UI intent; no extra payment is recorded.
  const secondRequest = page.waitForRequest((request: Request) => request.url().endsWith(receipts) && request.method() === "POST");
  await recordThroughUi(page, "820.00");
  const second = (await secondRequest).postDataJSON();
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
  expect((await post(page, receipts, second)).receipts).toHaveLength(2);
  expect((await page.request.post(receipts, { data: { ...second, amountPence: 1 } })).ok()).toBe(false);
  await page.getByTestId("uiwire12-reversal-reason").fill("Duplicate fictional receipt corrected");
  const reversalRequest = page.waitForRequest(request => request.url().endsWith(`${receipts}/reversals`) && request.method() === "POST");
  await page.getByTestId("uiwire12-receipt-history").nth(1).getByRole("button", { name: "Reverse this receipt", exact: true }).click();
  const reversal = (await reversalRequest).postDataJSON();
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 820.00");
  expect((await post(page, `${receipts}/reversals`, reversal)).invoice.balancePence).toBe(82000);
  const creditPath = `${root}/customer-invoices/${issued.id}/credit-notes`;
  expect((await page.request.post(`${creditPath}/preview`, { data: { version: "practice-credit-note.preview.v1", netPence: 110001, reason: "Exceeds the original bill" } })).ok()).toBe(false);
  await click(page, "Preview credit note");
  await expect(page.getByTestId("uiwire11-preview-gross")).toHaveText("−GBP 120.00");
  const creditRequest = page.waitForRequest(request => request.url().endsWith(creditPath) && request.method() === "POST");
  await click(page, "Approve this credit note");
  const credit = (await creditRequest).postDataJSON();
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 700.00");
  expect((await post(page, creditPath, credit)).credits).toHaveLength(1);
  const final = await read(page, receipts);
  expect(final).toMatchObject({ eligibleRecoveryPrincipalPence: 0, baseCreditPence: 0, invoice: { balancePence: 70000, totalPence: 132000, pdfSha256: issued.pdfSha256 } });
  expect((await read(page, `${root}/final-account/lock`)).lock).toEqual(locked.lock);
  await page.reload();
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 700.00");
  // A lost transport result pauses subsequent writes; no successful business response is mocked.
  await page.route(`**${receipts}`, async route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await recordThroughUi(page, "0.01");
  await expect(page.getByText("Further receipt changes are paused because the last result is unknown. Read the saved history before leaving this page.", { exact: true })).toBeVisible();
  await page.unroute(`**${receipts}`);
  expect((await read(page, receipts)).receipts).toHaveLength(2);
  await page.getByRole("link", { name: "Source-linked job value", exact: true }).click();
  for (const [id, text] of [["value-approved-extras", "£125.00"], ["value-approved-reductions", "£25.00"], ["value-recorded-gross", "£500.00"], ["value-outstanding-gross", "£700.00"]]) await expect(page.getByTestId(id!)).toHaveText(text!);
  const links = page.locator(".value-card a");
  expect(await links.count()).toBeGreaterThan(0);
  for (const href of await links.evaluateAll(elements => elements.map(element => element.getAttribute("href")))) expect(href).toContain(`/jobs/${jobId}`);
  const extraSource = page.locator(".value-card").filter({ has: page.getByTestId("value-approved-extras") }).getByRole("link");
  const extraHref = (await extraSource.getAttribute("href"))!;
  await extraSource.click();
  await expect(page.locator(new URL(extraHref, guidedUrl).hash)).toContainText("Extra preparation");
  await page.goto(`/jobs/${jobId}/value`);
  const invoiceSource = page.locator(".value-card").filter({ has: page.getByTestId("value-invoiced-gross") }).getByRole("link");
  await invoiceSource.click();
  await expect(page.locator(`#invoice-${issued.id}`)).toBeVisible();
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 700.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const other = await browser.newContext({ baseURL: new URL(guidedUrl).origin });
  try {
    expect((await other.request.post("/api/session")).ok()).toBe(true);
    for (const path of [`${root}/proposal`, `${root}/final-check`, `${root}/final-account/lock`, receipts, `${root}/value`]) expect((await other.request.get(path)).ok()).toBe(false);
    expect((await other.request.post(receipts, { data: second })).ok()).toBe(false);
    const tab = await other.newPage(); await tab.goto(guidedUrl);
    await expect(tab.getByRole("heading", { name: "You cannot open this job", exact: true })).toBeVisible();
    await expect(tab.getByTestId("invoice-balance")).toHaveCount(0);
    await expect(tab.getByTestId("final-check-item")).toHaveCount(0);
  } finally { await other.close(); }
});
