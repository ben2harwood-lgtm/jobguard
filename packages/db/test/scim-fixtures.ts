import { seedContractorAgreement } from "./contractor-agreement-test-fixtures.js";
/** Synthetic SCIM PostgreSQL fixtures. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { ContractorRepository, EnterpriseIdentityRepository, IdentityRepository, ScimRepository, SsoRequiredRepository, MIGRATION_URLS, migrate, verifyAuditChain, type AuditEvent } from "../src/index.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { SsoApplication } from "../../../apps/api/src/auth/sso/sso.application.js";
import { SsoRequiredApplication } from "../../../apps/api/src/auth/sso/sso-required.application.js";
import { ScimApplication } from "../../../apps/api/src/auth/sso/scim.application.js";
import { scimBearerFor } from "../../../apps/api/src/auth/sso/scim.contracts.js";
import { generateTestIdentityProvider } from "../../../apps/api/src/auth/sso/test-identity-provider.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

export const origin="https://jobguard.invalid";
export const sha256=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function createScimHarness(prefix:string,throughBefore?:string) {
 const directory=await mkdtemp(join(tmpdir(),prefix)),port=await freePort(57000,1800);
 const credential=randomBytes(24).toString("base64url");
 const postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:credential,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 const base={host:"127.0.0.1",port,database:"jobguard_synthetic_demo"};
 const control=new Pool({...base,database:"postgres",user:"postgres",password:credential});
 await control.query("CREATE DATABASE jobguard_synthetic_demo");await control.end();
 const admin=new Pool({...base,user:"postgres",password:credential});
 if(throughBefore) {
  const index=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith(`/${throughBefore}`));
  if(index<0)throw new Error("SCIM migration not registered");
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,index)) {
   await admin.query(await readFile(url,"utf8"));
   await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
  }
 } else {await migrate(admin);await migrate(admin);}
 await admin.query("CREATE ROLE scim_fixture_identity LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO scim_fixture_identity; CREATE ROLE scim_fixture_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO scim_fixture_runtime");
 await admin.query(`ALTER ROLE scim_fixture_identity PASSWORD '${credential}'; ALTER ROLE scim_fixture_runtime PASSWORD '${credential}'`);
 const identity=new Pool({...base,user:"scim_fixture_identity",password:credential,max:8}),runtime=new Pool({...base,user:"scim_fixture_runtime",password:credential,max:8});
 const seed=randomBytes(32).toString("base64url");
 const provider=new PersistedAuthProvider(new IdentityRepository(identity),randomBytes(32).toString("base64url"));
 const sso=new SsoApplication(provider,new EnterpriseIdentityRepository(identity),origin,"synthetic_demo");
 const required=new SsoRequiredApplication(provider,new SsoRequiredRepository(identity),origin,"synthetic_demo");
 const repository=new ScimRepository(identity),scim=new ScimApplication(repository,"synthetic_demo",seed),identityApp=new IdentityApplication(provider,origin);
 return {admin,runtime,identity,postgres,directory,seed,provider,sso,required,repository,scim,identityApp,
  close:async()=>{await closeTestPools(identity,runtime,admin);await postgres.stop();await rm(directory,{recursive:true,force:true});}};
}
export type ScimHarness=Awaited<ReturnType<typeof createScimHarness>>;
export type Credentials={sessionToken:string;csrfToken:string;origin:string};
export async function fixture(h:ScimHarness,configure=true,link=true) {
 const contractor=new ContractorRepository(h.runtime),principal=await contractor.startPractice(randomUUID());
 await seedContractorAgreement(h.admin, principal.tenantId);
 const connectionId=randomUUID(),domain=`${connectionId}.fixture.invalid`,email=`owner@${domain}`,sessionId=randomUUID();
 const sessionValue=randomBytes(32).toString("base64url"),csrfValue=randomBytes(24).toString("base64url");
 // The practice bootstrap creates the person; these rows mirror the merged SSO fixture's bootstrap.
 await h.admin.query("INSERT INTO identity.user_email VALUES($1,$2)",[email,principal.identityUserId]);
 await h.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[principal.identityUserId,principal.tenantId,principal.membershipId]);
 await h.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')",[sessionId,principal.identityUserId,h.provider.digest(`session:${sessionValue}`),csrfValue]);
 const ordinary:Credentials={sessionToken:sessionValue,csrfToken:csrfValue,origin},idp=generateTestIdentityProvider(),app=h.sso,service=h.required;
 const connection={id:connectionId,tenantId:principal.tenantId,idpEntityId:`urn:jobguard:test-idp:${connectionId}`,spEntityId:`urn:jobguard:sp:${connectionId}`,callbackUrl:`${origin}/api/auth/sso/${connectionId}/callback`,entryPoint:`${origin}/api/auth/sso/${connectionId}/start`,idpCert:idp.idpCert};
 const mapped=new Set<string>();
 async function map(role:string) {
  if(mapped.has(role))return;
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"mapping.set",connectionId,group:role,role,scope:{kind:"tenant",id:principal.tenantId},enabled:true,expectedRevision:0},ordinary);
  mapped.add(role);
 }
 async function signin(address=email,subject=principal.identityUserId,linkExisting=false,groups=["admin"]) {
  const started=await app.start(connectionId,{version:"sso-start.v1",action:"signin",...(linkExisting?{linkExisting:true}:{})},ordinary);
  const result=await app.callback(connectionId,{version:"sso-callback.v1",SAMLResponse:idp.response({connection,requestId:started.requestId,email:address,subject,groups}),relayState:started.relayState},started.relayState);
  return {sessionToken:result.sessionToken,csrfToken:result.csrfToken,origin};
 }
 let bound:Credentials|undefined;
 if(configure) {
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"connection.create",id:connectionId,idpCert:idp.idpCert},ordinary);
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"domain.verify",connectionId,domain,proof:`synthetic-domain:${connectionId}:${domain}`},ordinary);
  await map("admin");if(link)bound=await signin(email,principal.identityUserId,true);
 }
 const command=(enabled:boolean,expectedRevision:number)=>({version:"sso-required-command.v1",requested_tenant_id:principal.tenantId,required:enabled,expectedRevision,reason:"Synthetic administrator verifies SSO requirement"});
 const enable=()=>service.command(command(true,0),bound!);
 return {h,principal,connectionId,domain,email,ordinary,bound,sessionId,idp,connection,app,service,contractor,command,signin,map,enable};
}
export type ScimFixture=Awaited<ReturnType<typeof fixture>>;
export async function person(f:ScimFixture,role="finance",subject:string=randomUUID()) {
 await f.map(role);const email=`${randomUUID()}@${f.domain}`,bound=await f.signin(email,subject,false,[role]);
 const principal=(await f.h.provider.authenticate(bound.sessionToken))!;
 const membership=(await f.h.provider.findMembership(principal,f.principal.tenantId))!;
 const request=await f.h.provider.requestCode({email,purpose:"signin",ip:randomUUID()});
 const ordinary:Credentials={...await f.h.provider.verifyCode(email,"signin",request.fixtureCode!),origin};
 // Table-owner set-up, as merged identity tests advance their clock: age this stored sign-in request past the merged 60-second same-address cooldown, so a later request a test makes for this address is a real, otherwise-allowed one.
 await f.h.admin.query("UPDATE identity.challenge SET requested_at=requested_at-interval '61 seconds',expires_at=expires_at-interval '61 seconds' WHERE email=$1 AND purpose='signin'",[email]);
 return {subject,email,userId:principal.identityUserId,membershipId:membership.id,bound,ordinary,sessionId:principal.sessionId};
}
export type ScimPerson=Awaited<ReturnType<typeof person>>;
export async function deactivate(f:ScimFixture,p:{subject:string},eventId=randomUUID()) {
 const bearer=scimBearerFor(f.h.seed,f.connectionId);
 return f.h.scim.deactivate(f.connectionId,["Bearer",bearer].join(" "),{version:"scim-deactivation.v1",eventId,subject:p.subject,active:false});
}
/** Table-owner seed mirrors merged tests for otherwise unreachable multi-company links/re-admission. */
export async function memberIn(h:ScimHarness,user:string,tenant:string,role="finance") {
 const account=(await h.admin.query("SELECT id FROM app.account WHERE tenant_id=$1 LIMIT 1",[tenant])).rows[0].id,id=randomUUID();
 await h.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,$5)",[id,tenant,account,user,role]);
 await h.admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,$3)",[tenant,id,`${user}@fixture.invalid`]);
 await h.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[user,tenant,id]);return id;
}
export async function canonicalRows(h:ScimHarness,table:string,where="true",values:unknown[]=[]) {
 return (await h.admin.query<{text:string}>(`SELECT row_to_json(t)::text text FROM (SELECT * FROM ${table} WHERE ${where}) t ORDER BY row_to_json(t)::text`,values)).rows.map(r=>r.text);
}
export async function auditRows(h:ScimHarness,tenant:string) {
 const rows=(await h.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence",[tenant])).rows;
 const events:AuditEvent[]=rows.map(r=>({id:r.id,tenantId:r.tenant_id,sequence:Number(r.sequence),version:r.version,actorRef:r.actor_ref,eventType:r.event_type,subjectType:r.subject_type,subjectRef:r.subject_ref,occurredAt:r.occurred_at,payload:r.payload,payloadHash:r.payload_hash,previousHash:r.previous_hash,eventHash:r.event_hash}));
 verifyAuditChain(events);return rows;
}
