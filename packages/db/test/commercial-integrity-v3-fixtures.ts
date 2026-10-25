import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { issuePracticeSession, authenticatePracticeSession } from "../src/practice-session.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { CommercialIntegrityV3Repository } from "../src/commercial-integrity-v3-repository.js";
import { canonicalCommercialIntegritySnapshot } from "../../core/src/commercial-integrity-v3.js";
import { freePort, closeTestPools } from "./pool-test-utils.js";
export const tenant="11111111-1111-4111-8111-111111111111", member="d1500000-0000-4000-8000-000000000003", user="d1500000-0000-4000-8000-000000000001";
export const actor={membershipId:member,identityUserId:user};
export const migrationUrl=new URL("../migrations/0227_commercial_integrity_v3_receipts.sql",import.meta.url);
export async function createIntegrityFixture(throughCurrent=true, encoding: "UTF8" | "SQL_ASCII" = "UTF8") {
 const dir=await mkdtemp(join(tmpdir(),"ch6-p-")),port=await freePort(59200,300),password=randomUUID();
 const logs:string[]=[];
 const pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C",`--encoding=${encoding}`],onLog:line=>logs.push(line)});
 await pg.initialise();await pg.start();
 const admin=new Pool({host:"127.0.0.1",port,user:"postgres",password,database:"postgres"});
 if(throughCurrent)await migrate(admin);
 else {
  for(const url of MIGRATION_URLS.filter(url=>url.pathname<migrationUrl.pathname))await admin.query(await readFile(url,"utf8"));
 }
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[tenant]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[user]);
 const account=randomUUID();await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'CH6 fictional builder')",[account,tenant]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[member,tenant,account,user]);
 // Test login only, not a new application role or deployment grant.
 const login=`ch6_${randomUUID().replaceAll("-","")}`;
 await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_runtime TO ${login}`);
 await admin.query(`ALTER ROLE ${login} SET log_statement='all'`);
 const runtime=new Pool({host:"127.0.0.1",port,user:login,password,database:"postgres",max:2});
 const previous=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
 const token=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,token);
 const otherToken=await issuePracticeSession(runtime),other=await authenticatePracticeSession(runtime,otherToken);
 const repo=new CommercialIntegrityV3Repository(runtime);
 return {admin,runtime,repo,auth,other,logs,login,async close(){if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true});}};
}
export type IntegrityFixture=Awaited<ReturnType<typeof createIntegrityFixture>>;
export async function transaction<T>(pool:Pool,work:(db:PoolClient)=>Promise<T>) {
 const db=await pool.connect();try{await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);const result=await work(db);await db.query("COMMIT");return result;}catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}
export async function seedIntegrityJob(f:IntegrityFixture,invoice=true) {
 const job=randomUUID(),quote=randomUUID(),draft=randomUUID(),revision=randomUUID();
 await transaction(f.admin,async db=>{
  await db.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario,created_at) VALUES($1,$2,'Fictional ordinary source',$3,'capture',clock_timestamp()-interval '1 hour')",[job,tenant,f.auth.digest]);
  await seedSyntheticPartyFixture(db,tenant,job);
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture')",[tenant,job]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')",[quote,tenant,job,"a".repeat(64)]);
  await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[draft,tenant,job]);
  await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',100000,20000,120000,false,'[]')`,[revision,tenant,job,draft,"a".repeat(64),quote]);
 });
 if(invoice)await addIntegrityInvoice(f,job,revision);
 return {job,quote,draft,revision};
}
/** Populated ordinary immutable source fixtures; not a browser journey or live provider. */
export async function addIntegrityInvoice(f:IntegrityFixture,job:string,revision:string) {
 const invoice=randomUUID(),decision=randomUUID(),resolution=randomUUID(),authorization=randomUUID();
 await transaction(f.admin,async db=>{
  await db.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'final_account.issue')",[decision,tenant,job]);
  await db.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[resolution,tenant,decision,member]);
  await db.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at)
   VALUES($1,$2,$3,$4,$5,'final_account.issue',$6,1,'synthetic.ch6.source',clock_timestamp()+interval '1 day')`,[authorization,tenant,decision,resolution,member,"a".repeat(64)]);
  await db.query(`INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
   VALUES($1,$2,$3,$4,$5,$6,current_date,'{}','candidate_m1_standard_v1','GBP',100000,20000,120000,$7,$7,$8,true,'SYNTHETIC - NOT A REAL INVOICE')`,[invoice,tenant,job,revision,authorization,`CH6-${invoice.replaceAll("-","").slice(0,24)}`,"a".repeat(64),Buffer.from("synthetic fixture")]);
 });
 return invoice;
}
export async function reviewFor(f:IntegrityFixture,job:string) {
 const view=await f.repo.read(f.auth.context,actor,f.auth.digest,job),finding=view.result.findings[0];
 if(!finding)throw new Error("Missing ordinary finding");
 return {version:"commercial-integrity-review.v3" as const,commandId:randomUUID(),findingKey:finding.key,findingSnapshotHash:createHash("sha256").update(canonicalCommercialIntegritySnapshot(finding.sourceSnapshot)).digest("hex"),outcome:"dismissed_false_positive" as const,explanation:"Legitimate interim invoice."};
}
export async function protectedFacts(f:IntegrityFixture) {
 const tables=["job","job_activation","job_activation_terms","job_commercial_track","journal","journal_line","action_authorization","decision","customer_invoice","customer_payment","customer_payment_reversal","receipt_line_allocation","final_account_lock","final_account_draft","final_account_revision","meter_input_event","meter_computation","meter_day_ledger","job_work_state_event","subscription_period"];
 const result:Record<string,unknown>={};
 // Named columns are selected from actual information_schema; whole-row JSON only for snapshot comparison,
 // no schema/table absence is silently ignored.
 for(const table of tables){
  const exists=await f.admin.query("SELECT to_regclass($1) present",[`app.${table}`]);
  if(!exists.rows[0].present)throw new Error(`STOP missing protected table app.${table}`);
  const columns=(await f.admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>`"${r.column_name}"`).join(",");
  result[table]=(await f.admin.query(`SELECT ${columns} FROM app.${table} ORDER BY tenant_id`)).rows.map(row=>JSON.stringify(row)).sort();
 }
 return result;
}
export async function addIntegrityPayment(f:IntegrityFixture,job:string) {
 const invoice=(await f.admin.query("SELECT id,authorization_id FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2 LIMIT 1",[tenant,job])).rows[0],id=randomUUID();
 await transaction(f.admin,db=>db.query(`INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance)
 VALUES($1,$2,$3,$4,$5,current_date,1000,'GBP','cash','Fictional attestation',true,'manual_builder_attestation')`,[id,tenant,job,invoice.id,invoice.authorization_id]));
 return id;
}
export async function addIntegrityLock(f:IntegrityFixture,x:Awaited<ReturnType<typeof seedIntegrityJob>>) {
 const {withTenant}=await import("../src/tenant-context.js"),{appendAuditBatch}=await import("../src/audit.js");
 const id=randomUUID(),command=randomUUID(),event=randomUUID();
 await withTenant(f.admin,f.auth.context,async db=>{
  await db.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
   VALUES($1,$2,'synthetic.ch6.lock-fixture',$1::uuid::text,repeat('a',64),'succeeded','{}',$3,clock_timestamp())`,[command,tenant,member]);
  await db.$client.query(`INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
   VALUES($1,$2,$3,$4,$5,repeat('a',64),repeat('a',64),repeat('a',64),repeat('a',64),'{}','I''ve reviewed the work and extras on this job and this is my complete final account.','final_account_declaration.v1','synthetic_final_check_terms.v1',$6,clock_timestamp(),$7,$8)`,[tenant,x.job,id,x.revision,x.quote,member,command,event]);
  await appendAuditBatch(db,[{id:event,version:"audit.v1",actorRef:`membership:${member}`,eventType:"synthetic.ch6.lock_fixture",subjectType:"job",subjectRef:x.job,payload:{references:{jobId:x.job}}}]);
 });
 return id;
}
