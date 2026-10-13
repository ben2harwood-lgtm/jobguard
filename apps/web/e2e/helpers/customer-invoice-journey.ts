import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
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

/** Coordinator r2 setup only: simulated worker output is persisted through the checked publication path.
 * This establishes invoice premises; it does not install the SV-5 domain handler. */
async function inInvoiceFixtureTransaction<T>(pool:Pool,tenantId:string,work:(db:PoolClient)=>Promise<T>):Promise<T>{
 const db=await pool.connect();
 try{await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);const result=await work(db);await db.query("COMMIT");return result;}
 catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}
const fixtureResultHash="a".repeat(64);
export async function publishInvoiceFixtureCompletion(shadow: Pool, admin: Pool, tenantId: string, jobId: string, overrides: { lockId?: string; cutoff?: string; checkId?: string } = {}) {
 const manifestId=randomUUID(),runId=randomUUID(),executionId=randomUUID(),checkId=overrides.checkId??randomUUID();
 const lock=(await admin.query("SELECT id,locked_at::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[tenantId,jobId])).rows[0];
 await inInvoiceFixtureTransaction(shadow,tenantId,db=>db.query("INSERT INTO app.final_check_manifest(tenant_id,job_id,id,lock_id,evidence_cutoff_at,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5,'synthetic-fixture.v1','synthetic-fixture.v1')",[tenantId,jobId,manifestId,overrides.lockId??lock.id,overrides.cutoff??lock.cutoff]));
 // Read the inventory after its transaction commits; the restricted worker cannot read original evidence rows.
 const sources=(await admin.query("SELECT s.*,e.id finalized_id,e.object_version_id finalized_version,e.sha256 finalized_hash,e.server_received_at::text finalized_received FROM app.final_check_manifest_source s LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id)=(s.tenant_id,s.job_id,s.upload_id) AND e.kind='original' WHERE s.tenant_id=$1 AND s.job_id=$2 AND s.manifest_id=$3 ORDER BY s.id",[tenantId,jobId,manifestId])).rows;
 return inInvoiceFixtureTransaction(shadow,tenantId,async db=>{
  await db.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at,status) VALUES($1,$2,$3,'synthetic-fixture.v1',$4,'completed')",[tenantId,jobId,runId,lock.cutoff]);
  const signals=(await db.query("SELECT DISTINCT s.id FROM app.shadow_commercial_signal s JOIN app.shadow_signal_evidence e ON(e.tenant_id,e.job_id,e.signal_id)=(s.tenant_id,s.job_id,s.id) WHERE s.tenant_id=$1 AND s.job_id=$2 AND e.source_received_at<=$3::timestamptz ORDER BY s.id",[tenantId,jobId,lock.cutoff])).rows;
  for(const source of sources) {
   const signalIds=(await db.query("SELECT DISTINCT signal_id FROM app.shadow_signal_evidence WHERE tenant_id=$1 AND job_id=$2 AND evidence_id=$3 ORDER BY signal_id",[tenantId,jobId,source.finalized_id])).rows.map(row=>row.signal_id);
   // Successful empty output is explicit. A missing/quarantined upload is refused by the checked trigger.
   for(const stage of ["detection","reconciliation"]) await db.query("INSERT INTO app.final_check_source_attempt(tenant_id,job_id,manifest_id,source_id,id,execution_id,stage,version,input_hash,outcome,result_hash,result_signal_ids,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic-fixture.v1',$8,'succeeded',$9,$10,$11,$12,$13,$14::timestamptz)",[tenantId,jobId,manifestId,source.id,randomUUID(),executionId,stage,stage==='detection'?source.frozen_input_hash:fixtureResultHash,fixtureResultHash,signalIds,source.finalized_id,source.finalized_version,source.finalized_hash,source.finalized_received]);
  }
  for(const signal of signals) {
   const classification=randomUUID();
   await db.query("INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES($1,$2,$3,$4,$5,'not_enough_evidence')",[tenantId,jobId,classification,runId,signal.id]);
   await db.query("INSERT INTO app.final_check_reveal_proof(tenant_id,job_id,run_id,id,signal_id,classification_id,projection_version,result_descriptor) VALUES($1,$2,$3,$4,$5,$6,'final-check-result.v1',$7::jsonb)",[tenantId,jobId,runId,randomUUID(),signal.id,classification,JSON.stringify({version:'final-check-result.v1',outcome:'not_enough_evidence',signalId:signal.id,classificationId:classification})]);
  }
  if(!signals.length) await db.query("INSERT INTO app.final_check_reveal_proof(tenant_id,job_id,run_id,id,projection_version,result_descriptor) VALUES($1,$2,$3,$4,'final-check-result.v1',$5::jsonb)",[tenantId,jobId,runId,randomUUID(),JSON.stringify({version:'final-check-result.v1',outcome:'zero_result'})]);
  await db.query("INSERT INTO app.final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic-fixture.v1','synthetic-fixture.v1')",[tenantId,jobId,runId,manifestId,lock.id,lock.cutoff,executionId]);
  await db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status,run_id) VALUES($1,$2,$3,$4,$5,'completed',$6)",[tenantId,jobId,checkId,lock.id,lock.cutoff,runId]);
  return checkId;
 });
}
export async function prepareInvoiceFinalCheck(page:Page,jobId:string,account:{id:string;revision:number}){
 await withSyntheticShadow(tenant,async(shadow,admin)=>{
  const path=`/api/jobs/${jobId}/final-account`;
  await jsonResult(page.request.post(`${path}/terms`,{data:{version:"final-check-terms.accept.v1",commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"}}),"Accept invoice fixture terms");
  const scope=(await admin.query("SELECT DISTINCT scope_item_id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'",[tenant,jobId,account.id])).rows;
  for(const item of scope)await jsonResult(page.request.post(`${path}/dispositions`,{data:{version:"final-account.disposition.v1",commandId:randomUUID(),scopeItemId:item.scope_item_id,disposition:"done"}}),"Record invoice fixture disposition");
  await jsonResult(page.request.post(`${path}/lock`,{data:{version:"final-account.lock.v1",commandId:randomUUID(),finalAccountRevisionId:account.id,expectedRevision:account.revision,declarationVersion:"final_account_declaration.v1"}}),"Lock invoice fixture");
  await publishInvoiceFixtureCompletion(shadow,admin,tenant,jobId);
 });
}
