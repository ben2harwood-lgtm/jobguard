/** ENT-10d real PostgreSQL 16 tests. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContractorRepository, EnterpriseIdentityRepository, IdentityRepository, SsoRequiredRepository, MIGRATION_URLS, migrate, verifyAuditChain, type AuditEvent } from "../src/index.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { SsoApplication } from "../../../apps/api/src/auth/sso/sso.application.js";
import { SsoRequiredApplication } from "../../../apps/api/src/auth/sso/sso-required.application.js";
import { generateTestIdentityProvider } from "../../../apps/api/src/auth/sso/test-identity-provider.js";
import { closeTestPools } from "./pool-test-utils.js";
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,identity:Pool,directory:string;
const origin="https://jobguard.invalid",secret="synthetic-required-identity-key-longer-than-32";
const tables=["sso_required_event","sso_emergency_approval","sso_emergency_use","sso_emergency_event"];
const auth=()=>new PersistedAuthProvider(new IdentityRepository(identity),secret);
const sso=()=>new SsoApplication(auth(),new EnterpriseIdentityRepository(identity),origin,"synthetic_demo");
const required=()=>new SsoRequiredApplication(auth(),new SsoRequiredRepository(identity),origin,"synthetic_demo");
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"jg-ent10d-pg16-"));
 const port=59500+Math.floor(Math.random()*400);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 const base={host:"127.0.0.1",port,database:"jobguard_synthetic_demo"};
 const control=new Pool({...base,database:"postgres",user:"postgres",password:"synthetic"});
 await control.query("CREATE DATABASE jobguard_synthetic_demo");await control.end();
 admin=new Pool({...base,user:"postgres",password:"synthetic"});
 const names=MIGRATION_URLS.map(x=>x.pathname.split("/").at(-1)!);
 expect(names.indexOf("0125_sso_required.sql")).toBeGreaterThan(names.indexOf("0120_enterprise_identity.sql"));
 for(let i=1;i<names.length;i++)expect(names[i]!>names[i-1]!).toBe(true);
 // Real upgrade from the previous supported schema, followed by idempotent migration application.
 const index=names.indexOf("0125_sso_required.sql");
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,index)) {await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);}
 await migrate(admin);await migrate(admin);
 await admin.query("CREATE ROLE ent10d_identity LOGIN PASSWORD 'identity-fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO ent10d_identity; CREATE ROLE ent10d_runtime LOGIN PASSWORD 'runtime-fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO ent10d_runtime");
 identity=new Pool({...base,user:"ent10d_identity",password:"identity-fixture",max:8});runtime=new Pool({...base,user:"ent10d_runtime",password:"runtime-fixture",max:8});
},120000);
afterAll(async()=>{await closeTestPools(identity,runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});});
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

describe("ENT-10d PostgreSQL switch and session boundary",()=>{
 it("[S1] only-required signin and signup create no session or issuance; unknown signin has identical INVALID_CODE",async()=>{
  const f=await fixture();await f.enable();const before=await counts(),issuedBefore=(await admin.query("SELECT count(*)::int n FROM identity.security_event WHERE event_type='session.issued'")).rows[0].n;
  for(const [email,purpose] of [[f.email,"signin"],[f.email,"signup"],[`unknown@${f.domain}`,"signin"]] as const) {
   const request=await f.provider.requestCode({email,purpose,ip:randomUUID()});expect(request.accepted).toBe(true);
   await expect(f.provider.verifyCode(email,purpose,request.fixtureCode!)).rejects.toMatchObject({code:"INVALID_CODE"});
  }
  expect(await counts()).toEqual(before);
  expect((await admin.query("SELECT count(*)::int n FROM identity.security_event WHERE event_type='session.issued'")).rows[0].n).toBe(issuedBefore);
  expect((await admin.query("SELECT count(*)::int n FROM identity.sso_refusal_event WHERE code='SSO_REQUIRED_CODE_SIGNIN'")).rows[0].n).toBeGreaterThanOrEqual(2);
 });
 it("[S2] ordinary listing/context/write, SSO admin/link and worker are refused and create nothing",async()=>{
  const f=await fixture();await f.enable();const id=new IdentityApplication(f.provider,origin),before=await counts();
  expect((await id.session(f.ordinary.sessionToken)).memberships).toEqual([]);
  await expect(id.context({...f.ordinary,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(id.invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email:`invited@${f.domain}`,role:"finance"},f.ordinary)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(f.app.view(f.principal.tenantId,f.ordinary)).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
  await expect(f.app.start(f.connectionId,{version:"sso-start.v1",action:"signin",linkExisting:true},f.ordinary)).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
  await expect(f.service.view({version:"sso-required-view.v1",requested_tenant_id:f.principal.tenantId},f.ordinary)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
  const context=await id.context({...f.bound!,requestedTenantId:f.principal.tenantId});
  await expect(f.app.checkWorkerAction(context,{version:"sso-worker-action.v1",connectionId:f.connectionId,sessionId:f.sessionId,membershipId:f.principal.membershipId,permission:"organisation.manage",scopeId:f.principal.tenantId})).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
  expect(await counts()).toEqual(before);
 });
 it("[S3] A-required B-ordinary account signs in, lists, resolves and invites only B",async()=>{
  const f=await fixture(),other=await fixture(false,false);await memberIn(f.principal.identityUserId,other.principal.tenantId,"owner");await f.enable();
  const request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()}),session=await f.provider.verifyCode(f.email,"signin",request.fixtureCode!);
  const id=new IdentityApplication(f.provider,origin),credentials={...session,origin};
  expect((await id.session(session.sessionToken)).memberships.map(x=>x.tenantId)).toEqual([other.principal.tenantId]);
  expect((await id.context({...credentials,requestedTenantId:other.principal.tenantId})).tenantId).toBe(other.principal.tenantId);
  await expect(id.context({...credentials,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(id.invite({version:"identity-invitation.v1",requested_tenant_id:other.principal.tenantId,email:`invite@${f.domain}`,role:"finance"},credentials)).resolves.toHaveProperty("id");
 });
 it("[S4] bound session lists and resolves only A; expired and revoked sessions yield no authority",async()=>{
  const f=await fixture(),other=await fixture(false,false);await memberIn(f.principal.identityUserId,other.principal.tenantId);await f.enable();
  const id=new IdentityApplication(f.provider,origin);
  expect((await id.session(f.bound!.sessionToken)).memberships.map(x=>x.tenantId)).toEqual([f.principal.tenantId]);
  expect((await id.context({...f.bound!,requestedTenantId:f.principal.tenantId})).tenantId).toBe(f.principal.tenantId);
  for(const sql of ["UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1","UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1"]) {
   const bound=await f.signin();await admin.query(sql,[f.provider.digest(`session:${bound.sessionToken}`)]);await expect(id.session(bound.sessionToken)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  }
 });
 it("[S5] preexisting ordinary session loses A immediately, retains B, is not revoked and regains A after OFF",async()=>{
  const f=await fixture(),other=await fixture(false,false);await memberIn(f.principal.identityUserId,other.principal.tenantId);const id=new IdentityApplication(f.provider,origin);
  expect((await id.session(f.ordinary.sessionToken)).memberships).toHaveLength(2);await f.enable();
  expect((await id.session(f.ordinary.sessionToken)).memberships.map(x=>x.tenantId)).toEqual([other.principal.tenantId]);
  expect((await admin.query("SELECT revoked_at FROM identity.session WHERE id=$1",[f.sessionId])).rows[0].revoked_at).toBeNull();
  await f.service.command(f.command(false,1),f.bound!);expect((await id.session(f.ordinary.sessionToken)).memberships).toHaveLength(2);
 });
 it("[S6a] no organisation.manage and another tenant administrator cannot change requirement",async()=>{
  const f=await fixture(),outsider=await fixture();
  await expect(f.service.command(f.command(true,0),outsider.bound!)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
  const joiner=await f.signin(`readonly@${f.domain}`,randomUUID(),false,["admins"]);
  // A JIT member's admin grant is explicitly revoked before checking current authority.
  const p=(await f.provider.authenticate(joiner.sessionToken))!,member=(await f.provider.findMembership(p,f.principal.tenantId))!;
  await admin.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) SELECT tenant_id,gen_random_uuid(),id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2",[f.principal.tenantId,member.id]);
  await expect(f.service.command(f.command(true,0),joiner)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
 });
 it("[S6b] ordinary administrator cannot turn ON or OFF even with valid connection",async()=>{
  const f=await fixture();for(const enabled of [true,false])await expect(f.service.command(f.command(enabled,0),f.ordinary)).rejects.toMatchObject({code:"SSO_REQUIRED_NEEDS_SSO_SESSION"});
 });
 it("[S6c] missing connection, verified domain or latest enabled mapping refuses SQL guard",async()=>{
  const f=await fixture();
  await f.app.admin({version:"sso-admin.v1",requested_tenant_id:f.principal.tenantId,action:"mapping.set",connectionId:f.connectionId,group:"admins",role:"admin",scope:{kind:"tenant",id:f.principal.tenantId},enabled:false,expectedRevision:1},f.bound!);
  await expect(f.enable()).rejects.toMatchObject({code:"SSO_REQUIRED_NO_CONNECTION"});
  const empty=await fixture(false,false);
  await expect(empty.service.command(empty.command(true,0),empty.ordinary)).rejects.toMatchObject({code:"SSO_REQUIRED_NO_CONNECTION"});
  await empty.app.admin({version:"sso-admin.v1",requested_tenant_id:empty.principal.tenantId,action:"connection.create",id:empty.connectionId,idpCert:empty.idp.idpCert},empty.ordinary);
  await empty.app.admin({version:"sso-admin.v1",requested_tenant_id:empty.principal.tenantId,action:"mapping.set",connectionId:empty.connectionId,group:"admins",role:"admin",scope:{kind:"tenant",id:empty.principal.tenantId},enabled:true,expectedRevision:0},empty.ordinary);
  await expect(empty.service.command(empty.command(true,0),empty.ordinary)).rejects.toMatchObject({code:"SSO_REQUIRED_NO_CONNECTION"});
  // Verified domains are immutable: a successful bound session necessarily has one. Source inspection
  // pins the redundant SQL domain guard without altering any merged object in a fixture.
  const sql=await readFile(new URL("../migrations/0125_sso_required.sql",import.meta.url),"utf8");
  expect(sql).toContain("NOT EXISTS(SELECT 1 FROM identity.verified_domain d WHERE d.tenant_id=t AND d.connection_id=c)");
 });
 it("[S6d] unlinked active member and reinvited replacement pointing at retired SAML membership prevent ON",async()=>{
  const f=await fixture(),other=await fixture(false,false),newMember=await memberIn(other.principal.identityUserId,f.principal.tenantId);
  await expect(f.enable()).rejects.toMatchObject({code:"SSO_REQUIRED_UNLINKED_MEMBERS"});
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,newMember]);
  await admin.query("DELETE FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2",[other.principal.identityUserId,f.principal.tenantId]);
  const replacement=await memberIn(other.principal.identityUserId,f.principal.tenantId);
  await admin.query("INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id) VALUES($1,$2,$3,$4,$5,$6)",[f.principal.tenantId,f.connectionId,"a".repeat(64),"b".repeat(64),other.principal.identityUserId,newMember]);
  expect(replacement).not.toBe(newMember);await expect(f.enable()).rejects.toMatchObject({code:"SSO_REQUIRED_UNLINKED_MEMBERS"});
 });
 it("[S6e] concurrent expected-revision commands produce one row and replay is stale",async()=>{
  const f=await fixture(),results=await Promise.allSettled([f.enable(),f.enable()]);expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(results.find(x=>x.status==="rejected")).toMatchObject({reason:{code:"STALE_SSO_REQUIRED"}});
  expect((await admin.query("SELECT count(*)::int n FROM identity.sso_required_event WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1);
  await expect(f.enable()).rejects.toMatchObject({code:"STALE_SSO_REQUIRED"});
 });
 it("[S6f] revision and one success audit append atomically; chain verifies and forced rollback changes neither",async()=>{
  const f=await fixture();await f.enable();const events=await audit(f.principal.tenantId);expect(events.filter(x=>x.event_type==="sso.required.enabled")).toHaveLength(1);
  const client=await admin.connect();try {
   await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);
   await client.query("SELECT identity.sso_required_command($1,$2::jsonb)",[f.provider.digest(`session:${f.bound!.sessionToken}`),JSON.stringify(f.command(false,1))]);
  }finally{await client.query("ROLLBACK");client.release();}
  expect((await admin.query("SELECT max(revision) revision FROM identity.sso_required_event WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].revision).toBe(1);expect(await audit(f.principal.tenantId)).toEqual(events);
 });
 it("[S6g] SQL refuses a differently named real database independently of server mode",async()=>{
  await admin.query("CREATE DATABASE jobguard_other");
  const alternate=new Pool({...admin.options,password:"synthetic",database:"jobguard_other"});
  try {
   await migrate(alternate);
   for(const query of ["SELECT identity.sso_required_command($1,'{}'::jsonb)","SELECT identity.sso_required_view($1,NULL)"])await expect(alternate.query(query,["a".repeat(64)])).rejects.toMatchObject({code:"42501",message:"SSO_ROUTE_BLOCKED"});
   expect((await alternate.query("SELECT identity.sso_emergency_use(NULL,'{}'::jsonb) result")).rows[0].result).toEqual({used:false,cause:"SSO_ROUTE_BLOCKED"});
   expect((await alternate.query("SELECT * FROM identity.sso_session_memberships(NULL,NULL)")).rows).toEqual([]);
   expect((await alternate.query("SELECT * FROM identity.sso_code_signin_allowed(NULL)")).rows[0].allowed).toBe(true);
   expect((await alternate.query("SELECT * FROM identity.sso_invitation_accept_allowed(NULL)")).rows[0].allowed).toBe(true);
  }finally{await alternate.end();}
 });

 it("[S7] closed invitation creation and acceptance write no member/locator/acceptance; SAML JIT joins and ordinary B invite succeeds",async()=>{
  const f=await fixture(),id=new IdentityApplication(f.provider,origin),email=`invited@${f.domain}`;
  const invitation=await id.invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email,role:"finance"},f.ordinary);await f.enable();
  const before=await counts();await expect(id.invite({version:"identity-invitation.v1",requested_tenant_id:f.principal.tenantId,email:`new@${f.domain}`,role:"finance"},f.bound!)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  const request=await f.provider.requestCode({email,purpose:"invitation",invitationId:invitation.id,ip:randomUUID()});
  await expect(f.provider.verifyCode(email,"invitation",request.fixtureCode!,invitation.id)).rejects.toMatchObject({code:"INVALID_CODE"});expect(await counts()).toEqual(before);
  expect((await admin.query("SELECT verified,consumed_at FROM identity.challenge WHERE invitation_id=$1",[invitation.id])).rows[0]).toMatchObject({verified:false,consumed_at:expect.any(Date)});
  expect((await admin.query("SELECT accepted_at FROM identity.invitation WHERE id=$1",[invitation.id])).rows[0].accepted_at).toBeNull();
  const jit=await f.signin(email,randomUUID());expect((await id.session(jit.sessionToken)).memberships.map(x=>x.tenantId)).toEqual([f.principal.tenantId]);
  const other=await fixture(false,false),inv=await new IdentityApplication(other.provider,origin).invite({version:"identity-invitation.v1",requested_tenant_id:other.principal.tenantId,email:f.email,role:"finance"},other.ordinary);
  const join=await f.provider.requestCode({email:f.email,purpose:"invitation",invitationId:inv.id,ip:randomUUID()}),session=await f.provider.verifyCode(f.email,"invitation",join.fixtureCode!,inv.id);
  expect((await id.session(session.sessionToken)).memberships.map(x=>x.tenantId)).toEqual([other.principal.tenantId]);
 });
 it("[S8] finance mapped grant is usable only through bound web/worker authority and ends with the session",async()=>{
  const f=await fixture();await f.app.admin({version:"sso-admin.v1",requested_tenant_id:f.principal.tenantId,action:"mapping.set",connectionId:f.connectionId,group:"finance",role:"finance",scope:{kind:"tenant",id:f.principal.tenantId},enabled:true,expectedRevision:0},f.ordinary);
  const financeEmail=`finance@${f.domain}`,bound=await f.signin(financeEmail,randomUUID(),false,["finance"]);
  const challenge=await f.provider.requestCode({email:financeEmail,purpose:"signin",ip:randomUUID()}),ordinary=await f.provider.verifyCode(financeEmail,"signin",challenge.fixtureCode!);
  const ordinaryPrincipal=(await f.provider.authenticate(ordinary.sessionToken))!;await f.enable();
  const id=new IdentityApplication(f.provider,origin),context=await id.context({...bound,requestedTenantId:f.principal.tenantId}),p=(await f.provider.authenticate(bound.sessionToken))!,member=(await f.provider.findMembership(p,f.principal.tenantId))!;
  const action={version:"sso-worker-action.v1",connectionId:f.connectionId,sessionId:p.sessionId,membershipId:member.id,permission:"statement.read",scopeId:f.principal.tenantId};
  await expect(id.context({...ordinary,origin,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(f.app.checkWorkerAction(context,{...action,sessionId:ordinaryPrincipal.sessionId})).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
  await expect(f.app.checkWorkerAction(context,action)).resolves.toBeUndefined();
  await admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[p.sessionId]);await expect(id.context({...bound,requestedTenantId:f.principal.tenantId})).rejects.toMatchObject({code:"UNAUTHENTICATED"});await expect(f.app.checkWorkerAction(context,action)).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
 });
 it("[S9] default OFF gate equals current memberships in both directions for bound, ordinary, unknown and NULL ids",async()=>{
  const f=await fixture(),p=(await f.provider.authenticate(f.bound!.sessionToken))!;
  for(const session of [p.sessionId,f.sessionId,randomUUID(),null]) {
   const diff=(await identity.query("(SELECT * FROM identity.sso_session_memberships($1,$2) EXCEPT SELECT * FROM identity.current_memberships($1)) UNION ALL (SELECT * FROM identity.current_memberships($1) EXCEPT SELECT * FROM identity.sso_session_memberships($1,$2))",[f.principal.identityUserId,session])).rows;expect(diff).toEqual([]);
  }
  expect((await identity.query("SELECT * FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows[0].allowed).toBe(true);
  expect((await identity.query("SELECT * FROM identity.sso_invite_member($1,$2,$3,$4)",[f.provider.digest(`session:${f.ordinary.sessionToken}`),f.principal.tenantId,`direct@${f.domain}`,"finance"])).rows[0].id).toEqual(expect.any(String));
 });
 it("[S12] catalogs keys, tenant FKs, owner, append-only trigger, FORCE RLS and explicit narrow grants",async()=>{
  for(const name of tables) {
   const relation=`identity.${name}`,r=(await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",[relation])).rows[0];expect(r).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"});
   expect((await admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='tenant_id'",[relation])).rows[0].attnotnull).toBe(true);
   const constraints=(await admin.query("SELECT contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass",[relation])).rows;
   expect(constraints.find(x=>x.contype==="p").definition).toMatch(/^PRIMARY KEY \(tenant_id,/u);
   for(const fk of constraints.filter(x=>x.contype==="f"&&!x.definition.includes("identity_user")&&!x.definition.includes("approver_rule")))expect(fk.definition).toContain("FOREIGN KEY (tenant_id");
   expect((await admin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='immutable'",[relation])).rows[0].n).toBe(1);
   for(const role of ["jobguard_runtime","jobguard_infrastructure"])for(const privilege of ["SELECT","INSERT","UPDATE","DELETE","TRUNCATE"])expect((await admin.query("SELECT has_table_privilege($1,$2,$3) allowed",[role,relation,privilege])).rows[0].allowed).toBe(false);
  }
  const routines=(await admin.query("SELECT oid::regprocedure::text signature,proacl::text[] proacl,prosecdef,proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE pronamespace='identity'::regnamespace AND proname IN('sso_session_memberships','sso_code_signin_allowed','sso_invitation_accept_allowed','sso_invite_member','sso_required_refusal_target','sso_required_command','sso_required_view','sso_emergency_use','sso_required_append')")).rows;
  expect(routines).toHaveLength(9);for(const r of routines) {
   expect(r.proacl.join(',')).not.toMatch(/(?:^|,)=[^,]*X/u);expect(r.prosecdef).toBe(true);expect(r.proconfig).toContain("search_path=pg_catalog");expect(r.owner).toBe("jobguard_migration");
   for(const role of ["jobguard_runtime","jobguard_infrastructure"])expect((await admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,r.signature])).rows[0].allowed).toBe(false);
   expect((await admin.query("SELECT has_function_privilege('jobguard_identity',$1,'EXECUTE') allowed",[r.signature])).rows[0].allowed).toBe(!r.signature.includes("sso_required_append"));
  }
  for(const setting of ["","invalid",randomUUID()])for(const table of tables) {
   const client=await identity.connect();try {await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true)",[setting]);expect((await client.query(`SELECT * FROM identity.${table}`)).rows).toEqual([]);}finally{await client.query("ROLLBACK");client.release();}
  }
 });
});
