import { expect, test } from "@playwright/test";
import { click, jsonResult } from "./helpers/customer-invoice-journey";

test("own-job receipt defaults to its balance and reaches Paid", async ({ page }, testInfo) => {
 test.setTimeout(360_000);
 if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
 // A fresh own job, through the current mounted screens. No prepared demo job,
 // injected payment facts or mocked successful API responses.
 await page.goto("/practice-company");
 await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
 await click(page, "＋ Start a new job");
 await page.getByLabel("Work details").fill(`JOB: Fictional receipt balance decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves`);
 await click(page, "Make my draft"); await click(page, "Check and edit my draft");
 await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
 const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
 await click(page, "Save customer and site");
 await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
 for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(page, `Accept ${name}`);
 await click(page, "Dismiss Replace shelves");
 await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional job");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 await click(page, "Confirm scope"); await click(page, "Price the work");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
 await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
 await click(page, "Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await click(page, "Preview immutable quote"); await click(page, "Simulate sending this quote");
 await click(page, "Continue fake worker");
 await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
 await click(page, "Record practice acceptance"); await click(page, "Start this practice job");
 await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
 await page.goto(`/jobs/${jobId}#quote`);
 await click(page, "Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
 await click(page, "Build final account"); await expect(page.getByTestId("lock-state")).toHaveText("Final account review");
 await click(page, "Attach generated practice image"); await click(page, "Check file integrity"); await click(page, "Complete this stage");
 await expect(page.getByTestId("stage-status")).toHaveText("Complete");
 const panel = page.getByTestId("final-account-lock"), dispositions = panel.getByRole("combobox");
 await expect(dispositions).toHaveCount(5);
 for (let i = 0; i < 5; i++) { await dispositions.nth(i).selectOption("done"); await expect(panel).toHaveAttribute("aria-busy", "false"); }
 const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
 if (await terms.isEnabled()) await terms.click();
 await expect(panel.getByText("Final check terms accepted.", { exact: true })).toBeVisible();
 await click(page, "Rebuild from approved sources");
 await expect(panel.getByRole("button", { name: "Complete final account", exact: true })).toBeEnabled();
 await click(page, "Complete final account"); await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
 const checkPanel = page.getByTestId("final-check-reveal");
 const readCheck = async () => {
  await click(page, "Load the saved final check"); await expect(checkPanel).toHaveAttribute("aria-busy", "false");
  return (await jsonResult(page.request.get(`/api/jobs/${jobId}/final-check`), "Read own-job final check")).state as string;
 };
 const initial = await readCheck(); expect(initial).not.toBe("failed");
 if (initial !== "completed") {
  await click(page, "Run the final check (practice)");
  await expect.poll(readCheck, { timeout: 180_000, intervals: [3000] }).not.toBe("pending");
 }
 expect(await readCheck()).toBe("completed");
 await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
 const issuedResponse = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/customer-invoices`) && r.request().method() === "POST");
 await click(page, "Issue and simulate this invoice");
 const issued = await issuedResponse; expect(issued.ok(), await issued.text()).toBe(true);
 const invoice = (await issued.json()).invoices.at(-1);
 const receiptPath = `/api/jobs/${jobId}/customer-invoices/${invoice.id}/receipts`;
 const readReceipts = () => jsonResult(page.request.get(receiptPath), "Read saved own-job receipts");
 const pounds = (pence: number) => `${Math.trunc(pence / 100)}.${String(pence % 100).padStart(2, "0")}`;
 const amount = page.getByTestId("uiwire12-receipt-amount");
 const saved = await readReceipts(); expect(saved.invoice.balancePence).toBe(108000); expect(saved.receipts).toHaveLength(0);
 await expect(amount).toHaveValue(pounds(saved.invoice.balancePence));
 await amount.fill("123.45"); await click(page, "Refresh receipt history");
 await expect(page.getByRole("region", { name: "Customer receipts and balance history", exact: true })).toHaveAttribute("aria-busy", "false");
 await expect(amount).toHaveValue("123.45");
 const record = async (date: string, reference: string) => {
  await page.getByTestId("uiwire12-receipt-date").fill(date);
  await page.getByTestId("uiwire12-receipt-reference").fill(reference);
  const result = page.waitForResponse(r => r.url().endsWith(receiptPath) && r.request().method() === "POST");
  await click(page, "Record practice receipt"); const response = await result; expect(response.ok(), await response.text()).toBe(true);
  return response.json();
 };
 const partial = await record("2024-02-29", "Fictional earlier part payment");
 expect(partial.invoice.balancePence).toBe(95655);
 await expect(amount).toHaveValue(pounds(partial.invoice.balancePence));
 const full = await record("2024-03-01", "Fictional final payment");
 expect(full.invoice.balancePence).toBe(0); await expect(amount).toHaveValue("");
 await page.reload();
 await expect(page.getByTestId("job-status")).toHaveText("Customer paid");
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
 await expect(page.getByTestId("customer-payment-status")).toHaveText("Paid");
 await expect(amount).toHaveValue("");
 const final = await readReceipts();
 expect(final.receipts.map((r: { amountPence: number; paidOn: string; reference: string; reversal: unknown }) => ({ amountPence: r.amountPence, paidOn: r.paidOn, reference: r.reference, reversal: r.reversal }))).toEqual([
  { amountPence: 12345, paidOn: "2024-02-29", reference: "Fictional earlier part payment", reversal: null },
  { amountPence: 95655, paidOn: "2024-03-01", reference: "Fictional final payment", reversal: null },
 ]);
 const history = page.getByTestId("uiwire12-receipt-history"); await expect(history).toHaveCount(2);
 await expect(history.nth(0)).toContainText("2024-02-29 · GBP 123.45");
 await expect(history.nth(1)).toContainText("2024-03-01 · GBP 956.55");
 await expect(page.getByText("Recorded by you in the practice sandbox — not bank-confirmed", { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
