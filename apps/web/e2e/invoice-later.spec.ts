import { expect, test } from "@playwright/test";
import { enterQuote, issueInvoice, jsonResult } from "./helpers/customer-invoice-journey";

test.setTimeout(180000);
test("L075 L078 invoice, credit, receipt and reversal survive reload and a second context", async ({ page, browser }) => {
 const {jobId,invoiceId,receiptPath} = await issueInvoice(page);
 const invoicesPath = `/api/jobs/${jobId}/customer-invoices`, creditPath = `${invoicesPath}/${invoiceId}/credit-notes`;
 const original = (await jsonResult(page.request.get(invoicesPath),"Original invoice")).invoices[0];
 const credit = {version:"practice-credit-note.preview.v1",netPence:10000,reason:"Synthetic persistent correction"};
 const preview = await jsonResult(page.request.post(`${creditPath}/preview`,{data:credit}),"Credit preview");
 const creditCommand = {...credit,version:"practice-credit-note.issue.v1",commandId:crypto.randomUUID(),previewHash:preview.previewHash};
 await jsonResult(page.request.post(creditPath,{data:creditCommand}),"Approve synthetic credit");
 const payment = {version:"practice-customer-receipt.record.v1",commandId:crypto.randomUUID(),paidOn:"2024-02-29",
  amountPence:50000,method:"bank_transfer",reference:"Synthetic persisted receipt"};
 const partial = await jsonResult(page.request.post(receiptPath,{data:payment}),"Record synthetic receipt");
 expect(partial.invoice).toMatchObject({balancePence:70000,creditedPence:12000,paidPence:50000});
 const reversal = {version:"practice-customer-receipt.reverse.v1",commandId:crypto.randomUUID(),paymentId:partial.receipts[0].id,reason:"Synthetic receipt correction"};
 await jsonResult(page.request.post(`${receiptPath}/reversals`,{data:reversal}),"Reverse synthetic receipt");
 await jsonResult(page.request.post(creditPath,{data:creditCommand}),"Replay credit");
 await jsonResult(page.request.post(receiptPath,{data:payment}),"Replay receipt");
 await jsonResult(page.request.post(`${receiptPath}/reversals`,{data:reversal}),"Replay reversal");
 await page.reload(); await enterQuote(page);
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 1,200.00");
 const second = await browser.newContext({storageState:await page.context().storageState()});
 try {
  const listed = await jsonResult(second.request.get(invoicesPath),"Second context invoice list");
  const credits = await jsonResult(second.request.get(creditPath),"Second context credits");
  const receipts = await jsonResult(second.request.get(receiptPath),"Second context receipts");
  expect(listed.invoices).toHaveLength(1); expect(credits.credits).toHaveLength(1); expect(receipts.receipts).toHaveLength(1);
  expect(listed.invoices[0]).toEqual(credits.invoice); expect(listed.invoices[0]).toEqual(receipts.invoice);
  expect(receipts.invoice).toMatchObject({id:invoiceId,pdfSha256:original.pdfSha256,totalPence:132000,balancePence:120000,paidPence:0,creditedPence:12000});
  expect(receipts.receipts[0]).toMatchObject({paidOn:"2024-02-29",reversal:{reason:reversal.reason}});
  expect(credits.credits[0].sourceInvoiceHash).toBe(original.pdfSha256);
  expect(receipts.eligibleRecoveryPrincipalPence).toBe(0);
 } finally { await second.close(); }
});
