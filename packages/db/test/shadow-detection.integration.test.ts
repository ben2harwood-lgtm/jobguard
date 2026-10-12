import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectShadowObservations, parseObservation, proposalFromObservation, shadowCaptureV1, type Observation } from "@jobguard/core";
import { ShadowDetectionRepository } from "../src/shadow-detection-repository.js";
import { ShadowObservationReader, FixtureObservationSources } from "../src/shadow-observation-reader.js";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { listDecisionInbox } from "../src/decision-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { freePort, closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
const T=randomUUID(), O=randomUUID(), J=randomUUID(), K=randomUUID(), L=randomUUID(), M=randomUUID(), U=randomUUID();
const at="2026-10-01T00:00:00Z", credential=randomUUID();
let postgres:EmbeddedPostgres, admin:Pool, runtime:Pool, shadow:Pool, emergency:Pool, directory:string, port:number;
const pool=(user:string,database="postgres")=>new Pool({host:"127.0.0.1",port,database,user,password:credential,max:2});
async function fixtureContext<R>(p:Pool,tenant:string,work:(db:PoolClient)=>Promise<R>){const db=await p.connect();try{await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);const result=await work(db);await db.query("COMMIT");return result}catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}}
async function seed(p:Pool=admin){
 await installLegacySyntheticPartyFixtures(p);
 for(const [tenant,job] of [[T,J],[T,K],[O,L]]){await p.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[tenant]);await p.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional SV-3 job','live')",[job,tenant]);await p.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING",[tenant,job]);}
 await p.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);const a=randomUUID();
 await p.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SV-3')",[a,T]);
 await p.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,a,U]);
}
async function setup(){
 directory=await mkdtemp(join(tmpdir(),"sv3-pg16-"));port=await freePort(58500,500);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:credential,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();admin=pool("postgres");await migrate(admin);await seed();
 for(const [login,role] of [["sv3_runtime","jobguard_runtime"],["sv3_shadow","jobguard_shadow"],["sv3_emergency","jobguard_shadow_emergency_access"]]){await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT ${role} TO ${login}`);}
 runtime=pool("sv3_runtime");shadow=pool("sv3_shadow");emergency=pool("sv3_emergency");
 await withTenant(runtime,testTenantContext(T),db=>db.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)",[T,M,randomUUID(),"synthetic_final_check_terms.v1"]));
}
async function evidence(o:Observation,p:Pool=admin){
 await fixtureContext(p,o.tenantId,async db=>{
  const upload=randomUUID();await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
   VALUES($1,$2,$3,$4,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day')`,[upload,o.tenantId,o.jobId,`synthetic/${upload}`,o.evidence.sha256]);
  await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   VALUES($1,$2,$3,$4,'original','completion_photo',$5,$6,$7,100,'image/png','standard_evidence',$8,$8)`,[o.evidence.id,o.tenantId,upload,o.jobId,`synthetic/${upload}`,o.evidence.objectVersionId,o.evidence.sha256,o.evidence.serverReceivedAt]);
 });
}
function observation(changes:Partial<Observation>={}):Observation{return parseObservation({version:"observation.v1",tenantId:T,jobId:J,kind:"completion_photo",evidence:{id:randomUUID(),objectVersionId:"synthetic-v1",sha256:"a".repeat(64),serverReceivedAt:at},text:"Fitted outside tap.",citations:[{start:0,end:19,quote:"Fitted outside tap."}],facts:{workReference:randomUUID(),scopeArea:"job",description:"outside tap",status:"completed",estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false},...changes});}
const batch=(observations:readonly Observation[],captures:ReturnType<typeof shadowCaptureV1.parse>[]=[])=>( {version:"shadow-detection-batch.v1",jobId:J,observations,captures,proposals:detectShadowObservations(observations,[],at)} );
const routine="SELECT app.surface_shadow_signal_early($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)";
const firingArgs=(o:Observation,signal:string)=>[T,J,signal,randomUUID(),randomUUID(),randomUUID(),"prior_written_agreement","shadow_attribution_policy_v3",o.evidence.id,o.evidence.objectVersionId,JSON.stringify(o.facts)];
describe("SV-3 real PostgreSQL detection, atomic disclosure and permissions",()=>{
 beforeAll(setup,60000);afterAll(async()=>{await closeTestPools(runtime,shadow,emergency,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true})});
 it("J: email, message and photo coalesce to one survivor with three evidence links; replay and new sources add no survivor",async()=>{
  const workReference=randomUUID(),obs=["customer_request","note_or_voice","completion_photo"].map(kind=>{const o=observation();return observation({...o,kind:kind as Observation["kind"],facts:{...o.facts,workReference}})});
  for(const o of obs)await evidence(o);const repo=new ShadowDetectionRepository(shadow);await repo.persist(testTenantContext(T),batch(obs));await repo.persist(testTenantContext(T),batch([...obs].reverse()));
  const signals=(await admin.query("SELECT id,coalesced_into_signal_id,work_id FROM app.shadow_commercial_signal WHERE work_id=$1",[detectShadowObservations(obs,[],at)[0]!.workId])).rows;
  expect(signals.filter(s=>s.coalesced_into_signal_id===null)).toHaveLength(1);expect(new Set(signals.map(s=>s.work_id)).size).toBe(1);
  const primary=signals.find(s=>s.coalesced_into_signal_id===null)!.id;expect((await admin.query("SELECT evidence_id FROM app.shadow_signal_evidence WHERE signal_id=$1",[primary])).rows).toHaveLength(3);
  const next=observation({...obs[0]!,evidence:{...obs[0]!.evidence,id:randomUUID()}});await evidence(next);await repo.persist(testTenantContext(T),batch([...obs,next]));
  expect((await admin.query("SELECT id FROM app.shadow_commercial_signal WHERE work_id=$1 AND coalesced_into_signal_id IS NULL",[signals[0].work_id])).rows).toEqual([{id:primary}]);
 });
 it.each(["draft","rejected","withdrawn"] as const)("P: a %s never-priced capture is matched, with no fee eligibility or Decision",async state=>{
  const o=observation(),scope=randomUUID(),variation=randomUUID();await evidence(o);
  await fixtureContext(admin,T,async db=>{await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,T,J]);await db.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,state) VALUES($1,$2,$3,$4,'text','outside tap','outside tap',$5)",[variation,T,J,scope,state==="withdrawn"?"draft":state]);if(state==="withdrawn")await db.query("INSERT INTO app.variation_withdrawal(tenant_id,job_id,id,variation_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,$5,'builder_withdrawn')",[T,J,randomUUID(),variation,M])});
  const capture=shadowCaptureV1.parse({version:"shadow-capture.v1",tenantId:T,jobId:J,id:variation,scopeItemId:scope,revisionId:variation,serverRecordedAt:at,valuePence:null,kind:"log_extra",state,scopeArea:"job",description:"outside tap",recordedPhase:"pre_lock",aiStructured:false,sourceRef:variation});
  const request=batch([o],[capture]);request.proposals=[proposalFromObservation(o,"ai_proposal","synthetic.v1",at,{lock:"before_lock",adoption:"after_adoption"})];
  await new ShadowDetectionRepository(shadow).persist(testTenantContext(T),request);
  expect((await admin.query("SELECT state,outcome,matched_variation_id FROM app.shadow_commercial_signal WHERE id=$1",[request.proposals[0]!.signalId])).rows).toEqual([{state:"held_for_final_check",outcome:"builder_captured",matched_variation_id:variation}]);
  expect((await admin.query("SELECT id FROM app.job_finding WHERE subject_ref=$1",[request.proposals[0]!.signalId])).rows).toEqual([]);
 });
 it("I: £8,000 synthetic significance fires despite model hold/low confidence, and is shown by the inbox; replay conflicts and disclosure cannot clear",async()=>{
  const base=observation(),o=observation({...base,facts:{...base.facts,estimatedValuePence:800000,customerClearlyRequested:true,needsPriorWrittenAgreement:true,significantWork:{basis:"synthetic_fixture",sourceRef:"synthetic:I",significant:true}}});await evidence(o);
  const {ShadowFixtureProposer}=await import(new URL("../../ai/dist/shadow-proposal.js",import.meta.url).href);
  const model=new ShadowFixtureProposer({f:{output:{version:"shadow-ai-proposals.v1",proposals:[{description:"outside tap",confidenceBand:"low",recommendation:"hold",citation:o.citations[0]}]},citations:[]}});
  const repo=new ShadowDetectionRepository(shadow),request=batch([o]);request.proposals=[...(await model.propose(o,"f",at)).proposals];
  await repo.persist(testTenantContext(T),request);await repo.persist(testTenantContext(T),request);
  const s=request.proposals[0]!.signalId,firing=(await admin.query("SELECT * FROM app.shadow_must_surface_firing WHERE signal_id=$1",[s])).rows;
  expect(firing).toHaveLength(1);expect(firing[0]).toMatchObject({rule:"prior_written_agreement",rule_version:"shadow_attribution_policy_v3",source_ref:o.evidence.id});
  expect((await admin.query("SELECT state,disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[s])).rows).toEqual([{state:"surfaced_early",disclosed_before_lock:true}]);
  expect((await admin.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE signal_id=$1 ORDER BY reason",[s])).rows).toEqual([{reason:"disclosed_before_lock"},{reason:"surfaced_early"}]);
  const inbox=await withTenant(runtime,testTenantContext(T),db=>listDecisionInbox(db,J));expect(inbox).toContainEqual(expect.objectContaining({decision_id:firing[0].decision_id,kind:"must_surface_signal",classification:"mandatory",title:"outside tap"}));
  const args=[T,J,s,firing[0].id,firing[0].decision_id,firing[0].disclosure_event_id,"prior_written_agreement","shadow_attribution_policy_v3",o.evidence.id,o.evidence.objectVersionId,JSON.stringify({...o.facts,description:"changed"})];
  await expect(withTenant(shadow,testTenantContext(T),db=>db.$client.query(routine,args))).rejects.toMatchObject({code:"23505"});
  await expect(admin.query("UPDATE app.shadow_commercial_signal SET disclosed_before_lock=false WHERE id=$1",[s])).rejects.toMatchObject({code:"55000"});
  await expect(withTenant(shadow,testTenantContext(T),db=>db.$client.query("UPDATE app.shadow_commercial_signal SET state='revealed' WHERE id=$1",[s]))).rejects.toMatchObject({code:"55000"});
  expect((await admin.query("SELECT payload FROM app.audit_event WHERE id=$1",[firing[0].audit_event_id])).rows[0].payload.references).toMatchObject({rule:"prior_written_agreement",ruleVersion:"shadow_attribution_policy_v3"});
 });
 it("DW6: an unmatched supplier item is held evidence without a finding, disclosure, notification or outbox action",async()=>{
  const o=observation({kind:"supplier_line"});await evidence(o);const request=batch([o]);const before=(await admin.query("SELECT count(*)::int n FROM app.action_outbox")).rows;
  await new ShadowDetectionRepository(shadow).persist(testTenantContext(T),request);const s=request.proposals[0]!.signalId;
  expect((await admin.query("SELECT state,disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[s])).rows).toEqual([{state:"held_for_final_check",disclosed_before_lock:false}]);
  expect((await admin.query("SELECT id FROM app.job_finding WHERE subject_ref=$1",[s])).rows).toEqual([]);expect((await admin.query("SELECT id FROM app.shadow_disclosure_event WHERE signal_id=$1",[s])).rows).toEqual([]);
  expect((await admin.query("SELECT count(*)::int n FROM app.action_outbox")).rows).toEqual(before);
 });
 it("atomic rollback removes Decision, disclosure, firing and both audit events",async()=>{
  const base=observation(),o=observation({...base,facts:{...base.facts,customerClearlyRequested:true,needsPriorWrittenAgreement:true,significantWork:{basis:"synthetic_fixture",sourceRef:"synthetic:rollback",significant:true}}});await evidence(o);
  const noFire=observation({...o,facts:{...o.facts,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null}}),request=batch([noFire]);await new ShadowDetectionRepository(shadow).persist(testTenantContext(T),request);
  const args=firingArgs(o,request.proposals[0]!.signalId),before=(await admin.query("SELECT count(*)::int n FROM app.audit_event")).rows;
  await expect(withTenant(shadow,testTenantContext(T),async db=>{await db.$client.query(routine,args);throw new Error("rollback")})).rejects.toThrow("rollback");
  for(const [table,id] of [["decision",args[4]],["shadow_disclosure_event",args[5]],["shadow_must_surface_firing",args[3]],["job_finding",args[3]]])expect((await admin.query(`SELECT id FROM app.${table} WHERE id=$1`,[id])).rows).toEqual([]);
  expect((await admin.query("SELECT count(*)::int n FROM app.audit_event")).rows).toEqual(before);
 });
 it("C4: firing catalog is migration-owned, tenant/job-qualified, FORCE RLS, shadow SELECT only and immutable for all roles",async()=>{
  expect((await admin.query(`SELECT r.rolname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='app.shadow_must_surface_firing'::regclass`)).rows).toEqual([{rolname:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true}]);
  expect((await admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid='app.shadow_must_surface_firing'::regclass AND attname='tenant_id'")).rows).toEqual([{attnotnull:true}]);
  const constraints=(await admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.shadow_must_surface_firing'::regclass")).rows.map(r=>r.definition).join("\n");expect(constraints).toContain("FOREIGN KEY (tenant_id, job_id, signal_id, source_ref, object_version_id)");
  expect((await admin.query(`SELECT ARRAY(SELECT pg_get_userbyid(a.grantee)::text FROM aclexplode(p.proacl) a WHERE a.grantee<>p.proowner AND a.privilege_type='EXECUTE' ORDER BY 1) grantees,p.proconfig FROM pg_proc p WHERE p.proname='surface_shadow_signal_early'`)).rows).toEqual([{grantees:["jobguard_shadow"],proconfig:["search_path=pg_catalog, app"]}]);
  for(const role of ["jobguard_runtime","jobguard_infrastructure","jobguard_shadow_emergency_access"])
   expect((await admin.query("SELECT has_table_privilege($1,'app.shadow_must_surface_firing','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed",[role])).rows).toEqual([{allowed:false}]);
  expect((await admin.query("SELECT has_table_privilege('jobguard_shadow','app.shadow_must_surface_firing','SELECT') allowed,has_table_privilege('jobguard_shadow','app.shadow_must_surface_firing','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') forbidden")).rows).toEqual([{allowed:true,forbidden:false}]);
  for(const p of [runtime,shadow,emergency,admin])for(const verb of ["UPDATE app.shadow_must_surface_firing SET id=id","DELETE FROM app.shadow_must_surface_firing","TRUNCATE app.shadow_must_surface_firing"])
    await expect(withTenant(p,testTenantContext(T),db=>db.$client.query(verb))).rejects.toMatchObject({code:p===admin?"55000":"42501"});
  await expect(withTenant(shadow,testTenantContext(T),db=>db.$client.query("INSERT INTO app.shadow_must_surface_firing(tenant_id) VALUES($1)",[T]))).rejects.toMatchObject({code:"42501"});
 });
 it("C4: actual cross-job and cross-tenant firing inserts fail on qualified signal/evidence foreign keys",async()=>{
  const prior=(await admin.query("SELECT * FROM app.shadow_must_surface_firing ORDER BY created_at LIMIT 1")).rows[0];expect(prior).toBeDefined();
  for(const [tenant,job] of [[T,K],[O,L]])await expect(withTenant(admin,testTenantContext(tenant!),async db=>{
   const decision=randomUUID(),finding=randomUUID();await db.$client.query("INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'review')",[tenant,decision,job]);
   await db.$client.query("INSERT INTO app.job_finding(tenant_id,id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision) VALUES($1,$2,$3,$4,$5,'required_proof','mandatory','Fictional proof','','synthetic:boundary','review',0)",[tenant,finding,job,decision,createHash('sha256').update(finding).digest('hex')]);
   await db.$client.query(`INSERT INTO app.shadow_must_surface_firing(tenant_id,job_id,id,signal_id,rule,rule_version,source_ref,object_version_id,decision_id,finding_id,disclosure_event_id,audit_event_id,facts,request_hash,actor_ref)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,'synthetic:boundary')`,[tenant,job,randomUUID(),prior.signal_id,prior.rule,prior.rule_version,prior.source_ref,prior.object_version_id,decision,finding,randomUUID(),randomUUID(),JSON.stringify(prior.facts),prior.request_hash]);
  })).rejects.toMatchObject({code:"23503",constraint:expect.stringMatching(/shadow_must_surface_firing_tenant_id_job_id/u)});
 });
 it.each(["finding", "decision", "disclosure"] as const)("T1: the database refuses a same-tenant other-job %s link, with an accepted matching control",async link=>{
  // Ordinary superuser INSERTs isolate the foreign keys from the routine and RLS.
  const o=observation();await evidence(o);
  const db=await admin.connect(),signalJ=randomUUID(),signalK=randomUUID(),findingJ=randomUUID(),findingK=randomUUID(),decisionJ=randomUUID(),decisionK=randomUUID(),disclosureJ=randomUUID(),disclosureK=randomUUID(),firing=randomUUID();
  try{
   await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[T]);
   for(const [job,signal,decision,finding,disclosure] of [[J,signalJ,decisionJ,findingJ,disclosureJ],[K,signalK,decisionK,findingK,disclosureK]]){
    await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:T1','2026-10-01','Fictional FK control','low')",[T,job,signal]);
    await db.query("INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'review')",[T,decision,job]);
    await db.query("INSERT INTO app.job_finding(tenant_id,id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision) VALUES($1,$2,$3,$4,$5,'required_proof','mandatory','Fictional FK control','','synthetic:T1','review',0)",[T,finding,job,decision,createHash('sha256').update(finding!).digest('hex')]);
    await db.query("INSERT INTO app.shadow_disclosure_event(tenant_id,job_id,id,signal_id,route,actor_ref,before_lock) VALUES($1,$2,$3,$4,'defect','synthetic:T1',true)",[T,job,disclosure,signal]);
   }
   await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[T,J,signalJ,o.evidence.id,o.evidence.objectVersionId,o.evidence.sha256,o.evidence.serverReceivedAt]);
   // Audit parents are genuine chain entries; neither FK triggers nor guards are disabled.
   await db.query("SELECT app.append_shadow_audit($1,$2,'shadow.disclosed')",[disclosureJ,J]);
   await db.query("SELECT app.append_shadow_audit($1,$2,'shadow.disclosed')",[disclosureK,K]);
   await db.query("SET CONSTRAINTS ALL IMMEDIATE");await db.query("SET CONSTRAINTS ALL DEFERRED");
   const insert=(finding:string,decision:string,disclosure:string)=>db.query(`INSERT INTO app.shadow_must_surface_firing(tenant_id,job_id,id,signal_id,rule,rule_version,source_ref,object_version_id,decision_id,finding_id,disclosure_event_id,audit_event_id,facts,request_hash,actor_ref)
    VALUES($1,$2,$3,$4,'safety','shadow_attribution_policy_v3',$5,$6,$7,$8,$9,$10,'{}',repeat('a',64),'synthetic:T1')`,[T,J,firing,signalJ,o.evidence.id,o.evidence.objectVersionId,decision,finding,disclosure,disclosureJ]);
   const foreignKeys=(await db.query<{conname:string;target:string;condeferrable:boolean;condeferred:boolean}>("SELECT conname,confrelid::regclass::text target,condeferrable,condeferred FROM pg_constraint WHERE conrelid='app.shadow_must_surface_firing'::regclass AND contype='f'")).rows;
   const fk=foreignKeys.find(c=>c.target===(link==="disclosure"?"app.shadow_disclosure_event":"app.job_finding"));expect(fk).toBeDefined();
   expect(fk!.condeferrable).toBe(link==="disclosure");expect(fk!.condeferred).toBe(link==="disclosure");
   await db.query("SAVEPOINT bad_link");
   const badFinding=link==="finding"?findingK:findingJ,badDecision=link==="finding"||link==="decision"?decisionK:decisionJ,badDisclosure=link==="disclosure"?disclosureK:disclosureJ;
   if(link==="disclosure"){
    await insert(badFinding,badDecision,badDisclosure); // Deferred link accepts INSERT, then refuses constraint enforcement.
    await expect(db.query("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toMatchObject({code:"23503",constraint:fk!.conname});
   }else await expect(insert(badFinding,badDecision,badDisclosure)).rejects.toMatchObject({code:"23503",constraint:fk!.conname});
   await db.query("ROLLBACK TO SAVEPOINT bad_link");
   await insert(findingJ,decisionJ,disclosureJ);await db.query("SET CONSTRAINTS ALL IMMEDIATE");
   expect((await db.query("SELECT job_id,finding_id,decision_id,disclosure_event_id FROM app.shadow_must_surface_firing WHERE tenant_id=$1 AND id=$2",[T,firing])).rows).toEqual([{job_id:J,finding_id:findingJ,decision_id:decisionJ,disclosure_event_id:disclosureJ}]);
  }finally{await db.query("ROLLBACK");db.release()}
 });
 it("C5: missing/non-member tenant and wrong-job sources fail closed; roles cannot cross pool boundaries",async()=>{
  const o=observation();await evidence(o);const request=batch([o]);await new ShadowDetectionRepository(shadow).persist(testTenantContext(T),request);
  const args=firingArgs(observation({...o,facts:{...o.facts,customerClearlyRequested:true,needsPriorWrittenAgreement:true,significantWork:{basis:"synthetic_fixture",sourceRef:"synthetic:boundary",significant:true}}}),request.proposals[0]!.signalId);
  await expect(shadow.query(routine,args)).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(shadow,testTenantContext(O),db=>db.$client.query(routine,args))).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(shadow,testTenantContext(T),db=>db.$client.query(routine,[...args.slice(0,1),K,...args.slice(2)]))).rejects.toMatchObject({code:"23503"});
  for(const table of ["evidence_object","job","variation","decision"])await expect(shadow.query(`SELECT * FROM app.${table}`)).rejects.toMatchObject({code:"42501"});
  for(const table of ["shadow_commercial_signal","shadow_signal_evidence","shadow_must_surface_firing"])await expect(runtime.query(`SELECT * FROM app.${table}`)).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(runtime,testTenantContext(T),db=>db.$client.query(routine,args))).rejects.toMatchObject({code:"42501"});
 });
 it("reader uses runtime RLS, verified immutable sources, and refuses absent terms",async()=>{
  const o=observation();await evidence(o);const sources=new FixtureObservationSources([o]),reader=new ShadowObservationReader(runtime,sources);
  expect(await sources.decode({tenantId:O,jobId:L,kind:o.kind,evidenceId:o.evidence.id,objectVersionId:o.evidence.objectVersionId,sha256:o.evidence.sha256,text:o.text})).toBeNull();
  const result=await reader.read(testTenantContext(T),{version:"shadow-observation-read.v1",jobId:J});expect(result.observations).toContainEqual(expect.objectContaining({evidence:expect.objectContaining({id:o.evidence.id})}));
  await expect(reader.read(testTenantContext(O),{version:"shadow-observation-read.v1",jobId:J})).rejects.toThrow("OBSERVATION_JOB_UNAVAILABLE");
 });
 it("rule and disclosure audits preserve the existing audit.v1 payload contract and chain",async()=>{
  const rows=(await admin.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`,[T])).rows as AuditEvent[];
  expect(rows.some(r=>r.eventType==="shadow.must_surface_fired")).toBe(true);expect(()=>verifyAuditChain(rows)).not.toThrow();
 });
 it("0129 upgrade proves its own step, named-column text/type preservation, and rolled-back adversarial controls",async()=>{
  // An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare;
  // then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations.
  const database=`sv3_upgrade_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE DATABASE ${database}`);const p=pool("postgres",database);
  try{
   const own=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith("0129_shadow_detection.sql"));expect(own).toBeGreaterThan(0);
   await p.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
   for(const url of MIGRATION_URLS.slice(0,own)){
    const name=url.pathname.split('/').at(-1)!;let sql=await readFile(url,"utf8");if(name==="0095_job_parties.sql")sql=sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);");
    await p.query(sql);await p.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
   }
   const registeredBefore=MIGRATION_URLS.slice(0,own).map(u=>u.pathname.split('/').at(-1)!).sort();
   const appliedNames=async()=>(await p.query<{migration_name:string}>("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name);
   expect(await appliedNames()).toEqual(registeredBefore);
   await seed(p);const s=randomUUID(),d=randomUUID(),f=randomUUID(),disclosure=randomUUID();
   await fixtureContext(p,T,async db=>{
    await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band) VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-upgrade',clock_timestamp(),'Fictional outside tap','low')",[T,J,s,randomUUID()]);
    await db.query("INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'review')",[T,d,J]);
    await db.query("INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision,created_at) VALUES($1,$2,$3,$4,repeat('a',64),'required_proof','mandatory','Fictional proof','','Fictional proof','review',0,'2026-10-01T00:00:00.123456Z')",[f,T,J,d]);
    await db.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'defect')",[T,J,s,disclosure]);
   });
   const tables=["app.job","app.decision","app.job_finding","app.shadow_commercial_signal","app.shadow_disclosure_event"];
   type Snapshot={columns:{name:string;type:string}[];keys:string[];rows:string[];pk:string[]};
   const snapshots:Record<string,Snapshot>={};
   const qi=(n:string)=>`"${n.replaceAll('"','""')}"`;
   async function columns(client:Pick<Pool|PoolClient,"query">,table:string){return(await client.query<{name:string;type:string}>("SELECT attname name,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[table])).rows}
   async function rows(client:Pick<Pool|PoolClient,"query">,table:string,cols:readonly {name:string}[],pk:readonly string[],keys?:readonly string[]){
    const projection=cols.map(c=>qi(c.name)).join(','),identity=`jsonb_build_array(${pk.map(qi).join(',')})::text`;
    return(await client.query<{identity:string;value:string}>(`SELECT ${identity} identity,row_to_json(t)::text value FROM (SELECT ${projection} FROM ${table}) t ${keys?'WHERE '+identity+'=ANY($1::text[])':''} ORDER BY ${identity}`,keys?[keys]:[])).rows;
   }
   for(const table of tables){
    const cols=await columns(p,table),pk=(await p.query<{name:string}>("SELECT a.attname name FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position",[table])).rows.map(c=>c.name);
    expect(pk.length).toBeGreaterThan(0);const data=await rows(p,table,cols,pk);expect(data.length).toBeGreaterThan(0);
    snapshots[table]={columns:cols,pk,keys:data.map(r=>r.identity),rows:data.map(r=>r.value)};
   }
   async function compare(client:Pick<Pool|PoolClient,"query">){for(const [table,snapshot] of Object.entries(snapshots)){
    const after=(await columns(client,table)).filter(c=>snapshot.columns.some(old=>old.name===c.name));expect(after).toEqual(snapshot.columns);
    expect((await rows(client,table,snapshot.columns,snapshot.pk,snapshot.keys)).map(r=>r.value)).toEqual(snapshot.rows);
   }}
   const newKeys=()=>p.query<{table_name:string;definition:string}>("SELECT conrelid::regclass::text table_name,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname=ANY($1::text[]) ORDER BY conname",[["job_finding_tenant_job_id_decision_key","shadow_disclosure_event_tenant_job_id_key"]]);
   expect((await newKeys()).rows).toEqual([]);
   await p.query(await readFile(MIGRATION_URLS[own]!,"utf8"));await compare(p);
   expect(await appliedNames()).toEqual(registeredBefore); // This step applied 0129 alone, without later migrations.
   expect((await newKeys()).rows).toEqual([
    {table_name:"app.job_finding",definition:"UNIQUE (tenant_id, job_id, id, decision_id)"},
    {table_name:"app.shadow_disclosure_event",definition:"UNIQUE (tenant_id, job_id, id)"},
   ]);
   await p.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('0129_shadow_detection.sql')");
   await migrate(p);await migrate(p);await compare(p);
   expect(await appliedNames()).toEqual(MIGRATION_URLS.map(u=>u.pathname.split('/').at(-1)!).sort());
   async function control(sql:string,fail:boolean){const db=await p.connect();try{await db.query("BEGIN");await db.query(sql);if(fail)await expect(compare(db)).rejects.toThrow();else await compare(db)}finally{await db.query("ROLLBACK");db.release()}}
   await control("ALTER TABLE app.job_finding DISABLE TRIGGER job_finding_immutable; UPDATE app.job_finding SET created_at=created_at+interval '1 microsecond'",true);
   await control("ALTER TABLE app.job_finding ALTER COLUMN title TYPE varchar(161)",true);
   await control("ALTER TABLE app.decision ADD COLUMN sv3_control_nullable text",false);
   await control("CREATE OR REPLACE FUNCTION app.reference_recovery_cap(p_net bigint) RETURNS bigint LANGUAGE sql IMMUTABLE AS 'SELECT 1::bigint'",false);
   await control(`INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES('${T}','${randomUUID()}','job','synthetic:later','review')`,false);
   await compare(p);
  }finally{await closeTestPools(p);await admin.query(`DROP DATABASE ${database}`)}
 });

// Continuation: direct callers cannot bypass the worker's SV-4 gate.
 it("checks accepted terms in the alert transaction and leaves all commercial/disclosure effects empty on refusal",async()=>{
  const base=observation(),o=observation({...base,facts:{...base.facts,safetyImplication:true}});await evidence(o);
  const held=observation({...o,facts:{...o.facts,safetyImplication:false}}),request=batch([held]);
  await new ShadowDetectionRepository(shadow).persist(testTenantContext(T),request);
  const args=firingArgs(o,request.proposals[0]!.signalId);args[6]="safety";
  for(const alteration of ["ALTER TABLE app.final_check_terms_acceptance RENAME TO sv3_missing_terms", "ALTER TABLE app.final_check_terms_acceptance ENABLE ROW LEVEL SECURITY; CREATE POLICY sv3_hide_terms ON app.final_check_terms_acceptance AS RESTRICTIVE FOR SELECT TO jobguard_migration USING(false)"]){
   const db=await admin.connect();try{
    await db.query("BEGIN");await db.query(alteration);await db.query("SELECT set_config('app.tenant_id',$1,true)",[T]);
    await db.query("SAVEPOINT alert");
    await expect(db.query(routine,args)).rejects.toMatchObject({code:"55000",message:expect.stringMatching(/TERMS_(?:RELATION_UNAVAILABLE|NOT_ACCEPTED)/u)});
    await db.query("ROLLBACK TO SAVEPOINT alert");
    for(const [table,column,id] of [["decision","id",args[4]],["shadow_disclosure_event","id",args[5]],["shadow_must_surface_firing","id",args[3]],["job_finding","subject_ref",args[2]]])
     expect((await db.query(`SELECT id FROM app.${table} WHERE ${column}=$1`,[id])).rows).toEqual([]);
    expect((await db.query("SELECT disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[args[2]])).rows).toEqual([{disclosed_before_lock:false}]);
   }finally{await db.query("ROLLBACK");db.release()}
  }
  const reader=new ShadowObservationReader(runtime,new FixtureObservationSources([]));await reader.assertTermsRelation();
  expect(await reader.hasAcceptedTerms(testTenantContext(T))).toBe(true);
  expect(await reader.hasAcceptedTerms(testTenantContext(O))).toBe(false);
  await expect(withTenant(runtime,testTenantContext(T),db=>db.$client.query("INSERT INTO app.final_check_terms_acceptance(tenant_id) VALUES($1)",[T]))).rejects.toMatchObject({code:"42501"});
  await withTenant(shadow,testTenantContext(T),db=>db.$client.query(routine,args));
  expect((await admin.query("SELECT rule FROM app.shadow_must_surface_firing WHERE id=$1",[args[3]])).rows).toEqual([{rule:"safety"}]);
 });
});
