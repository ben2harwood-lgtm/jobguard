import {randomUUID} from "node:crypto";
import {realReceiptFixture} from "./stored-receipt-case-fixture.js";
import type {FinalCheckFixture} from "./final-check-fixture.js";
import {StoredReceiptCaseAllocationRepository} from "../src/stored-receipt-case-allocation-repository.js";
import {RecoveryAttributionRepository} from "../src/recovery-attribution-repository.js";
import {SuccessFeeRepository} from "../src/success-fee-repository.js";
export async function catchFeeFixture(f:FinalCheckFixture,approved=true,twoCatches=false,stageSecondCatch=false){
 const x=await realReceiptFixture(f,"F7","receipt-line-allocation-command.v1",false,undefined,twoCatches);
 const subjects=[{caseId:x.caseId,workId:x.workId,line:x.line,fact:x.fact}];
 if(twoCatches){
  const rows=(await f.admin.query(`SELECT fl.id line,c.id case_id,s.work_id FROM app.final_account_line fl
   JOIN app.variation_revision vr ON vr.tenant_id=fl.tenant_id AND vr.id=fl.commercial_revision_id
   JOIN app.extra_origin o ON o.tenant_id=vr.tenant_id AND o.variation_id=vr.variation_id
   JOIN app.shadow_commercial_signal s ON s.tenant_id=o.tenant_id AND s.id=o.source_signal_id
   JOIN app.recovery_case c ON c.tenant_id=fl.tenant_id AND c.job_id=fl.job_id AND c.source_refs ? ('variation:'||vr.variation_id::text)
   WHERE fl.tenant_id=$1 AND fl.job_id=$2 AND fl.final_account_revision_id=$3 AND fl.id<>$4`,[x.context.tenantId,x.jobId,x.fact.invoiceBinding.revisionId,x.line])).rows;
  if(rows.length!==1)throw new Error("expected exactly two source-backed catches");
  const snapshot=await x.producer.readCurrent(x.context,x.actor,x.auth.digest,{jobId:x.jobId});
  for(const r of rows)subjects.push({caseId:r.case_id as string,workId:r.work_id as string,line:r.line as string,fact:snapshot.rows.find(v=>v.lineId===r.line)!});
 }
 const allocator=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo"),attribution=new RecoveryAttributionRepository(f.runtime);
 const assessments=[];
 const addSubject=async(subject:typeof subjects[number])=>{
  const revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,subject.caseId])).rows[0].revision as number;
  const p={version:"stored-receipt-case-command.v1",commandId:randomUUID(),action:"review",factLineId:subject.fact.lineAllocationId,caseId:subject.caseId,workId:subject.workId,expectedCaseRevision:revision};
  const review=await allocator.command(x.context,x.jobId,x.auth.digest,p);
  await allocator.command(x.context,x.jobId,x.auth.digest,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
  const selection={version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:subject.caseId,workId:subject.workId,lineId:subject.line,lockId:subject.fact.invoiceBinding.lockId,expectedCaseRevision:revision,expectedAttributionRevision:0};
  const assessment=await attribution.assess(x.context,x.jobId,x.auth.digest,selection);
  if(approved){
   const hash=(await f.admin.query("SELECT app.final_lock_hash($1::jsonb) hash",[assessment])).rows[0].hash as string;
   await attribution.approveReview(x.context,x.jobId,x.auth.digest,{...selection,action:"approve_review",commandId:randomUUID(),expectedAttributionRevision:assessment.revision,assessmentId:assessment.assessmentId,expectedSourceHash:assessment.sourceHash,reviewArtifactHash:hash});
  }
  assessments.push(assessment);
 };
 for(const subject of stageSecondCatch?subjects.slice(0,1):subjects)await addSubject(subject);
 const repo=new SuccessFeeRepository(f.runtime),command={version:"success-fee-command.v1",action:"review",commandId:randomUUID(),expectedPostingRevision:0};
 const execute=(p:unknown=command)=>repo.command(x.context,x.jobId,x.auth.digest,p);
 return {...x,repo,assessment:assessments[0]!,execute,command,addSecondCatch:()=>addSubject(subjects[1]!)};
}
