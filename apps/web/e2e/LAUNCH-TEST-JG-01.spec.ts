import { expect, test } from "@playwright/test";
import { issueInvoice, jsonResult } from "./helpers/customer-invoice-journey";

test("J8 records one bank transfer when the same receipt is submitted from two tabs", async ({ page, context }) => {
  test.setTimeout(180_000);
  const { jobId, invoiceId, receiptPath } = await issueInvoice(page);
  const other = await context.newPage();
  const jobPath = `/jobs/${jobId}#invoice-${invoiceId}`;
  await Promise.all([page.goto(jobPath), other.goto(jobPath)]);

  const tabs = [page, other];
  const reference = "Fictional bank transfer JG01-0001";
  for (const tab of tabs) {
    await expect(tab.getByTestId("invoice-balance")).toHaveText("GBP 1,320.00");
    await tab.getByTestId("uiwire12-receipt-amount").fill("500.00");
    await tab.getByTestId("uiwire12-receipt-date").fill("2026-11-21");
    await tab.getByTestId("uiwire12-receipt-reference").fill(reference);
  }

  const results = await Promise.all(tabs.map(async tab => {
    const [response] = await Promise.all([
      tab.waitForResponse(result => result.url().endsWith(receiptPath) && result.request().method() === "POST"),
      tab.getByRole("button", { name: "Record practice receipt", exact: true }).click(),
    ]);
    return { status: response.status(), commandId: response.request().postDataJSON().commandId as string };
  }));
  expect(new Set(results.map(result => result.commandId)).size).toBe(2);
  const saved = await jsonResult(page.request.get(receiptPath), "Read stored receipts after both submissions");
  test.info().annotations.push({ type: "stored receipt result",
    description: JSON.stringify({ results, receiptCount: saved.receipts.length, balancePence: saved.invoice.balancePence }) });
  expect(saved.receipts.filter((receipt: { reference: string }) => receipt.reference === reference)).toHaveLength(1);
  expect(saved.invoice.balancePence).toBe(82000);
});
