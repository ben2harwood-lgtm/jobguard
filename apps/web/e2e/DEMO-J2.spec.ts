import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { allocationPanel, allocateThroughUi, post, readAllocations, readyAllocations, recovery18800 } from "./helpers/recovery-allocation-journey";

// Real routes and fresh command-produced state. No seeded end state and no mocked response.
// Settled fake-rail outcomes are refused over HTTP by design; as in the collection DB suite
// they come through the real writer on the fake-rail operator's connection.
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
async function packAndPursuit(page: Page, jobId: string, amount: string) {
  await page.goto(`/jobs/${jobId}#recovery-cases`);
  await page.getByRole("button", { name: `withheld customer payment · ${amount}`, exact: true }).click();
  await click(page, "Build evidence pack");
  await V(page, "pack-state", "Sources mapped — inspect the evidence");
  await click(page, "Approve this pack for attachment");
  await V(page, "pack-current-attachment-status", "Attachment approval recorded for these exact hashes");
  await click(page, "Preview factual message");
  await click(page, "Approve this exact message");
  await click(page, "Advance practice delivery");
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
/** The fake rail's terminal fact: the real writer, on the operator connection, replayed once. */
async function fakeRailSettles(page: Page, jobId: string, attemptId: string) {
  const token = (await page.context().cookies()).find(cookie => cookie.name === "jg_session")!.value;
  const digest = createHash("sha256").update(token).digest("hex");
  const rail = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  try {
    const client = await rail.connect();
    try {
      const tenant = (await client.query("SELECT tenant_id FROM app.job WHERE id=$1", [jobId])).rows[0].tenant_id as string;
      const command = { version: "simulation-fee-collection-command.v1", action: "settle", commandId: randomUUID(), attemptId };
      for (let i = 0; i < 2; i++) {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true)", [tenant, digest]);
        await client.query("SELECT app.write_platform_fee_collection($1,$2,$3::jsonb)", [jobId, digest, command]);
        await client.query("COMMIT");
      }
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } finally { await rail.end(); }
}
const collectionPanel = (page: Page) => page.getByRole("region", { name: "Simulated fee collection" });
async function settlePendingAttempt(page: Page, jobId: string) {
  const view = await (await page.request.get(`/api/jobs/${jobId}/success-fees/collection`)).json() as { attempts: { id: string; state: string }[] };
  const pending = view.attempts.filter(attempt => attempt.state === "pending");
  expect(pending).toHaveLength(1);
  await fakeRailSettles(page, jobId, pending[0]!.id);
  await collectionPanel(page).getByRole("button", { name: "Refresh collection records", exact: true }).click();
}

test("DEMO-J2 recovery-18800 reaches all five figures through the complete fresh journey", async ({ page, browser, baseURL }, testInfo) => {
  const pursuits = ["£320.00", "£2,500.00"];
  const fixture = await recovery18800(page, {
    afterStart: () => materialsChecks(page, testInfo.project.name),
    afterCaseOpen: (jobId, caseId) => approveTerms(page, jobId, caseId),
    afterEligibility: jobId => packAndPursuit(page, jobId, pursuits.shift()!),
  });
  const { jobId } = fixture, guide = `/jobs/${jobId}/recovery-journey`;

  // A fresh guide shows no figures until a money check runs over saved rows.
  await page.goto(guide);
  for (const marker of ["success-fee-net-posted", "fee-refunded-principal", "value-found-yours-before-tax", "unresolved-money-differences"]) await V(page, marker, "Not ready yet");
  await V(page, "journey-eligible-net", "£0.00");

  await splitReceiptLines(page, jobId, 38400, "Review line split for £384.00", "Split saved");
  await splitReceiptLines(page, jobId, 300000, "Review line split for £3,000.00", "Split saved");
  await page.goto(`/jobs/${jobId}#recovery-allocations`); await readyAllocations(page);
  await allocateThroughUi(page, fixture.cases[0]!, "384.00", "£384.00 = £320.00 net + £64.00 tax");
  await postFee(page, jobId, "£32.00", "£32.00");
  await page.goto(`/jobs/${jobId}#recovery-allocations`); await readyAllocations(page);
  await allocateThroughUi(page, fixture.cases[1]!, "3000.00", "£3,000.00 = £2,500.00 net + £500.00 tax");
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
  await settlePendingAttempt(page, jobId);
  await V(page, "fee-settled-principal", "£282.00"); await V(page, "fee-outstanding-principal", "£0.00");

  // Reversal, then compensation.
  await post(page, `${fixture.receiptPath}/reversals`, { version: "practice-customer-receipt.reverse.v1", commandId: randomUUID(), invoiceId: fixture.invoiceId, paymentId: fixture.cases[1]!.paymentId, reason: "Fictional reversal for DEMO-J2" });
  await splitReceiptLines(page, jobId, 300000, "Review line split reversal for £3,000.00", "Split and reversal saved");
  await page.goto(`/jobs/${jobId}#recovery-allocations`); await readyAllocations(page);
  const allocation = before.allocations.find(row => row.caseId === fixture.cases[1]!.caseId)!;
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
  await settlePendingAttempt(page, jobId);
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
  for (const source of fixture.cases) await expect(page.locator(`a[href="/api/recovery-cases/${source.caseId}/evidence-packs"]`)).toBeVisible();

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
  } finally { await stranger.close(); }
});
