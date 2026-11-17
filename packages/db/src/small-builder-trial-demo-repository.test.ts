import { randomUUID } from "node:crypto";
import { afterEach,describe,expect,it } from "vitest";
import type { Pool } from "pg";
import { approvedTrialClockV1,trialDeadlineV1,trialDemoCommandV1 } from "@jobguard/core";
import { SmallBuilderTrialDemoRepository,trialDemoReport } from "./small-builder-trial-demo-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const tenant=randomUUID(),first=randomUUID(),second=randomUUID(),run=randomUUID();
const source=(jobId:string)=>({version:"trial-lifecycle-source.v1",environment:"synthetic_demo",tenantId:tenant,jobId,asOf:"2026-03-25T12:00:00.000000Z",start:null,target:null,events:[]});
const eligibility=(jobId:string)=>({version:"trial-eligibility-read.v1",environment:"synthetic_demo",hypothetical:true,jobId,jobRevision:0,targetStatus:"unavailable",reasons:["ADMISSION_DISABLED","KEY_CHECK_UNAVAILABLE"],identity:"unavailable",cardGate:"optional_first",cardAction:null,offerSkip:false,keyCheck:"unavailable",admission:"disabled",sources:{documentId:null,acceptanceId:null,partyBindingId:null,verificationId:null,cardResultId:null,termsId:null},revisionDigest:"a".repeat(64)});
const raw=()=>({version:"trial-demo-report.v1",environment:"synthetic_demo",runId:run,archived:false,snapshotId:null,first:source(first),second:source(second),firstEligibility:eligibility(first),secondEligibility:eligibility(second),subscription:{version:"subscription-persisted-read.v1",hypothetical:true,environment:"synthetic_demo",...Object.fromEntries(["agreements","changes","changeOutcomes","periods","statements","reviews","work","attempts","results","corrections","alerts","onboarding","periodLines","placeBindings","places","statementLines","operationsCards"].map(key=>[key,[]]))}});
const old=process.env.JOBGUARD_ENV;afterEach(()=>{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;});
describe("DEMO-J5 attacks against command and source boundaries",()=>{
 it.each(["tenantId","now","asOf","completed","settled","releaseTrialKey","acceptedAt","amountPence","firstSource"])("refuses browser-owned %s",key=>{
  expect(trialDemoCommandV1.safeParse({version:"trial-demo-command.v1",action:"snapshot",runId:run,commandId:randomUUID(),[key]:true}).success).toBe(false);
 });
 it("refuses two roles for one job and rejects a foreign run/company/source",()=>{
  expect(trialDemoCommandV1.safeParse({version:"trial-demo-command.v1",action:"bind",runId:run,commandId:randomUUID(),firstJobId:first,secondJobId:first}).success).toBe(false);
  expect(()=>trialDemoReport(tenant,randomUUID(),raw())).toThrow();
  expect(()=>trialDemoReport(randomUUID(),run,raw())).toThrow();
  expect(()=>trialDemoReport(tenant,run,{...raw(),firstEligibility:eligibility(second)})).toThrow();
 });
 it("missing start remains visibly incomplete without inventing a clock or settlement",()=>{
  const report=trialDemoReport(tenant,run,raw());expect(report.status).toBe("incomplete");expect(report.first.timeline).toBeNull();expect(report.deadlinePreview).toBeNull();expect(report.subscription.results).toEqual([]);
 });
 it("projects the stored London deadline across DST without mutating source or accepted terms",()=>{
  const base=raw(),startedAt="2026-03-01T12:00:00.123456Z",start={trialId:randomUUID(),activationId:randomUUID(),startedAt,deadlineAt:trialDeadlineV1(startedAt,approvedTrialClockV1).deadlineAt};
  const input={...base,first:{...base.first,start}};const before=JSON.stringify(input);
  const report=trialDemoReport(tenant,run,input);expect(report.first.timeline?.active).toBe(true);expect(report.deadlinePreview?.active).toBe(false);expect(report.deadlinePreview?.endedAt).toBe(start.deadlineAt);expect(JSON.stringify(input)).toBe(before);
 });
 it.each(["lock","close","second_activation"] as const)("uses real persisted %s source at its exact boundary",kind=>{
  const base=raw(),startedAt="2026-03-01T12:00:00.000000Z",event={sourceId:randomUUID(),kind,tenantId:tenant,jobId:kind==="second_activation"?second:first,effectiveAt:"2026-03-20T12:00:00.000000Z",recordedAt:"2026-03-20T12:00:00.000001Z"};
  const report=trialDemoReport(tenant,run,{...base,first:{...base.first,start:{trialId:randomUUID(),activationId:randomUUID(),startedAt,deadlineAt:trialDeadlineV1(startedAt,approvedTrialClockV1).deadlineAt},events:[event,event]}});
  expect(report.first.timeline?.sourceIds).toEqual([event.sourceId]);expect(report.first.timeline?.endedAt).toBe(event.effectiveAt);
 });
 it("refuses production before SQL, and rolls back mismatched persisted subjects",async()=>{
  const statements:string[]=[];const pool={connect:async()=>({query:async(sql:string)=>{statements.push(sql);return {rows:[{result:{...raw(),runId:randomUUID()}}]};},release(){}})} as unknown as Pool;
  const repo=new SmallBuilderTrialDemoRepository(pool),input={version:"trial-demo-command.v1",action:"read",runId:run};
  process.env.JOBGUARD_ENV="production";await expect(repo.execute(verifiedTenantContextForQueuedJob(tenant),"a".repeat(64),input)).rejects.toThrow("DEMO_SYNTHETIC_ONLY");expect(statements).toEqual([]);
  process.env.JOBGUARD_ENV="synthetic_demo";await expect(repo.execute(verifiedTenantContextForQueuedJob(tenant),"a".repeat(64),input)).rejects.toThrow("DEMO_UNAVAILABLE");expect(statements.at(-1)).toBe("ROLLBACK");
 });
});
