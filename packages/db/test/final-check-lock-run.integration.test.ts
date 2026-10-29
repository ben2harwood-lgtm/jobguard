// RED SV-5: real restricted pools and routines; CI only in the builder sandbox.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, insertFinalCheckEvidence, finalCheckTenant, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { executeFinalCheckTask } from "../../../apps/api/src/final-check-task-executor.js";
let f:FinalCheckFixture;
beforeAll(async()=>{vi.stubEnv("JOBGUARD_ENV","synthetic_demo");f=await createFinalCheckFixture();},60000);
afterAll(async()=>{await closeFinalCheckFixture(f);vi.unstubAllEnvs();});
function runner(){
 const repo=new FinalCheckRepository(f.shadow),completion=new FinalCheckCompletionRepository(f.shadow);
 const worker=new FinalCheckWorker(practiceFinalCheckPorts(f.shadow,f.runtime,"f".repeat(64)),"synthetic_demo");
 return {repo,ports:{read:repo.manifest.bind(repo),execute:worker.execute.bind(worker),publish:completion.publish.bind(completion)}};
}
it("lock and exact command replay create one durable request; request-role access stays denied",async()=>{
 const a=await seedFinalCheckJob(f),commandId=randomUUID(),locks=new FinalAccountLockRepository(f.runtime);
 const command={jobId:a.jobId,actorMembershipId:FINAL_CHECK_ACTOR,commandId,finalAccountRevisionId:a.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1" as const};
 expect((await f.admin.query("SELECT 1 FROM infrastructure.final_check_request WHERE job_id=$1",[a.jobId])).rowCount).toBe(0);
 await locks.lock(a.context,command);await locks.lock(a.context,command);
 await new FinalCheckRepository(f.runtime).requestRun(a.context,a.jobId,a.digest);
 expect((await f.admin.query("SELECT 1 FROM infrastructure.final_check_request WHERE job_id=$1",[a.jobId])).rowCount).toBe(1);
 await expect(f.runtime.query("SELECT * FROM infrastructure.final_check_request")).rejects.toThrow();
 await expect(f.runtime.query("SELECT app.request_practice_final_check_on_lock()")).rejects.toThrow();
});
it("actual worker completion and redelivery preserve one classification run and one certificate",async()=>{
 const a=await seedFinalCheckJob(f);await a.lock();const {repo,ports}=runner(),m=await repo.begin(a.context,a.jobId);
 const task={version:"final-check-task.v1",tenantId:a.tenantId,jobId:a.jobId,lockId:m.lockId,manifestId:m.id,executionId:randomUUID()};
 await executeFinalCheckTask(a.context,task,ports,"synthetic_demo");
 await executeFinalCheckTask(a.context,{...task,executionId:randomUUID()},ports,"synthetic_demo");
 const fresh=await repo.manifest(a.context,a.jobId,m.id);
 expect(fresh.result).toMatchObject({zeroResult:true,lockId:m.lockId});
 expect(await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).toMatchObject({state:"completed",items:[]});
 expect((await f.admin.query("SELECT id,run_id FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{id:m.id,run_id:fresh.result!.runId}]);
 expect((await f.admin.query("SELECT 1 FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rowCount).toBe(1);
 const before=JSON.stringify(fresh.result);
 await expect(executeFinalCheckTask(testTenantContext(randomUUID()),task,ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_TASK_TENANT_MISMATCH");
 for(const forged of [{jobId:randomUUID()},{lockId:randomUUID()},{manifestId:randomUUID()}])await expect(executeFinalCheckTask(a.context,{...task,...forged},ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
 expect(JSON.stringify((await repo.manifest(a.context,a.jobId,m.id)).result)).toBe(before);
});
it("an unknown source stays unsupported on retry, cannot certify a zero or unblock invoice authority",async()=>{
 const a=await seedFinalCheckJob(f);await insertFinalCheckEvidence(f,a);await a.lock();
 const {repo,ports}=runner(),m=await repo.begin(a.context,a.jobId);
 const task={version:"final-check-task.v1",tenantId:a.tenantId,jobId:a.jobId,lockId:m.lockId,manifestId:m.id,executionId:randomUUID()};
 for(let retry=0;retry<2;retry++)await expect(executeFinalCheckTask(a.context,task,ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_PENDING");
 const fresh=await repo.manifest(a.context,a.jobId,m.id);
 expect(fresh.sources[0]).toMatchObject({status:"unsupported"});expect(fresh.result).toBeNull();
 expect((await f.admin.query("SELECT 1 FROM app.final_account_lock_check WHERE job_id=$1",[a.jobId])).rowCount).toBe(0);
 await expect(finalCheckTenant(f.admin,a.tenantId,db=>db.query("SELECT * FROM app.require_authoritative_final_check($1,$2)",[a.tenantId,a.jobId]))).rejects.toThrow("FINAL_CHECK_NOT_COMPLETE");
});
it("a job without a practice session does not auto-request work",async()=>{
 const a=await seedFinalCheckJob(f);
 await finalCheckTenant(f.admin,a.tenantId,async db=>{
  // Privileged fixture removes the practice session; no production capability is activated.
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("UPDATE app.job SET practice_session_digest=NULL WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId]);
 });
 await a.lock();expect((await f.admin.query("SELECT 1 FROM infrastructure.final_check_request WHERE job_id=$1",[a.jobId])).rowCount).toBe(0);
});

it("0400 upgrades without changing existing locks or privileges and migrate replays safely",async()=>{
 const {readFile}=await import("node:fs/promises"),{MIGRATION_URLS,migrate}=await import("../src/migrate.js");
 const {installLegacySyntheticPartyFixtures}=await import("./pool-test-utils.js");
 const u=await createFinalCheckFixture(false);
 try{
  const index=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("/0400_final_check_lock_request.sql"));expect(index).toBeGreaterThan(0);
  await u.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,index)){await u.admin.query(await readFile(url,"utf8"));await u.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);}
  await u.admin.query(`GRANT jobguard_runtime TO ${u.runtime.options.user}`);await u.admin.query(`GRANT jobguard_shadow TO ${u.shadow.options.user}`);
  await installLegacySyntheticPartyFixtures(u.admin);
  const a=await seedFinalCheckJob(u);await a.lock();
  const before=await u.admin.query("SELECT to_jsonb(l) row FROM app.final_account_lock l WHERE job_id=$1",[a.jobId]);
  await migrate(u.admin);await migrate(u.admin);
  expect((await u.admin.query("SELECT to_jsonb(l) row FROM app.final_account_lock l WHERE job_id=$1",[a.jobId])).rows).toEqual(before.rows);
  expect((await u.admin.query("SELECT 1 FROM infrastructure.final_check_request WHERE job_id=$1",[a.jobId])).rowCount).toBe(0);
  const acl=(await u.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,
   has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,
   has_function_privilege('jobguard_shadow',oid,'EXECUTE') shadow,
   has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure
   FROM pg_proc WHERE oid='app.request_practice_final_check_on_lock()'::regprocedure`)).rows[0];
  expect(acl).toEqual({owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog, app, infrastructure"],runtime:false,shadow:false,infrastructure:false});
  const b=await seedFinalCheckJob(u);await b.lock();
  expect((await u.admin.query("SELECT 1 FROM infrastructure.final_check_request WHERE job_id=$1",[b.jobId])).rowCount).toBe(1);
 }finally{await closeFinalCheckFixture(u);}
},120000);
