// Synthetic sources through existing writers. No qualifying allocation or fee rows seeded.
import {randomUUID} from "node:crypto";
import {recoveryCaseTermsHash} from "@jobguard/core";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import type {FinalCheckFixture} from "./final-check-fixture.js";
import {RecoveryCaseRepository,type RecoveryCaseView} from "../src/recovery-case-repository.js";
import {RecoveryCaseTermsRepository} from "../src/recovery-case-terms-repository.js";
import {RecoveryAllocationRepository} from "../src/recovery-allocation-repository.js";
import {PracticeFeedRepository} from "../src/practice-feed-repository.js";
import {SuccessFeeRepository} from "../src/success-fee-repository.js";
export async function recoveryFeeFixture(f:FinalCheckFixture,settleReceipts=true){
 const x=await realReceiptFixture(f,"F5","receipt-line-allocation-command.v1");
 const cases=new RecoveryCaseRepository(x.scoped),allocator=new RecoveryAllocationRepository(f.runtime,"synthetic_demo");
 const opened:RecoveryCaseView[]=[];
 for(const amount of [32000,250000]){
  let c=await cases.command(x.context,x.jobId,{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),expectedRevision:0,
   caseType:"withheld_customer_payment",claimedNetPence:amount,counterparty:"Fictional withheld payer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:[x.invoiceId]},x.actor);
  await new RecoveryCaseTermsRepository(x.scoped).approve(x.context,x.jobId,{version:"recovery-case-terms-command.v1",action:"approve",commandId:randomUUID(),caseId:c.id,
   termsVersion:"synthetic_recovery_fee_terms.v1",feePolicyVersion:"reference_fee_policy_v3",eligibilityPolicyVersion:"reference_recovery_eligibility_policy_v3",termsHash:recoveryCaseTermsHash(c.id)},x.actor);
  c=await cases.command(x.context,x.jobId,{version:"recovery-case-command.v1",action:"transition",commandId:randomUUID(),caseId:c.id,expectedRevision:c.revision,eventType:"assemble_evidence"},x.actor);
  c=await cases.eligibilityCommand(x.context,x.jobId,{version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,
   evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,scenario:"evidence_backed_withheld_payment"},x.actor);
  c=await cases.eligibilityCommand(x.context,x.jobId,{version:"recovery-eligibility-command.v1",action:"approve",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,
   expectedEvidenceRevision:1,expectedPolicyRevision:1,expectedReviewRevision:c.eligibility!.revision},x.actor);
  opened.push(c);
 }
 const feed=new PracticeFeedRepository(f.runtime,"synthetic_demo");
 let revision=(await feed.view(x.context,x.actor,x.auth.digest,x.jobId)).revision;
 const payments:string[]=[];
 for(const [movement,amount] of [["receipt-384",38400],["receipt-3000",300000]] as const){
  const payment=(await x.invoices.recordReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),paidOn:"2026-10-30",amountPence:amount,method:"bank_transfer",reference:"Fictional case receipt"})).paymentId;
  if(settleReceipts)for(const action of ["advance","match_receipt"] as const){
   const v=await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action,commandId:randomUUID(),expectedRevision:revision,movement,...(action==="advance"?{step:"settled"}:{paymentId:payment})});revision=v.revision;
  }
  payments.push(payment);
 }
 const allocate=async(index:number)=>{
  const c=opened[index]!;
  const command={version:"recovery-allocation-command.v1",action:"review",commandId:randomUUID(),caseId:c.id,paymentId:payments[index]!,evidenceId:x.evidence,expectedCaseRevision:c.revision,grossPence:index===0?38400:300000};
  const review=await allocator.command(x.context,x.actor,x.auth.digest,x.jobId,command);
  return allocator.command(x.context,x.actor,x.auth.digest,x.jobId,{...command,action:"allocate",commandId:randomUUID(),approvalHash:review.review!.approvalHash});
 };
 const reverse=async(index:number)=>{
  await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:payments[index]!,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional reversed receipt"});
  const view=await allocator.view(x.context,x.actor,x.auth.digest,x.jobId),a=view.allocations.find(a=>a.paymentId===payments[index])!,c=view.cases.find(c=>c.caseId===a.caseId)!;
  const command={version:"recovery-allocation-command.v1",action:"review_reverse",commandId:randomUUID(),allocationId:a.id,expectedCaseRevision:c.revision,grossPence:a.grossPence};
  const review=await allocator.command(x.context,x.actor,x.auth.digest,x.jobId,command);
  await allocator.command(x.context,x.actor,x.auth.digest,x.jobId,{...command,action:"reverse",commandId:randomUUID(),approvalHash:review.review!.approvalHash});
 };
 const fees=new SuccessFeeRepository(f.runtime);
 const review=(expectedPostingRevision=0)=>fees.command(x.context,x.jobId,x.auth.digest,{version:"success-fee-command.v1",action:"review",commandId:randomUUID(),expectedPostingRevision});
 const approve=(r:Awaited<ReturnType<typeof review>>)=>fees.command(x.context,x.jobId,x.auth.digest,{version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:r.postingRevision,reviewId:r.reviewId,statementHash:r.statementHash});
 return {...x,cases,opened,allocator,payments,allocate,reverse,fees,review,approve};
}
