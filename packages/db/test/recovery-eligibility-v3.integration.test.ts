// Written before migration/repository implementation. NOT RUN in the builder sandbox.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, MIGRATION_URLS, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, withTenant } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import type { TenantTransaction } from "../src/tenant-context.js";
const ctx=testTenantContext(T), actor={membershipId:M,identityUserId:U};
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,directory:string;
const previousEnvironment=process.env.JOBGUARD_ENV;
let legacy:unknown[];
const oldJob=randomUUID(),oldCase=randomUUID();
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";directory=await mkdtemp(join(tmpdir(),"jg-ch7-"));const port=await freePort(60500,150);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await postgres.initialise();await postgres.start();
 admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 const index=MIGRATION_URLS.findIndex(u=>basename(fileURLToPath(u))==="0119_recovery_eligibility_v3.sql");expect(index).toBeGreaterThan(MIGRATION_URLS.findIndex(u=>basename(fileURLToPath(u))==="0112_recovery_follow_up.sql"));
 const names=MIGRATION_URLS.map(u=>basename(fileURLToPath(u)));expect(names).toEqual([...names].sort());
 for(const url of MIGRATION_URLS.slice(0,index)){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[basename(fileURLToPath(url))]);}
 await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[T]);await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[U]);await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'CH-7 synthetic')",[A,T]);await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
 await admin.query("INSERT INTO app.job(id,tenant_id,title)VALUES($1,$2,'Previous schema')",[oldJob,T]);
 await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence)VALUES($1,$2,$3,32000)",[oldCase,T,oldJob]);
 await admin.query(`INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)VALUES($1,$2,$3,$4,1,1,1,'reference-d03.v1',1,'pending_money','excluded',NULL,'GBP','Pending money cannot qualify','[]','reviewed','reviewer:previous',$5,$6)`,[randomUUID(),T,oldJob,oldCase,randomUUID(),"a".repeat(64)]);
 legacy=(await admin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_eligibility_revision r")).rows;
 await migrate(admin);await migrate(admin);
 await admin.query("CREATE ROLE ch7_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO ch7_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"ch7_login",password:"synthetic"});
});
afterAll(async()=>{if(previousEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousEnvironment;await closeTestPools(runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});});
async function fixture(type="withheld_customer_payment",before=false){
 const sessionId=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,sessionId),jobId=randomUUID();
 await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'CH-7 generated job',$3,'capture')",[jobId,T,auth.digest]);
 const cases=new RecoveryCaseRepository(practiceMaterialPool(runtime,auth.digest)),feed=new PracticeFeedRepository(runtime,"synthetic_demo");let revision=0;
 const advance=async(movement:string,step="settled")=>{const reply=await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:revision,action:revision===0?"connect":"advance",...(revision===0?{}:{movement,step})});revision=reply.revision;};
 await advance("receipt-384");if(before)await advance("receipt-384");
 const c=await cases.command(ctx,jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:type,claimedNetPence:300000,counterparty:"Fictional debtor",book:type==="withheld_customer_payment"?"builder_customer":"supplier_cost",sourceType:type==="withheld_customer_payment"?"customer_invoice":"supplier_documents",sourceRefs:type==="withheld_customer_payment"?["Generated customer invoice INV-18800"]:["Supplier invoice INV-320"],expectedRevision:0},actor);
 return {auth,jobId,c,cases,advance,repo:new RecoveryEligibilityV3Repository(practiceMaterialPool(runtime,auth.digest),"synthetic_demo")};
}
const review=(c:{id:string;revision:number},fixture:string,expectedReviewRevision=0)=>({version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,expectedReviewRevision,fixture});
it.each([["F15","merchant_overcharge",0,"Credit note below the £250 minimum"],["F17","duplicate_supplier_payment",45000,null],["F18","withheld_customer_payment",262000,"Fixed statutory compensation is not part of the fee base"],["F19","withheld_customer_payment",250000,"Fixed statutory compensation is not part of the fee base"],["F20","withheld_customer_payment",0,"Paid before you opened this case"],["F21","merchant_overcharge",0,null],["F22","prevention",0,"Prevented spending is not recovered cash"]] as const)("DW1 %s uses M4-7-S facts and persists exact Q/reason",async(name,type,q,reason)=>{
 const f=await fixture(type,name==="F20");if(name!=="F20"&&name!=="F15")await f.advance(name==="F17"?"supplier-refund-540":"receipt-3000");
 const command=review(f.c,name),r=await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);
 expect(r.result).toMatchObject({qualifyingPrincipal:{pence:q,currency:"GBP"},reason,outcome:q>0?"eligible_for_review":"excluded",terminal:name==="F22",productionEnabled:false});
 if(["F15","F21","F22"].includes(name))expect(r.sourceEventId).toBeNull();
 else expect((await admin.query("SELECT tenant_id,job_id,event_kind,movement_key,gross_pence FROM app.practice_feed_event WHERE tenant_id=$1 AND id=$2",[T,r.sourceEventId])).rows).toEqual([{tenant_id:T,job_id:f.jobId,event_kind:"settled",movement_key:name==="F17"?"supplier-refund-540":name==="F20"?"receipt-384":"receipt-3000",gross_pence:name==="F17"?"54000":name==="F20"?"38400":"300000"}]);
 const rows=(await f.cases.listForMember(ctx,f.jobId,actor));expect(rows.find(c=>c.id===f.c.id)?.eligibilityV3).toEqual(r);
 expect(await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest)).toEqual(r);
 await expect(f.repo.review(ctx,f.jobId,{...command,fixture:name==="F18"?"F19":"F18"},actor,f.auth.digest)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
 if(name==="F18"||name==="F19"){
  const lines=(await admin.query("SELECT kind,debtor_type,net_pence FROM app.recovery_claim_line WHERE tenant_id=$1 AND case_id=$2 ORDER BY kind",[T,f.c.id])).rows;
  expect(lines).toEqual([{kind:"fixed_compensation",debtor_type:name==="F19"?"individual":"business",net_pence:"7000"},{kind:"principal",debtor_type:name==="F19"?"individual":"business",net_pence:"250000"},{kind:"statutory_interest",debtor_type:name==="F19"?"individual":"business",net_pence:"12000"}]);
 }
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2",[T,f.jobId])).rows[0].n).toBe(0);
});
it("DW4 migration preserves previous reviews byte-for-byte and version",async()=>{expect((await admin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_eligibility_revision r")).rows).toEqual(legacy);});
it("rejects stale/rebound fixtures, injected fields, cross-job and revoked authority including replay",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const command=review(f.c,"F18"),r=await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);
 await expect(f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest)).rejects.toThrow("ELIGIBILITY_STALE_REVISION");
 await expect(f.repo.review(ctx,f.jobId,review(f.c,"F19",r.revision),actor,f.auth.digest)).rejects.toThrow("ELIGIBILITY_FIXTURE_MISMATCH");
 for(const field of [{category:"merchant_overcharge"},{debtorType:"business"},{settlement:"settled"},{Q:262000},{termsStatus:"approved"}])await expect(f.repo.review(ctx,f.jobId,{...command,...field},actor,f.auth.digest)).rejects.toThrow();
 await expect(f.repo.review(ctx,oldJob,command,actor,f.auth.digest)).rejects.toThrow();
 await expect(f.repo.review(testTenantContext(randomUUID()),f.jobId,command,actor,f.auth.digest)).rejects.toThrow();
 await admin.query("UPDATE app.membership SET revoked_at=now() WHERE id=$1 AND tenant_id=$2",[M,T]);
 try{await expect(f.repo.review(ctx,f.jobId,command,actor,f.auth.digest)).rejects.toThrow();}finally{await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE id=$1 AND tenant_id=$2",[M,T]);}
});
it("pending movements and replayed statement representations do not invent qualifying cash",async()=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540","pending");
 const pending=await f.repo.review(ctx,f.jobId,review(f.c,"F17"),actor,f.auth.digest);expect(pending.result.qualifyingPrincipal.pence).toBe(0);
 await f.advance("supplier-refund-540");const settled=await f.repo.review(ctx,f.jobId,review(f.c,"F17",pending.revision),actor,f.auth.digest);expect(settled.result.qualifyingPrincipal.pence).toBe(45000);
 await f.advance("supplier-refund-540","alternate_representation");expect((await f.repo.review(ctx,f.jobId,review(f.c,"F17",settled.revision),actor,f.auth.digest)).result.qualifyingPrincipal.pence).toBe(45000);
});
it("catalogs and runtime enforce FORCE RLS, ownership, append-only and job/case-qualified links",async()=>{
 for(const name of ["guard_recovery_eligibility_v3","require_recovery_eligibility_v3_effect","prevent_recovery_eligibility_v3_mutation"])expect((await admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[`app.${name}()`])).rows).toEqual([{allowed:false}]);
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line","supplier_credit_consumption"]){
  expect((await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"}]);
  for(const sql of [`UPDATE app.${table} SET job_id=job_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(withTenant(runtime,ctx,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});
  expect((await runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
 }
 const f=await fixture();await f.advance("receipt-3000");const r=await f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest);
 // Real FK backstop (migration connection), with the case and review pointing at a different job.
 const connection=await admin.connect();
 try{
  await connection.query("BEGIN");await connection.query("ALTER TABLE app.recovery_claim_line DISABLE TRIGGER recovery_claim_line_guard");
  await expect(connection.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'principal','business',250000)",[randomUUID(),T,oldJob,f.c.id,r.id])).rejects.toMatchObject({code:"23503"});
 }finally{await connection.query("ROLLBACK");connection.release();}
 const bytes=JSON.stringify(r.result);
 await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,99,2,'F18',$5,$6,$7,$8)",[randomUUID(),T,f.jobId,f.c.id,M,randomUUID(),createHash("sha256").update(bytes).digest("hex"),bytes]))).rejects.toThrow();
});

it("B2 refuses customer receipts as supplier-invoice settlement without writing credit/review rows",async()=>{
 const f=await fixture("merchant_overcharge");await f.advance("receipt-3000");
 for(const name of ["F14","F16-partial","F16-full"])await expect(f.repo.review(ctx,f.jobId,review(f.c,name),actor,f.auth.digest)).rejects.toMatchObject({code:"ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE"});
 for(const table of ["supplier_credit_consumption","recovery_eligibility_v3_review","recovery_claim_line"])expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND case_id=$2`,[T,f.c.id])).rows[0].n).toBe(0);
});
it("source updates yield a new immutable review and races append one revision",async()=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540");
 const initialCommand=review(f.c,"F17"),initial=await f.repo.review(ctx,f.jobId,initialCommand,actor,f.auth.digest);
 await f.advance("supplier-refund-540","unknown_duplicate");
 const outcomes=await Promise.allSettled([f.repo.review(ctx,f.jobId,review(f.c,"F17",initial.revision),actor,f.auth.digest),f.repo.review(ctx,f.jobId,review(f.c,"F17",initial.revision),actor,f.auth.digest)]);
 expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(outcomes.filter(x=>x.status==="rejected")).toHaveLength(1);
 const rows=(await admin.query("SELECT revision,result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision",[T,f.c.id])).rows;
 expect(rows.map(r=>r.result.qualifyingPrincipal.pence)).toEqual([45000,0]);expect(rows[0].result).toEqual(initial.result);
 expect(await f.repo.review(ctx,f.jobId,initialCommand,actor,f.auth.digest)).toEqual(initial);
});
it("append-only triggers deny an owner rewrite, and failures after write roll back review/components/audit",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const command=review(f.c,"F18");
 await admin.query("CREATE FUNCTION app.ch7_test_audit_failure()RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='recovery.eligibility.v3_reviewed' THEN RAISE EXCEPTION 'injected audit failure';END IF;RETURN NEW;END $$; CREATE TRIGGER ch7_test_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.ch7_test_audit_failure()");
 try{await expect(f.repo.review(ctx,f.jobId,command,actor,f.auth.digest)).rejects.toThrow("injected audit failure");}finally{await admin.query("DROP TRIGGER ch7_test_audit_failure ON app.audit_event;DROP FUNCTION app.ch7_test_audit_failure()");}
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line"])expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND case_id=$2`,[T,f.c.id])).rows[0].n).toBe(0);
 const r=await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);
 await expect(admin.query("UPDATE app.recovery_eligibility_v3_review SET result=result WHERE tenant_id=$1 AND id=$2",[T,r.id])).rejects.toMatchObject({code:"42501"});
 await expect(admin.query("DELETE FROM app.recovery_claim_line WHERE tenant_id=$1 AND review_id=$2",[T,r.id])).rejects.toMatchObject({code:"42501"});
});
it("malformed tenant context fails closed, runtime grants are exact, and pooling clears context",async()=>{
 const connection=await runtime.connect();
 try{
  await connection.query("BEGIN");await connection.query("SELECT set_config('app.tenant_id','not-a-uuid',true)");
  await expect(connection.query("SELECT * FROM app.recovery_claim_line")).rejects.toMatchObject({code:"22P02"});
 }finally{await connection.query("ROLLBACK");connection.release();}
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line","supplier_credit_consumption"]){
  const grants=(await admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') s,has_table_privilege('jobguard_runtime',$1,'INSERT') i,has_table_privilege('jobguard_runtime',$1,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') forbidden",[`app.${table}`])).rows;
  expect(grants).toEqual([{s:true,i:true,forbidden:false}]);expect((await runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
 }
});
it("a database guard refusal has the same typed code as the application, with no committed effect",async()=>{
 const f=await fixture();await f.advance("receipt-3000");
 await admin.query("CREATE FUNCTION app.ch7_test_guard_failure()RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ELIGIBILITY_STALE_REVISION' USING ERRCODE='40001';END $$;CREATE TRIGGER ch7_test_guard_failure BEFORE INSERT ON app.recovery_eligibility_v3_review FOR EACH ROW EXECUTE FUNCTION app.ch7_test_guard_failure()");
 try{await expect(f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest)).rejects.toMatchObject({code:"ELIGIBILITY_STALE_REVISION"});}finally{await admin.query("DROP TRIGGER ch7_test_guard_failure ON app.recovery_eligibility_v3_review;DROP FUNCTION app.ch7_test_guard_failure()");}
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2",[T,f.c.id])).rows[0].n).toBe(0);
});
it("runtime cannot put compensation into Q or alter a generated component's exact pence",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const saved=await f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest);
 const rollback=new Error("CH-7 intentional rollback");
 const insert=async(db:TenantTransaction,result:unknown)=>{
  const id=randomUUID();await db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,2,$5,'F18',$6,$7,$8,$9,$10)",[id,T,f.jobId,f.c.id,f.c.revision,saved.sourceEventId,M,randomUUID(),"a".repeat(64),JSON.stringify(result)]);return id;
 };
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  await expect(insert(db,{...saved.result,qualifyingPrincipal:{pence:269000,currency:"GBP"}})).rejects.toMatchObject({message:"ELIGIBILITY_FIXTURE_MISMATCH"});
  throw rollback;
 })).rejects.toBe(rollback);
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");const id=await insert(db,saved.result);
  await expect(db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'fixed_compensation','business',7100)",[randomUUID(),T,f.jobId,f.c.id,id])).rejects.toMatchObject({message:"ELIGIBILITY_FIXTURE_MISMATCH"});
  throw rollback;
 })).rejects.toBe(rollback);
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2",[T,f.c.id])).rows[0].n).toBe(1);
});
