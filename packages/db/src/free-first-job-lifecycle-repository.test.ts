import { randomUUID } from "node:crypto";
import { describe,it,expect,afterEach } from "vitest";
import type { Pool } from "pg";
import { approvedTrialClockV1,trialDeadlineV1 } from "@jobguard/core";
import { projectTrialLifecycle,FreeFirstJobLifecycleRepository,trialSwitchLiveV1,TrialActivationMutation } from "./free-first-job-lifecycle-repository.js";
import type { TenantTransaction } from "./tenant-context.js";
import type { ConsequentialCommand } from "./commands.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const tenant=randomUUID(),job=randomUUID(),trial=randomUUID(),activation=randomUUID();
const source=()=>({version:"trial-lifecycle-source.v1",environment:"synthetic_demo",tenantId:tenant,jobId:job,asOf:"2026-04-30T23:59:59.999999Z",target:null,
 start:{trialId:trial,activationId:activation,startedAt:"2026-04-01T12:00:00.123456Z",deadlineAt:trialDeadlineV1("2026-04-01T12:00:00.123456Z",approvedTrialClockV1).deadlineAt},events:[]});
const old=process.env.JOBGUARD_ENV;afterEach(()=>{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;});
describe("MON-3 lifecycle boundary",()=>{
 it("locks the tenant-qualified job before company authority and rejects a different actor",async()=>{
  process.env.JOBGUARD_ENV="synthetic_demo";
  const statements:{sql:string;values:unknown[]}[]=[],actor=randomUUID();
  const db={$client:{query:async(sql:string,values:unknown[])=>{
   statements.push({sql,values});return {rows:[{actor}]};
  }}} as unknown as TenantTransaction;
  const input={version:"trial-switch-live.v1" as const,commandId:randomUUID(),jobId:job,acceptedDocumentId:randomUUID(),acceptedDocumentVersion:1,acceptedDocumentHash:"a".repeat(64),expectedJobRevision:1};
  const mutation=new TrialActivationMutation(tenant,"a".repeat(64),input);
  await mutation.lock(db,{actorMembershipId:actor} as ConsequentialCommand);
  expect(statements).toEqual([
   {sql:"SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE",values:[tenant,job]},
   {sql:"SELECT app.mon3_owner($1,$2) actor",values:[tenant,"a".repeat(64)]},
  ]);
  await expect(mutation.lock(db,{actorMembershipId:randomUUID()} as ConsequentialCommand)).rejects.toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
 });
 it("retains immutable microseconds and derives an as-of end without writes",()=>{
  const raw=source(),id=randomUUID();const event={sourceId:id,kind:"lock",tenantId:tenant,jobId:job,effectiveAt:"2026-04-20T12:00:00.123456Z",recordedAt:"2026-04-20T12:00:00.123457Z"};
  const read=projectTrialLifecycle(tenant,job,{...raw,events:[event,event]});
  expect(read.timeline?.endedAt).toBe(event.effectiveAt);expect(read.timeline?.sourceIds).toEqual([id]);expect(read.start?.startedAt).toBe(raw.start.startedAt);
  expect(projectTrialLifecycle(tenant,job,{...raw,events:[{...event,recordedAt:"2026-05-01T00:00:00.000000Z"}]}).timeline?.active).toBe(true);
 });
 it("rejects foreign company/job, clock mutation and conflicting source replays",()=>{
  expect(()=>projectTrialLifecycle(randomUUID(),job,source())).toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
  expect(()=>projectTrialLifecycle(tenant,randomUUID(),source())).toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
  expect(()=>projectTrialLifecycle(tenant,job,{...source(),start:{...source().start,deadlineAt:"2026-07-02T00:00:00.000000Z"}})).toThrow();
  expect(trialSwitchLiveV1.safeParse({version:"trial-switch-live.v1",commandId:randomUUID(),jobId:job,acceptedDocumentId:randomUUID(),acceptedDocumentVersion:1,acceptedDocumentHash:"a".repeat(64),expectedJobRevision:1,skipCard:true}).success).toBe(false);
 });
 it("refuses non-synthetic calls before database access and rolls back foreign output",async()=>{
  process.env.JOBGUARD_ENV="production";await expect(new FreeFirstJobLifecycleRepository({} as Pool).read(verifiedTenantContextForQueuedJob(tenant),"a".repeat(64),job)).rejects.toThrow("FREE_FIRST_JOB_SYNTHETIC_ONLY");
  process.env.JOBGUARD_ENV="synthetic_demo";const statements:string[]=[];
  const pool={connect:async()=>({query:async(sql:string)=>{statements.push(sql);return {rows:[{result:{...source(),tenantId:randomUUID()}}]};},release(){}})} as unknown as Pool;
  await expect(new FreeFirstJobLifecycleRepository(pool).read(verifiedTenantContextForQueuedJob(tenant),"a".repeat(64),job)).rejects.toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
  expect(statements.at(-1)).toBe("ROLLBACK");expect(statements).not.toContain("COMMIT");
 });
});
