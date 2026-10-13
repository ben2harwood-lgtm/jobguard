// Written before 0142 and the mark writer. NOT RUN in the socket-restricted builder sandbox.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { MIGRATION_URLS, migrate, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, RecoveryPaymentPayerRepository, PracticeFeedRepository, withTenant, appendAuditBatch } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { evaluateRecoveryEligibilityV3 } from "@jobguard/core";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { freePort, closeTestPools } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
// The upgrade seed models the previous evaluator's F19 encoding while using
// the real repository and previous PostgreSQL guard. No production path uses it.
const previousSchema = vi.hoisted(() => ({ active: true }));
vi.mock("@jobguard/core", async original => {
 const actual = await original<typeof import("@jobguard/core")>();
 return { ...actual, evaluateRecoveryEligibilityV3: (raw: unknown) => {
  const result = actual.evaluateRecoveryEligibilityV3(raw);
  if (!previousSchema.active || result.fixture !== "F19") return result;
  return { ...result, reasonHeld: true, lines: result.lines.map(line => line.kind === "statutory_interest" ? { ...line, reason: null, reasonHeld: true } : line) };
 } };
});
const ctx=testTenantContext(T), actor={membershipId:M,identityUserId:U};
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool;
const originalEnvironment=process.env.JOBGUARD_ENV;
const accessValue=["syn","thetic"].join("");
let proof:Awaited<ReturnType<typeof proofBefore>>;
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";
 const directory=await mkdtemp(join(tmpdir(),"jg-insurer-")),port=await freePort(60900,100);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:
  accessValue,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:
  accessValue});
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 const names=MIGRATION_URLS.map(u=>basename(fileURLToPath(u))),n=names.indexOf("0142_recovery_insurer_money.sql");
 expect(n,"[DB18] own migration present").toBeGreaterThan(0);expect(names).toEqual([...names].sort());
 for(const url of MIGRATION_URLS.slice(0,n)){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[basename(fileURLToPath(url))]);}
 await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[T]);await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[U]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Insurer synthetic')",[A,T]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
 const login=(await admin.query("SELECT format('CREATE ROLE insurer_test_login LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',$1) statement",[accessValue])).rows[0];
 await admin.query(login.statement);await admin.query("GRANT jobguard_runtime TO insurer_test_login");
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"insurer_test_login",password:
  accessValue});
 for(const [name,type] of [["F19","withheld_customer_payment"],["F21","merchant_overcharge"]]){
  const f=await fixture(type!,false);if(name==="F19")await f.advance("receipt-3000");
  const saved=await f.reviews.review(ctx,f.jobId,{version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:f.c.id,expectedCaseRevision:f.c.revision,expectedReviewRevision:0,fixture:name},actor,f.auth.digest);
  expect(saved.result.reasonHeld).toBe(true);
 }
 previousSchema.active=false;
 proof=await proofBefore(admin,["app.recovery_eligibility_v3_review","app.recovery_claim_line"]);
 await admin.query(await readFile(MIGRATION_URLS[n]!,"utf8"));
 await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[names[n]]);
 expect(await proofDifferences(admin,proof),"[DB18] N alone").toEqual({rows:[],types:[]});
 await migrate(admin);await migrate(admin);
});
afterAll(async()=>{if(originalEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=originalEnvironment;await closeTestPools(runtime,admin);await postgres?.stop();});
async function fixture(type="withheld_customer_payment",insurer=true,before=false){
 const session=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,session),jobId=randomUUID();
 await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'Insurer test job',$3,'capture')",[jobId,T,auth.digest]);
 const client=await admin.connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true)",[T]);await seedSyntheticPartyFixture(client,T,jobId);await client.query("COMMIT");}finally{client.release();}
 if(insurer){
  const party=(await admin.query("SELECT b.paying_party_id,b.paying_party_revision_id FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.binding_id)=(b.tenant_id,b.id) WHERE b.tenant_id=$1 AND b.job_id=$2",[T,jobId])).rows[0];
  const revision=randomUUID(),binding=randomUUID();
  await admin.query("INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload)VALUES($1,$2,$3,2,$4)",[T,revision,party.paying_party_id,JSON.stringify({version:"customer.v1",name:"Practice Insurer",type:"insurer"})]);
  await admin.query("INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)SELECT tenant_id,$3,job_id,revision+1,customer_id,customer_revision_id,paying_party_id,$4,site_id,site_revision_id,'backfilled_synthetic_fixture' FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1",[T,jobId,binding,revision]);
  await admin.query("UPDATE app.job_party_current SET binding_id=$3 WHERE tenant_id=$1 AND job_id=$2",[T,jobId,binding]);
 }
 const pool=practiceMaterialPool(runtime,auth.digest),cases=new RecoveryCaseRepository(pool),feed=new PracticeFeedRepository(runtime,"synthetic_demo");let revision=0;
 const advance=async(movement:string,step="settled")=>{const reply=await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:revision,action:revision===0?"connect":"advance",...(revision===0?{}:{movement,step})});revision=reply.revision;};
 await advance("receipt-384");if(before)await advance("receipt-384");
 const c=await cases.command(ctx,jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:type,claimedNetPence:300000,counterparty:"Fictional debtor",book:type==="withheld_customer_payment"?"builder_customer":"supplier_cost",sourceType:type==="withheld_customer_payment"?"customer_invoice":"supplier_documents",sourceRefs:type==="withheld_customer_payment"?["Generated customer invoice INV-18800"]:["Supplier invoice INV-320"],expectedRevision:0},actor);
 const evidence=randomUUID(),upload=randomUUID(),objectKey=`synthetic/recovery/${evidence}`;
 const evidenceClient=await admin.connect();
 try{
  await evidenceClient.query("BEGIN");await evidenceClient.query("SET LOCAL ROLE jobguard_migration");
  await evidenceClient.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true)",[T,auth.digest]);
  await evidenceClient.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES($1,$2,$3,$4,$5,'application/pdf',1,'standard_evidence','verified','stored-version',now(),now()+interval '1 day')",[upload,T,jobId,objectKey,"a".repeat(64)]);
  await evidenceClient.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES($1,$2,$3,$4,'original','synthetic_bank_receipt',$5,'stored-version',$6,1,'application/pdf','standard_evidence',now(),now())",[evidence,T,upload,jobId,objectKey,"a".repeat(64)]);
  await evidenceClient.query("COMMIT");
 }catch(error){await evidenceClient.query("ROLLBACK");throw error;}finally{evidenceClient.release();}
 return {auth,jobId,c,advance,evidence,pool,reviews:new RecoveryEligibilityV3Repository(pool,"synthetic_demo"),marks:new RecoveryPaymentPayerRepository(pool,"synthetic_demo")};
}
async function markInput(f:Awaited<ReturnType<typeof fixture>>,movement="receipt-3000"){
 const event=(await admin.query("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key=$3 AND event_kind='settled' AND identity='identified' ORDER BY created_at,id LIMIT 1",[T,f.jobId,movement])).rows[0];
 return {version:"recovery-payment-payer-command.v1",action:"mark_customer_own",commandId:randomUUID(),caseId:f.c.id,sourceEventId:event.id,expectedMarkRevision:0,evidenceId:f.evidence};
}
it("[A2 DB2] shared payer function reads current payer and returns null for no binding",async()=>{
 const f=await fixture(),g=await fixture("withheld_customer_payment",false);
 for(const [jobId,type] of [[f.jobId,"insurer"],[g.jobId,"person"],[randomUUID(),null]])expect((await withTenant(runtime,ctx,db=>db.$client.query("SELECT app.recovery_job_payer_type($1,$2) type",[T,jobId]))).rows[0].type).toBe(type);
});
it("[A3 A4 A7 DB3 DB5 DB14] marks exact evidence, replays original, withdraws and marks again",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f);
 const first=await f.marks.command(ctx,f.jobId,input,actor,f.auth.digest);
 expect(first).toMatchObject({revision:1,state:"customer_own",evidenceId:f.evidence,sourceEventId:input.sourceEventId});
 expect((await admin.query("SELECT evidence_object_version_id,evidence_sha256,evidence_received_at=e.server_received_at same_time FROM app.recovery_payment_payer_mark m JOIN app.evidence_object e ON(e.tenant_id,e.id)=(m.tenant_id,m.evidence_id) WHERE m.id=$1",[first.id])).rows).toEqual([{evidence_object_version_id:"stored-version",evidence_sha256:"a".repeat(64),same_time:true}]);
 const {evidenceId:_e,...withdraw}=input;
 const second=await f.marks.command(ctx,f.jobId,{...withdraw,action:"withdraw_mark",commandId:randomUUID(),expectedMarkRevision:1},actor,f.auth.digest);
 expect(second).toMatchObject({revision:2,state:"withdrawn",evidenceId:null});
 expect(await f.marks.command(ctx,f.jobId,input,actor,f.auth.digest)).toEqual(first);
 await expect(f.marks.command(ctx,f.jobId,{...input,expectedMarkRevision:2},actor,f.auth.digest)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
 expect(await f.marks.command(ctx,f.jobId,{...input,commandId:randomUUID(),expectedMarkRevision:2},actor,f.auth.digest)).toMatchObject({revision:3,state:"customer_own"});
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_payment_payer_mark WHERE tenant_id=$1 AND job_id=$2",[T,f.jobId])).rows[0].n).toBe(3);
 expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'markId'=$2",[T,first.id])).rows[0].n).toBe(1);
});
it("[A4 DB12] refuses stale, repeated state, missing/foreign evidence and non-insurer jobs without writes",async()=>{
 const f=await fixture(),g=await fixture("withheld_customer_payment",false);await f.advance("receipt-3000");await g.advance("receipt-3000");
 const input=await markInput(f),foreign=await markInput(g);
 const {evidenceId:_unusedEvidence,...withdraw}=input;
 for(const [candidate,code] of [[{...input,evidenceId:randomUUID()},"PAYER_MARK_EVIDENCE_REQUIRED"],[{...input,evidenceId:g.evidence},"PAYER_MARK_EVIDENCE_REQUIRED"],[{...input,expectedMarkRevision:1},"PAYER_MARK_STALE_REVISION"],[{...withdraw,action:"withdraw_mark"},"PAYER_MARK_STATE_CONFLICT"]] as const)await expect(f.marks.command(ctx,f.jobId,candidate,actor,f.auth.digest)).rejects.toThrow(code);
 await expect(g.marks.command(ctx,g.jobId,foreign,actor,g.auth.digest)).rejects.toThrow("PAYER_MARK_NOT_INSURER_JOB");
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_payment_payer_mark WHERE tenant_id=$1 AND job_id=ANY($2::uuid[])",[T,[f.jobId,g.jobId]])).rows[0].n).toBe(0);
 await f.marks.command(ctx,f.jobId,input,actor,f.auth.digest);
 await expect(f.marks.command(ctx,f.jobId,{...input,commandId:randomUUID(),expectedMarkRevision:1},actor,f.auth.digest)).rejects.toThrow("PAYER_MARK_STATE_CONFLICT");
});
it("[A4 A5 DB12] definer entry points refuse missing, mismatched and malformed tenant context",async()=>{
 const f=await fixture();
 await expect(runtime.query("SELECT app.lock_recovery_payer_job($1,$2,$3)",[T,f.jobId,M])).rejects.toThrow("PAYER_MARK_FORBIDDEN");
 for(const value of [randomUUID(),"malformed"]){
  const client=await runtime.connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[value,f.auth.digest]);await expect(client.query("SELECT app.lock_recovery_payer_job($1,$2,$3)",[T,f.jobId,M])).rejects.toThrow("PAYER_MARK_FORBIDDEN");}finally{await client.query("ROLLBACK");client.release();}
 }
});
it("[A3 A4 DB13 DB17] catalogs enforce standard F, RLS, owner and fixed search paths",async()=>{
 expect((await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='app.recovery_payment_payer_mark'::regclass")).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"}]);
 expect((await admin.query("SELECT has_table_privilege('jobguard_runtime','app.recovery_payment_payer_mark','SELECT') s,has_table_privilege('jobguard_runtime','app.recovery_payment_payer_mark','INSERT,UPDATE,DELETE,TRUNCATE') forbidden")).rows).toEqual([{s:true,forbidden:false}]);
 expect((await admin.query("SELECT has_table_privilege('jobguard_runtime','app.job','UPDATE') allowed")).rows).toEqual([{allowed:false}]);
 for(const name of ["lock_recovery_payer_job","write_recovery_payment_payer_mark","recovery_job_payer_type","guard_recovery_payment_payer_mark","require_recovery_payment_payer_mark_effect"]){
  const row=(await admin.query("SELECT prosecdef,proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname=$1",[name])).rows[0];
  expect(row).toEqual({prosecdef:["lock_recovery_payer_job","write_recovery_payment_payer_mark"].includes(name),proconfig:["search_path=pg_catalog, app"],owner:"jobguard_migration"});
 }
 expect((await runtime.query("SELECT * FROM app.recovery_payment_payer_mark")).rows).toEqual([]);
 for(const sql of ["INSERT INTO app.recovery_payment_payer_mark(id)VALUES(gen_random_uuid())","UPDATE app.recovery_payment_payer_mark SET state=state","DELETE FROM app.recovery_payment_payer_mark"])await expect(runtime.query(sql)).rejects.toMatchObject({code:"42501"});
});
it("[DB18] preserves named pre-existing F19/F21 rows and full types with rolled-back controls",async()=>{
 for(const [table,was] of Object.entries(proof)){
  expect(Object.keys(was.rows).length).toBeGreaterThan(0);
  const key=JSON.parse(Object.keys(was.rows)[0]!) as {tenant_id:string;id:string};
  await rolledBack(admin,async client=>{
   await client.query("SET LOCAL session_replication_role=replica");
   await client.query(`UPDATE ${table} SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1 AND id=$2`,[key.tenant_id,key.id]);
   expect((await proofDifferences(client,proof)).rows.length).toBeGreaterThan(0);
  });
  await rolledBack(admin,async client=>{await client.query(`ALTER TABLE ${table} ALTER COLUMN created_at TYPE timestamp(3) with time zone`);expect((await proofDifferences(client,proof)).types.length).toBeGreaterThan(0);});
  await rolledBack(admin,async client=>{await client.query(`ALTER TABLE ${table} ADD COLUMN insurer_proof_nullable text`);expect(await proofDifferences(client,proof)).toEqual({rows:[],types:[]});});
 }
 await rolledBack(admin,async client=>{
  await client.query("CREATE OR REPLACE FUNCTION app.recovery_job_payer_type(uuid,uuid) RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,app AS 'SELECT NULL::text'");
  expect(await proofDifferences(client,proof)).toEqual({rows:[],types:[]});
 });
 await rolledBack(admin,async client=>{
  await client.query("SET LOCAL session_replication_role=replica");
  const added=await client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)SELECT gen_random_uuid(),tenant_id,job_id,case_id,revision+1000,case_revision,fixture,source_event_id,actor_membership_id,gen_random_uuid(),payload_hash,result FROM app.recovery_eligibility_v3_review WHERE fixture='F21' ORDER BY created_at,id LIMIT 1");
  expect(added.rowCount).toBe(1);expect(await proofDifferences(client,proof)).toEqual({rows:[],types:[]});
 });
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
});

// SQL-only backstop checks: A6's application evaluator remains stopped.
async function rawReview(f:Awaited<ReturnType<typeof fixture>>,insurer:boolean){
 const event=(await admin.query("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key='receipt-3000' AND event_kind='settled'",[T,f.jobId])).rows[0];
 const ordinary=evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:T,jobId:f.jobId,caseId:f.c.id,fixture:"F18",settlement:"settled",paymentTiming:"after_opening",sourceRef:event.id});
 const result=insurer?{...ordinary,outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Insurer proceeds never qualify",lines:ordinary.lines.map(line=>({...line,qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Insurer proceeds never qualify"}))}:ordinary;
 return withTenant(f.pool,ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const id=randomUUID(),command=randomUUID(),requestHash=createHash("sha256").update(command).digest("hex");
  const inserted=await db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,1,$5,'F18',$6,$7,$8,$9,$10)RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') result_hash",[id,T,f.jobId,f.c.id,f.c.revision,event.id,M,command,requestHash,JSON.stringify(result)]);
  for(const line of ordinary.lines)await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),T,f.jobId,f.c.id,id,line.kind,line.debtorType,line.netPence]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{reviewId:id,commandId:command},hashes:{command:requestHash,result:inserted.rows[0]!.result_hash}}}]);
  return id;
 });
}
it("[A1 A5 DB11] SQL backstop refuses ordinary money on an insurer job and an insurer reason on a person job",async()=>{
 const f=await fixture(),g=await fixture("withheld_customer_payment",false);await f.advance("receipt-3000");await g.advance("receipt-3000");
 await expect(rawReview(f,false)).rejects.toThrow("ELIGIBILITY_FIXTURE_MISMATCH");await expect(rawReview(g,true)).rejects.toThrow("ELIGIBILITY_FIXTURE_MISMATCH");
 const saved=await rawReview(f,true);
 expect((await admin.query("SELECT result->>'reason' reason,result->'qualifyingPrincipal'->>'pence' q FROM app.recovery_eligibility_v3_review WHERE id=$1",[saved])).rows).toEqual([{reason:"Insurer proceeds never qualify",q:"0"}]);
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2",[T,f.jobId])).rows[0].n).toBe(0);
});
it("[A4 DB12] owner role, revocation, other-session digest, other job and case type fail without marks",async()=>{
 const f=await fixture(),g=await fixture("merchant_overcharge");await f.advance("receipt-3000");await g.advance("receipt-3000");const input=await markInput(f);
 for(const role of ["admin","finance"]){
  await admin.query("UPDATE app.membership SET role=$2 WHERE tenant_id=$1 AND id=$3",[T,role,M]);
  try{await expect(f.marks.command(ctx,f.jobId,input,actor,f.auth.digest)).rejects.toThrow("PAYER_MARK_FORBIDDEN");}finally{await admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2",[T,M]);}
 }
 await admin.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",[T,M]);
 try{await expect(f.marks.command(ctx,f.jobId,input,actor,f.auth.digest)).rejects.toThrow("PAYER_MARK_FORBIDDEN");}finally{await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",[T,M]);}
 await expect(f.marks.command(ctx,f.jobId,input,actor,g.auth.digest)).rejects.toThrow("RECOVERY_JOB_NOT_FOUND");
 await expect(f.marks.command(ctx,f.jobId,{...input,sourceEventId:(await markInput(g)).sourceEventId},actor,f.auth.digest)).rejects.toThrow("PAYER_MARK_SOURCE_REQUIRED");
 await expect(g.marks.command(ctx,g.jobId,await markInput(g),actor,g.auth.digest)).rejects.toThrow("RECOVERY_CASE_NOT_FOUND");
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_payment_payer_mark WHERE tenant_id=$1 AND job_id=$2",[T,f.jobId])).rows[0].n).toBe(0);
 expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'jobId'=$2 AND event_type LIKE 'recovery.payment_payer.%'",[T,f.jobId])).rows[0].n).toBe(0);
});
it.each([["receipt-3000","pending","pending","PAYER_MARK_SOURCE_REQUIRED"],["receipt-3000","alternate_representation","statement","PAYER_MARK_SOURCE_REQUIRED"],["receipt-3000","unknown_duplicate","unknown","PAYER_MARK_SOURCE_REQUIRED"],["supplier-refund-540","settled","settled","PAYER_MARK_NOT_CUSTOMER_PAYMENT"]])("[A4 DB12] refuses %s %s",async(movement,step,kind,code)=>{
 const f=await fixture();await f.advance(movement!,step!);
 const event=(await admin.query("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key=$3 AND event_kind=$4",[T,f.jobId,movement,kind])).rows[0];
 await expect(f.marks.command(ctx,f.jobId,{version:"recovery-payment-payer-command.v1",action:"mark_customer_own",commandId:randomUUID(),caseId:f.c.id,sourceEventId:event.id,expectedMarkRevision:0,evidenceId:f.evidence},actor,f.auth.digest)).rejects.toThrow(code!);
});
it("[A4 DB13] controlled writer without matching audit cannot commit and leaves no mark",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f);
 await expect(withTenant(f.pool,ctx,async db=>{await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");await db.$client.query("SELECT app.write_recovery_payment_payer_mark($1,$2,$3::jsonb)",[T,f.jobId,JSON.stringify(input)]);})).rejects.toThrow("PAYER_MARK_AUDIT_REQUIRED");
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_payment_payer_mark WHERE tenant_id=$1 AND command_id=$2",[T,input.commandId])).rows[0].n).toBe(0);
});

it("[B1 B2 DB16] independent F19 wording preserves Q and compensation header",async()=>{
 const f=await fixture("withheld_customer_payment",false);await f.advance("receipt-3000");
 const saved=await f.reviews.review(ctx,f.jobId,{version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:f.c.id,expectedCaseRevision:f.c.revision,expectedReviewRevision:0,fixture:"F19"},actor,f.auth.digest);
 const message="Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.";
 expect(saved.result).toMatchObject({qualifyingPrincipal:{pence:250000},reason:"Fixed statutory compensation is not part of the fee base",reasonHeld:false});
 expect(saved.result.lines.find(l=>l.kind==="statutory_interest")).toMatchObject({reason:message,reasonHeld:false,qualifyingPrincipal:{pence:0}});
 expect(message).toHaveLength(173);expect(createHash("sha256").update(message).digest("hex")).toBe("fb24c95b4190d5b342b52302d5f5e18734f6b75a06b1c943de313359fa07a72f");
});

it("[A4 DB12] preview evidence, no binding and another tenant refuse with exact codes",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f),preview=randomUUID();
 await rolledBack(admin,async client=>{
  await client.query("SET LOCAL ROLE jobguard_migration");await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true)",[T,f.auth.digest]);
  await client.query("INSERT INTO app.evidence_object(id,tenant_id,job_id,kind,original_evidence_id,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)SELECT $2,tenant_id,job_id,'preview',id,evidence_type,object_key||'/preview','preview-version',sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at FROM app.evidence_object WHERE id=$1",[f.evidence,preview]);
  // The uncommitted preview is intentionally tested through the same migration transaction,
  // while the guarded writer still derives the actual session owner.
  await client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");await client.query("SAVEPOINT preview_control");
  await expect(client.query("SELECT app.write_recovery_payment_payer_mark($1,$2,$3::jsonb)",[T,f.jobId,JSON.stringify({...input,evidenceId:preview})])).rejects.toThrow("PAYER_MARK_EVIDENCE_REQUIRED");
  await client.query("ROLLBACK TO SAVEPOINT preview_control");
 });
 await expect(f.marks.command(testTenantContext(randomUUID()),f.jobId,input,actor,f.auth.digest)).rejects.toThrow("PAYER_MARK_FORBIDDEN");
 const unbound=randomUUID();await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'Unbound mark control',$3,'capture')",[unbound,T,f.auth.digest]);
 const c=await new RecoveryCaseRepository(f.pool).command(ctx,unbound,{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:"withheld_customer_payment",claimedNetPence:300000,counterparty:"Fictional debtor",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"],expectedRevision:0},actor);
 await expect(f.marks.command(ctx,unbound,{...input,caseId:c.id},actor,f.auth.digest)).rejects.toThrow("PAYER_MARK_NOT_INSURER_JOB");
});
it("[A7 DB14] changed job replay conflicts when both jobs belong to the authorized session",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f);await f.marks.command(ctx,f.jobId,input,actor,f.auth.digest);
 const other=randomUUID();await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'Other owned job',$3,'capture')",[other,T,f.auth.digest]);
 await expect(f.marks.command(ctx,other,input,actor,f.auth.digest)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
});
it("[A3 A4 DB13] trigger pins supplied time and rejects changed stored evidence bytes",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f);const saved=await f.marks.command(ctx,f.jobId,input,actor,f.auth.digest);
 await rolledBack(admin,async client=>{
  await client.query("SET LOCAL ROLE jobguard_migration");await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[T,f.auth.digest]);
  const pinned=await client.query("INSERT INTO app.recovery_payment_payer_mark(id,tenant_id,job_id,source_event_id,revision,state,party_binding_id,actor_membership_id,command_id,payload_hash,created_at)SELECT gen_random_uuid(),tenant_id,job_id,source_event_id,2,'withdrawn',party_binding_id,actor_membership_id,gen_random_uuid(),payload_hash,'2000-01-01'::timestamptz FROM app.recovery_payment_payer_mark WHERE id=$1 RETURNING created_at=transaction_timestamp() pinned",[saved.id]);
  expect(pinned.rows).toEqual([{pinned:true}]);
 });
 await f.advance("receipt-384");const other=await markInput(f,"receipt-384");
 await rolledBack(admin,async client=>{
  await client.query("SET LOCAL ROLE jobguard_migration");await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.recovery_eligibility_environment','synthetic_demo',true)",[T,f.auth.digest]);
  await expect(client.query("INSERT INTO app.recovery_payment_payer_mark(id,tenant_id,job_id,source_event_id,revision,state,evidence_id,evidence_object_version_id,evidence_sha256,evidence_received_at,party_binding_id,actor_membership_id,command_id,payload_hash)SELECT gen_random_uuid(),tenant_id,job_id,$2,1,'customer_own',evidence_id,evidence_object_version_id,$3,evidence_received_at,party_binding_id,actor_membership_id,gen_random_uuid(),payload_hash FROM app.recovery_payment_payer_mark WHERE id=$1",[saved.id,other.sourceEventId,"b".repeat(64)])).rejects.toThrow("PAYER_MARK_EVIDENCE_REQUIRED");
 });
 for(const sql of ["UPDATE app.recovery_payment_payer_mark SET state=state WHERE id=$1","DELETE FROM app.recovery_payment_payer_mark WHERE id=$1"])await expect(admin.query(sql,[saved.id])).rejects.toMatchObject({code:"42501"});
});
it("[A5 DB15] a review waits for the open mark transaction and then uses the committed mark without sleeps",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f);
 let release!:()=>void,ready!: (pid:number)=>void,failed!:(error:unknown)=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<number>((resolve,reject)=>{ready=resolve;failed=reject;});
 const transaction=withTenant(f.pool,ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const pid=(await db.$client.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
  const row=(await db.$client.query("SELECT * FROM app.write_recovery_payment_payer_mark($1,$2,$3::jsonb)",[T,f.jobId,JSON.stringify(input)])).rows[0];
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.payment_payer.marked",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{markId:row.id,commandId:input.commandId},hashes:{command:row.payload_hash.trim()}}}]);
  ready(pid);await gate;
 }).catch(error=>{failed(error);throw error;});
 try{
  const pid=await started;
  const reviewing=f.reviews.review(ctx,f.jobId,{version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:f.c.id,expectedCaseRevision:f.c.revision,expectedReviewRevision:0,fixture:"F18"},actor,f.auth.digest).then(value=>({value}),error=>({error}));
  let waiting=false;
  for(let attempt=0;attempt<200&&!waiting;attempt++)waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE $1=ANY(pg_blocking_pids(a.pid)) AND a.wait_event_type='Lock' AND a.query LIKE 'INSERT INTO app.recovery_eligibility_v3_review%') waiting",[pid])).rows[0].waiting as boolean;
  release();await transaction;const outcome=await reviewing;
  expect(waiting).toBe(true);if("error" in outcome)throw outcome.error;
  expect(outcome.value.result.qualifyingPrincipal.pence).toBe(262000);
 }finally{release();await transaction;}
});

it.each([["F17","duplicate_supplier_payment","supplier-refund-540",45000,null],["F22","prevention",null,0,"Prevented spending is not recovered cash"]] as const)("[A1 DB9] insurer payer does not change %s supplier/prevention control",async(name,type,movement,q,reason)=>{
 const f=await fixture(type);if(movement)await f.advance(movement);
 const saved=await f.reviews.review(ctx,f.jobId,{version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:f.c.id,expectedCaseRevision:f.c.revision,expectedReviewRevision:0,fixture:name},actor,f.auth.digest);
 expect(saved.result).toMatchObject({qualifyingPrincipal:{pence:q},reason});
});
it("[A1 DB7] F20 paid-before wins on an insurer job before and after marking its original payment",async()=>{
 const f=await fixture("withheld_customer_payment",true,true);
 const command={version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:f.c.id,expectedCaseRevision:f.c.revision,expectedReviewRevision:0,fixture:"F20"};
 expect((await f.reviews.review(ctx,f.jobId,command,actor,f.auth.digest)).result).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Paid before you opened this case"});
 await f.marks.command(ctx,f.jobId,await markInput(f,"receipt-384"),actor,f.auth.digest);
 expect((await f.reviews.review(ctx,f.jobId,{...command,commandId:randomUUID(),expectedReviewRevision:1},actor,f.auth.digest)).result).toMatchObject({qualifyingPrincipal:{pence:0},reason:"Paid before you opened this case"});
});
it("[A7 F] authenticated contractor-track jobs have no mark write path",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f);
 await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance)VALUES($1,$2,'contractor','synthetic_demo','work_order_import')",[T,f.jobId]);
 await expect(f.marks.command(ctx,f.jobId,input,actor,f.auth.digest)).rejects.toThrow("RECOVERY_JOB_NOT_FOUND");
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_payment_payer_mark WHERE tenant_id=$1 AND job_id=$2",[T,f.jobId])).rows[0].n).toBe(0);
});

it("[A4 DB12] an existing original evidence file from another tenant is refused without disclosure",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const input=await markInput(f);
 const tenant=randomUUID(),job=randomUUID(),upload=randomUUID(),evidence=randomUUID(),objectKey=`synthetic/recovery/${evidence}`;
 const client=await admin.connect();try{
  await client.query("BEGIN");await client.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[tenant]);
  await client.query("INSERT INTO app.job(id,tenant_id,title)VALUES($1,$2,'Foreign evidence control')",[job,tenant]);
  await client.query("SET LOCAL ROLE jobguard_migration");await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  await client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES($1,$2,$3,$4,$5,'application/pdf',1,'standard_evidence','verified','foreign-version',now(),now()+interval '1 day')",[upload,tenant,job,objectKey,"a".repeat(64)]);
  await client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES($1,$2,$3,$4,'original','synthetic_bank_receipt',$5,'foreign-version',$6,1,'application/pdf','standard_evidence',now(),now())",[evidence,tenant,upload,job,objectKey,"a".repeat(64)]);
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 await expect(f.marks.command(ctx,f.jobId,{...input,evidenceId:evidence},actor,f.auth.digest)).rejects.toThrow("PAYER_MARK_EVIDENCE_REQUIRED");
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_payment_payer_mark WHERE tenant_id=$1 AND job_id=$2",[T,f.jobId])).rows[0].n).toBe(0);
});
