import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe,expect,it } from "vitest";
import { JobWorkStateRepository, WatchdogError, checkPostLockAfterLiveRefusal, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "@jobguard/db";
const testTenantContext=(tenantId:string)=>verifiedTenantContextFromMembership({tenantId,membershipId:randomUUID(),identityUserId:randomUUID()} as AuthenticatedMembership);
/** Scripted query-shape boundary only. Actual PostgreSQL isolation remains dispatcher evidence. */
describe("CH-4 read statements and context stamping",()=>{
 it("CH4-A20 a copied context is refused before a connection is acquired",async()=>{
  const stamped=testTenantContext(randomUUID());let connections=0;const pool={connect:async()=>{connections++;throw new Error("unexpected connection")}} as unknown as Pool;
  await expect(new JobWorkStateRepository(pool).read({...stamped},randomUUID(),"a".repeat(64))).rejects.toThrow("A verified tenant context");expect(connections).toBe(0);
 });
 it("CH4-A22 public read statement has no signal-count input or shadow query (scripted boundary)",async()=>{
  const tenantId=randomUUID(),jobId=randomUUID(),statements:string[]=[];
  const row={version:"job-work-state-read.v1",jobId,events:[],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};
  const pool={connect:async()=>({query:async(sql:string)=>{statements.push(sql);return {rows:sql.includes("ch4_read_work_facts")?[{result:row}]:[]}},release:()=>undefined})} as unknown as Pool;
  const repo=new JobWorkStateRepository(pool);expect(await repo.read(testTenantContext(tenantId),jobId,"a".repeat(64))).toEqual(row);
  expect(statements).toEqual(["BEGIN","SELECT set_config('app.tenant_id', $1, true)","SELECT app.ch4_read_work_facts($1,$2,$3) result","COMMIT"]);
  expect(statements.join(" ")).not.toMatch(/shadow|signal|finding/iu);
 });
});

describe("CH-4 post-lock offer after the original source refusal (scripted boundary)",()=>{
 it.each(["IDEMPOTENCY_CONFLICT","JOB_NOT_FOUND"] as const)("%s adds no membership or lifecycle query",async code=>{
  const pool={connect:async()=>{throw new Error("unexpected connection")}} as unknown as Pool;
  await checkPostLockAfterLiveRefusal(pool,testTenantContext(randomUUID()),randomUUID(),new WatchdogError(code),randomUUID());
 });
 it.each([false,true])("not-live locked source checks membership before offering party identities (active %s)",async active=>{
  const jobId=randomUUID(),tenantId=randomUUID(),actorId=randomUUID(),statements:string[]=[];
  const pool={connect:async()=>({query:async(sql:string)=>{
   statements.push(sql);
   return {rows:sql.includes("FROM app.membership")?(active?[{}]:[]):sql.includes("JOIN app.final_account_lock")?[{job_id:jobId,customer_id:randomUUID(),site_id:randomUUID()}]:[]};
  },release:()=>undefined})} as unknown as Pool;
  await expect(checkPostLockAfterLiveRefusal(pool,testTenantContext(tenantId),jobId,new WatchdogError("JOB_NOT_LIVE"),actorId)).rejects.toThrow(active?"POST_LOCK_WORK_REQUIRES_LINKED_JOB":"WORK_STATE_FORBIDDEN");
  expect(statements.some(sql=>sql.includes("JOIN app.final_account_lock"))).toBe(active);
  expect(statements.at(-1)).toBe("ROLLBACK");
 });
 it("not-live unlocked source preserves the original refusal and commits only the offer read",async()=>{
  const statements:string[]=[];
  const pool={connect:async()=>({query:async(sql:string)=>{statements.push(sql);return {rows:sql.includes("FROM app.membership")?[{}]:[]}},release:()=>undefined})} as unknown as Pool;
  const error=new WatchdogError("JOB_NOT_LIVE");
  await expect(checkPostLockAfterLiveRefusal(pool,testTenantContext(randomUUID()),randomUUID(),error,randomUUID())).resolves.toBeUndefined();
  expect(error.code).toBe("JOB_NOT_LIVE");expect(statements.at(-1)).toBe("COMMIT");
 });
});
