import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { withSyntheticShadow } from "./final-account-lock-journey";
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
 await prepareInvoiceFinalCheck(page,jobId,final.account);
 const issued=await jsonResult(page.request.post(`/api/jobs/${jobId}/customer-invoices`,{data:{version:"practice-customer-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:final.account.id,expectedSourceHash:final.account.sourceHash,recipient:"practice-customer@example.invalid",issuedOn:"2026-09-19"}}),"Issue synthetic invoice");
 const invoiceId=issued.invoices.at(-1).id as string;
 await page.reload();await enterQuote(page);
 await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,320.00",{timeout:30_000});
 await expect(page.getByTestId("customer-invoice-number")).toHaveText(/^DEMO-CUST-\d{6}$/u);
 return {jobId,invoiceId,receiptPath:`/api/jobs/${jobId}/customer-invoices/${invoiceId}/receipts`};
}
export async function recordThroughUi(page:Page,amount:string){await page.getByTestId("uiwire12-receipt-amount").fill(amount);await click(page,"Record practice receipt");}

/** Let the registered worker own manifest creation and proof publication, including
 * fixture invoice setup. Kick its existing discovery task to avoid a cron wait. */
async function publishInvoiceFixtureCompletion(page: Page, admin: Pool, jobId: string) {
 await admin.query("SELECT graphile_worker.add_job('discover_final_check_requests','{}'::json)");
 await expect.poll(async () => (await jsonResult(page.request.get(`/api/jobs/${jobId}/final-check`), "Read invoice fixture check")).state,
  {timeout:10_000}).toBe("completed");
}
export async function prepareInvoiceFinalCheck(page:Page,jobId:string,account:{id:string;revision:number}){
 await withSyntheticShadow(tenant,async(_shadow,admin)=>{
  // Set-up only (per C135): a job taken live without the capture activation has no commercial track; establish the synthetic small-builder premise, never rewriting an existing track.
  const trackDb=await admin.connect();
  try{await trackDb.query("BEGIN");await trackDb.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
   await trackDb.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) SELECT tenant_id,id,'small_builder','synthetic_demo','legacy_synthetic_live_fixture' FROM app.job WHERE tenant_id=$1 AND id=$2 AND status IN ('live','invoiced','paid') ON CONFLICT(tenant_id,job_id) DO NOTHING",[tenant,jobId]);
   await trackDb.query("COMMIT");}catch(error){await trackDb.query("ROLLBACK");throw error;}finally{trackDb.release();}
   const path=`/api/jobs/${jobId}/final-account`;
  await jsonResult(page.request.post(`${path}/terms`,{data:{version:"final-check-terms.accept.v1",commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"}}),"Accept invoice fixture terms");
  const scope=(await admin.query("SELECT DISTINCT scope_item_id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'",[tenant,jobId,account.id])).rows;
  for(const item of scope)await jsonResult(page.request.post(`${path}/dispositions`,{data:{version:"final-account.disposition.v1",commandId:randomUUID(),scopeItemId:item.scope_item_id,disposition:"done"}}),"Record invoice fixture disposition");
  await jsonResult(page.request.post(`${path}/lock`,{data:{version:"final-account.lock.v1",commandId:randomUUID(),finalAccountRevisionId:account.id,expectedRevision:account.revision,declarationVersion:"final_account_declaration.v1"}}),"Lock invoice fixture");
  await publishInvoiceFixtureCompletion(page,admin,jobId);
 });
}

/** Set-up only (per C135): the issue routine now needs the lock and a checked completion; take the current account and establish both. */
export async function prepareCurrentInvoiceFinalCheck(page:Page,jobId:string){
 const state=await jsonResult(page.request.get(`/api/jobs/${jobId}/final-account`),"Read final account for invoice set-up");
 await prepareInvoiceFinalCheck(page,jobId,state.account);
}
