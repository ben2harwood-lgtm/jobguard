import { expect, type APIResponse, type Page } from "@playwright/test";
import { openReview } from "./capture-journey";
const tenant="11111111-1111-4111-8111-111111111111";
export const button=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
export async function click(page:Page,name:string){await expect(button(page,name)).toBeVisible();await expect(button(page,name)).toBeEnabled();await button(page,name).click();}
export async function jsonResult(request:Promise<APIResponse>,step:string){
 const response=await request;const text=await response.text();
 expect(response.ok(),`${step}: HTTP ${response.status()} ${text}`).toBe(true);
 return JSON.parse(text);
}
export async function enterQuote(page:Page){
 const open=button(page,"Price the work"),heading=page.getByRole("heading",{name:"Price the work",exact:true});
 await Promise.race([open.waitFor({state:"visible",timeout:30_000}),heading.waitFor({state:"visible",timeout:30_000})]);
 if(await open.isVisible())await click(page,"Price the work");
 await expect(heading).toBeVisible({timeout:30_000});
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
}
async function add(page:Page,description:string,amount:string,direction:"addition"|"omission"){
 const form=page.locator(".variation-entry");await expect(form).toBeVisible();
 await form.getByLabel("Description",{exact:true}).fill(description);
 await form.getByLabel("Change type").selectOption(direction);
 await form.getByLabel("Variation price (£, optional)").fill(amount);
 await click(page,"Add proposed variation");
 await expect(form.getByLabel("Description",{exact:true})).toHaveValue("");
}
/** Real UI and API setup, backed by PostgreSQL and actual application services.
 * Proof and invoice endpoints are setup for the receipt tests. No success API is
 * mocked; every failed response is surfaced immediately with its body. Commands
 * are awaited once, not retried with a newly generated identity on each poll.
 */
export async function issueInvoice(page:Page){
 await openReview(page);
 for(const name of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await click(page,`Accept ${name}`);
 await click(page,"Dismiss Replace shelves");
 await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this practice quote");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
 await click(page,"Confirm scope");await enterQuote(page);
 await click(page,"Save draft revision");
 await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await page.getByLabel("Unit rate Clean site").fill("200.00");
 await expect(page.getByTestId("quote-net")).toHaveText("GBP 1,000.00");
 await click(page,"Save draft revision");await expect(page.getByTestId("quote-revision")).toHaveText("2");
 await expect(page.getByTestId("quote-net")).toHaveText("GBP 1,000.00");
 await click(page,"Preview immutable quote");await click(page,"Simulate sending this quote");
 await click(page,"Continue fake worker");await click(page,"Record practice acceptance");await click(page,"Start this practice job");
 await expect(page.getByRole("heading",{name:"Final account",exact:true})).toBeVisible();
 await expect(page.locator(".variation-entry")).toBeVisible({timeout:30_000});
 const jobId=(await page.locator(".quote-editor").getAttribute("data-job-id"))!;
 expect(jobId).toMatch(/^[a-f0-9-]{36}$/u);
 await add(page,"Extra preparation","125.00","addition");
 await add(page,"Omit cabinet painting","25.00","omission");
 await add(page,"Pending trim repair","50.00","addition");
 await button(page,"Approve exact revision").nth(0).click();await expect(page.getByTestId("approved-additions")).toHaveText("£125.00");
 await button(page,"Approve exact revision").nth(0).click();await expect(page.getByTestId("approved-omissions")).toHaveText("−£25.00");
 await jsonResult(page.request.post("/api/decisions",{data:{version:"finding-evaluation-command.v1",commandId:crypto.randomUUID(),tenantId:tenant,jobId}}),"Evaluate findings");
 const finalPath=`/api/jobs/${jobId}/final-account`,proofPath=`/api/jobs/${jobId}/proof`;
 const blocked=await jsonResult(page.request.post(finalPath,{data:{version:"final-account.assemble.v1",commandId:crypto.randomUUID(),expectedRevision:0}}),"Initial final account");
 expect(blocked.account.issueBlocked).toBe(true);
 const initial=await jsonResult(page.request.get(proofPath),"Read required proof");
 const proofCommand=(data:Record<string,unknown>,step:string)=>jsonResult(page.request.post(proofPath,{data:{version:"practice-proof-command.v1",commandId:crypto.randomUUID(),...data}}),step);
 const selected=await proofCommand({action:"select_generated",scopeItemId:initial.scopeItemId,fixture:"completion-photo"},"Select generated proof");
 const finalized=await proofCommand({action:"finalize",uploadId:selected.upload.id,objectVersionId:selected.upload.objectVersionId},"Finalize proof");
 expect(finalized.upload.state).toBe("verified");
 const completed=await proofCommand({action:"complete",evidenceId:finalized.upload.evidenceId,scopeItemId:initial.scopeItemId},"Complete proof");
 expect(completed.completion.id).toEqual(expect.any(String));
 const final=await jsonResult(page.request.post(finalPath,{data:{version:"final-account.assemble.v1",commandId:crypto.randomUUID(),expectedRevision:blocked.account.revision}}),"Rebuild after proof");
 expect(final.account.issueBlocked).toBe(false);
 const issued=await jsonResult(page.request.post(`/api/jobs/${jobId}/customer-invoices`,{data:{version:"practice-customer-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:final.account.id,expectedSourceHash:final.account.sourceHash,recipient:"practice-customer@example.invalid",issuedOn:"2026-09-19"}}),"Issue synthetic invoice");
 const invoiceId=issued.invoices.at(-1).id as string;
 await page.reload();await enterQuote(page);
 await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,320.00",{timeout:30_000});
 await expect(page.getByTestId("customer-invoice-number")).toHaveText(/^DEMO-CUST-\d{6}$/u);
 return {jobId,invoiceId,receiptPath:`/api/jobs/${jobId}/customer-invoices/${invoiceId}/receipts`};
}
export async function recordThroughUi(page:Page,amount:string){await page.getByTestId("uiwire12-receipt-amount").fill(amount);await click(page,"Record practice receipt");}
