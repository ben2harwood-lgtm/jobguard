import {expect,test} from "@playwright/test";
import {button,click,enterQuote,issueInvoice,jsonResult,recordThroughUi} from "./helpers/customer-invoice-journey";
test.setTimeout(180_000);
test("records partial and full receipts and reverses the second after reload",async({page})=>{
 const{receiptPath}=await issueInvoice(page);
 await page.getByTestId("uiwire12-receipt-date").fill("2024-02-29");
 await recordThroughUi(page,"500.00");
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 820.00",{timeout:30_000});
 await expect(page.getByTestId("customer-payment-status")).toHaveText("Part paid");
 let view=await jsonResult(page.request.get(receiptPath),"Read first receipt");expect(view.receipts[0].paidOn).toBe("2024-02-29");
 await page.getByTestId("uiwire12-receipt-date").fill("2026-09-18");
 await recordThroughUi(page,"820.00");
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00",{timeout:30_000});
 await expect(page.getByTestId("job-status")).toHaveText("Customer paid");
 view=await jsonResult(page.request.get(receiptPath),"Read both receipts");expect(view.receipts).toHaveLength(2);
 await page.reload();await enterQuote(page);
 // This catches the old DOM-only paid label, which disappeared after reload.
 await expect(page.getByTestId("job-status")).toHaveText("Customer paid");
 const history=page.getByTestId("uiwire12-receipt-history");await expect(history).toHaveCount(2);
 await expect(history.nth(0)).toContainText("2024-02-29");
 await page.getByTestId("uiwire12-reversal-reason").fill("Duplicate fictional receipt corrected");
 await history.nth(1).getByRole("button",{name:"Reverse this receipt",exact:true}).click();
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 820.00",{timeout:30_000});
 await expect(page.getByTestId("job-status")).toHaveText("Work under way");
 await page.reload();await enterQuote(page);
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 820.00");
 await expect(page.getByTestId("customer-payment-status")).toHaveText("Part paid");
 await expect(history).toHaveCount(2);await expect(history.nth(1)).toContainText("Reversed: Duplicate fictional receipt corrected");
 await expect(page.getByText("Recorded by you in the practice sandbox — not bank-confirmed",{exact:true})).toBeVisible();
 await expect(page.getByTestId("eligible-recovery-principal")).toHaveText("GBP 0.00");
 await expect(page.getByTestId("base-credit").first()).toHaveText("£0.00");
 await button(page,"Record practice receipt").focus();await expect(button(page,"Record practice receipt")).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test("shows an overpayment as customer credit rather than a negative balance",async({page})=>{
 await issueInvoice(page);await recordThroughUi(page,"1400.00");
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00",{timeout:30_000});
 await expect(page.getByTestId("customer-credit")).toHaveText("GBP 80.00");
 await expect(page.getByText("Recorded by you in the practice sandbox — not bank-confirmed",{exact:true})).toBeVisible();
 await expect(page.getByTestId("eligible-recovery-principal")).toHaveText("GBP 0.00");
 await expect(page.getByTestId("base-credit").first()).toHaveText("£0.00");
});
test("validates amounts, refuses unauthenticated reads and pauses an unknown transport result",async({page,browser})=>{
 const{receiptPath}=await issueInvoice(page);
 const stranger=await browser.newContext();try{expect((await stranger.request.get(receiptPath)).status()).toBe(401);}finally{await stranger.close();}
 await recordThroughUi(page,"1.001");await expect(page.getByRole("alert")).toContainText("Enter a positive amount");
 expect((await jsonResult(page.request.get(receiptPath),"Check invalid amount")).receipts).toHaveLength(0);
 await recordThroughUi(page,"16.29");await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 1,303.71");
 expect((await jsonResult(page.request.get(receiptPath),"Check exact pence")).receipts[0].amountPence).toBe(1629);
 let writes=0;
 // Fault injection aborts transport. No successful business response is faked.
 await page.route(`**${receiptPath}`,async route=>{if(route.request().method()==="POST"){writes++;await route.abort("failed");}else await route.continue();});
 await recordThroughUi(page,"500.00");
 await expect(page.getByText("Further receipt changes are paused because the last result is unknown. Read the saved history before leaving this page.",{exact:true})).toBeVisible();
 await expect(button(page,"Record practice receipt")).toBeDisabled();expect(writes).toBe(1);
 await click(page,"Refresh receipt history");await expect(page.getByTestId("uiwire12-receipt-history")).toHaveCount(1);
 await expect(button(page,"Record practice receipt")).toBeDisabled();expect(writes).toBe(1);
});
