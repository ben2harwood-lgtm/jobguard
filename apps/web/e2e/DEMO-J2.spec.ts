import { expect, test } from "@playwright/test";
import { allocationPanel, allocateThroughUi, post, readAllocations, readyAllocations, recovery18800 } from "./helpers/recovery-allocation-journey";

// Real routes and fresh command-produced state. No seeded end state or mocked producer.
// The dependency-bound producers cannot satisfy the complete DEMO-S acceptance yet.
test.setTimeout(360_000);
test("DEMO-J2 resumes real recovery allocations and reversal without inventing downstream results", async ({ page, browser, baseURL }) => {
  const fixture = await recovery18800(page);
  await allocateThroughUi(page, fixture.cases[0]!, "384.00", "£384.00 = £320.00 net + £64.00 tax");
  await allocateThroughUi(page, fixture.cases[1]!, "3000.00", "£3,000.00 = £2,500.00 net + £500.00 tax");
  const before = await readAllocations(page, fixture.jobId);
  const path = `/jobs/${fixture.jobId}/recovery-journey`;
  await page.goto(path);
  await expect(page.getByTestId("journey-eligible-net")).toHaveText("£2,820.00");
  for (const marker of ["success-fee-net-posted", "fee-refunded-principal", "value-found-yours-before-tax", "unresolved-money-differences"]) {
    await expect(page.getByTestId(marker)).toHaveText("Not ready yet");
  }
  await expect(page.getByTestId("real-external-actions")).toHaveText("0");
  await page.getByRole("button", { name: "Read saved journey again" }).click();
  await expect(page.getByTestId("journey-eligible-net")).toHaveText("£2,820.00");
  expect(await readAllocations(page, fixture.jobId)).toEqual(before);
  await expect(page.getByRole("link", { name: "CH-9 available customer invoice and receipt sources" })).toHaveAttribute("href", `/jobs/${fixture.jobId}/value`);
  for (const source of fixture.cases) await expect(page.locator(`a[href="/api/recovery-cases/${source.caseId}/evidence-packs"]`)).toBeVisible();

  await post(page, `${fixture.receiptPath}/reversals`, { version: "practice-customer-receipt.reverse.v1", commandId: crypto.randomUUID(), invoiceId: fixture.invoiceId, paymentId: fixture.cases[1]!.paymentId, reason: "Fictional reversal for DEMO-J2" });
  await page.goto(`/jobs/${fixture.jobId}#recovery-allocations`); await readyAllocations(page);
  const allocation = before.allocations.find(row => row.caseId === fixture.cases[1]!.caseId)!;
  await allocationPanel(page).locator(`[data-allocation-id="${allocation.id}"]`).getByRole("button", { name: "Review allocation reversal", exact: true }).click();
  await allocationPanel(page).getByRole("button", { name: "Approve exact allocation reversal", exact: true }).click();
  await expect(allocationPanel(page).getByTestId("eligible-net")).toHaveText("£320.00");
  await page.goto(path);
  await expect(page.getByTestId("journey-eligible-net")).toHaveText("£320.00");
  await expect(page.getByTestId("journey-invoice-balance")).toHaveText("£22,176.00");
  await expect(page.getByTestId("fee-refunded-principal")).toHaveText("Not ready yet");
  await page.reload();
  await expect(page.getByTestId("journey-eligible-net")).toHaveText("£320.00");
  const stranger = await browser.newContext({ ...(baseURL ? { baseURL } : {}) });
  try {
    const other = await stranger.newPage(); await other.goto(path);
    await expect(other.getByRole("alert")).toContainText("could not load");
    await expect(other.getByTestId("journey-eligible-net")).toHaveCount(0);
    await expect(other.getByTestId("real-external-actions")).toHaveCount(0);
  } finally { await stranger.close(); }
});
