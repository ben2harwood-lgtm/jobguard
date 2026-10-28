import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
/** ENT-10e PostgreSQL 16. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ContractorRepository, EnterpriseIdentityRepository, IdentityRepository, SsoRequiredRepository, MIGRATION_URLS, migrate, verifyAuditChain, type AuditEvent } from "../src/index.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { SsoApplication } from "../../../apps/api/src/auth/sso/sso.application.js";
import { SsoRequiredApplication } from "../../../apps/api/src/auth/sso/sso-required.application.js";
import { SsoRequiredController } from "../../../apps/api/src/auth/sso/sso-required.controller.js";
import { generateTestIdentityProvider } from "../../../apps/api/src/auth/sso/test-identity-provider.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,identity:Pool,directory:string;
const origin="https://jobguard.invalid";
const auth=()=>new PersistedAuthProvider(new IdentityRepository(identity),"s".repeat(40));
const sso=()=>new SsoApplication(auth(),new EnterpriseIdentityRepository(identity),origin,"synthetic_demo");
const required=()=>new SsoRequiredApplication(auth(),new SsoRequiredRepository(identity),origin,"synthetic_demo",60);
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"jg-ent10e-window-pg16-"));
 const port=await freePort(60700,200);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 const base={host:"127.0.0.1",port,database:"jobguard_synthetic_demo"};
 const control=new Pool({...base,database:"postgres",user:"postgres",password:"synthetic"});
 try{await control.query("CREATE DATABASE jobguard_synthetic_demo");}finally{await control.end();}
 admin=new Pool({...base,user:"postgres",password:"synthetic"});
 await migrate(admin);
 await admin.query("CREATE ROLE ent10e_window_identity LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO ent10e_window_identity; CREATE ROLE ent10e_window_runtime LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO ent10e_window_runtime");
 identity=new Pool({...base,user:"ent10e_window_identity",password:"fixture",max:4});runtime=new Pool({...base,user:"ent10e_window_runtime",password:"fixture",max:4});
},120000);
afterAll(async()=>{try{await closeTestPools(identity,runtime,admin);}finally{try{await postgres?.stop();}finally{if(directory)await rm(directory,{recursive:true,force:true});}}});
async function requestSigninCode(provider:PersistedAuthProvider,email:string) {
 // Fixture-only elapsed cooldown: keep attempts, expiry and consumption intact; do not move the database window clock.
 await admin.query("UPDATE identity.challenge SET requested_at=LEAST(requested_at,clock_timestamp()-interval '61 seconds') WHERE email=$1 AND purpose='signin'",[email]);
 return provider.requestCode({email,purpose:"signin",ip:randomUUID()});
}
async function fixture(configure=true,link=true) {
 const contractor=new ContractorRepository(runtime),principal=await contractor.startPractice(randomUUID()),provider=auth();
 await seedActiveContractorAgreement(admin,principal.tenantId);
 const connectionId=randomUUID(),domain=`${connectionId}.fixture.invalid`,email=`owner@${domain}`;
 const sessionToken=randomUUID(),csrfToken=randomUUID(),sessionId=randomUUID();
 await admin.query("INSERT INTO identity.user_email VALUES($1,$2)",[email,principal.identityUserId]);
 await admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[principal.identityUserId,principal.tenantId,principal.membershipId]);
 await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')",[sessionId,principal.identityUserId,provider.digest(`session:${sessionToken}`),csrfToken]);
 const ordinary={sessionToken,csrfToken,origin},idp=generateTestIdentityProvider(),app=sso(),service=required();
 const command=(required:boolean,expectedRevision:number)=>({version:"sso-required-command.v1",requested_tenant_id:principal.tenantId,required,expectedRevision,reason:"Synthetic administrator verifies SSO requirement"});
 const connection={id:connectionId,tenantId:principal.tenantId,idpEntityId:`urn:jobguard:test-idp:${connectionId}`,spEntityId:`urn:jobguard:sp:${connectionId}`,callbackUrl:`${origin}/api/auth/sso/${connectionId}/callback`,entryPoint:`${origin}/api/auth/sso/${connectionId}/start`,idpCert:idp.idpCert};
 let bound:{sessionToken:string;csrfToken:string;origin:string}|undefined;
 async function signin(address=email,subject=principal.identityUserId,linkExisting=false,groups=["admins"]) {
  const started=await app.start(connectionId,{version:"sso-start.v1",action:"signin",...(linkExisting?{linkExisting:true}:{})},ordinary);
  const result=await app.callback(connectionId,{version:"sso-callback.v1",SAMLResponse:idp.response({connection,requestId:started.requestId,email:address,subject,groups}),relayState:started.relayState},started.relayState);
  return {sessionToken:result.sessionToken,csrfToken:result.csrfToken,origin};
 }
 if(configure) {
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"connection.create",id:connectionId,idpCert:idp.idpCert},ordinary);
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"domain.verify",connectionId,domain,proof:`synthetic-domain:${connectionId}:${domain}`},ordinary);
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"mapping.set",connectionId,group:"admins",role:"admin",scope:{kind:"tenant",id:principal.tenantId},enabled:true,expectedRevision:0},ordinary);
  if(link)bound=await signin(email,principal.identityUserId,true);
 }
 const enable=()=>service.command(command(true,0),bound!);
 return {principal,provider,connectionId,domain,email,ordinary,bound,sessionId,idp,connection,app,service,command,signin,enable};
}
async function memberIn(user:string,tenant:string,role="finance") {
 const account=(await admin.query("SELECT id FROM app.account WHERE tenant_id=$1 LIMIT 1",[tenant])).rows[0].id,id=randomUUID();
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,$5)",[id,tenant,account,user,role]);
 await admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[user,tenant,id]);return id;
}
async function counts() {
 const names=["identity.session","identity.invitation","identity.membership_locator","identity.sso_required_event","app.membership"];
 return Promise.all(names.map(async name=>(await admin.query(`SELECT count(*)::int n FROM ${name}`)).rows[0].n));
}
async function audit(tenant:string) {
 const rows=(await admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence",[tenant])).rows;
 const events:AuditEvent[]=rows.map(r=>({id:r.id,tenantId:r.tenant_id,sequence:Number(r.sequence),version:r.version,actorRef:r.actor_ref,eventType:r.event_type,subjectType:r.subject_type,subjectRef:r.subject_ref,occurredAt:r.occurred_at,payload:r.payload,payloadHash:r.payload_hash,previousHash:r.previous_hash,eventHash:r.event_hash}));
 expect(()=>verifyAuditChain(events)).not.toThrow();return rows;
}

type Fixture=Awaited<ReturnType<typeof fixture>>;
const detailInput=(f:Fixture)=>({version:"sso-required-detail-view.v1",requested_tenant_id:f.principal.tenantId});
const viewInput=(f:Fixture)=>({version:"sso-required-view.v1",requested_tenant_id:f.principal.tenantId});
const reason="Synthetic owner requests emergency access";
const sqlInput=(f:Fixture,commandId=randomUUID(),windowMinutes:unknown=60)=>({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId,windowMinutes,reason});
async function emergency(f:Fixture,commandId=randomUUID()) {
 const code=await requestSigninCode(f.provider,f.email);
 return f.service.emergency({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId,reason,email:f.email,code:code.fixtureCode},origin);
}
async function state(f:Fixture) {
 const c=await admin.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);return (await c.query("SELECT * FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows[0];}finally{await c.query("ROLLBACK");c.release();}
}
async function completeWindow(f:Fixture,shape:"past"|"transition"|"missing"="past",commandId=randomUUID()) {
 const client=await admin.connect(),approval=randomUUID();
 try {
  await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);
  const rule=(await client.query("SELECT id FROM identity.sso_emergency_approver_rule")).rows[0].id;
  await client.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) SELECT $1,$2,$3,$4,$5,$6,ts,ts+interval '1 minute' FROM (SELECT clock_timestamp()-interval '15 minutes'+(CASE WHEN $7 THEN interval '300 milliseconds' ELSE interval '-1 minute' END) ts) n",[f.principal.tenantId,approval,f.principal.membershipId,rule,`membership:${f.principal.membershipId}`,createHash("sha256").update(reason).digest("hex"),shape==="transition"]);
  const revision=(await client.query("SELECT max(revision)::int n FROM identity.sso_required_event WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n;
  const event=(await client.query("SELECT identity.sso_required_append($1,$2,$3,'emergency',false,$4,$5) result",[f.principal.tenantId,f.connectionId,f.principal.membershipId,reason,revision])).rows[0].result.eventId;
  await client.query("INSERT INTO identity.sso_emergency_use(tenant_id,approval_id,event_id,used_at) SELECT tenant_id,id,$3,approved_at FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,approval,event]);
  if(shape!=="missing")await client.query("INSERT INTO identity.sso_emergency_window(tenant_id,approval_id,event_id,command_id,owner_membership_id,window_minutes,opened_at,closes_at) SELECT tenant_id,id,$3,$4,membership_id,15,approved_at,approved_at+interval '15 minutes' FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,approval,event,commandId]);
  await client.query("COMMIT");return {approval,event,commandId};
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
async function bytes(table:string,tenant?:string) {
 return (await admin.query(`SELECT row_to_json(r)::text bytes FROM ${table} r ${tenant?"WHERE tenant_id=$1":""} ORDER BY row_to_json(r)::text`,tenant?[tenant]:[])).rows.map(r=>r.bytes);
}
async function storedWindow(f:Fixture) {
 return bytes("identity.sso_emergency_window",f.principal.tenantId);
}
async function rolledBack(work:(c:PoolClient)=>Promise<void>) {
 const c=await admin.connect();try{await c.query("BEGIN");await work(c);}finally{await c.query("ROLLBACK");c.release();}
}
async function gates(f:Fixture,invitation:string) {
 const c=await admin.connect();try{
  await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);
  return {
   code:(await c.query("SELECT * FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows,
   memberships:(await c.query("SELECT tenant_id FROM identity.sso_session_memberships($1,$2) ORDER BY tenant_id",[f.principal.identityUserId,f.sessionId])).rows,
   accept:(await c.query("SELECT * FROM identity.sso_invitation_accept_allowed($1)",[invitation])).rows,
   target:(await c.query("SELECT identity.sso_required_refusal_target($1,$2) target",[f.principal.identityUserId,f.principal.tenantId])).rows,
  };
 }finally{await c.query("ROLLBACK");c.release();}
}
async function invite(f:Fixture) {
 return new IdentityApplication(f.provider,origin).invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email:`pending-${randomUUID()}@${f.domain}`,role:"finance"},f.ordinary);
}
describe("ENT-10e emergency window",()=>{
 it.each(["downgraded","revoked","expired"] as const)("[E10] owner %s while emergency use waits on the company lock is refused",async change=>{
  const f=await fixture();await f.enable();
  // Prove mailbox control before execution, as in the existing emergency race fixture.
  const challenge=await requestSigninCode(f.provider,f.email);
  expect(await f.provider.proveEmergencyMailbox(f.email,challenge.fixtureCode!)).toBe(f.principal.identityUserId);
  const tables=["sso_required_event","sso_emergency_approval","sso_emergency_use","sso_emergency_window"];
  const snapshot=()=>Promise.all(tables.map(t=>bytes(`identity.${t}`,f.principal.tenantId)));
  const before=await snapshot(),earlierAudit=await audit(f.principal.tenantId);
  const blocker=await admin.connect(),waiter=await identity.connect();
  let pending:ReturnType<SsoRequiredRepository["emergency"]>|undefined;
  try {
   await blocker.query("BEGIN");
   await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[f.principal.tenantId]);
   const blockerPid=(await blocker.query("SELECT pg_backend_pid() pid")).rows[0].pid;
   const waiterPid=(await waiter.query("SELECT pg_backend_pid() pid")).rows[0].pid;
   const repo=new SsoRequiredRepository({connect:async()=>({query:waiter.query.bind(waiter),release:()=>undefined})} as unknown as Pool);
   pending=repo.emergency(f.principal.identityUserId,sqlInput(f),60);
   // Attach a handler during the wait; the original promise still rejects on await.
   void pending.catch(()=>undefined);
   const deadline=Date.now()+5000;
   let waiting=false;
   while(Date.now()<deadline) {
    waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND mode='ExclusiveLock' AND NOT granted AND $2=ANY(pg_blocking_pids(pid))) waiting",[waiterPid,blockerPid])).rows[0].waiting;
    if(waiting)break;
    await new Promise(resolve=>setTimeout(resolve,5));
   }
   expect(waiting).toBe(true);
   // The blocked routine has already read the owner role in the vulnerable implementation.
   // An admin still has organisation.manage, so permission alone cannot catch this downgrade.
   if(change==="downgraded")await blocker.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,f.principal.membershipId]);
   else if(change==="revoked")await blocker.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,f.principal.membershipId]);
   else await blocker.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 minute' WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,f.principal.membershipId]);
   await blocker.query("COMMIT");
   expect(await pending).toEqual(change==="downgraded"
    ?{used:false,cause:"EMERGENCY_NOT_OWNER",connectionId:f.connectionId,actorMembershipId:f.principal.membershipId}
    :{used:false,cause:"EMERGENCY_PERMISSION_REFUSED"});
   expect(await snapshot()).toEqual(before);
   const afterAudit=await audit(f.principal.tenantId);
   expect(afterAudit.slice(0,earlierAudit.length)).toEqual(earlierAudit);
   expect(afterAudit.slice(earlierAudit.length).map(r=>({type:r.event_type,code:r.payload.references.code}))).toEqual(change==="downgraded"
    ?[{type:"sso.emergency.refused",code:"EMERGENCY_NOT_OWNER"}]:[]);
   const log=(await admin.query("SELECT outcome,cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at,id",[f.principal.tenantId])).rows;
   expect(log).toEqual(change==="downgraded"?[{outcome:"refused",cause_code:"EMERGENCY_NOT_OWNER"}]:[]);
  } finally {
   await blocker.query("ROLLBACK");
   if(pending)await Promise.allSettled([pending]);
   waiter.release();blocker.release();
  }
 },30000);
 it("[T2] database owns the integer bound and immutable exact window length",async()=>{
  const f=await fixture();await f.enable();
  const repo=new SsoRequiredRepository(identity);
  for(const raw of [{...sqlInput(f),version:"sso-emergency.v1"},{...sqlInput(f),commandId:"invalid"},{...sqlInput(f),email:f.email,code:"0".repeat(8)},null,1]) {
   const tables=["sso_required_event","sso_emergency_approval","sso_emergency_use","sso_emergency_window","sso_emergency_event"],before=await Promise.all(tables.map(t=>bytes(`identity.${t}`,f.principal.tenantId)));
   const result=await new EnterpriseIdentityRepository(identity).transaction(async c=>(await c.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[f.principal.identityUserId,JSON.stringify(raw)])).rows[0].result);
   expect(result).toEqual({used:false,cause:"EMERGENCY_INPUT_INVALID"});expect(await Promise.all(tables.map(t=>bytes(`identity.${t}`,f.principal.tenantId)))).toEqual(before);
  }
  for(const minutes of [null,14,241,60.5,"60"]) {
   const before=await Promise.all(["sso_required_event","sso_emergency_approval","sso_emergency_use","sso_emergency_window"].map(t=>bytes(`identity.${t}`,f.principal.tenantId)));
   const result=await repo.emergency(f.principal.identityUserId,sqlInput(f),minutes as never);
   expect(result).toEqual({used:false,cause:"EMERGENCY_WINDOW_INVALID",connectionId:f.connectionId,actorMembershipId:f.principal.membershipId});
   expect(await Promise.all(["sso_required_event","sso_emergency_approval","sso_emergency_use","sso_emergency_window"].map(t=>bytes(`identity.${t}`,f.principal.tenantId)))).toEqual(before);
   expect((await audit(f.principal.tenantId)).at(-1).payload.references.code).toBe("EMERGENCY_WINDOW_INVALID");
  }
  const direct=new EnterpriseIdentityRepository(identity);
  const invalid=await direct.transaction(async c=>{
   const result=(await c.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[f.principal.identityUserId,JSON.stringify(sqlInput(f,randomUUID(),"60"))])).rows[0].result;
   await direct.audit(c,result.connectionId,"sso.emergency.refused",`membership:${result.actorMembershipId}`,result.cause,createHash("sha256").update(reason).digest("hex"));return result;
  });
  expect(invalid).toEqual({used:false,cause:"EMERGENCY_WINDOW_INVALID",connectionId:f.connectionId,actorMembershipId:f.principal.membershipId});
  await emergency(f);
  for(const statement of [
   "INSERT INTO identity.sso_emergency_window SELECT tenant_id,approval_id,event_id,gen_random_uuid(),owner_membership_id,241,opened_at,opened_at+interval '241 minutes' FROM identity.sso_emergency_window WHERE tenant_id=$1",
   "INSERT INTO identity.sso_emergency_window SELECT tenant_id,approval_id,event_id,gen_random_uuid(),owner_membership_id,60,opened_at,opened_at+interval '61 minutes' FROM identity.sso_emergency_window WHERE tenant_id=$1",
  ])await rolledBack(async c=>{await c.query("SET LOCAL ROLE jobguard_migration");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);await expect(c.query(statement,[f.principal.tenantId])).rejects.toMatchObject({code:"23514"});});
  for(const statement of ["UPDATE identity.sso_emergency_window SET closes_at=closes_at+interval '1 minute' WHERE tenant_id=$1","DELETE FROM identity.sso_emergency_window WHERE tenant_id=$1"])await rolledBack(async c=>{await c.query("SET LOCAL ROLE jobguard_migration");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);await expect(c.query(statement,[f.principal.tenantId])).rejects.toThrow();});
 });
 it("[T3] open window allows emailed-code sign-in, listing, contexts and both invitation gates",async()=>{
  const f=await fixture(),pending=await invite(f);await f.enable();await emergency(f);
  const request=await requestSigninCode(f.provider,f.email),session=await f.provider.verifyCode(f.email,"signin",request.fixtureCode!);
  const app=new IdentityApplication(f.provider,origin);
  expect((await app.session(session.sessionToken)).memberships.map(m=>m.tenantId)).toEqual([f.principal.tenantId]);
  expect((await app.context({...session,origin,requestedTenantId:f.principal.tenantId})).tenantId).toBe(f.principal.tenantId);
  const answers=await gates(f,pending.id);expect(answers.code).toEqual([{allowed:true,connections:[]}]);expect(answers.accept).toEqual([{allowed:true,connection_id:null}]);expect(answers.target).toEqual([{target:null}]);
  expect(await invite(f)).toHaveProperty("id");
  const code=await f.provider.requestCode({email:`pending-${randomUUID()}@${f.domain}`,purpose:"signin",ip:randomUUID()});expect(code.accepted).toBe(true);
  const row=(await admin.query("SELECT email FROM identity.invitation WHERE id=$1",[pending.id])).rows[0];
  const acceptance=await f.provider.requestCode({email:row.email,purpose:"invitation",invitationId:pending.id,ip:randomUUID()});
  await expect(f.provider.verifyCode(row.email,"invitation",acceptance.fixtureCode!,pending.id)).resolves.toHaveProperty("sessionToken");
 });
 it.each(["past","transition"] as const)("[T4] %s window closes all five gates without a worker or new identity row",async shape=>{
  const f=await fixture(),other=await fixture(false,false),pending=await invite(f);await memberIn(f.principal.identityUserId,other.principal.tenantId);await f.enable();
  // The ordinary session is issued before seeding the short transition; its lifetime is independent.
  await emergency(f);
  const code=await requestSigninCode(f.provider,f.email),session=await f.provider.verifyCode(f.email,"signin",code.fixtureCode!);
  await f.service.command(f.command(true,2),f.bound!);
  const seeded=await completeWindow(f,shape);
  const names=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='identity' ORDER BY tablename")).rows.map(r=>`identity.${r.tablename}`);
  const snapshot=()=>Promise.all(names.map(n=>bytes(n)));
  const before=await snapshot();
  if(shape==="transition") {
   expect((await state(f)).required).toBe(false);
   await admin.query("SELECT pg_sleep(0.5)");
  }
  expect(await snapshot()).toEqual(before);
  const current=await state(f);expect(current.required).toBe(true);expect(current.event_id).toBe(seeded.event);expect(current.revision).toBe(4);
  const app=new IdentityApplication(f.provider,origin);
  expect((await app.session(session.sessionToken)).memberships.map(m=>m.tenantId)).toEqual([other.principal.tenantId]);
  await expect(app.context({...session,origin,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  expect((await admin.query("SELECT revoked_at FROM identity.session WHERE token_digest=$1",[f.provider.digest(`session:${session.sessionToken}`)])).rows[0].revoked_at).toBeNull();
  await expect(new IdentityApplication(f.provider,origin).invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email:`new@${f.domain}`,role:"finance"},f.bound!)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  const pendingEmail=(await admin.query("SELECT email FROM identity.invitation WHERE id=$1",[pending.id])).rows[0].email;
  const accept=await f.provider.requestCode({email:pendingEmail,purpose:"invitation",invitationId:pending.id,ip:randomUUID()});
  await expect(f.provider.verifyCode(pendingEmail,"invitation",accept.fixtureCode!,pending.id)).rejects.toMatchObject({code:"INVALID_CODE"});
  const answer=await gates(f,pending.id);expect(answer.accept).toEqual([{allowed:false,connection_id:f.connectionId}]);expect(answer.target).toEqual([{target:f.connectionId}]);
  const view=await f.service.view(viewInput(f),f.bound!);expect(view.required).toBe(true);expect(view.revision).toBe(4);
  const d=await f.service.detail(detailInput(f),f.bound!);expect(d.emergencyWindow).toEqual({openedAt:(await admin.query("SELECT to_char(opened_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') t FROM identity.sso_emergency_window WHERE tenant_id=$1 AND event_id=$2",[f.principal.tenantId,seeded.event])).rows[0].t,closesAt:(await admin.query("SELECT to_char(closes_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') t FROM identity.sso_emergency_window WHERE tenant_id=$1 AND event_id=$2",[f.principal.tenantId,seeded.event])).rows[0].t,windowMinutes:15,open:false});
  // A separate owner whose only company is required cannot obtain an ordinary session.
  const sole=await fixture();await sole.enable();await completeWindow(sole);
  const challenge=await requestSigninCode(sole.provider,sole.email),sessions=await bytes("identity.session");
  await expect(sole.provider.verifyCode(sole.email,"signin",challenge.fixtureCode!)).rejects.toMatchObject({code:"INVALID_CODE"});expect(await bytes("identity.session")).toEqual(sessions);
 });
 it("[T5] one immutable window per use and all three unique keys are enforced",async()=>{
  const f=await fixture();await f.enable();const command=randomUUID();await emergency(f,command);const before=await storedWindow(f);
  await expect(emergency(f,command)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await storedWindow(f)).toEqual(before);
  const keys=(await admin.query("SELECT pg_get_constraintdef(oid) text FROM pg_constraint WHERE conrelid='identity.sso_emergency_window'::regclass AND contype IN('p','u') ORDER BY contype,conname")).rows.map(r=>r.text);
  expect(keys.sort()).toEqual(["PRIMARY KEY (tenant_id, approval_id)","UNIQUE (tenant_id, command_id)","UNIQUE (tenant_id, event_id)"].sort());
  const sql=await readFile(new URL("../migrations/0143_sso_emergency_owner_window.sql",import.meta.url),"utf8");
  expect(sql.match(/INSERT INTO identity\.sso_emergency_window/gu)).toHaveLength(1);expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM) identity\.sso_emergency_window/u);
 });
 it("[T6] emergency OFF without a window is required and missing company context raises",async()=>{
  const f=await fixture();await f.enable();await completeWindow(f,"missing");expect((await state(f)).required).toBe(true);
  expect((await gates(f,randomUUID())).code).toEqual([{allowed:false,connections:[f.connectionId]}]);
  for(const setting of ["","invalid",randomUUID()])await rolledBack(async c=>{await c.query("SELECT set_config('app.tenant_id',$1,true)",[setting]);await expect(c.query("SELECT * FROM identity.sso_required_state($1)",[f.principal.tenantId])).rejects.toMatchObject({code:"42501"});});
 });
 it("[T7] administrator ON supersedes open window, OFF supersedes closed window, strict guard still holds",async()=>{
  const f=await fixture();await f.enable();await emergency(f);await f.service.command(f.command(true,2),f.bound!);
  expect((await state(f)).required).toBe(true);expect((await f.service.detail(detailInput(f),f.bound!)).emergencyWindow).toBeNull();
  await completeWindow(f);await f.service.command(f.command(false,4),f.bound!);expect((await state(f)).required).toBe(false);expect((await f.service.detail(detailInput(f),f.bound!)).emergencyWindow).toBeNull();
  const newcomer=await fixture(false,false);await memberIn(newcomer.principal.identityUserId,f.principal.tenantId);
  await expect(f.service.command(f.command(true,5),f.bound!)).rejects.toMatchObject({code:"SSO_REQUIRED_UNLINKED_MEMBERS"});expect((await state(f)).required).toBe(false);
 });
 it("[T7] a member who accepts an invitation during a window blocks administrator ON but cannot block automatic expiry",async()=>{
  const f=await fixture();await f.enable();await emergency(f);const pending=await invite(f);
  const email=(await admin.query("SELECT email FROM identity.invitation WHERE id=$1",[pending.id])).rows[0].email;
  const code=await f.provider.requestCode({email,purpose:"invitation",invitationId:pending.id,ip:randomUUID()});
  const joined=await f.provider.verifyCode(email,"invitation",code.fixtureCode!,pending.id);
  expect((await new IdentityApplication(f.provider,origin).session(joined.sessionToken)).memberships.map(m=>m.tenantId)).toEqual([f.principal.tenantId]);
  await expect(f.service.command(f.command(true,2),f.bound!)).rejects.toMatchObject({code:"SSO_REQUIRED_UNLINKED_MEMBERS"});
  await completeWindow(f);expect((await state(f)).required).toBe(true);
  const d=await f.service.detail(detailInput(f),f.bound!);expect(d.unlinked.members.map(m=>m.email)).toEqual([email]);
  expect((await new IdentityApplication(f.provider,origin).session(joined.sessionToken)).memberships).toEqual([]);
 });
 it("[T8] A window leaves all B gate answers unchanged; emailed-code access reaches A only",async()=>{
  const a=await fixture(),b=await fixture();await a.enable();await b.enable();await memberIn(a.principal.identityUserId,b.principal.tenantId);
  const pending=randomUUID(),before=await gates(b,pending),bState=await state(b);await emergency(a);
  expect(await gates(b,pending)).toEqual(before);expect(await state(b)).toEqual(bState);
  const challenge=await requestSigninCode(a.provider,a.email),session=await a.provider.verifyCode(a.email,"signin",challenge.fixtureCode!);
  expect((await new IdentityApplication(a.provider,origin).session(session.sessionToken)).memberships.map(m=>m.tenantId)).toEqual([a.principal.tenantId]);
 });
 it("[K1] catalogue, privileges and RLS fail closed for omitted, invalid and other-company contexts",async()=>{
  const table=(await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='identity.sso_emergency_window'::regclass")).rows[0];expect(table).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"});
  const columns=(await admin.query("SELECT attname,attnotnull FROM pg_attribute WHERE attrelid='identity.sso_emergency_window'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows;
  expect(columns).toHaveLength(8);expect(columns.every(r=>r.attnotnull)).toBe(true);expect(columns[0].attname).toBe("tenant_id");
  const fks=(await admin.query("SELECT pg_get_constraintdef(oid) text FROM pg_constraint WHERE conrelid='identity.sso_emergency_window'::regclass AND contype='f' ORDER BY conname")).rows.map(r=>r.text);
  expect(fks.sort()).toEqual(["FOREIGN KEY (tenant_id, approval_id) REFERENCES identity.sso_emergency_use(tenant_id, approval_id)","FOREIGN KEY (tenant_id, event_id) REFERENCES identity.sso_required_event(tenant_id, id)","FOREIGN KEY (tenant_id, owner_membership_id) REFERENCES app.membership(tenant_id, id)"].sort());
  expect((await admin.query("SELECT tgfoid::regprocedure::text routine FROM pg_trigger WHERE tgrelid='identity.sso_emergency_window'::regclass AND NOT tgisinternal")).rows).toEqual([{routine:"app.reject_immutable_authorization_record()"}]);
  for(const role of ["jobguard_runtime","jobguard_infrastructure","jobguard_identity"]) {
   expect((await admin.query("SELECT has_table_privilege($1,'identity.sso_emergency_window','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed",[role])).rows[0].allowed).toBe(false);
   expect((await admin.query("SELECT has_table_privilege($1,'identity.sso_emergency_window','SELECT') allowed",[role])).rows[0].allowed).toBe(role==="jobguard_identity");
   expect((await admin.query("SELECT has_function_privilege($1,'identity.sso_required_state(uuid)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
   expect((await admin.query("SELECT has_function_privilege($1,'identity.sso_required_detail(character,uuid)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(role==="jobguard_identity");
  }
  const functions=(await admin.query("SELECT proname,prosecdef,proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid IN('identity.sso_required_state(uuid)'::regprocedure,'identity.sso_required_detail(character,uuid)'::regprocedure) ORDER BY proname")).rows;
  expect(functions).toEqual(["sso_required_detail","sso_required_state"].map(proname=>({proname,prosecdef:true,proconfig:["search_path=pg_catalog"],owner:"jobguard_migration"})));
  expect((await admin.query("SELECT p.oid::regprocedure::text name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='identity' AND p.prosecdef OR p.proname LIKE 'sso_%') AND (has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))")).rows).toEqual([]);
  const f=await fixture();await f.enable();await emergency(f);
  for(const setting of ["","invalid",randomUUID()]){
   const c=await identity.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[setting]);expect((await c.query("SELECT * FROM identity.sso_emergency_window")).rows).toEqual([]);}finally{await c.query("ROLLBACK");c.release();}
  }
 });
});
