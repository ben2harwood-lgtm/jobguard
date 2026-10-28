// Written before 0197 (was 0195)/core activation. PostgreSQL NOT RUN in the builder sandbox.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolConfig } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migrate, MIGRATION_URLS, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, withTenant } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
const reason="Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.";
const expected={version:"recovery-eligibility-review.v3",policyVersion:"reference_recovery_eligibility_policy_v3",fixture:"F21",outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason,reasonHeld:false,terminal:false,productionEnabled:false,
 lines:[{kind:"principal",debtorType:"business",netPence:9000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason,reasonHeld:false}]};
const ctx=testTenantContext(T),actor={membershipId:M,identityUserId:U};
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,runtimeConfig:PoolConfig,adminConfig:PoolConfig;
const previousEnvironment=process.env.JOBGUARD_ENV;
async function start(){
 process.env.JOBGUARD_ENV="synthetic_demo";
 const directory=await mkdtemp(join(tmpdir(),"jg-f21-")),port=await freePort(62000,100),value=randomUUID();
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:value,persistent:true,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 adminConfig={host:"127.0.0.1",port,database:"postgres",user:"postgres",password:value};admin=new Pool(adminConfig);
 await admin.query(`CREATE ROLE f21_login LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 runtimeConfig={...adminConfig,user:"f21_login"};runtime=new Pool(runtimeConfig);
}
async function identity(){
 await admin.query("GRANT jobguard_runtime TO f21_login");
 await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[T]);await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[U]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional F21 builder')",[A,T]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
}
afterAll(async()=>{await closeTestPools(runtime,admin);if(postgres)await postgres.stop();if(previousEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousEnvironment;});
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

// Pre-N encoding adapter only. Real repository, authorization, audit and old SQL guards execute.
const previousSchema=vi.hoisted(()=>({active:true}));
vi.mock("@jobguard/core",async original=>{
 const actual=await original<typeof import("@jobguard/core")>();
 return {...actual,evaluateRecoveryEligibilityV3:(raw:unknown)=>{
  const result=actual.evaluateRecoveryEligibilityV3(raw);
  if(!previousSchema.active||result.fixture!=="F21")return result;
  return {version:"recovery-eligibility-review.v3",policyVersion:"reference_recovery_eligibility_policy_v3",fixture:"F21",outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:null,reasonHeld:true,terminal:false,productionEnabled:false,
   lines:[{kind:"principal",debtorType:"business",netPence:9000,qualifyingPrincipal:{pence:0,currency:"GBP"},reason:null,reasonHeld:true}]};
 }};
});
const names=MIGRATION_URLS.map(u=>basename(fileURLToPath(u))),position=names.indexOf("0197_ch7_f21_reason.sql");
let proof:Awaited<ReturnType<typeof proofBefore>>,historical:Awaited<ReturnType<typeof fixture>>,command:ReturnType<typeof review>,saved:Awaited<ReturnType<RecoveryEligibilityV3Repository["review"]>>;
const routines=async()=> (await admin.query("SELECT oid,proname,proowner,proacl::text,prosecdef,proconfig,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid IN('app.guard_recovery_eligibility_v3()'::regprocedure,'app.require_recovery_eligibility_v3_effect()'::regprocedure) ORDER BY proname")).rows;
async function security(){
 return {
  tables:(await admin.query("SELECT c.oid,c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','infrastructure') ORDER BY c.oid")).rows,
  columns:(await admin.query("SELECT a.attrelid,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','infrastructure') AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attrelid,a.attnum")).rows,
  policies:(await admin.query("SELECT oid,polrelid,polname,polcmd,polroles,polqual::text,polwithcheck::text FROM pg_policy ORDER BY oid")).rows,
  triggers:(await admin.query("SELECT oid,tgrelid,tgname,pg_get_triggerdef(oid) definition FROM pg_trigger ORDER BY oid")).rows,
  constraints:(await admin.query("SELECT oid,conrelid,conname,pg_get_constraintdef(oid) definition FROM pg_constraint ORDER BY oid")).rows,
  roles:(await admin.query("SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY oid")).rows,
  memberships:(await admin.query("SELECT * FROM pg_auth_members ORDER BY roleid,member")).rows,
  functions:(await admin.query("SELECT p.oid,p.proowner,p.proacl::text,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','control_plane','identity','infrastructure') AND p.prokind='f' AND p.proname NOT IN('guard_recovery_eligibility_v3','require_recovery_eligibility_v3_effect') ORDER BY p.oid")).rows
 };
}
// Assert that the only routine-body differences are exactly the four F21 edits.
function previousDefinition(definition:string){
 return definition.replace(`ELSIF NEW.fixture='F21' THEN expected_reason:='${reason}';`,"ELSIF NEW.fixture='F21' THEN expected_reason:=NULL;")
  .replace("OR NEW.result->'reasonHeld' IS DISTINCT FROM 'false'::jsonb","OR NEW.result->'reasonHeld' IS DISTINCT FROM to_jsonb(NEW.fixture='F21')")
  .replace(`    WHEN NEW.fixture='F21' THEN '${reason}'\n`,"")
  .replace("'reasonHeld',false)\n  ORDER BY","'reasonHeld',NEW.fixture='F21')\n  ORDER BY");
}
beforeAll(async()=>{await start();});
// Installs every predecessor migration, then a fresh database twice; the 5 s default is too short under CI load.
it("F21FreshInstallAndOwnMigrationUpgrade",async()=>{
 expect(position).toBeGreaterThan(0);expect(names).toEqual([...names].sort());
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,position)){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[basename(fileURLToPath(url))]);}
 await identity();historical=await fixture("merchant_overcharge");command=review(historical.c,"F21");
 saved=await historical.repo.review(ctx,historical.jobId,command,actor,historical.auth.digest);
 expect(saved.result).toMatchObject({reason:null,reasonHeld:true,lines:[{reason:null,reasonHeld:true}]});
 const f19=await fixture();await f19.advance("receipt-3000");
 const nineteen=await f19.repo.review(ctx,f19.jobId,review(f19.c,"F19"),actor,f19.auth.digest);expect(nineteen.result.qualifyingPrincipal.pence).toBe(250000);
 await historical.cases.eligibilityCommand(ctx,historical.jobId,{version:"recovery-eligibility-command.v1",commandId:randomUUID(),action:"review",caseId:historical.c.id,expectedCaseRevision:historical.c.revision,scenario:"pending_money",evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1},actor);
 proof=await proofBefore(admin,["app.recovery_case","app.recovery_case_event","app.recovery_claim_revision","app.recovery_eligibility_revision","app.recovery_eligibility_v3_review","app.recovery_claim_line","app.audit_event"]);
 for(const [table,before] of Object.entries(proof))expect(Object.keys(before.rows).length,`${table}: nonempty historical rows`).toBeGreaterThan(0);
 const oldSecurity=await security(),oldRoutines=await routines();
 await admin.query(await readFile(MIGRATION_URLS[position]!,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[names[position]]);
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});expect(await security()).toEqual(oldSecurity);
 const newRoutines=await routines();
 for(const [index,old] of oldRoutines.entries()){
  expect(newRoutines[index].definition).not.toBe(old.definition);
  expect(previousDefinition(newRoutines[index].definition)).toBe(old.definition);
  expect({...newRoutines[index],definition:old.definition}).toEqual(old);
 }
 previousSchema.active=false;
 const f=await fixture("merchant_overcharge");expect((await f.repo.review(ctx,f.jobId,review(f.c,"F21"),actor,f.auth.digest)).result).toEqual(expected);
 await migrate(admin);await migrate(admin);expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
 expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name)).toEqual(names);
 // Separate empty database exercises fresh directory-discovered installation.
 const database=`f21_fresh_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE DATABASE ${database}`);
 const fresh=new Pool({...adminConfig,database});try{await migrate(fresh);await migrate(fresh);expect((await fresh.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name)).toEqual(names);}finally{await closeTestPools(fresh);}
},120000);
it("F21LegacyReplayAfterUpgrade",async()=>{
 expect(await historical.repo.review(ctx,historical.jobId,command,actor,historical.auth.digest)).toEqual(saved);
 const next=await historical.repo.review(ctx,historical.jobId,review(historical.c,"F21",1),actor,historical.auth.digest);
 expect(next.result).toEqual(expected);expect(next.revision).toBe(2);
 expect(await historical.repo.review(ctx,historical.jobId,command,actor,historical.auth.digest)).toEqual(saved);
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
});
it("F21UpgradeComparatorControls",async()=>{
 expect(proof).toBeDefined();
 for(const [table,before] of Object.entries(proof)){
  const count=Object.keys(before.rows).length,time=table==='app.audit_event'?'occurred_at':'created_at';expect(count).toBeGreaterThan(0);
  const changed=await rolledBack(admin,async db=>{await db.query("SET LOCAL session_replication_role=replica");await db.query(`UPDATE ${table} SET ${time}=${time}+interval '1 microsecond'`);return proofDifferences(db,proof);});
  expect(changed.rows.filter(r=>r.startsWith(`${table} `)&&r.endsWith(': changed'))).toHaveLength(count);expect(changed.types).toEqual([]);
 }
 const corrupted=await rolledBack(admin,async db=>{await db.query("SET LOCAL session_replication_role=replica");await db.query("UPDATE app.recovery_eligibility_v3_review SET result=jsonb_set(result,'{reason}','null') WHERE fixture='F19'");return proofDifferences(db,proof);});expect(corrupted.rows.some(r=>r.startsWith('app.recovery_eligibility_v3_review ')&&r.endsWith(': changed'))).toBe(true);
 const retyped=await rolledBack(admin,async db=>{await db.query("ALTER TABLE app.recovery_claim_line ALTER COLUMN net_pence TYPE numeric(20,0)");return proofDifferences(db,proof);});expect(retyped.types).toEqual(['app.recovery_claim_line: net_pence bigint -> numeric(20,0)']);
 const identity=await rolledBack(admin,async db=>{await db.query("SET LOCAL session_replication_role=replica");await db.query("UPDATE app.recovery_claim_line SET id=gen_random_uuid()");return proofDifferences(db,proof);});expect(identity.rows.filter(r=>r.startsWith('app.recovery_claim_line ')&&r.endsWith(': missing'))).toHaveLength(Object.keys(proof['app.recovery_claim_line']!.rows).length);
 // Later columns/functions and new rows are outside the original-row preservation claim.
 expect(await rolledBack(admin,async db=>{await db.query("ALTER TABLE app.recovery_claim_line ADD COLUMN f21_later text");expect(await scratchReplaceFunction(db,'app.guard_recovery_eligibility_v3()')).toBe(true);return proofDifferences(db,proof);})).toEqual({rows:[],types:[]});
 expect(await rolledBack(admin,async db=>{await db.query("SET LOCAL session_replication_role=replica");await db.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)SELECT $1,tenant_id,job_id,case_id,review_id,'fixed_compensation',debtor_type,1 FROM app.recovery_claim_line LIMIT 1",[randomUUID()]);return proofDifferences(db,proof);})).toEqual({rows:[],types:[]});
 expect(await proofDifferences(admin,proof)).toEqual({rows:[],types:[]});
});
