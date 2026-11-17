import {createHash,randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import {Pool,type PoolClient} from "pg";
import {migrate} from "../src/migrate.js";
import {FinalAccountLockRepository} from "../src/final-account-lock-repository.js";
import {FinalCheckRepository,type FinalCheckClassification} from "../src/final-check-repository.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
import {freePort,closeTestPools,installLegacySyntheticPartyFixtures} from "./pool-test-utils.js";
export const FINAL_CHECK_TENANT="11111111-1111-4111-8111-111111111111",FINAL_CHECK_ACTOR="d1500000-0000-4000-8000-000000000003",FINAL_CHECK_USER="d1500000-0000-4000-8000-000000000001";
export type FinalCheckFixture={postgres:EmbeddedPostgres;admin:Pool;runtime:Pool;shadow:Pool;directory:string;logs:string[]};
export async function createFinalCheckFixture(install=true):Promise<FinalCheckFixture>{
 const directory=await mkdtemp(join(tmpdir(),"sv5-pg16-")),port=await freePort(58000,200),credential=randomUUID(),logs:string[]=[];
 const postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:credential,persistent:true,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:line=>logs.push(line)});
 await postgres.initialise();await postgres.start();
 const config={host:"127.0.0.1",port,user:"postgres",password:credential},bootstrap=new Pool({...config,database:"postgres"});
 await bootstrap.query('CREATE DATABASE jobguard_synthetic_demo');await bootstrap.end();const admin=new Pool({...config,database:"jobguard_synthetic_demo"});
 if(install){await migrate(admin);await installLegacySyntheticPartyFixtures(admin);}
 const runtimeLogin=`sv5_runtime_${randomUUID().replaceAll("-","")}`,shadowLogin=`sv5_shadow_${randomUUID().replaceAll("-","")}`;
 // Parameterized server-side format creates generated fixture logins; no literal credential in SQL.
 for(const login of [runtimeLogin,shadowLogin])await admin.query(`DO $body$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', '${login}', '${credential}'); END $body$`);
 await admin.query("ALTER SYSTEM SET log_line_prefix='SV5:%u: '");await admin.query('SELECT pg_reload_conf()');await admin.query(`ALTER ROLE ${runtimeLogin} SET log_statement='all'`);
 if(install){await admin.query(`GRANT jobguard_runtime TO ${runtimeLogin}`);await admin.query(`GRANT jobguard_shadow TO ${shadowLogin}`);}
 return {postgres,admin,runtime:new Pool({...config,database:"jobguard_synthetic_demo",user:runtimeLogin}),shadow:new Pool({...config,database:"jobguard_synthetic_demo",user:shadowLogin}),directory,logs};
}
export async function closeFinalCheckFixture(f:FinalCheckFixture|undefined){if(!f)return;await closeTestPools(f.runtime,f.shadow,f.admin);await f.postgres.stop();}
export async function finalCheckTenant<T>(pool:Pool,tenantId:string,work:(client:PoolClient)=>Promise<T>):Promise<T>{const db=await pool.connect();try{await db.query('BEGIN');await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);const result=await work(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export async function seedFinalCheckJob(f:FinalCheckFixture){
 const tenantId=FINAL_CHECK_TENANT,jobId=randomUUID(),scopeItemId=randomUUID(),baselineId=randomUUID(),draftId=randomUUID(),revisionId=randomUUID(),lineId=randomUUID(),accountId=randomUUID(),sessionId=randomUUID(),digest=createHash('sha256').update(sessionId).digest('hex'),hash="a".repeat(64);
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[tenantId]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[FINAL_CHECK_USER]);
 await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional SV-5 builder')",[accountId,tenantId]);
 await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[FINAL_CHECK_ACTOR,tenantId,accountId,FINAL_CHECK_USER]);
 await f.admin.query("SELECT app.issue_practice_session($1)",[digest]);
 await finalCheckTenant(f.admin,tenantId,async db=>{
  await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional final check','live',$3,'capture')",[jobId,tenantId,digest]);
  await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeItemId,tenantId,jobId]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')",[baselineId,tenantId,jobId,hash]);
  await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[draftId,tenantId,jobId]);
  await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',100000,20000,120000,false,'[]')",[revisionId,tenantId,jobId,draftId,hash,baselineId]);
  await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional kitchen work',100000,1)",[lineId,tenantId,jobId,revisionId,baselineId,scopeItemId]);
  await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3",[revisionId,tenantId,draftId]);
 });
 const context=testTenantContext(tenantId),locks=new FinalAccountLockRepository(f.runtime);
 if(!(await f.admin.query("SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=$1",[tenantId])).rowCount)await locks.acceptTerms(context,{actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
 await locks.disposition(context,{jobId,actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),scopeItemId,disposition:"done"});
 return {tenantId,jobId,scopeItemId,baselineId,revisionId,lineId,context,digest,sessionId,lock:()=>locks.lock(context,{jobId,actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),finalAccountRevisionId:revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"})};
}
export type FinalCheckJob=Awaited<ReturnType<typeof seedFinalCheckJob>>;
export async function insertFinalCheckEvidence(f:FinalCheckFixture,a:FinalCheckJob,evidenceType="completion_photo",contentType="image/png"){const evidence=randomUUID(),upload=randomUUID(),hash="a".repeat(64),objectVersion=randomUUID();await finalCheckTenant(f.admin,a.tenantId,async db=>{
 await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at) VALUES($1,$2,$3,$4,$5,$6,$8,100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$7,clock_timestamp())",[upload,a.tenantId,a.jobId,a.scopeItemId,`synthetic/${evidence}`,hash,objectVersion,contentType]);
 await db.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at,device_captured_at) VALUES($1,$2,$3,$4,$5,'original',$9,$6,$7,$8,0,$10,'standard_evidence',clock_timestamp(),clock_timestamp(),'2020-01-01')",[evidence,a.tenantId,upload,a.jobId,a.scopeItemId,`synthetic/${evidence}`,objectVersion,hash,evidenceType,contentType]);
 });return evidence;}
export async function finalCheckProposal(f:FinalCheckFixture,a:FinalCheckJob,evidence:string,scopeItemId:string|null=null){const signalId=randomUUID();await finalCheckTenant(f.shadow,a.tenantId,async db=>{
 await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state,matched_scope_item_id) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),'Outside tap','low','held_for_final_check',$5)",[a.tenantId,a.jobId,signalId,randomUUID(),scopeItemId]);
 // The shadow role cannot read original evidence rows; the fixture reads the exact row as admin and writes its values.
 const row=(await f.admin.query("SELECT id,object_version_id,sha256,server_received_at::text received FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[a.tenantId,a.jobId,evidence])).rows[0];
 await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($2,$3,$1,$4,$5,$6,$7::timestamptz)",[signalId,a.tenantId,a.jobId,row.id,row.object_version_id,row.sha256,row.received]);});return signalId;}
export async function availableFinalCheck(f:FinalCheckFixture,a:FinalCheckJob,outcome:FinalCheckClassification['outcome']='reveal'){
 const evidence=await insertFinalCheckEvidence(f,a),signalId=await finalCheckProposal(f,a,evidence,outcome==='already_in_original_scope'?a.scopeItemId:null);await a.lock();const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId),s=m.sources[0]!;
 await repo.record(a.context,a.jobId,m.id,s.id,randomUUID(),{version:"final-check.source-result.v1",inputHash:s.inputHash,status:"detected",failureCode:null,signalIds:[signalId]});
 const p:FinalCheckClassification={signalId,expectedRevision:0,outcome,references:outcome==='already_in_original_scope'?[a.scopeItemId]:[],comparisons:{baselineItemIds:[a.scopeItemId],captureIds:[],lockedLineIds:[a.lineId]}};
 const result=await repo.reconcile(a.context,a.jobId,m.id,[p]) as {runId:string;lockId:string};
 return {...result,signalId,manifest:m,classification:p,body:{version:"final-check.disposition.v1" as const,commandId:randomUUID(),lockId:result.lockId,runId:result.runId,signalId,expectedSignalRevision:1,answer:"not_completed" as const,referenceId:null}};
}
