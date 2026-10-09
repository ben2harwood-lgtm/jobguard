import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS, SwitchJobLiveMutation, withTenant, DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M, PracticeActivationRepository, FinalAccountCommandService, QuoteRepository, insertVariationProposal, UserCommandDispatcher, SwitchJobLiveV3Mutation, prepareActivationFixtureV3, seedActivationFixturesV3, issuePracticeSession, authenticatePracticeSession, authorizePracticeJob } from "../src/index.js";
import { freePort, closeTestPools } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const context=testTenantContext(T);
const originalEnvironment=process.env.JOBGUARD_ENV;
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string,pgPort:number;
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";
 dir=await mkdtemp(join(tmpdir(),"ch1-pg-"));const port=pgPort=await freePort(57200,200);
 pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();
 admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);
 await admin.query(`INSERT INTO control_plane.tenant(id)VALUES('${T}');INSERT INTO identity.identity_user(id)VALUES('d1500000-0000-4000-8000-000000000001');INSERT INTO app.account(id,tenant_id,name)VALUES('d1500000-0000-4000-8000-000000000002','${T}','Synthetic');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${M}','${T}','d1500000-0000-4000-8000-000000000002','d1500000-0000-4000-8000-000000000001','owner');CREATE ROLE ch1_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS;GRANT jobguard_runtime TO ch1_login;`);
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"ch1_login",password:"synthetic",max:4});
},60000);
afterAll(async()=>{await closeTestPools(runtime,admin);await pg?.stop();await rm(dir,{recursive:true,force:true});if(originalEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=originalEnvironment;});
const counts=async(jobId:string)=>(await admin.query(`SELECT (SELECT count(*)::int FROM app.job_activation WHERE job_id=$1) activations,(SELECT count(*)::int FROM app.job_activation_terms WHERE job_id=$1) terms,(SELECT count(*)::int FROM app.cap_snapshot WHERE job_id=$1) caps,(SELECT count(*)::int FROM app.synthetic_obligation WHERE job_id=$1) obligations,(SELECT count(*)::int FROM app.journal WHERE tenant_id=$2) journals`,[jobId,T])).rows[0];
describe("CH-1 v3 activation",()=>{
 it("owns the saved v1 sample per session and refuses a client pricing-generation switch",async()=>{
  const creator=await issuePracticeSession(runtime),stranger=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,creator);
  const sample=(await admin.query(`SELECT id,saved_v1_sample FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND practice_scenario='v1_sample'`,[T,auth.digest])).rows;
  expect(sample).toHaveLength(1);expect(sample[0].saved_v1_sample).toBe(true);
  await expect(authorizePracticeJob(runtime,creator,sample[0].id)).resolves.toMatchObject({context:{tenantId:T}});
  await expect(authorizePracticeJob(runtime,stranger,sample[0].id)).rejects.toThrow("NOT_FOUND");
  expect(await counts(sample[0].id)).toEqual({activations:0,terms:0,caps:0,obligations:0,journals:0});
  await expect(withTenant(runtime,context,db=>db.$client.query(`UPDATE app.job SET saved_v1_sample=false WHERE tenant_id=$1 AND id=$2`,[T,sample[0].id]))).rejects.toMatchObject({code:"42501"});
 });
 it("DW1/DW5 generates three named fixtures through the real command, without historic financial effects",async()=>{
  const jobs=await seedActivationFixturesV3(admin,runtime,context);
  for(const [name,net,small] of [["core-1000",100000,true],["recovery-18800",1880000,false],["shadow-30000",3000000,false]] as const){
   const view=await new PracticeActivationRepository(runtime).view(context,jobs[name]);
   expect(view.terms).toMatchObject({acceptedNetPence:net,highestSentNetPence:net,smallJob:small,policyVersion:"reference_fee_policy_v3",trialPlanContext:"none_recorded_pre_mon2a",commercialTrack:"small_builder"});
   expect(await counts(jobs[name])).toEqual({activations:1,terms:1,caps:0,obligations:0,journals:0});
  }
 });
 it("binds a higher sent net even when the accepted net is small",async()=>{
  const job=await prepareActivationFixtureV3(admin,context,"higher-sent",100000,runtime,200000),repo=new PracticeActivationRepository(runtime);
  await repo.start(context,job,{commandId:randomUUID(),scenario:"no_charge"});
  expect((await repo.view(context,job)).terms).toMatchObject({acceptedNetPence:100000,highestSentNetPence:200000,smallJob:false});
 });
 it("DW1 replays, serializes two clients and rejects command-id reuse with a different payload",async()=>{
  const job=await prepareActivationFixtureV3(admin,context,"race",100000),repo=new PracticeActivationRepository(runtime),commandId=randomUUID();
  await Promise.all([repo.start(context,job,{commandId,scenario:"no_charge"}),repo.start(context,job,{commandId:randomUUID(),scenario:"no_charge"})]);
  await repo.start(context,job,{commandId,scenario:"no_charge"});
  expect(await counts(job)).toEqual({activations:1,terms:1,caps:0,obligations:0,journals:0});
  await expect(repo.start(context,job,{commandId,scenario:"simulated_base_obligation"})).rejects.toThrow("COMMAND_CONFLICT");
 });
 it("keeps parties mandatory and rolls failed activation back before audit",async()=>{
  const job=await prepareActivationFixtureV3(admin,context,"parties-guard",100000),before=(await admin.query(`SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1`,[T])).rows[0].n;
  // Fault fixture: remove only the mutable current pointer with owner credentials.
  await admin.query(`DELETE FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2`,[T,job]);
  await expect(new PracticeActivationRepository(runtime).start(context,job,{commandId:randomUUID(),scenario:"no_charge"})).rejects.toThrow("JOB_PARTIES_REQUIRED");
  expect(await counts(job)).toEqual({activations:0,terms:0,caps:0,obligations:0,journals:0});
  expect((await admin.query(`SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1`,[T])).rows[0].n).toBe(before);
 });
 it("DW4 denies runtime edits and keeps classification after later commercial activity",async()=>{
  const job=await prepareActivationFixtureV3(admin,context,"immutable",199999),repo=new PracticeActivationRepository(runtime);
  await repo.start(context,job,{commandId:randomUUID(),scenario:"no_charge"});const before=(await repo.view(context,job)).terms;
  for(const sql of [`UPDATE app.job_activation_terms SET small_job=false WHERE job_id=$1`,`DELETE FROM app.job_activation_terms WHERE job_id=$1`,`TRUNCATE app.job_activation_terms`])await expect(withTenant(runtime,context,db=>db.$client.query(sql,sql.includes('$1')?[job]:[]))).rejects.toMatchObject({code:"42501"});
  const workspace=await new QuoteRepository(runtime).readWorkspace(context,job),line=workspace.revisions.at(-1)!.lines[0];
  await new QuoteRepository(runtime).saveDraft(context,{jobId:job,draftId:workspace.draft!.id,expectedRevision:workspace.draft!.revision,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",effectiveAt:new Date(),lines:[{...line,unitRatePence:400000}]});
  await withTenant(runtime,context,db=>insertVariationProposal(db,T,{version:"variation-proposal.v1",id:randomUUID(),jobId:job,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:line.scopeItemId,captureKind:"text",captureText:"Later fictional extra",description:"Later fictional extra",suggestion:null}));
  // The MON-1 trip is not implemented here; a later job revision cannot mutate terms.
  await admin.query(`UPDATE app.job SET title='Later £4,000 trip recorded separately',revision=revision+1 WHERE id=$1`,[job]);
  expect((await repo.view(context,job)).terms).toEqual(before);
  await expect(admin.query(`UPDATE app.job_activation_terms SET small_job=false WHERE job_id=$1`,[job])).rejects.toMatchObject({code:"55000"});
 });
 it("fails closed for missing/foreign contexts, non-members and wrong-job accepted documents",async()=>{
  const job=await prepareActivationFixtureV3(admin,context,"boundary",100000),other=await prepareActivationFixtureV3(admin,context,"other",100000),repo=new PracticeActivationRepository(runtime);
  expect((await runtime.query(`SELECT * FROM app.job_activation_terms`)).rows).toEqual([]);
  await expect(runtime.query(`SELECT app.switch_job_live_v3($1,$2,$3,$4,$5,1,$6,0,$7,$8,$9)`,[T,randomUUID(),randomUUID(),job,randomUUID(),"a".repeat(64),M,randomUUID(),randomUUID()])).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.job_activation_terms(id,tenant_id,job_id,activation_id,baseline_quote_version_id,baseline_document_version,baseline_document_hash,accepted_net_pence,highest_sent_net_pence,small_job,policy_version,commercial_track,trial_plan_context) VALUES($1,$2,$3,$4,$5,1,$6,100000,100000,true,'reference_fee_policy_v3','small_builder','none_recorded_pre_mon2a')`,[randomUUID(),T,job,randomUUID(),randomUUID(),"a".repeat(64)]))).rejects.toMatchObject({code:"42501"});
  await expect(repo.view(testTenantContext("22222222-2222-4222-8222-222222222222"),job)).rejects.toThrow("NOT_FOUND");
  const row=(await admin.query(`SELECT accepted_quote_version_id FROM app.job WHERE id=$1`,[other])).rows[0];
  const doc=(await admin.query(`SELECT document_version,content_hash FROM app.quote_document_version WHERE id=$1`,[row.accepted_quote_version_id])).rows[0];
  const input={version:"switch-live.v3",activationId:randomUUID(),termsId:randomUUID(),jobId:job,acceptedDocumentId:row.accepted_quote_version_id,acceptedDocumentVersion:doc.document_version,acceptedDocumentHash:doc.content_hash,expectedJobRevision:(await admin.query(`SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2`,[T,job])).rows[0].revision};
  const command={version:"command.v1",commandId:randomUUID(),commandType:"job.switch_live",semanticKey:`boundary:${job}`,actorMembershipId:M,subjectType:"job",subjectRef:job,action:{actionType:"job.switch_live",recipient:null,contentHash:doc.content_hash,aggregateRevision:doc.document_version,amountPence:null,currency:null,policyVersion:"synthetic_demo_activation.v3",expiresAt:new Date("2099-01-01")}};
  await expect(new UserCommandDispatcher(runtime).dispatch(context,command,new SwitchJobLiveV3Mutation(T,input))).rejects.toMatchObject({code:"40001"});
  await expect(new UserCommandDispatcher(runtime).dispatch(context,{...command,actorMembershipId:randomUUID()},new SwitchJobLiveV3Mutation(T,input))).rejects.toThrow("FORBIDDEN");
  expect(await counts(job)).toEqual({activations:0,terms:0,caps:0,obligations:0,journals:0});
 });

 it("rechecks revoked membership before replaying a successful activation",async()=>{
  const job=await prepareActivationFixtureV3(admin,context,"revoked-replay",100000),repo=new PracticeActivationRepository(runtime),input={commandId:randomUUID(),scenario:"no_charge" as const};
  await repo.start(context,job,input);await admin.query(`UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2`,[T,M]);
  try{await expect(repo.start(context,job,input)).rejects.toThrow("FORBIDDEN");expect(await counts(job)).toEqual({activations:1,terms:1,caps:0,obligations:0,journals:0});}finally{await admin.query(`UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2`,[T,M]);}
 });
 it("inspects actual catalog privileges, RLS, owner and qualified keys",async()=>{
  const table=(await admin.query(`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='app.job_activation_terms'::regclass`)).rows[0];
  expect(table).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"});
  const grants=(await admin.query(`SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name='job_activation_terms' ORDER BY privilege_type`)).rows;
  expect(grants).toEqual([{privilege_type:"INSERT"},{privilege_type:"SELECT"}]);
  const f=(await admin.query(`SELECT prosecdef,proconfig,pg_get_userbyid(proowner) owner,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime FROM pg_proc WHERE oid='app.switch_job_live_v3(uuid,uuid,uuid,uuid,uuid,integer,character,integer,uuid,uuid,uuid)'::regprocedure`)).rows[0];
  expect(f).toEqual({prosecdef:true,proconfig:["search_path=pg_catalog, app"],owner:"jobguard_migration",runtime:true});
  const keys=(await admin.query(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.job_activation_terms'::regclass AND contype='f'`)).rows.map(r=>r.definition).join(" ");
  expect(keys).toContain("FOREIGN KEY (tenant_id, job_id, activation_id)");expect(keys).toContain("FOREIGN KEY (tenant_id, job_id, baseline_quote_version_id)");expect(keys).toContain("FOREIGN KEY (tenant_id, job_id, commercial_track)");
 });
 it("upgrades from the schema just before CH-1's migration without rewriting v1 commercial rows",async()=>{
  await admin.query("CREATE DATABASE ch1_upgrade");const upgrade=new Pool({host:"127.0.0.1",port:pgPort,user:"postgres",password:"synthetic",database:"ch1_upgrade"});
  try{
   // The existing migration runner, on real PG, is told the last migration is
   // already applied only during this setup pass. Its earlier SQL is unchanged.
   await migrate({query:async(sql:string,values?:unknown[])=>values?.[0]==="0109_job_activation_terms.sql"&&sql.startsWith("SELECT 1 FROM public.jobguard_schema_migration")?{rows:[{}],rowCount:1}:upgrade.query(sql,values)} as Pick<Pool,"query">);
   await upgrade.query(`INSERT INTO control_plane.tenant(id)VALUES('${T}');INSERT INTO identity.identity_user(id)VALUES('d1500000-0000-4000-8000-000000000001');INSERT INTO app.account(id,tenant_id,name)VALUES('d1500000-0000-4000-8000-000000000002','${T}','Synthetic');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${M}','${T}','d1500000-0000-4000-8000-000000000002','d1500000-0000-4000-8000-000000000001','owner');`);
   const job=await prepareActivationFixtureV3(upgrade,context,"historic-upgrade",100000),row=(await upgrade.query(`SELECT j.revision,d.id,d.document_version,d.content_hash FROM app.job j JOIN app.quote_document_version d ON(d.tenant_id,d.id)=(j.tenant_id,j.accepted_quote_version_id) WHERE j.id=$1`,[job])).rows[0];
   const input={version:"switch-live.v1",activationId:randomUUID(),capSnapshotId:randomUUID(),syntheticObligationId:null,jobId:job,acceptedDocumentId:row.id,acceptedDocumentVersion:row.document_version,acceptedDocumentHash:row.content_hash,expectedJobRevision:row.revision,acceptedNetValuePence:100000,recoveryCapPence:1500,mode:"pilot_no_charge",activationTermsVersion:"pilot_no_charge.v1",feePolicyVersion:"reference_fee_policy_v1",activatedAt:new Date()};
   await new UserCommandDispatcher(upgrade).dispatch(context,{version:"command.v1",commandId:randomUUID(),commandType:"job.switch_live",semanticKey:`historic:${job}`,actorMembershipId:M,subjectType:"job",subjectRef:job,action:{actionType:"job.switch_live",recipient:null,contentHash:row.content_hash,aggregateRevision:row.document_version,amountPence:null,currency:null,policyVersion:"pilot_no_charge.v1",expiresAt:new Date("2099-01-01")}},new SwitchJobLiveMutation(T,"pilot_no_charge",input));
   const snapshot=async()=>(await upgrade.query(`SELECT row_to_json(a) activation,row_to_json(c) snapshot FROM app.job_activation a JOIN app.cap_snapshot c ON(c.tenant_id,c.activation_id)=(a.tenant_id,a.id)`)).rows;
   const before=await snapshot();await migrate(upgrade);await migrate(upgrade);expect(await snapshot()).toEqual(before);
   expect((await upgrade.query(`SELECT count(*)::int n FROM app.job_activation_terms`)).rows[0].n).toBe(0);
   const names=MIGRATION_URLS.map(url=>fileURLToPath(url).split("/").at(-1)!),own=names.indexOf("0109_job_activation_terms.sql"),feed=names.indexOf("0106_practice_feed.sql");expect(feed).toBeGreaterThanOrEqual(0);expect(own).toBeGreaterThan(feed);expect(names.every((name,index)=>index===0||names[index-1]<name)).toBe(true);expect((await upgrade.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row=>row.migration_name)).toEqual(names);
   expect((await readFile(fileURLToPath(MIGRATION_URLS[own]!),"utf8")).trim()).toMatch(/^BEGIN;[\s\S]*COMMIT;$/u);
  }finally{await closeTestPools(upgrade);}
 });
 it("DW3 snapshots/exports and the immutable terms contain no historic copy",async()=>{
  const job=(await admin.query(`SELECT job_id FROM app.job_activation_terms LIMIT 1`)).rows[0].job_id;
  await new FinalAccountCommandService(runtime).assemble(context,{version:"final-account.assemble.v1",commandId:randomUUID(),jobId:job,actorMembershipId:M});
  const rows=await admin.query(`SELECT d.snapshot::text text FROM app.quote_document_version d JOIN app.job_activation_terms t ON(t.tenant_id,t.job_id)=(d.tenant_id,d.job_id) UNION ALL SELECT row_to_json(t)::text FROM app.job_activation_terms t UNION ALL SELECT row_to_json(f)::text FROM app.final_account_revision f WHERE job_id IN(SELECT job_id FROM app.job_activation_terms) UNION ALL SELECT convert_from(pdf_bytes,'UTF8') FROM app.customer_invoice WHERE job_id IN(SELECT job_id FROM app.job_activation_terms)`);
  expect(rows.rowCount).toBeGreaterThan(0);for(const row of rows.rows)expect(row.text).not.toMatch(/£79|\bcap\b|plan credit/iu);
 });
});
