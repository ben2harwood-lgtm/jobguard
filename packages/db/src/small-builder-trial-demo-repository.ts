import type { Pool } from "pg";
import { z } from "zod";
import { trialDemoCommandV1, trialDeadlineV1, approvedTrialClockV1, reduceTrialEndsV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { SmallBuilderDemoError } from "./small-builder-demo-repository.js";
import { trialLifecycleSourceV1, projectTrialLifecycle } from "./free-first-job-lifecycle-repository.js";
import { trialEligibilityReadV1 } from "./free-first-job-eligibility-repository.js";
import { subscriptionPersistedReadV1 } from "./subscription-repository.js";
const reportV1=z.object({version:z.literal("trial-demo-report.v1"),environment:z.literal("synthetic_demo"),runId:z.uuid(),
 archived:z.boolean(),snapshotId:z.uuid().nullable(),first:trialLifecycleSourceV1,second:trialLifecycleSourceV1,
 firstEligibility:trialEligibilityReadV1,secondEligibility:trialEligibilityReadV1,subscription:subscriptionPersistedReadV1}).strict();
/** The boundary clock is a projection from the stored start, never a clock for commands or billing. */
export function trialDemoReport(tenantId:string,runId:string,raw:unknown){
 const value=reportV1.parse(raw);
 if(value.runId!==runId||value.first.jobId===value.second.jobId
  ||value.firstEligibility.jobId!==value.first.jobId||value.secondEligibility.jobId!==value.second.jobId)throw new SmallBuilderDemoError("DEMO_UNAVAILABLE");
 const first=projectTrialLifecycle(tenantId,value.first.jobId,value.first),second=projectTrialLifecycle(tenantId,value.second.jobId,value.second);
 const start=first.start;
 const boundary=start?trialDeadlineV1(start.startedAt,approvedTrialClockV1):null;
 const atDeadline=start&&boundary?reduceTrialEndsV1({version:"trial-end-input.v1",trialId:start.trialId,tenantId,jobId:first.jobId,
  startedAt:start.startedAt,asOf:boundary.deadlineAt,deadline:boundary,events:first.events}):null;
 return {...value,first,second,deadlinePreview:atDeadline,status:"incomplete" as const,
  missing:["Capacity admission must succeed through the existing producer before a first trial can start.","Final Check, subscription pro-ration and collection require their downstream producer journeys."],
  pricesAndLegalWording:"[BEN TO SUPPLY]" as const};
}
export type TrialDemoReport=ReturnType<typeof trialDemoReport>;
export class SmallBuilderTrialDemoRepository {
 constructor(private readonly pool:Pool){}
 async execute(context:VerifiedTenantContext,digest:string,raw:unknown):Promise<TrialDemoReport>{
  const parsed=trialDemoCommandV1.safeParse(raw);
  if(!parsed.success||!/^[a-f0-9]{64}$/u.test(digest))throw new SmallBuilderDemoError("INVALID_DEMO_INPUT");
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new SmallBuilderDemoError("DEMO_SYNTHETIC_ONLY");
  try{return await withTenant(this.pool,context,async db=>{
   const result=(await db.$client.query("SELECT app.demo_trial($1,$2,$3::jsonb) result",[context.tenantId,digest,JSON.stringify(parsed.data)])).rows[0]?.result;
   return trialDemoReport(context.tenantId,parsed.data.runId,result);
  });}catch(error){
   const message=error instanceof Error?error.message:"";
   if(["METER_FORBIDDEN","FREE_FIRST_JOB_ACCESS_DENIED"].includes(message))throw new SmallBuilderDemoError("DEMO_FORBIDDEN");
   const codes=["DEMO_NOT_FOUND","DEMO_COMMAND_CONFLICT","DEMO_ARCHIVED","DEMO_SYNTHETIC_ONLY","INVALID_DEMO_INPUT"] as const;
   for(const code of codes)if(message===code)throw new SmallBuilderDemoError(code);
   throw new SmallBuilderDemoError("DEMO_UNAVAILABLE");
  }
 }
}
