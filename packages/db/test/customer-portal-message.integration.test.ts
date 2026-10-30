// CI only: real PostgreSQL. Messages are always submitted through the checked intake.
import {createHash,randomUUID} from "node:crypto";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {sourcesFixture,closeWorkFixture,type SourceFixture} from "./job-sources-fixture.js";
import {seedWorkPractice,boundaryLock,seedWorkJob} from "./job-work-state-fixtures.js";
import {withTenant} from "../src/tenant-context.js";
import {readJobSourceObservations} from "../src/job-source-observation-reader.js";
import {ShadowObservationReader,FixtureObservationSources} from "../src/shadow-observation-reader.js";
import {ShadowDetectionRepository} from "../src/shadow-detection-repository.js";
import {ShadowDetectionWorker} from "../../../apps/api/src/shadow-detection.worker.js";
import {CUSTOMER_MESSAGE_SAFETY_TEXT} from "../src/customer-message-fixtures.js";
import {startBeforeMigration,applyMigration} from "./contractor-practice-session-fixtures.js";
import {snapshot} from "./contractor-entitlement-fixtures.js";
import {migrate} from "../src/migrate.js";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const input=(jobId:string,text="Please fit an outside tap.")=>({version:"customer-portal-message.v1",jobId,commandId:randomUUID(),text});
describe("MON-5 customer messages through checked SV-7A",()=>{
 let f:SourceFixture,shadow:Pool;
 beforeAll(async()=>{
  f=await sourcesFixture();
  const login=`m5message_${randomUUID().replaceAll("-","")}`,password=randomUUID();
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_shadow TO ${login}`);
  shadow=new Pool({...f.admin.options,user:login,password,max:2});
 },120000);
 afterAll(async()=>{await shadow?.end();await closeWorkFixture(f);});
 async function identityQuery(sql:string,args:unknown[]){
  const db=await f.admin.connect();try{await db.query("BEGIN");await db.query("SET LOCAL ROLE jobguard_identity");const r=await db.query(sql,args);await db.query("COMMIT");return r;}catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
 }
 async function customer(practice=f.practice){
  const {auth,jobId}=practice,t=auth.context.tenantId,digest=hash(randomUUID());
  const member=(await f.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[t,auth.membershipId])).rows[0];
  await f.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)",[`${member.identity_user_id}@fixture.invalid`,member.identity_user_id]);
  await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[member.identity_user_id,t,auth.membershipId]);
  await f.admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fixture-csrf',clock_timestamp()+interval '1 hour','synthetic_demo')",[randomUUID(),member.identity_user_id,digest]);
  const c=(await f.admin.query("SELECT b.customer_id FROM app.job_party_current pc JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(pc.tenant_id,pc.job_id,pc.binding_id) WHERE pc.tenant_id=$1 AND pc.job_id=$2",[t,jobId])).rows[0].customer_id as string;
  const secret="a".repeat(43),linkDigest=hash(randomUUID()),sessionDigest=hash(randomUUID());
  const grant=(await identityQuery("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) id",[t,digest,jobId,c,linkDigest,`/customer/sign-in#${t}/${jobId}/${c}/${secret}`])).rows[0].id;
  await identityQuery("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')",[t,jobId,c,linkDigest,sessionDigest]);
  return {t,j:jobId,c,digest:sessionDigest,grant,practice};
 }
 type Customer=Awaited<ReturnType<typeof customer>>;
 const send=async(w:Customer,raw=input(w.j))=>(await identityQuery("SELECT identity.customer_portal_message($1,$2,$3,$4,$5::jsonb) result",[w.t,w.j,w.c,w.digest,JSON.stringify(raw)])).rows[0].result;
 const fresh=async()=>customer(await seedWorkPractice(f));
 it("persists exact message/evidence once, replays concurrently, conflicts on changed text; audits session without text",async()=>{
  const w=await fresh(),raw=input(w.j,"I agree to £500 maybe, unknown text.");
  const commercialCounts=async()=>Promise.all(["quote_acceptance","variation_approval"].map(async table=>(await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[w.t,w.j])).rows[0].n));
  const commercialBefore=await commercialCounts();
  const results=await Promise.all([send(w,raw),send(w,raw)]);expect(results[0]).toEqual(results[1]);
  expect(results[0].record).toMatchObject({text:raw.text,evidence:{sha256:hash(raw.text)}});
  expect(JSON.stringify(results[0])).not.toMatch(/membership/i);
  expect(JSON.stringify(results[0])).not.toContain(w.practice.auth.membershipId);
  expect(await send(w,raw)).toEqual(results[0]);
  const read=await f.repository.read(w.practice.auth.context,w.j,w.practice.auth.digest,"customer_message");expect(read.messages).toContainEqual({...results[0].record,actualTesterMembershipId:w.practice.auth.membershipId});
  const stored=(await f.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[w.t,raw.commandId])).rows[0].result;
  expect(stored.record.actualTesterMembershipId).toBe(w.practice.auth.membershipId);
  await expect(send(w,{...raw,text:"Changed"})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  const observations=await withTenant(f.runtime,w.practice.auth.context,db=>readJobSourceObservations(db,w.t,w.j));expect(observations).toEqual([]);
  const audit=(await f.admin.query("SELECT actor_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='customer_portal.message_recorded'",[w.t,w.j])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].actor_ref).toMatch(/^customer-session:/);expect(JSON.stringify(audit)).not.toContain(raw.text);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_message_source WHERE tenant_id=$1 AND command_id=$2",[w.t,raw.commandId])).rows[0].n).toBe(1);
  expect(await commercialCounts()).toEqual(commercialBefore);
 });
 it("other tenant/job/customer, forged and revoked session cannot write or replay",async()=>{
  const w=await fresh(),raw=input(w.j);await send(w,raw);const other=await seedWorkJob(f);
  for(const change of [{t:other.tenantId,j:other.jobId},{j:other.jobId},{c:randomUUID()},{digest:hash("forged")}])await expect(send({...w,...change},raw)).rejects.toMatchObject({code:"42501"});
  await f.admin.query("UPDATE app.customer_portal_grant SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[w.t,w.grant]);
  await expect(send(w,raw)).rejects.toMatchObject({code:"42501"});
 });
 it("expired sessions cannot replay, and identity credentials cannot write a diary or call the private helper",async()=>{
  const w=await fresh(),raw=input(w.j);await send(w,raw);
  await f.admin.query("UPDATE app.customer_portal_session SET issued_at=issued_at-interval '2 hours',expires_at=expires_at-interval '2 hours' WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j]);
  await expect(send(w,raw)).rejects.toMatchObject({code:"42501"});
  await expect(identityQuery("SELECT app.sv7a_intake_job_source($1,$2,$3,'diary','{}'::jsonb)",[w.t,w.j,w.digest])).rejects.toMatchObject({code:"42501"});
  await expect(identityQuery("SELECT app.sv7a_require_source_owner($1,$2,$3,'customer_message')",[w.t,w.j,w.digest])).rejects.toMatchObject({code:"42501"});
 });
 it("new post-lock messages refuse with the existing code, while authorized history replays",async()=>{
  const w=await fresh(),raw=input(w.j),saved=await send(w,raw);
  await boundaryLock(f,{tenantId:w.t,jobId:w.j,actorId:w.practice.auth.membershipId,scopeId:randomUUID(),context:w.practice.auth.context} as Awaited<ReturnType<typeof seedWorkJob>>);
  await expect(send(w,input(w.j,"After lock"))).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");expect(await send(w,raw)).toEqual(saved);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.customer_message_source WHERE tenant_id=$1 AND job_id=$2",[w.t,w.j])).rows[0].n).toBe(1);
 });
 it("pre-lock hidden signals never change message receipt/read; exact candidate B safety message surfaces once and loses fee eligibility",async()=>{
  const w=await fresh(),raw=input(w.j),saved=await send(w,raw),a=w.practice.auth;
  const before=await f.repository.read(a.context,w.j,a.digest,"customer_message");
  const reader=new ShadowObservationReader(f.runtime,new FixtureObservationSources([])),sink=new ShadowDetectionRepository(shadow);
  const worker=new ShadowDetectionWorker({assertTermsRelation:()=>reader.assertTermsRelation(),hasAcceptedTerms:c=>reader.hasAcceptedTerms(c),read:(c,r)=>reader.read(c,r),propose:async()=>({proposals:[]}),persist:(c,r)=>sink.persist(c,r)},"synthetic_demo",()=>new Date().toISOString());
  await withTenant(f.runtime,a.context,db=>db.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)",[w.t,a.membershipId,randomUUID(),"synthetic_final_check_terms.v1"]));
  const task={version:"shadow-detection-task.v1",tenantId:w.t,jobId:w.j};await worker.start();await worker.execute(a.context,task);
  expect((await f.admin.query("SELECT state FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[w.t,w.j])).rows).toEqual([{state:"held_for_final_check"}]);
  expect(await send(w,raw)).toEqual(saved);expect(await f.repository.read(a.context,w.j,a.digest,"customer_message")).toEqual(before);
  const safety=await send(w,input(w.j,CUSTOMER_MESSAGE_SAFETY_TEXT));await worker.execute(a.context,task);await worker.execute(a.context,task);
  const firings=(await f.admin.query("SELECT signal_id,decision_id,rule FROM app.shadow_must_surface_firing WHERE source_ref=$1",[safety.record.evidence.id])).rows;
  expect(firings).toHaveLength(1);expect(firings[0].rule).toBe("safety");
  expect((await f.admin.query("SELECT state,disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[firings[0].signal_id])).rows).toEqual([{state:"surfaced_early",disclosed_before_lock:true}]);
  expect((await f.admin.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE signal_id=$1 ORDER BY reason",[firings[0].signal_id])).rows).toEqual([{reason:"disclosed_before_lock"},{reason:"surfaced_early"}]);
 });
});
it("0391 upgrade adds only two routines, keeps populated rows/ACLs and supports rerun",async()=>{
 const c=await startBeforeMigration("0391_customer_portal_message.sql");
 try{const before=await snapshot(c.admin);await applyMigration(c,"0391_customer_portal_message.sql");expect(await snapshot(c.admin)).toEqual(before);await migrate(c.admin);expect(await snapshot(c.admin)).toEqual(before);
  for(const fn of ["app.sv7a_require_source_owner(uuid,uuid,text,text)","identity.customer_portal_message(uuid,uuid,uuid,text,jsonb)"]){for(const role of ["jobguard_runtime","jobguard_infrastructure"]){expect((await c.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed).toBe(false);}}
 }finally{await c.close();}
},120000);
