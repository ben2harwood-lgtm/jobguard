import { testTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { createWorkFixture,closeWorkFixture,meterCompany,verifyBusiness,requestCard,recordCard,resultFixture,workTenant,type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { keyParent,snapshot,store } from "./free-first-job-keys-fixtures.js";
import { prepareWorkAccount, seedWorkJob } from "./job-work-state-fixtures.js";
import { FreeFirstJobLifecycleRepository } from "../src/free-first-job-lifecycle-repository.js";
import { exactTarget, firstTrialFixture as first } from "./free-first-job-lifecycle-fixtures.js";
import { historicalAgreement } from "./subscription-persistence-fixtures.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
describe("MON-3 END source persistence, company isolation and races",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("starts from the immutable activation and retains sources without changing keys or Final Check",async()=>{
  const a=await first(f),repo=new FreeFirstJobLifecycleRepository(f.runtime),old=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV='synthetic_demo';
  try{
   const before=await repo.read(a.context,a.digest,a.jobId);expect(before.timeline?.active).toBe(true);
   const row=(await f.admin.query("SELECT to_char(activated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') at FROM app.job_activation WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0];
   expect(before.start?.startedAt).toBe(row.at);
   const id=randomUUID();await workTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");await db.query("INSERT INTO app.trial_end_source(tenant_id,trial_id,source_id,job_id,kind,effective_at,recorded_at) VALUES($1,$2,$3,$4,'close',clock_timestamp(),clock_timestamp())",[a.tenantId,a.trialId,id,a.jobId]);}, { membershipId: a.actorId, bindRequest: false });
   expect((await repo.read(a.context,a.digest,a.jobId)).timeline?.sourceIds).toEqual([id]);
   expect(Number((await f.admin.query("SELECT count(*) n FROM app.trial_identity_key_claim WHERE tenant_id=$1",[a.tenantId])).rows[0].n)).toBe(2);
   await expect(workTenant(f.runtime,a.tenantId,db=>db.query("DELETE FROM app.trial_start WHERE tenant_id=$1",[a.tenantId]), { membershipId: a.actorId, bindRequest: false })).rejects.toThrow();
   const b=await meterCompany(f);
   await expect(repo.read(b.context,b.digest,a.jobId)).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');
   await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
   await expect(repo.read(testTenantContext(a.tenantId,{membershipId:a.actorId,bindRequest:false}),a.digest,a.jobId)).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');
  }finally{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
 });
 it("real lock and close triggers capture exact trial sources once; reopen cannot restore the free trial",async()=>{
  const a=await first(f),lockRepo=new FinalAccountLockRepository(f.runtime),workRepo=new JobWorkStateRepository(f.runtime);
  const scopeId=(await f.admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].id as typeof a.scopeId;
  const account=await prepareWorkAccount(f,{...a,scopeId});
  await lockRepo.acceptTerms(a.context,{actorMembershipId:a.actorId,commandId:randomUUID(),termsVersion:'synthetic_final_check_terms.v1'});
  await lockRepo.disposition(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),scopeItemId:scopeId,disposition:'done'});
  const input={jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),finalAccountRevisionId:account.revisionId,expectedRevision:1,declarationVersion:'final_account_declaration.v1' as const};
  // No trigger bypass: both commands must commit, and their AFTER triggers must capture.
  await expect(lockRepo.lock(a.context,{...input,finalAccountRevisionId:randomUUID()})).rejects.toThrow('STALE_REVISION');
  const locked=await lockRepo.lock(a.context,input);
  expect(await lockRepo.lock(a.context,input)).toEqual(locked);
  const sources=async()=>(await f.admin.query(`SELECT s.trial_id,s.source_id,s.job_id,s.kind,
   CASE WHEN s.kind='lock' THEN s.effective_at=l.locked_at ELSE s.effective_at=e.fact_at END exact_time
   FROM app.trial_end_source s LEFT JOIN app.final_account_lock l ON(l.tenant_id,l.job_id,l.id)=(s.tenant_id,s.job_id,s.source_id)
   LEFT JOIN app.job_work_state_event e ON(e.tenant_id,e.job_id,e.id)=(s.tenant_id,s.job_id,s.source_id)
   WHERE s.tenant_id=$1 ORDER BY s.kind`,[a.tenantId])).rows;
  expect(await sources()).toEqual([{trial_id:a.trialId,source_id:locked.id,job_id:a.jobId,kind:'lock',exact_time:true}]);
  const close={version:'job-work-state-command.v1',commandId:randomUUID(),expectedRevision:0,action:'close',reason:'completed_outside_jobguard',note:'Fictional completion'};
  const closed=await workRepo.command(a.context,a.jobId,a.actorId,close),event=closed.events.at(-1)!;
  expect(event.kind).toBe('closed');
  expect(await workRepo.command(a.context,a.jobId,a.actorId,close)).toEqual(closed);
  await expect(workRepo.command(a.context,a.jobId,a.actorId,{...close,note:'Changed fictional completion'})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  const captured=[{trial_id:a.trialId,source_id:event.id,job_id:a.jobId,kind:'close',exact_time:true},{trial_id:a.trialId,source_id:locked.id,job_id:a.jobId,kind:'lock',exact_time:true}];
  expect(await sources()).toEqual(captured);
  const reopened=await workRepo.command(a.context,a.jobId,a.actorId,{version:'job-work-state-command.v1',commandId:randomUUID(),expectedRevision:closed.events.length,action:'reopen',closeEventId:event.id});
  expect(reopened.events.at(-1)?.kind).toBe('reopened');
  expect(await sources()).toEqual(captured);
  const old=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV='synthetic_demo';
  try{
   const repo=new FreeFirstJobLifecycleRepository(f.runtime),view=await repo.read(a.context,a.digest,a.jobId);
   expect(view.timeline?.active).toBe(false);
   const b=await meterCompany(f);
   await expect(repo.read(b.context,b.digest,a.jobId)).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');
  }finally{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
  // Reopening cannot mutate the bill the lock bound, nor can it reverse an end fact.
  expect((await lockRepo.read(a.context,a.jobId)).lock).toEqual(locked);
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("DELETE FROM app.trial_end_source WHERE tenant_id=$1",[a.tenantId]), { membershipId: a.actorId, bindRequest: false })).rejects.toThrow();
  for(const table of ['platform_statement','journal','recovery_fee_journal','action_outbox']){
   expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n).toBe(0);
  }
 });
 it("closing another job or another company cannot end the trial",async()=>{
  const a=await first(f),otherJob=await seedWorkJob(f,a.tenantId),b=await meterCompany(f),repo=new JobWorkStateRepository(f.runtime);
  for(const target of [otherJob,b]){
   await repo.command(target.context,target.jobId,target.actorId,{version:'job-work-state-command.v1',commandId:randomUUID(),expectedRevision:0,action:'close',reason:'other',note:'Fictional unrelated closure'});
  }
  expect((await f.admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=ANY($1::uuid[])",[[a.tenantId,b.tenantId]])).rows[0].n).toBe(0);
 });
 it("two first admissions cannot create two trials even with disjoint fixture keys",async()=>{
  const a=await meterCompany(f),verification=await verifyBusiness(f,a);
  const parents=await Promise.all([keyParent(f,a.tenantId),keyParent(f,a.tenantId)]),snaps=parents.map(p=>snapshot(p));
  for(const s of snaps)await store(f,s);
  const results=await Promise.allSettled(snaps.map(s=>workTenant(f.admin,a.tenantId,async db=>{
   const command=randomUUID();await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2::uuid,'ch4.fixture',($2::uuid)::text,$3,'succeeded',$4,'{}',clock_timestamp())",[a.tenantId,command,'a'.repeat(64),a.actorId]);await db.query("SET LOCAL ROLE jobguard_migration");
   await db.query("INSERT INTO app.trial_admission(tenant_id,job_id,activation_id,snapshot_id,verification_id,command_id,admission_kind) VALUES($1,$2,$3,$4,$5,$6,'first')",[a.tenantId,s.jobId,s.activationId,s.id,verification,command]);
  }, { membershipId: a.actorId, bindRequest: false })));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(Number((await f.admin.query("SELECT count(*) n FROM app.trial_start WHERE tenant_id=$1",[a.tenantId])).rows[0].n)).toBe(1);
 });
 it("skip then concurrent second-job attempts refuse before any activation or end; card replay is company-bound",async()=>{
  const a=await first(f),targets=await Promise.all([seedWorkJob(f,a.tenantId),seedWorkJob(f,a.tenantId)]);
  const before=(await f.admin.query("SELECT count(*)::int n FROM app.job_activation WHERE tenant_id=$1",[a.tenantId])).rows[0].n;
  const attempt=(jobId:string)=>workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon3_activate($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,randomUUID(),JSON.stringify({version:'trial-admission.v1',activationId:randomUUID(),termsId:randomUUID(),jobId,acceptedDocumentId:randomUUID(),acceptedDocumentVersion:1,acceptedDocumentHash:'a'.repeat(64),expectedJobRevision:1,authorizationId:randomUUID()})]), { membershipId: a.actorId, bindRequest: false });
  for(const target of targets)await expect(attempt(target.jobId)).rejects.toThrow('TRIAL_COMPLETED_CARD_REQUIRED');
  const concurrent=await Promise.allSettled(targets.map(target=>attempt(target.jobId)));expect(concurrent.every(r=>r.status==='rejected')).toBe(true);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_activation WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(before);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.trial_end_source WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
  const command=randomUUID();await requestCard(f,a,command);
  const simulate=()=>workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon3_simulate_card($1,$2,$3,'{\"version\":\"trial-card-simulate.v1\"}')",[a.tenantId,a.digest,command]), { membershipId: a.actorId, bindRequest: false });
  await Promise.all([simulate(),simulate()]);expect((await f.admin.query("SELECT count(*)::int n FROM app.trial_card_result WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  const b=await meterCompany(f);await expect(workTenant(f.runtime,b.tenantId,db=>db.query("SELECT app.mon3_simulate_card($1,$2,$3,'{\"version\":\"trial-card-simulate.v1\"}')",[b.tenantId,b.digest,command]), { membershipId: b.actorId, bindRequest: false })).rejects.toThrow('TRIAL_CARD_ATTEMPT_REQUIRED');
 });
 it("new tables are owner-only, FORCE RLS and immutable; private helpers have no runtime execute",async()=>{
  for(const table of ['trial_start','trial_end_source','trial_subscription_source']){
   const row=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows[0];expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration',allowed:false});
  }
  for(const fn of ['mon3_capture_lifecycle()','mon3_trial_date(uuid,timestamptz)','mon3_pin_source(uuid,text,uuid)','mon3_validate_billing(uuid,uuid)'])expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[`app.${fn}`])).rows[0].allowed).toBe(false);
 });
 it("real capacity admission permits one of two racing first jobs",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);await exactTarget(f,a);
  const second=await seedWorkJob(f,a.tenantId);await exactTarget(f,{...a,jobId:second.jobId});
  const repo=new FreeFirstJobLifecycleRepository(f.runtime),old=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV='synthetic_demo';
  try{
   const targets=await Promise.all([repo.read(a.context,a.digest,a.jobId),repo.read(a.context,a.digest,second.jobId)]);
   const inputs=targets.map((target,index)=>({version:'trial-switch-live.v1',commandId:randomUUID(),jobId:index===0?a.jobId:second.jobId,...target.target}));
   const run=(index:number)=>repo.activate(a.context,a.digest,a.actorId,inputs[index]);
const outcomes=await Promise.allSettled([run(0),run(1)]);
   expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
   const winner=outcomes.findIndex(result=>result.status==='fulfilled'),stored=outcomes[winner]!;
   expect(await run(winner)).toEqual(stored.status==='fulfilled'?stored.value:null);
   await expect(repo.activate(a.context,a.digest,a.actorId,{...inputs[winner],expectedJobRevision:999})).rejects.toThrow('COMMAND_CONFLICT');
   expect(outcomes.filter(result=>result.status==='rejected').map(result=>result.status==='rejected'?(result.reason as Error).message:'')).toEqual(['TRIAL_COMPLETED_CARD_REQUIRED']);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.trial_start WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
   const firstCard=randomUUID();await requestCard(f,a,firstCard);
   await workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon3_simulate_card($1,$2,$3,'{\"version\":\"trial-card-simulate.v1\"}')",[a.tenantId,a.digest,firstCard]), { membershipId: a.actorId, bindRequest: false });
   const phone=(await f.admin.query("SELECT normalized_phone FROM app.trial_business_verification WHERE tenant_id=$1",[a.tenantId])).rows[0].normalized_phone;
   const b=await meterCompany(f);await verifyBusiness(f,b,`fictional_${randomUUID()}`,phone);await exactTarget(f,b);
   const nextCard=randomUUID();await requestCard(f,b,nextCard);
   await workTenant(f.runtime,b.tenantId,db=>db.query("SELECT app.mon3_simulate_card($1,$2,$3,'{\"version\":\"trial-card-simulate.v1\"}')",[b.tenantId,b.digest,nextCard]), { membershipId: b.actorId, bindRequest: false });
   const target=await repo.read(b.context,b.digest,b.jobId);
   await expect(repo.activate(b.context,b.digest,b.actorId,{version:'trial-switch-live.v1',commandId:randomUUID(),jobId:b.jobId,...target.target})).rejects.toThrow('TRIAL_IDENTITY_CONFLICT');
   expect((await f.admin.query("SELECT count(*)::int n FROM app.trial_start WHERE tenant_id=$1",[b.tenantId])).rows[0].n).toBe(0);

  }finally{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
 });

 it("a second job with card and terms goes live, ends the trial once and its activation claims no new key",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);await exactTarget(f,a);
  const second=await seedWorkJob(f,a.tenantId);await exactTarget(f,{...a,jobId:second.jobId});
  const repo=new FreeFirstJobLifecycleRepository(f.runtime),old=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV='synthetic_demo';
  try{
   const activate=async(jobId:string)=>repo.activate(a.context,a.digest,a.actorId,{version:'trial-switch-live.v1',commandId:randomUUID(),jobId,...(await repo.read(a.context,a.digest,jobId)).target});
   await activate(a.jobId);
   const keys=async()=>(await f.admin.query("SELECT count(*)::int n FROM app.trial_identity_key_claim WHERE tenant_id=$1",[a.tenantId])).rows[0].n;
   const ends=async()=>(await f.admin.query("SELECT kind FROM app.trial_end_source WHERE tenant_id=$1",[a.tenantId])).rows;
   await expect(activate(second.jobId)).rejects.toThrow('TRIAL_COMPLETED_CARD_REQUIRED');
   const card=randomUUID();await requestCard(f,a,card);
   await workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon3_simulate_card($1,$2,$3,'{\"version\":\"trial-card-simulate.v1\"}')",[a.tenantId,a.digest,card]), { membershipId: a.actorId, bindRequest: false });
   await expect(activate(second.jobId)).rejects.toThrow('TRIAL_SUBSCRIPTION_TERMS_REQUIRED');
   expect(await ends()).toEqual([]);
   await historicalAgreement(f,a);const before=await keys();
   expect(await activate(second.jobId)).toMatchObject({jobId:second.jobId,state:'live'});
   expect(await ends()).toEqual([{kind:'second_activation'}]);expect(await keys()).toBe(before);
   expect((await repo.read(a.context,a.digest,a.jobId)).timeline?.active).toBe(false);
  }finally{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
 });

 it("a changed transaction context cannot hide a registered company's deferred admission check",async()=>{
  const a=await meterCompany(f);await verifyBusiness(f,a);
  await expect(workTenant(f.admin,a.tenantId,async db=>{
   // Parent fixture bypass only; the new deferred guard is explicitly ALWAYS
   // so this exercises its real commit-time behavior, including FORCE RLS.
   await db.query("ALTER TABLE app.job_activation ENABLE ALWAYS TRIGGER mon3_checked_activation");
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at) VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',$6,clock_timestamp())",[randomUUID(),a.tenantId,a.jobId,randomUUID(),'a'.repeat(64),a.actorId]);
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[randomUUID()]);
  }, { membershipId: a.actorId, bindRequest: false })).rejects.toThrow('TRIAL_CHECKED_ACTIVATION_REQUIRED');
  expect((await f.admin.query("SELECT count(*)::int n FROM app.job_activation WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
 });


 it.each([
  {column:"provider",value:"fictional_other_provider",predicate:"a.provider='simulated'"},
  {column:"environment",value:"pilot_no_charge",predicate:"a.environment='synthetic_demo'"},
 ])("second-job gate refuses a completed card with $column=$value; removing that filter exposes the bypass",async({column,value,predicate})=>{
  const a=await first(f),second=await seedWorkJob(f,a.tenantId);
  await exactTarget(f,{...a,jobId:second.jobId});
  const card=await requestCard(f,a);await recordCard(f,a,resultFixture(card.attemptId));
  const db=await f.admin.connect();
  try{
   await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
   // Owner-only adversarial fixture. Relax exactly one CHECK and the immutable
   // trigger inside this rolled-back transaction; runtime never receives these powers.
   await db.query("SET LOCAL ROLE jobguard_migration");
   await db.query(`ALTER TABLE app.trial_card_attempt DROP CONSTRAINT trial_card_attempt_${column}_check`);
   await db.query("ALTER TABLE app.trial_card_attempt DISABLE TRIGGER immutable");
   await db.query(`UPDATE app.trial_card_attempt SET ${column}=$3 WHERE tenant_id=$1 AND id=$2`,[a.tenantId,card.attemptId,value]);
   await db.query("ALTER TABLE app.trial_card_attempt ENABLE TRIGGER immutable");
   const definition=(await db.query("SELECT pg_get_functiondef('app.mon3_activate(uuid,text,uuid,jsonb)'::regprocedure) body")).rows[0].body as string;
   const input={version:'trial-admission.v1',activationId:randomUUID(),termsId:randomUUID(),jobId:second.jobId,acceptedDocumentId:randomUUID(),acceptedDocumentVersion:1,acceptedDocumentHash:'a'.repeat(64),expectedJobRevision:1,authorizationId:randomUUID()};
   const attempt=()=>db.query("SELECT app.mon3_activate($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,randomUUID(),JSON.stringify(input)]);
   await db.query("SAVEPOINT checked_gate");await db.query("SET LOCAL ROLE jobguard_runtime");
   await expect(attempt()).rejects.toThrow('TRIAL_COMPLETED_CARD_REQUIRED');
   await db.query("ROLLBACK TO SAVEPOINT checked_gate");
   // Scratch mutation: remove only this predicate, leaving its sibling intact.
   // A card now passes the gate and reaches the distinct missing-terms refusal.
   const mutant=definition.replace(predicate,'true');expect(mutant).not.toBe(definition);
   await db.query(mutant);await db.query("SAVEPOINT mutated_gate");await db.query("SET LOCAL ROLE jobguard_runtime");
   await expect(attempt()).rejects.toThrow('TRIAL_SUBSCRIPTION_TERMS_REQUIRED');
   await db.query("ROLLBACK TO SAVEPOINT mutated_gate");
  }finally{await db.query("ROLLBACK");db.release();}
  // DDL, fixture contamination and mutated function must all be gone.
  expect((await f.admin.query(`SELECT ${column} value FROM app.trial_card_attempt WHERE tenant_id=$1 AND id=$2`,[a.tenantId,card.attemptId])).rows[0].value).toBe(column==='provider'?'simulated':'synthetic_demo');
  expect((await f.admin.query("SELECT pg_get_functiondef('app.mon3_activate(uuid,text,uuid,jsonb)'::regprocedure) body")).rows[0].body).toContain(predicate);
 });

});
