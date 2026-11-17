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
 directory=await mkdtemp(join(tmpdir(),"jg-ent10e-unlinked-pg16-"));
 const port=await freePort(60900,200);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 const base={host:"127.0.0.1",port,database:"jobguard_synthetic_demo"};
 const control=new Pool({...base,database:"postgres",user:"postgres",password:"synthetic"});
 try{await control.query("CREATE DATABASE jobguard_synthetic_demo");}finally{await control.end();}
 admin=new Pool({...base,user:"postgres",password:"synthetic"});
 await migrate(admin);
 await admin.query("CREATE ROLE ent10e_unlinked_identity LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO ent10e_unlinked_identity; CREATE ROLE ent10e_unlinked_runtime LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO ent10e_unlinked_runtime");
 identity=new Pool({...base,user:"ent10e_unlinked_identity",password:"fixture",max:4});runtime=new Pool({...base,user:"ent10e_unlinked_runtime",password:"fixture",max:4});
},120000);
afterAll(async()=>{try{await closeTestPools(identity,runtime,admin);}finally{try{await postgres?.stop();}finally{if(directory)await rm(directory,{recursive:true,force:true});}}});
async function fixture(configure=true,link=true) {
 const contractor=new ContractorRepository(runtime),principal=await contractor.startPractice(randomUUID()),provider=auth();
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
 const code=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});
 return f.service.emergency({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId,reason,email:f.email,code:code.fixtureCode},origin);
}
async function state(f:Fixture) {
 const c=await admin.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);return (await c.query("SELECT * FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows[0];}finally{await c.query("ROLLBACK");c.release();}
}
async function bytes(table:string,tenant?:string) {
 return (await admin.query(`SELECT row_to_json(r)::text bytes FROM ${table} r ${tenant?"WHERE tenant_id=$1":""} ORDER BY row_to_json(r)::text`,tenant?[tenant]:[])).rows.map(r=>r.bytes);
}

async function person(f:Fixture,label:string,role="finance") {
 const user=randomUUID(),email=`${label}@${f.domain}`,id=randomUUID(),sessionToken=randomUUID(),csrfToken=randomUUID(),provider=auth();
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[user]);await admin.query("INSERT INTO identity.user_email VALUES($1,$2)",[email,user]);
 const membership=await memberIn(user,f.principal.tenantId,role);
 await admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,$3)",[f.principal.tenantId,membership,email]);
 await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')",[id,user,provider.digest(`session:${sessionToken}`),csrfToken]);
 const credentials={sessionToken,csrfToken,origin};
 const link=async()=>{
  const started=await f.app.start(f.connectionId,{version:"sso-start.v1",action:"signin",linkExisting:true},credentials);
  return f.app.callback(f.connectionId,{version:"sso-callback.v1",SAMLResponse:f.idp.response({connection:f.connection,requestId:started.requestId,email,subject:user,groups:["admins"]}),relayState:started.relayState},started.relayState);
 };
 return {user,email,membership,credentials,link};
}
async function projected(f:Fixture) {return f.service.detail(detailInput(f),f.bound!);}
async function pending(f:Fixture,email=`invite-${randomUUID()}@${f.domain}`) {return new IdentityApplication(f.provider,origin).invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email,role:"finance"},f.ordinary);}
describe("ENT-10e not-yet-linked database projection",()=>{
 it.each([1,3])("[L1] strict ON refuses %i active members and attaches the exact detail, then succeeds after SAML linking",async count=>{
  const f=await fixture(),people=[];
  for(let i=0;i<count;i++)people.push(await person(f,`member-${i}`));
  const before=await bytes("identity.sso_required_event",f.principal.tenantId);
  const error=await f.enable().catch(e=>e),detail=await projected(f);
  expect(error.code).toBe("SSO_REQUIRED_UNLINKED_MEMBERS");expect(error.unlinked).toEqual(detail.unlinked);expect(detail.unlinked.total).toBe(count);expect(await bytes("identity.sso_required_event",f.principal.tenantId)).toEqual(before);
  const http=await new SsoRequiredController(()=>f.service).command(f.command(true,0),{headers:{cookie:`jobguard_session=${f.bound!.sessionToken}`,"x-csrf-token":f.bound!.csrfToken,origin}}).catch(e=>e);
  expect(http.getStatus()).toBe(409);expect(http.getResponse()).toEqual({code:"SSO_REQUIRED_UNLINKED_MEMBERS",unlinked:detail.unlinked});
  for(const p of people)await p.link();expect((await projected(f)).unlinked.total).toBe(0);expect((await f.enable()).required).toBe(true);
 });
 it("[L2] projection and count share exactly the guard population including earlier memberships",async()=>{
  const f=await fixture(),never=await person(f,"never"),earlier=await person(f,"earlier"),linked=await person(f,"linked"),revoked=await person(f,"revoked"),expired=await person(f,"expired");
  await linked.link();await earlier.link();
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,earlier.membership]);
  // Re-invitation changes the locator and adds a new membership; the immutable subject still names the old one.
  const replacement=randomUUID(),account=(await admin.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,earlier.membership])).rows[0].account_id;
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'finance')",[replacement,f.principal.tenantId,account,earlier.user]);
  await admin.query("UPDATE identity.membership_locator SET membership_id=$3 WHERE user_id=$1 AND tenant_id=$2",[earlier.user,f.principal.tenantId,replacement]);
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,revoked.membership]);await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,expired.membership]);
  const withoutAccount=randomUUID();await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[withoutAccount]);await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) SELECT gen_random_uuid(),tenant_id,account_id,$2,'finance' FROM app.membership WHERE tenant_id=$1 LIMIT 1",[f.principal.tenantId,withoutAccount]);
  const invitation=await pending(f),d=await projected(f),view=await f.service.view(viewInput(f),f.bound!);
  expect(d.unlinked).toEqual({total:2,truncated:false,members:[{membershipId:replacement,email:earlier.email,role:"finance",kind:"linked_to_earlier_membership"},{membershipId:never.membership,email:never.email,role:"finance",kind:"never_linked"}]});
  expect(view.unlinkedMembers).toBe(d.unlinked.total);expect(d.pendingInvitations.map(i=>i.invitationId)).toEqual([invitation.id]);await expect(f.enable()).rejects.toMatchObject({code:"SSO_REQUIRED_UNLINKED_MEMBERS"});
  // Neither account-less nor pending invitation is counted. Remove active unlinked cases by expiry, never by deleting facts.
  await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=ANY($2::uuid[])",[f.principal.tenantId,[replacement,never.membership]]);
  expect((await projected(f)).unlinked.total).toBe(0);expect((await f.enable()).required).toBe(true);
 });
 it("[L3] live administrator authority and the synthetic database boundary are required",async()=>{
  const f=await fixture(),b=await fixture();await f.enable();const ordinary=await person(f,"read-only","read_only");
  for(const credentials of [ordinary.credentials,b.bound!,{},f.ordinary]) {
   await expect(f.service.detail(detailInput(f),credentials)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
  }
  await admin.query("CREATE DATABASE jobguard_detail_other");const other=new Pool({...admin.options,password:"synthetic",database:"jobguard_detail_other"});
  try{await migrate(other);await expect(other.query("SELECT identity.sso_required_detail($1,$2)",["a".repeat(64),f.principal.tenantId])).rejects.toMatchObject({code:"42501",message:"SSO_ROUTE_BLOCKED"});}finally{await other.end();}
  expect((await audit(f.principal.tenantId)).some(r=>r.event_type==="sso.refused")).toBe(true);
 });
 it("[L4] A lists only A membership identities and invitations, including a user also in B",async()=>{
  const a=await fixture(),b=await fixture(),shared=await person(a,"shared"),onlyB=await person(b,"only-b");
  const bMembership=await memberIn(shared.user,b.principal.tenantId),aInvite=await pending(a),bInvite=await pending(b);
  const d=await projected(a);expect(d.unlinked.members).toEqual([{membershipId:shared.membership,email:shared.email,role:"finance",kind:"never_linked"}]);expect(d.unlinked.total).toBe(1);expect(d.pendingInvitations.map(i=>i.invitationId)).toEqual([aInvite.id]);
  expect(JSON.stringify(d)).not.toContain(bMembership);expect(JSON.stringify(d)).not.toContain(onlyB.email);expect(JSON.stringify(d)).not.toContain(bInvite.id);
  const failure=await a.enable().catch(e=>e);expect(failure.unlinked).toEqual(d.unlinked);
  for(const setting of ["","invalid",b.principal.tenantId]){
   const c=await identity.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[setting]);await expect(c.query("SELECT identity.sso_required_detail($1,$2)",[a.provider.digest(`session:${a.bound!.sessionToken}`),a.principal.tenantId])).rejects.toMatchObject({code:expect.any(String)});}finally{await c.query("ROLLBACK");c.release();}
  }
 });
 it("[L5] more than 200 unlinked members returns the first 200 in email and membership order with the true total",async()=>{
  const f=await fixture();for(let i=0;i<203;i++)await person(f,`member-${String(i).padStart(3,"0")}`);
  const d=await projected(f);expect(d.unlinked.total).toBe(203);expect(d.unlinked.truncated).toBe(true);expect(d.unlinked.members).toHaveLength(200);
  const ordered=(await admin.query("SELECT l.membership_id AS \"membershipId\",e.email,m.role,'never_linked'::text kind FROM identity.membership_locator l JOIN app.membership m ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id) JOIN identity.user_email e ON e.user_id=l.user_id WHERE l.tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM identity.sso_subject s WHERE s.tenant_id=l.tenant_id AND s.user_id=l.user_id AND s.membership_id=l.membership_id) ORDER BY e.email,l.membership_id LIMIT 200",[f.principal.tenantId])).rows;
  expect(d.unlinked.members).toEqual(ordered);expect((await f.service.view(viewInput(f),f.bound!)).unlinkedMembers).toBe(203);
 });
});
