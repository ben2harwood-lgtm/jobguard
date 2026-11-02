import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { allocationPanel, readAllocations, readyAllocations } from "./helpers/recovery-allocation-journey";

// A person's path through the screens: no seeded state, mocked response or operator connection.
// Fake payments settle on the guide's demo-only rail; the general settle command stays refused.
test.setTimeout(600_000);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) { await expect(button(page, name)).toBeEnabled({ timeout: 30_000 }); await button(page, name).click(); }
const V = (page: Page, id: string, value: string) => expect(page.getByTestId(id)).toHaveText(value, { timeout: 45_000 });
const X = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 30_000 });

async function materialsChecks(page: Page, label: string) {
  // Materials A: the £25 proposal is revised to the £20 agreed rate before the exact simulated placement.
  await page.getByLabel("SKU", { exact: true }).fill(`J2-${label}-${randomUUID()}`);
  await click(page, "Save agreed price and material");
  await V(page, "required-material-net", "£200.00");
  await click(page, "Preview proposed order");
  await V(page, "order-proposed-net", "£250.00"); await V(page, "order-price-difference", "£50.00");
  await page.getByLabel("Order unit price (£)", { exact: true }).fill("20.00");
  await click(page, "Preview changed order");
  await V(page, "order-proposed-net", "£200.00"); await V(page, "order-price-difference", "£0.00");
  await click(page, "Approve simulated order");
  await V(page, "order-status", "Simulated placement — nothing ordered"); await V(page, "prevented-fee", "£0.00");
  // Materials B: 10 ordered, 8 accepted, billed at £25; the human-confirmed revised bill removes £90, which is not recovered cash.
  const documents = page.locator("#supplier-documents"), picker = documents.locator("select").first();
  await picker.selectOption("materials-B-delivery"); await click(page, "Import generated document");
  await V(page, "delivery-accepted", "8 each");
  await picker.selectOption("materials-B-invoice"); await click(page, "Import generated document");
  await V(page, "supplier-document-status", "Ready for review");
  await documents.getByRole("button", { name: "Confirm supplier document", exact: true }).click();
  await expect(documents.getByTestId("supplier-confirmed-revision")).toHaveText("Confirmed revision 1; no supplier debt or settled cash recorded.");
  await click(page, "Match recorded sources");
  await V(page, "match-state", "Matched to recorded sources");
  await click(page, "Check confirmed supplier facts");
  await V(page, "price-to-check", "£50.00"); await V(page, "quantity-to-check", "£40.00"); await V(page, "total-to-check", "£90.00");
  await X(page, "Possible bill discrepancy - check these sources");
  await page.getByLabel("Review reason").fill("Supplier confirmed a revised bill is coming");
  await click(page, "Dispute finding");
  await X(page, "disputed: Supplier confirmed a revised bill is coming");
  await picker.selectOption("materials-B-revised-invoice"); await click(page, "Import generated document");
  await expect(documents.getByRole("button", { name: "Confirm supplier document", exact: true })).toHaveCount(2);
  await documents.getByRole("button", { name: "Confirm supplier document", exact: true }).last().click();
  await expect(documents.getByTestId("supplier-confirmed-revision")).toHaveCount(2);
  await click(page, "Approve revised bill supersession");
  await V(page, "confirmed-bill-reduction", "£90.00"); await V(page, "ttc-eligible-recovery-principal", "£0.00");
}
async function approveTerms(page: Page, jobId: string, caseId: string) {
  await page.goto(`/jobs/${jobId}/recovery-journey`);
  const row = page.locator(`[data-case-id="${caseId}"]`);
  await row.getByRole("button", { name: /^Approve exact terms for the/u }).click();
  await expect(row.getByRole("status")).toHaveText("Exact terms approved for this case.");
}
async function splitReceiptLines(page: Page, jobId: string, grossPence: number, control: string, state: string) {
  await page.goto(`/jobs/${jobId}/recovery-journey`);
  const row = page.locator(`[data-receipt-lines="${grossPence}"]`);
  // Line facts run SERIALIZABLE in the tenant other test jobs share. A refused save changes nothing, and the panel offers a retry.
  await expect(async () => {
    const approve = button(page, "Approve this exact line split"), review = row.getByRole("button", { name: control, exact: true });
    if (await approve.isVisible()) await approve.click(); else if (await review.isVisible()) await review.click();
    await expect(row.getByTestId("receipt-lines-state")).toHaveText(state, { timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}
async function postFee(page: Page, jobId: string, cumulative: string, delta: string) {
  await page.goto(`/jobs/${jobId}/recovery-journey`);
  await click(page, "Review success fee");
  await V(page, "fee-review-cumulative", cumulative); await V(page, "fee-review-delta", delta);
  await click(page, "Approve this exact fee posting");
  await expect(page.getByTestId("fee-posting-saved")).toContainText(`Cumulative fee ${cumulative}; change ${delta}.`);
}
async function settleOnGuide(page: Page, jobId: string, control: string, testId: string, expected: string) {
  await page.goto(`/jobs/${jobId}/recovery-journey`);
  await click(page, control);
  await V(page, testId, expected);
  await expect(button(page, control)).toHaveCount(0);
}
const collectionPanel = (page: Page) => page.getByRole("region", { name: "Simulated fee collection" });
async function openCaseAndApprove(page: Page, jobId: string, open: string, amount: string) {
  await page.goto(`/jobs/${jobId}#recovery-cases`);
  await click(page, open);
  await V(page, "case-claimed-net", amount);
  const caseId = await page.evaluate(async ([job, net]) => (await (await fetch(`/api/jobs/${job}/recovery-allocations`)).json() as { cases: { caseId: string; claimedNetPence: number }[] }).cases.find(row => row.claimedNetPence === net)!.caseId, [jobId, Math.round(Number(amount.replace(/[£,]/gu, "")) * 100)] as const);
  await approveTerms(page, jobId, caseId);
  await page.goto(`/jobs/${jobId}#recovery-cases`);
  await page.getByRole("button", { name: `withheld customer payment · ${amount}`, exact: true }).click();
  await click(page, "Evidence assembled");
  await V(page, "case-state", "Evidence assembled");
  await click(page, "Review evidence-backed claim");
  await click(page, "Approve this eligibility review");
  await V(page, "eligibility-status", "Approved for this simulation");
  await click(page, "Build evidence pack");
  await V(page, "pack-state", "Sources mapped — inspect the evidence");
  await click(page, "Approve this pack for attachment");
  await V(page, "pack-current-attachment-status", "Attachment approval recorded for these exact hashes");
  await click(page, "Preview factual message");
  await click(page, "Approve this exact message");
  await click(page, "Advance practice delivery");
  return caseId;
}
async function receiptAndFeed(page: Page, jobId: string, amount: string, movement: string, label: string) {
  await page.goto(`/jobs/${jobId}#final-account-title`);
  await page.getByTestId("uiwire12-receipt-amount").fill(amount);
  await click(page, "Record practice receipt");
  await page.goto(`/jobs/${jobId}#practice-receipts`);
  const panel = page.locator("#practice-receipts"), connect = panel.getByRole("button", { name: "Connect practice feed", exact: true });
  await expect(panel).toHaveAttribute("aria-busy", "false");
  await expect(panel.getByTestId("practice-feed-state")).toBeVisible();
  if (await connect.isVisible()) { await connect.click(); await expect(panel.getByTestId("practice-feed-state")).toHaveText("Connected"); }
  await panel.getByLabel("Generated movement", { exact: true }).selectOption(movement);
  await panel.getByLabel("Generated event", { exact: true }).selectOption("settled");
  await panel.getByRole("button", { name: "Advance practice executor", exact: true }).click();
  await expect(panel.locator(`[data-movement-key="${movement}"]`).first()).toBeVisible();
  await panel.getByRole("button", { name: `Match ${label} receipt to its settled movement`, exact: true }).click();
  await expect(panel.getByTestId("receipt-matched-movement").filter({ hasText: movement })).toBeVisible();
}
async function allocate(page: Page, jobId: string, caseId: string, gross: string, split: string, receiptLabel: string) {
  await page.goto(`/jobs/${jobId}#recovery-allocations`); await readyAllocations(page);
  const panel = allocationPanel(page);
  await panel.getByRole("combobox", { name: "Recovery case", exact: true }).selectOption(caseId);
  const receipt = panel.getByRole("combobox", { name: "Matched receipt", exact: true });
  await receipt.selectOption({ value: await receipt.locator("option").filter({ hasText: receiptLabel }).first().getAttribute("value") ?? "" });
  await panel.getByRole("combobox", { name: "Recovery evidence on file", exact: true }).selectOption({ index: 1 });
  await panel.getByLabel("Allocation gross (£)", { exact: true }).fill(gross);
  await panel.getByRole("button", { name: "Review receipt allocation", exact: true }).click();
  await expect(panel.getByTestId("allocation-review-split")).toHaveText(split);
  await panel.getByRole("button", { name: "Approve exact receipt allocation", exact: true }).click();
  await expect(panel.getByTestId("allocation-review-split")).toHaveCount(0);
  await readyAllocations(page);
}

test("DEMO-J2 recovery-18800 reaches all five figures through the complete fresh journey", async ({ page, browser, baseURL }, testInfo) => {
  await page.goto("/demo-s");
  await page.getByRole("link", { name: "Open the guided £18,800 recovery journey" }).click();
  await click(page, "Start recovery-18800 practice session");
  await click(page, "Make my draft");
  await expect(page.getByTestId("proposal-line-count")).toHaveText("5");
  await click(page, "Check and edit my draft");
  await page.waitForURL(/recovery-18800\?jobId=/u);
  const jobId = new URL(page.url()).searchParams.get("jobId")!, guide = `/jobs/${jobId}/recovery-journey`;
  await click(page, "Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(page, `Accept ${name}`);
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click(page, "Confirm scope");
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");
  await click(page, "Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 18,800.00");
  await click(page, "Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  for (const step of ["Preview immutable quote", "Simulate sending this quote", "Continue fake worker", "Record practice acceptance", "Start this practice job"]) await click(page, step);
  await expect(page.getByTestId("activation-policy")).toHaveText("reference_fee_policy_v3");

  await materialsChecks(page, testInfo.project.name);

  await click(page, "Build final account");
  await click(page, "Attach generated practice image");
  await click(page, "Check file integrity");
  await click(page, "Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await click(page, "Rebuild from approved sources");
  await expect(page.getByTestId("final-gross")).toHaveText("£22,560.00");
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) {
    await page.getByLabel(`Disposition ${name}`, { exact: true }).selectOption("done");
    await expect(page.getByLabel(`Disposition ${name}`, { exact: true })).toHaveValue("done");
  }
  const terms = button(page, "Accept final check terms");
  await expect(page.getByTestId("final-account-lock")).toHaveAttribute("aria-busy", "false");
  if (await terms.isEnabled()) await terms.click();
  await expect(terms).toBeDisabled();
  await click(page, "Complete final account");
  await expect(page.getByTestId("lock-state")).toHaveText("Final account completed");
  await page.reload();
  await click(page, "Run the final check (practice)");
  // Read-only wait for the real worker, as in DEMO-J1.
  await expect.poll(async () => (await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json()).state, { timeout: 180_000, intervals: [3_000] }).toBe("completed");
  await click(page, "Load the saved final check");
  await page.goto(`/jobs/${jobId}#final-account-title`);
  await click(page, "Issue and simulate this invoice");
  await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 22,560.00");

  const case320 = await openCaseAndApprove(page, jobId, "Open £320 withheld payment", "£320.00");
  await receiptAndFeed(page, jobId, "384.00", "receipt-384", "£384.00");
  const case2500 = await openCaseAndApprove(page, jobId, "Open £2,500 withheld payment", "£2,500.00");
  await receiptAndFeed(page, jobId, "3000.00", "receipt-3000", "£3,000.00");

  // A fresh guide shows no figures until a money check runs over saved rows.
  await page.goto(guide);
  for (const marker of ["success-fee-net-posted", "fee-refunded-principal", "value-found-yours-before-tax", "unresolved-money-differences"]) await V(page, marker, "Not ready yet");
  await V(page, "journey-eligible-net", "£0.00");

  await splitReceiptLines(page, jobId, 38400, "Review line split for £384.00", "Split saved");
  await splitReceiptLines(page, jobId, 300000, "Review line split for £3,000.00", "Split saved");
  await allocate(page, jobId, case320, "384.00", "£384.00 = £320.00 net + £64.00 tax", "£384.00");
  await postFee(page, jobId, "£32.00", "£32.00");
  await allocate(page, jobId, case2500, "3000.00", "£3,000.00 = £2,500.00 net + £500.00 tax", "£3,000.00");
  const before = await readAllocations(page, jobId);
  await postFee(page, jobId, "£282.00", "£250.00");
  await V(page, "journey-eligible-net", "£2,820.00"); await V(page, "journey-invoice-balance", "£19,176.00");

  // Approved v3 statement, then simulated collection.
  await page.goto(`/jobs/${jobId}#simulation-fee-statements`);
  const statements = page.getByRole("region", { name: "Simulation fee statements" });
  await statements.getByRole("button", { name: "Save current simulation statement or correction", exact: true }).click();
  await expect(statements.getByTestId("statement-success-fee-principal").last()).toHaveText("£282.00");
  await click(page, "Approve this exact simulation statement");
  await expect(statements.getByText("Exact statement approved; no money collected.", { exact: true })).toBeVisible();
  await collectionPanel(page).getByRole("button", { name: "Approve simulated collection of £282.00 principal", exact: true }).click();
  await expect(collectionPanel(page).getByRole("status").first()).toHaveText("pending");
  await V(page, "fee-settled-principal", "£0.00");
  await settleOnGuide(page, jobId, "Settle fake collection of £282.00", "journey-fee-settled", "£282.00");
  await page.goto(`/jobs/${jobId}#simulation-fee-statements`);
  await V(page, "fee-settled-principal", "£282.00"); await V(page, "fee-outstanding-principal", "£0.00");

  // Reversal, then compensation.
  await page.goto(`/jobs/${jobId}#final-account-title`);
  await page.getByTestId("uiwire12-reversal-reason").fill("Fictional reversal for DEMO-J2");
  await page.getByTestId("uiwire12-receipt-history").filter({ hasText: "3,000.00" }).getByRole("button", { name: "Reverse this receipt", exact: true }).click();
  await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 22,176.00");
  await splitReceiptLines(page, jobId, 300000, "Review line split reversal for £3,000.00", "Split and reversal saved");
  await page.goto(`/jobs/${jobId}#recovery-allocations`); await readyAllocations(page);
  const allocation = before.allocations.find(row => row.caseId === case2500)!;
  await allocationPanel(page).locator(`[data-allocation-id="${allocation.id}"]`).getByRole("button", { name: "Review allocation reversal", exact: true }).click();
  await allocationPanel(page).getByRole("button", { name: "Approve exact allocation reversal", exact: true }).click();
  await expect(allocationPanel(page).getByTestId("eligible-net")).toHaveText("£320.00");
  await postFee(page, jobId, "£32.00", "−£250.00");
  await V(page, "journey-eligible-net", "£320.00"); await V(page, "journey-invoice-balance", "£22,176.00");

  // Correction, then simulated refund.
  await page.goto(`/jobs/${jobId}#simulation-fee-statements`);
  await statements.getByRole("button", { name: "Save current simulation statement or correction", exact: true }).click();
  await expect(statements.getByTestId("statement-document-principal").last()).toHaveText("−£250.00");
  await expect(statements.getByTestId("statement-success-fee-principal").last()).toHaveText("£32.00");
  await V(page, "fee-refund-due", "£250.00");
  await collectionPanel(page).getByRole("button", { name: "Approve simulated refund of £250.00 principal", exact: true }).click();
  await expect(collectionPanel(page).getByRole("article").filter({ hasText: "refund:" }).getByRole("status")).toHaveText("pending");
  await settleOnGuide(page, jobId, "Settle fake refund of £250.00", "journey-fee-refunded", "£250.00");
  await page.goto(`/jobs/${jobId}#simulation-fee-statements`);
  await V(page, "fee-refunded-principal", "£250.00"); await V(page, "fee-retained-principal", "£32.00");

  // Reconcile from saved rows; the same figures come back after a fresh read.
  await page.goto(guide);
  await click(page, "Run money check");
  const end = async () => {
    await V(page, "success-fee-net-posted", "£32.00");
    await V(page, "fee-refunded-principal", "£250.00");
    await V(page, "value-found-yours-before-tax", "£288.00");
    await V(page, "unresolved-money-differences", "0");
    await V(page, "real-external-actions", "0");
    await V(page, "recovery-journey-state", "Records match within this simulation");
  };
  await end();
  await page.reload(); await end();
  await click(page, "Read saved journey again"); await end();
  const saved = new URL(page.url()); expect(saved.searchParams.get("run")).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const caseId of [case320, case2500]) await expect(page.locator(`a[href="/api/recovery-cases/${caseId}/evidence-packs"]`)).toBeVisible();

  // A stranger gets a refusal, including with the saved run's exact link.
  const stranger = await browser.newContext({ ...(baseURL ? { baseURL } : {}) });
  try {
    const other = await stranger.newPage();
    for (const path of [guide, `${guide}${saved.search}`]) {
      await other.goto(path);
      await expect(other.locator('p[role="alert"]')).toHaveText("The saved journey could not load. No result is available.");
      await expect(other.getByTestId("journey-eligible-net")).toHaveCount(0);
      await expect(other.getByTestId("success-fee-net-posted")).toHaveCount(0);
      await expect(other.getByTestId("real-external-actions")).toHaveCount(0);
    }
    // The demo step refuses a stranger over HTTP, and the general settle stays refused for the owner.
    const attempts = (await (await page.request.get(`/api/jobs/${jobId}/success-fees/collection`)).json()).attempts as { id: string }[];
    const strange = await stranger.request.post(`/api/jobs/${jobId}/success-fees/collection/demo-settle`, { data: { version: "simulation-fee-demo-settle-command.v1", commandId: randomUUID(), attemptId: attempts[0]!.id } });
    expect(strange.ok()).toBe(false);
    const general = await page.request.post(`/api/jobs/${jobId}/success-fees/collection`, { data: { version: "simulation-fee-collection-command.v1", action: "settle", commandId: randomUUID(), attemptId: attempts[0]!.id } });
    expect(general.status()).toBe(403);
  } finally { await stranger.close(); }
});
