import {randomUUID} from "node:crypto";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import type {FinalCheckFixture} from "./final-check-fixture.js";
import {StoredReceiptCaseAllocationRepository} from "../src/stored-receipt-case-allocation-repository.js";
import {RecoveryAttributionRepository} from "../src/recovery-attribution-repository.js";
import {SuccessFeeRepository} from "../src/success-fee-repository.js";
export async function catchFeeFixture(f:FinalCheckFixture,approved=true,collection282=false){
 const x=await realReceiptFixture(f,"F7","receipt-line-allocation-command.v1",false,collection282);
 const revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.caseId])).rows[0].revision as number;
 const facts=collection282?(await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId})).rows.filter(r=>r.lineId===x.line):[x.fact];
 const allocator=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo");
 for(const fact of facts){
 const p={version:"stored-receipt-case-command.v1",commandId:randomUUID(),action:"review",factLineId:fact.lineAllocationId,caseId:x.caseId,workId:x.workId,expectedCaseRevision:revision};
 const review=await allocator.command(x.context,x.jobId,x.auth.digest,p);
 await allocator.command(x.context,x.jobId,x.auth.digest,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 }
 const attribution=new RecoveryAttributionRepository(f.runtime),selection={version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,lineId:x.line,lockId:x.fact.invoiceBinding.lockId,expectedCaseRevision:revision,expectedAttributionRevision:0};
 const assessment=await attribution.assess(x.context,x.jobId,x.auth.digest,selection);
 if(approved){
  const hash=(await f.admin.query("SELECT app.final_lock_hash($1::jsonb) hash",[assessment])).rows[0].hash as string;
  await attribution.approveReview(x.context,x.jobId,x.auth.digest,{...selection,action:"approve_review",commandId:randomUUID(),expectedAttributionRevision:assessment.revision,assessmentId:assessment.assessmentId,expectedSourceHash:assessment.sourceHash,reviewArtifactHash:hash});
 }
 const repo=new SuccessFeeRepository(f.runtime),command={version:"success-fee-command.v1",action:"review",commandId:randomUUID(),expectedPostingRevision:0};
 const execute=(p:unknown=command)=>repo.command(x.context,x.jobId,x.auth.digest,p);
 return {...x,repo,assessment,execute,command};
}
