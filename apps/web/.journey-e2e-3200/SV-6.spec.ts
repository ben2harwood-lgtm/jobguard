import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { openQuotingWatchdogJob, startWatchdogJob } from "./helpers/capture-journey";
import { finishDispositionsAndTerms } from "./helpers/final-account-lock-journey";
import { recordedProof, get, post } from "./helpers/recovery-sources";
import { approveJ3Catches, type PricedCatch } from "./helpers/j3-integrity-approval";

// Both configured projects (mobile-360 and desktop); real saved commands and
// fake provider facts only. Run headless with at most two workers.
test.setTimeout(300_000);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) {
 await expect(button(page,name)).toBeEnabled(); await button(page,name).click();
}
async function caughtInvoice(page: Page, browser: Browser, combined: boolean) {
 await openQuotingWatchdogJob(page);
 // A £2,400 baseline with five original scope lines, all still present.
 const quantities=page.getByLabel(/^Quantity /), rates=page.getByLabel(/^Unit rate /);
 await expect(rates).toHaveCount(5);
 for(let i=0;i<5;i++){await quantities.nth(i).fill("1");await rates.nth(i).fill("480.00");}
 await startWatchdogJob(page);
 const jobId=(await page.locator(".quote-editor").getAttribute("data-job-id"))!;
 const base=`/api/jobs/${jobId}`;
 await recordedProof(page,jobId,true);
 await post(page,`${base}/final-account`,{version:"final-account.assemble.v1",commandId:randomUUID(),expectedRevision:0});
 await post(page,`${base}/diary`,{version:"job-diary-input.v1",commandId:randomUUID(),entryMode:"typed",onSite:false,text:"Fitted outside tap."});
 await page.goto(`/jobs/${jobId}#final-account-title`);await finishDispositionsAndTerms(page);
 await click(page,"Complete final account");
 await expect.poll(async()=>(await get(page,`${base}/final-check`)).state,{timeout:180_000}).toBe("completed");
 const check=await get(page,`${base}/final-check`);expect(check.items).toHaveLength(1);
 const issue=async(kind:"final"|"supplementary")=>{
  const view=await get(page,`${base}/final-account/lock`);
  return post(page,`${base}/final-account/lock`,{version:"lock-bound-invoice.issue.v1",commandId:randomUUID(),invoiceKind:kind,
   finalAccountRevisionId:view.account.id,expectedSourceHash:view.account.sourceHash,recipient:"fictional@example.invalid",issuedOn:"2026-11-02"});
 };
 // The guide issues a combined final invoice only. Supplementary issue has no screen.
 if(!combined)await issue("final");
 await page.goto(`/jobs/${jobId}#final-check`);
 const panel=page.getByTestId("final-check-reveal");await expect(panel).toHaveAttribute("aria-busy","false");
 const item=panel.locator("article").filter({hasText:check.items[0].description});
 await item.getByRole("button",{name:"Yes — this was extra work",exact:true}).click();
 await expect(item.getByTestId("final-check-disposition")).toContainText("extra work");
 const variations=await get(page,`${base}/variations`);expect(variations.variations).toHaveLength(1);
 const id=variations.variations[0].id;
 await page.goto(`/jobs/${jobId}#variation-${id}`);
 const row=page.getByTestId(`variation-${id}`);
 await row.getByRole("button",{name:"Change price",exact:true}).click();
 await row.getByLabel(`New price ${check.items[0].description}`).fill("800.00");
 await row.getByRole("button",{name:"Save new proposed revision",exact:true}).click();
 await expect(row.getByRole("button",{name:"Approve exact revision",exact:true})).toBeVisible();
 const priced=(await get(page,`${base}/variations`)).variations[0] as PricedCatch;
 await approveJ3Catches(page,browser,jobId,[priced]);
 if(!combined){const current=await get(page,`${base}/final-account`);await post(page,`${base}/final-account`,{version:"final-account.assemble.v1",commandId:randomUUID(),expectedRevision:current.account.revision});}
 await page.goto(`/jobs/${jobId}/shadow-journey`);if(combined)await click(page,"Rebuild the bill");
 await expect(page.getByTestId("guide-bill")).toHaveText("£3,200.00 net / £3,840.00 gross");
 let invoice;
 if(combined){await click(page,"Issue this one invoice");await expect(page.getByTestId("guide-invoice")).toBeVisible();invoice=(await get(page,`${base}/customer-invoices`)).invoices[0];}
 else {const issued=await issue("supplementary");invoice=issued.invoices.find((item:{netPence:number})=>item.netPence===80000);}
 expect(invoice.netPence).toBe(combined?320000:80000);
 return {jobId,base,invoice,priced};
}
async function settle(page:Page,x:Awaited<ReturnType<typeof caughtInvoice>>,amountPence:number,movement:string){
 // Supplementary invoice selection and the second equal-value movement have no
 // dedicated receipt screen. Use the public commands, never settlement SQL.
 const receipt=await post(page,`${x.base}/customer-invoices/${x.invoice.id}/receipts`,{version:"practice-customer-receipt.record.v1",commandId:randomUUID(),invoiceId:x.invoice.id,paidOn:"2026-11-02",amountPence,method:"bank_transfer",reference:`Fictional SV-6 ${movement}`});
 const paymentId=receipt.receipts.find((r:{reference:string})=>r.reference===`Fictional SV-6 ${movement}`).id;
 let feed=await get(page,`${x.base}/practice-feed`);
 if(feed.feedState==="not_connected")feed=await post(page,`${x.base}/practice-feed`,{version:"practice-feed-command.v1",action:"connect",commandId:randomUUID(),expectedRevision:feed.revision});
 for(const action of ["advance","match_receipt"]){feed=await post(page,`${x.base}/practice-feed`,{version:"practice-feed-command.v1",action,commandId:randomUUID(),expectedRevision:feed.revision,movement,...(action==="advance"?{step:"settled"}:{paymentId})});}
 return paymentId;
}
async function splitReceipt(page:Page,x:Awaited<ReturnType<typeof caughtInvoice>>,paymentId:string){
 // The guide reads only the first invoice's first receipt. Supplementary and
 // subsequent receipt selection currently require the public writer.
 const allocate=async(target:string,command:unknown)=>post(page,`${x.base}/receipt-case-allocations`,{version:"receipt-case-allocation-command.v1",target,command});
 let lines=await get(page,`${x.base}/receipt-case-allocations`);
 const review=await allocate("receipt_lines",{version:"receipt-line-facts-command.v1",action:"review",commandId:randomUUID(),paymentId,expectedSourceRevision:lines.revision});
 await allocate("receipt_lines",{version:"receipt-line-facts-command.v1",action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash,expectedSourceRevision:review.sourceRevision});
 lines=await get(page,`${x.base}/receipt-case-allocations`);
 return lines;
}
async function assessOnScreen(page:Page,x:Awaited<ReturnType<typeof caughtInvoice>>,paymentId?:string){
 if(paymentId)await splitReceipt(page,x,paymentId);
 await page.goto(`/jobs/${x.jobId}/shadow-journey`);
 if(!paymentId){await click(page,"Review the line split");await expect(page.getByTestId("guide-lines-state")).toHaveText("Review ready to approve");
 await click(page,"Approve this exact line split");await expect(page.getByTestId("guide-lines-state")).toHaveText("Line split saved");}
 let assessed;
 for(const [name,state] of [["Review allocation of £800.00","Allocation ready to approve"],["Approve allocation of £800.00","Allocated"],["Assess £800.00","Assessed: £800.00 remains"],["Approve assessment review of £800.00","Assessment review recorded"]]){
  const response=name==="Assess £800.00"?page.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/success-fee-attribution")):null;
  await click(page,name!);await expect(page.getByTestId("guide-case-state")).toHaveText(state!);
  if(response)assessed=await (await response).json();
 }
 return assessed;
}
async function value(page:Page,jobId:string,figures:string[]){
 await page.goto(`/jobs/${jobId}/value`);
 for(let pass=0;pass<2;pass++){
  for(const [i,id] of ["found-recovered-net","found-success-fee","found-yours-before-tax"].entries())await expect(page.getByTestId(id)).toHaveText(figures[i]!);
  await expect(page.getByText(/Illustration — proposed policy; principal only/)).toBeVisible();
  if(pass===0)await page.reload();
 }
}
test("SV-6 G: half a catch settles, then a second settlement appends a cumulative revision",async({page,browser})=>{
 const x=await caughtInvoice(page,browser,false);
 const firstPayment=await settle(page,x,48000,"receipt-480-a");
 const first=await assessOnScreen(page,x,firstPayment);
 expect(first.assessment.remainingPrincipal).toEqual({numerator:"40000",denominator:"1"});
 await value(page,x.jobId,["£400.00","£40.00","£360.00"]);
 const paymentId=await settle(page,x,48000,"receipt-480-b");
 // The guide supports only the initial assessment. Reassessment and selection
 // of a second receipt use the same public writers, with current revisions.
 const allocate=async(target:string,command:unknown)=>post(page,`${x.base}/receipt-case-allocations`,{version:"receipt-case-allocation-command.v1",target,command});
 const lines=await splitReceipt(page,x,paymentId);
 const line=lines.rows.find((r:{paymentId:string;commercialRevisionId:string})=>r.paymentId===paymentId&&r.commercialRevisionId===x.priced.currentRevisionId);
 const recovery=(await get(page,`${x.base}/recovery-cases`)).cases.find((r:{id:string})=>r.id===first.assessment.caseId);
 const command={version:"stored-receipt-case-command.v1",commandId:randomUUID(),action:"review",factLineId:line.lineAllocationId,caseId:recovery.id,workId:first.assessment.workId,expectedCaseRevision:recovery.revision};
 const caseReview=await allocate("case",command);
 await allocate("case",{...command,commandId:randomUUID(),action:"approve",reviewId:caseReview.reviewId,approvalHash:caseReview.approvalHash});
 const current=(await get(page,`${x.base}/recovery-cases`)).cases.find((r:{id:string})=>r.id===recovery.id);
 const selection={version:"recovery-attribution-command.v1",commandId:randomUUID(),action:"assess",caseId:current.id,workId:first.assessment.workId,lineId:line.lineId,lockId:first.assessment.lockId,expectedCaseRevision:current.revision,expectedAttributionRevision:1};
 const next=await post(page,`${x.base}/success-fee-attribution`,selection);
 const input=(await get(page,`${x.base}/shadow-demo/review-inputs`)).cases.find((r:{caseId:string})=>r.caseId===current.id);
 await post(page,`${x.base}/success-fee-attribution`,{...selection,commandId:randomUUID(),action:"approve_review",expectedAttributionRevision:2,assessmentId:next.assessment.assessmentId,expectedSourceHash:next.assessment.sourceHash,reviewArtifactHash:input.reviewArtifactHash});
 expect(next.assessment.previousAssessmentId).toBe(first.assessment.assessmentId);
 expect((await get(page,`${x.base}/success-fee-attribution`)).revisions[0]).toEqual(first.assessment);
 await value(page,x.jobId,["£800.00","£80.00","£720.00"]);
});
test("SV-6 M: partial blended receipt allocates only its exact quarter catch share",async({page,browser})=>{
 const x=await caughtInvoice(page,browser,true);
 const paymentId=await settle(page,x,96000,"receipt-960");
 const saved=await assessOnScreen(page,x);
 const lines=await get(page,`${x.base}/receipt-case-allocations`);
 const catchLine=lines.rows.find((r:{commercialRevisionId:string})=>r.commercialRevisionId===x.priced.currentRevisionId);
 expect(catchLine).toMatchObject({paymentId,rule:"pro_rata",gross:{numerator:"24000",denominator:"1"},net:{numerator:"20000",denominator:"1"}});
 expect(saved.assessment.remainingPrincipal).toEqual(catchLine.net);
 expect(saved.valueReceipt.fee.pence).toBe(2000);
 // £720 gross remains outside the catch allocation; the invoice is part paid.
 expect((await get(page,`${x.base}/customer-invoices`)).invoices[0].balancePence).toBe(288000);
 await value(page,x.jobId,["£200.00","£20.00","£180.00"]);
 expect((await get(page,`${x.base}/success-fee-attribution`)).revisions).toEqual([saved.assessment]);
});
