import { seedContractorAgreement } from "./contractor-agreement-test-fixtures.js";
/** ENT-10d real PostgreSQL 16 tests. NOT RUN (sandbox cannot start PostgreSQL / a browser). */
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
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
import { closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { LedgerRepository, EvidenceService } from "../src/index.js";
import type { PrivateVersionedStorage } from "@jobguard/storage";
function validPng(){const crc=(bytes:Buffer)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0)}return(value^0xffffffff)>>>0};const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),8+data.length);return out};const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.from([0,20,30,40]))),chunk("IEND",Buffer.alloc(0))])}
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,identity:Pool,directory:string;
const origin="https://jobguard.invalid",secret="synthetic-required-identity-key-longer-than-32";
const tables=["sso_required_event","sso_emergency_approval","sso_emergency_use","sso_emergency_event"];
const auth=()=>new PersistedAuthProvider(new IdentityRepository(identity),secret);
const sso=()=>new SsoApplication(auth(),new EnterpriseIdentityRepository(identity),origin,"synthetic_demo");
const required=()=>new SsoRequiredApplication(auth(),new SsoRequiredRepository(identity),origin,"synthetic_demo",60);
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
 expect(names.indexOf("0129_sso_required.sql")).toBeGreaterThan(names.indexOf("0120_enterprise_identity.sql"));
 for(let i=1;i<names.length;i++)expect(names[i]!>names[i-1]!).toBe(true);
 // Real upgrade from the previous supported schema, followed by idempotent migration application.
 const index=names.indexOf("0129_sso_required.sql");
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,index)) {await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);}
 await migrate(admin);await migrate(admin);
 await admin.query("CREATE ROLE ent10d_identity LOGIN PASSWORD 'identity-fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO ent10d_identity; CREATE ROLE ent10d_runtime LOGIN PASSWORD 'runtime-fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO ent10d_runtime");
 identity=new Pool({...base,user:"ent10d_identity",password:"identity-fixture",max:8});runtime=new Pool({...base,user:"ent10d_runtime",password:"runtime-fixture",max:8});
},120000);
afterAll(async()=>{await closeTestPools(identity,runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});});
async function requestSigninCode(provider:PersistedAuthProvider,email:string) {
 // Fixture-only elapsed cooldown: keep attempts, expiry and consumption intact; do not move the database window clock.
 await admin.query("UPDATE identity.challenge SET requested_at=LEAST(requested_at,clock_timestamp()-interval '61 seconds') WHERE email=$1 AND purpose='signin'",[email]);
 return provider.requestCode({email,purpose:"signin",ip:randomUUID()});
}
async function fixture(configure=true,link=true) {
 const contractor=new ContractorRepository(runtime),principal=await contractor.startPractice(randomUUID()),provider=auth();
 await seedContractorAgreement(admin, principal.tenantId);
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

describe("ENT-10d emergency PostgreSQL boundary",()=>{
 it("[S10d] one owner-run rolled-back fixture proves sequential single use, expiry, wrong member and tenant",async()=>{
  const f=await fixture(),other=await fixture();await f.enable();await other.enable();
  const client=await admin.connect();
  const reason="Synthetic owner-only emergency fixture reason";
  const use=(u:string,t=f.principal.tenantId)=>client.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[u,JSON.stringify({version:"sso-emergency.v2",requested_tenant_id:t,commandId:randomUUID(),windowMinutes:60,reason})]);
  try {
   await client.query("BEGIN");
   await client.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);
   await client.query("SAVEPOINT expired_window");
   const rule=(await client.query("SELECT id FROM identity.sso_emergency_approver_rule WHERE version='company-owner-only.v1'")).rows[0].id;
   const expiredApproval=randomUUID(),expiredCommand=randomUUID(),freshCommand=randomUUID();
   const reasonHash=createHash("sha256").update(reason).digest("hex");
   await client.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,statement_timestamp()-interval '31 minutes',statement_timestamp()-interval '1 minute')",[f.principal.tenantId,expiredApproval,f.principal.membershipId,rule,`membership:${f.principal.membershipId}`,reasonHash]);
   const expiredEvent=(await client.query("SELECT identity.sso_required_append($1,$2,$3,'emergency',false,$4,1) result",[f.principal.tenantId,f.connectionId,f.principal.membershipId,reason])).rows[0].result.eventId;
   await client.query("INSERT INTO identity.sso_emergency_use(tenant_id,approval_id,event_id,used_at) SELECT tenant_id,id,$3,approved_at FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,expiredApproval,expiredEvent]);
   await client.query("INSERT INTO identity.sso_emergency_window(tenant_id,approval_id,event_id,command_id,owner_membership_id,window_minutes,opened_at,closes_at) SELECT tenant_id,id,$3,$4,membership_id,30,approved_at,approved_at+interval '30 minutes' FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,expiredApproval,expiredEvent,expiredCommand]);
   const expiredRows=()=>Promise.all([
    client.query("SELECT to_jsonb(r) value FROM identity.sso_emergency_approval r WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,expiredApproval]),
    client.query("SELECT to_jsonb(r) value FROM identity.sso_emergency_use r WHERE tenant_id=$1 AND approval_id=$2",[f.principal.tenantId,expiredApproval]),
    client.query("SELECT to_jsonb(r) value FROM identity.sso_emergency_window r WHERE tenant_id=$1 AND approval_id=$2",[f.principal.tenantId,expiredApproval]),
   ]).then(results=>results.map(result=>result.rows));
   const expiredBefore=await expiredRows();
   expect((await client.query("SELECT a.expires_at<=clock_timestamp() approval_expired,w.closes_at<=clock_timestamp() window_expired FROM identity.sso_emergency_approval a JOIN identity.sso_emergency_window w ON(w.tenant_id,w.approval_id)=(a.tenant_id,a.id) WHERE a.tenant_id=$1 AND a.id=$2",[f.principal.tenantId,expiredApproval])).rows).toEqual([{approval_expired:true,window_expired:true}]);
   expect((await client.query("SELECT required,event_id,window_open FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows).toEqual([{required:true,event_id:expiredEvent,window_open:false}]);
   // The expired window is the latest OFF revision, yet cannot authorize emailed-code sign-in.
   expect((await client.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:false}]);
   const fresh=(await client.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[f.principal.identityUserId,JSON.stringify({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId:freshCommand,windowMinutes:60,reason})])).rows[0].result;
   expect(fresh).toMatchObject({used:true,cause:"EMERGENCY_USED",connectionId:f.connectionId,actorMembershipId:f.principal.membershipId,windowMinutes:60});
   const recorded=(await client.query("SELECT a.id,a.membership_id,a.rule_id,a.approver_ref,a.reason_hash,u.event_id,w.command_id FROM identity.sso_emergency_approval a JOIN identity.sso_emergency_use u ON(u.tenant_id,u.approval_id)=(a.tenant_id,a.id) JOIN identity.sso_emergency_window w ON(w.tenant_id,w.approval_id,w.event_id)=(u.tenant_id,u.approval_id,u.event_id) WHERE w.tenant_id=$1 AND w.command_id=$2",[f.principal.tenantId,freshCommand])).rows;
   expect(recorded).toHaveLength(1);
   expect(recorded[0]).toMatchObject({membership_id:f.principal.membershipId,rule_id:rule,approver_ref:`membership:${f.principal.membershipId}`,reason_hash:reasonHash,event_id:fresh.eventId,command_id:freshCommand});
   expect(recorded[0].id).not.toBe(expiredApproval);
   for(const table of ["sso_emergency_approval","sso_emergency_use","sso_emergency_window"])expect((await client.query(`SELECT count(*)::int n FROM identity.${table} WHERE tenant_id=$1`,[f.principal.tenantId])).rows[0].n).toBe(2);
   expect(await expiredRows()).toEqual(expiredBefore);
   expect((await client.query("SELECT required,event_id,window_open FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows).toEqual([{required:false,event_id:fresh.eventId,window_open:true}]);
   expect((await client.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:true}]);
   // Restore ON and remove both fixture uses before the existing single-use checks.
   await client.query("ROLLBACK TO SAVEPOINT expired_window");
   await client.query("RELEASE SAVEPOINT expired_window");
   expect((await use(other.principal.identityUserId)).rows[0].result.used).toBe(false);
   expect((await use(f.principal.identityUserId,other.principal.tenantId)).rows[0].result.used).toBe(false);
   // One connection proves sequential single use; the separate disposable fixture tests concurrency.
   const submissions=await Promise.all([use(f.principal.identityUserId),use(f.principal.identityUserId)]);
   expect(submissions.filter(r=>r.rows[0].result.used)).toHaveLength(1);
   expect(submissions.filter(r=>!r.rows[0].result.used)).toHaveLength(1);
   expect(submissions[0]!.rows[0].result).toMatchObject({used:true,connectionId:f.connectionId});
   expect((await client.query("SELECT required,actor_kind FROM identity.sso_required_event WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[f.principal.tenantId])).rows[0]).toEqual({required:false,actor_kind:"emergency"});
   expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(false);
   expect((await client.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1);
  }finally{await client.query("ROLLBACK");client.release();}
  for(const table of ["sso_emergency_approval","sso_emergency_use"])expect((await admin.query(`SELECT count(*)::int n FROM identity.${table} WHERE tenant_id=$1`,[f.principal.tenantId])).rows[0].n).toBe(0);
 });
 it("[S11] refused and owner-fixture uses preserve journal, evidence, earlier audit and every identity authority row byte-for-byte",async()=>{
  const f=await fixture();await f.enable();
  // Nonempty immutable records are created through merged posting/evidence services before comparison.
  const context=testTenantContext(f.principal.tenantId),book=randomUUID(),receivable=randomUUID(),deferred=randomUUID(),authorization=randomUUID(),journal=randomUUID(),hash="a".repeat(64);
  await admin.query("INSERT INTO app.ledger_book(id,tenant_id,code,currency,chart_status) VALUES($1,$2,$3,'GBP','synthetic')",[book,f.principal.tenantId,`fixture:${book}`]);
  for(const [id,code,kind] of [[receivable,"AR","receivable"],[deferred,"DEF","deferred_income"]])await admin.query("INSERT INTO app.ledger_account(id,tenant_id,book_id,currency,code,class,mapping_status) VALUES($1,$2,$3,'GBP',$4,$5,'synthetic')",[id,f.principal.tenantId,book,code,kind]);
  await admin.query("INSERT INTO app.financial_authorization(id,tenant_id,membership_id,purpose,amount_pence,currency,artifact_hash,status) VALUES($1,$2,$3,'plan_obligation',1000,'GBP',$4,'approved')",[authorization,f.principal.tenantId,f.principal.membershipId,hash]);
  await new LedgerRepository(runtime).postPlanObligation(context,{authorizationId:authorization,actorRef:"member:synthetic",permission:"finance:approve"},{schemaVersion:1,journalId:journal,bookId:book,amountPence:1000,currency:"GBP",sourceEventId:`fixture:${journal}`,provenanceRef:"synthetic:ENT-10d",artifactHash:hash,authorizationId:authorization,actorRef:"member:synthetic",receivableAccountId:receivable,deferredIncomeAccountId:deferred,provenanceKind:"synthetic_authorized_plan"});
  await installLegacySyntheticPartyFixtures(admin);const job=randomUUID();await importWatchdogFixtureJob(admin,f.principal.tenantId,job);
  const bytes=validPng();
  // The storage adapter is the only external effect fake; upload and verified evidence are real PostgreSQL rows.
  let key="";
  const storage:PrivateVersionedStorage={createUploadUrl:async input=>{key=input.key;return "memory://synthetic";},createDownloadUrl:async()=>"memory://synthetic",deleteExactVersion:async()=>undefined,readExactVersion:async()=>({key,versionId:"fixture-v1",bytes,byteLength:bytes.length,contentType:"image/png"})};
  const evidence=new EvidenceService(runtime,storage),upload=await evidence.beginUpload(context,{jobId:job,scopeItemId:null,expectedSha256:createHash("sha256").update(bytes).digest("hex"),contentType:"image/png",maximumBytes:1000,expiresAt:new Date(Date.now()+60000)});
  await evidence.finalize(context,{uploadId:upload.id,objectVersionId:"fixture-v1",evidenceType:"site_photo"});
  expect((await admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1);
  expect((await admin.query("SELECT count(*)::int n FROM app.evidence_object WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1);
  const compared=["app.journal","app.journal_line","app.evidence_object","identity.sso_connection","identity.verified_domain","identity.idp_group_role_mapping","identity.sso_subject","identity.sso_session_binding","identity.sso_grant","identity.session","app.membership","app.role_grant"];
  const snapshot=async(client:Pick<PoolClient,'query'>)=>Promise.all(compared.map(async table=>(await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text bytes FROM ${table} r`)).rows[0].bytes));
  const prior=await snapshot(admin),earlier=await audit(f.principal.tenantId),request=await requestSigninCode(f.provider,f.email);
  await expect(f.service.emergency({version:"sso-emergency.v1",requested_tenant_id:f.principal.tenantId,email:f.email,code:request.fixtureCode!,reason:"Synthetic outage with held approval rule"},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});
  expect(await snapshot(admin)).toEqual(prior);expect((await audit(f.principal.tenantId)).slice(0,earlier.length)).toEqual(earlier);
  const client=await admin.connect();try {
   await client.query("BEGIN");
   const result=(await client.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[f.principal.identityUserId,JSON.stringify({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId:randomUUID(),windowMinutes:60,reason:"Synthetic owner fixture confirms sole OFF effect"})])).rows[0].result;
   expect(result.used).toBe(true);
   await new EnterpriseIdentityRepository(admin).audit(client,result.connectionId,"sso.emergency.used",`membership:${result.actorMembershipId}`,result.cause,createHash("sha256").update("Synthetic owner fixture confirms sole OFF effect").digest("hex"));
   expect(await snapshot(client)).toEqual(prior);
   const after=(await client.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence",[f.principal.tenantId])).rows;
   expect(after.slice(0,earlier.length)).toEqual(earlier);
   expect(after.at(-1).event_type).toBe("sso.emergency.used");
  }finally{await client.query("ROLLBACK");client.release();}
  const body=(await admin.query("SELECT pg_get_functiondef('identity.sso_emergency_use(uuid,jsonb)'::regprocedure) text")).rows[0].text;
  expect(body).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE)\b|journal|evidence/iu);
 });
});

type OwnerFixture=Awaited<ReturnType<typeof fixture>>;
const emergencyReason="Synthetic owner requests emergency access";
const inputV2=(f:OwnerFixture,commandId=randomUUID())=>({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId,email:f.email,reason:emergencyReason});
async function publicUse(f:OwnerFixture,commandId=randomUUID(),service=f.service) {
 const request=await requestSigninCode(f.provider,f.email);
 return service.emergency({...inputV2(f,commandId),code:request.fixtureCode},origin);
}
async function canonical(table:string,tenant?:string) {
 return (await admin.query(`SELECT row_to_json(r)::text bytes FROM ${table} r ${tenant?"WHERE tenant_id=$1":""} ORDER BY row_to_json(r)::text`,tenant?[tenant]:[])).rows.map(r=>r.bytes);
}
const created=["identity.sso_emergency_approval","identity.sso_emergency_use","identity.sso_emergency_window","identity.sso_required_event"];
const beforeUse=(f:OwnerFixture)=>Promise.all(created.map(t=>canonical(t,f.principal.tenantId)));
async function grant(tenant:string,membership:string,role:string,email:string) {
 let clientId:string|null=null;
 if(role==="client_approver"){
  clientId=randomUUID();
  const branchId=(await admin.query("SELECT id FROM app.org_unit WHERE tenant_id=$1 AND kind='branch' ORDER BY id LIMIT 1",[tenant])).rows[0].id;
  await admin.query("INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES($1,$2,$3,'Synthetic client','person')",[tenant,clientId,branchId]);
 }
 await admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email,client_id) VALUES($1,$2,$3,$4)",[tenant,membership,email,clientId]);
 if(role!=="client_approver")await admin.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,$4,'tenant',$1)",[tenant,randomUUID(),membership,role]);
}
async function pastUse(f:OwnerFixture,commandId:string) {
 const c=await admin.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);
 const approval=randomUUID(),rule=(await c.query("SELECT id FROM identity.sso_emergency_approver_rule")).rows[0].id;
 await c.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '15 minutes')",[f.principal.tenantId,approval,f.principal.membershipId,rule,`membership:${f.principal.membershipId}`,createHash("sha256").update(emergencyReason).digest("hex")]);
 const event=(await c.query("SELECT identity.sso_required_append($1,$2,$3,'emergency',false,$4,(SELECT max(revision) FROM identity.sso_required_event WHERE tenant_id=$1)) result",[f.principal.tenantId,f.connectionId,f.principal.membershipId,emergencyReason])).rows[0].result.eventId;
 await c.query("INSERT INTO identity.sso_emergency_use(tenant_id,approval_id,event_id,used_at) SELECT tenant_id,id,$3,approved_at FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,approval,event]);
 await c.query("INSERT INTO identity.sso_emergency_window(tenant_id,approval_id,event_id,command_id,owner_membership_id,window_minutes,opened_at,closes_at) SELECT tenant_id,id,$3,$4,membership_id,15,approved_at,approved_at+interval '15 minutes' FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,approval,event,commandId]);await c.query("COMMIT");
 }catch(error){await c.query("ROLLBACK");throw error;}finally{c.release();}
}
describe("ENT-10e owner emergency records",()=>{
 it("[E1] every non-owner role and all revoked or expired owner forms are refused without an OFF row",async()=>{
  const check=(await admin.query("SELECT pg_get_constraintdef(c.oid) text FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='role' WHERE c.conrelid='app.membership'::regclass AND c.contype='c' AND a.attnum=ANY(c.conkey)")).rows.map(r=>r.text).join(" ");
  const roles=check?[...check.matchAll(/'([^']+)'/gu)].map(m=>m[1]!).filter(r=>r!=="owner"):["admin","operative","supervisor","surveyor","commercial_manager","finance","read_only","client_approver"];
  expect(roles.length).toBeGreaterThan(0);
  const f=await fixture();await f.enable();
  for(const role of roles) {
   const claimant={email:`${role}@${f.domain}`,principal:{identityUserId:randomUUID()}};
   await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[claimant.principal.identityUserId]);
   await admin.query("INSERT INTO identity.user_email VALUES($1,$2)",[claimant.email,claimant.principal.identityUserId]);
   const membership=await memberIn(claimant.principal.identityUserId,f.principal.tenantId,role);
   await grant(f.principal.tenantId,membership,role,claimant.email);
   const before=await beforeUse(f),logs=await canonical("identity.sso_emergency_event",f.principal.tenantId),events=await audit(f.principal.tenantId);
   const code=await requestSigninCode(f.provider,claimant.email);
   await expect(f.service.emergency({...inputV2(f),email:claimant.email,code:code.fixtureCode},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(f)).toEqual(before);
   const cause=role==="admin"?"EMERGENCY_NOT_OWNER":"EMERGENCY_PERMISSION_REFUSED";
   const after=await audit(f.principal.tenantId);
   if(role==="admin"){expect(after.slice(events.length).map(r=>({type:r.event_type,code:r.payload.references.code}))).toEqual([{type:"sso.emergency.refused",code:cause}]);expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1",[f.principal.tenantId])).rows).toEqual([{cause_code:cause}]);}
   else {expect(after).toEqual(events);expect(await canonical("identity.sso_emergency_event",f.principal.tenantId)).toEqual(logs);}
   expect((await admin.query("SELECT code FROM identity.sso_refusal_event ORDER BY created_at DESC LIMIT 1")).rows[0].code).toBe(cause);
  }
  for(const kind of ["revoked","expired","contractor revoked"]){
   const f=await fixture();await f.enable();
   if(kind==="contractor revoked")await admin.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)",[f.principal.tenantId,randomUUID(),f.principal.membershipId]);
   else await admin.query(`UPDATE app.membership SET ${kind==="revoked"?"revoked_at":"expires_at"}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`,[f.principal.tenantId,f.principal.membershipId]);
   const before=await beforeUse(f),logs=await canonical("identity.sso_emergency_event",f.principal.tenantId);await expect(publicUse(f)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(f)).toEqual(before);expect(await canonical("identity.sso_emergency_event",f.principal.tenantId)).toEqual(logs);
  }
 });
 it("[E2] wrong-company owner, admin of A and owner of both can affect only the named company",async()=>{
  const a=await fixture(),b=await fixture();await a.enable();await b.enable();
  const bState=await b.service.view({version:"sso-required-view.v1",requested_tenant_id:b.principal.tenantId},b.bound!);
  const bBefore=await Promise.all([...created,"identity.sso_emergency_event"].map(t=>canonical(t,b.principal.tenantId))),aBefore=await beforeUse(a),aLogs=await canonical("identity.sso_emergency_event",a.principal.tenantId);
  const submit=async()=>{const code=await requestSigninCode(b.provider,b.email);return a.service.emergency({...inputV2(a),email:b.email,code:code.fixtureCode},origin);};
  await expect(submit()).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(a)).toEqual(aBefore);expect(await canonical("identity.sso_emergency_event",a.principal.tenantId)).toEqual(aLogs);
  expect((await admin.query("SELECT code FROM identity.sso_refusal_event ORDER BY created_at DESC LIMIT 1")).rows[0].code).toBe("EMERGENCY_MEMBER_NOT_ACTIVE");
  const membership=await memberIn(b.principal.identityUserId,a.principal.tenantId,"admin");await grant(a.principal.tenantId,membership,"admin",b.email);
  await expect(submit()).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(a)).toEqual(aBefore);expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1",[a.principal.tenantId])).rows).toEqual([{cause_code:"EMERGENCY_NOT_OWNER"}]);
  await admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2",[a.principal.tenantId,membership]);
  expect((await submit()).required).toBe(false);expect(await Promise.all([...created,"identity.sso_emergency_event"].map(t=>canonical(t,b.principal.tenantId)))).toEqual(bBefore);
  expect(await b.service.view({version:"sso-required-view.v1",requested_tenant_id:b.principal.tenantId},b.bound!)).toEqual(bState);
 });
 it("[E3] one owner command records exact approval, switch, use, window, log and audit with no session",async()=>{
  const f=await fixture();await f.enable();const before=await beforeUse(f),session=await canonical("identity.session"),earlier=await audit(f.principal.tenantId),commandId=randomUUID();const result=await publicUse(f,commandId);
  const row=(await admin.query("SELECT a.approver_ref,a.rule_id,a.reason_hash,a.approved_at=w.opened_at same_time,w.closes_at=w.opened_at+make_interval(mins=>w.window_minutes) exact_length,w.window_minutes,to_char(w.closes_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') closes_at,e.required,e.actor_kind,e.revision,u.event_id FROM identity.sso_emergency_window w JOIN identity.sso_emergency_approval a ON(a.tenant_id,a.id)=(w.tenant_id,w.approval_id) JOIN identity.sso_emergency_use u ON(u.tenant_id,u.approval_id,u.event_id)=(w.tenant_id,w.approval_id,w.event_id) JOIN identity.sso_required_event e ON(e.tenant_id,e.id)=(w.tenant_id,w.event_id) WHERE w.tenant_id=$1 AND w.command_id=$2",[f.principal.tenantId,commandId])).rows[0];
  expect(row).toEqual({approver_ref:`membership:${f.principal.membershipId}`,rule_id:"14300000-0000-4000-8000-000000000001",reason_hash:createHash("sha256").update(emergencyReason).digest("hex"),same_time:true,exact_length:true,window_minutes:60,closes_at:result.requiredAgainAt,required:false,actor_kind:"emergency",revision:2,event_id:expect.any(String)});
  expect(result).toEqual({version:"sso-emergency-response.v2",environment:"synthetic_demo",required:false,requiredAgainAt:row.closes_at,windowMinutes:60});
  const after=await beforeUse(f);for(let i=0;i<created.length;i++)expect(after[i]).toHaveLength(before[i]!.length+1);
  expect((await admin.query("SELECT outcome,cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1",[f.principal.tenantId])).rows).toEqual([{outcome:"used",cause_code:"EMERGENCY_USED"}]);
  const events=await audit(f.principal.tenantId);expect(events.slice(earlier.length)).toHaveLength(1);expect(events.at(-1).event_type).toBe("sso.emergency.used");expect(events.at(-1).payload.hashes.document).toBe(row.reason_hash);expect(await canonical("identity.session")).toEqual(session);
 });
 it("[E4] failed audit append rolls back every emergency fact and keeps code sign-in closed",async()=>{
  const f=await fixture();await f.enable();const repo=new SsoRequiredRepository(identity),service=new SsoRequiredApplication(f.provider,repo,origin,"synthetic_demo",60),before=await beforeUse(f),log=await canonical("identity.sso_emergency_event",f.principal.tenantId);
  const original=repo.enterprise.audit;repo.enterprise.audit=async()=>{throw new Error("Synthetic audit rejection");};
  try{await expect(publicUse(f,randomUUID(),service)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});}finally{repo.enterprise.audit=original;}
  expect(await beforeUse(f)).toEqual(before);expect(await canonical("identity.sso_emergency_event",f.principal.tenantId)).toEqual(log);
  expect((await admin.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:false}]);
 });
 it("[E5] open replay, closed replay, mailbox replay and a fresh post-close use preserve earlier windows",async()=>{
  const f=await fixture();await f.enable();const commandId=randomUUID();await publicUse(f,commandId);const open=await canonical("identity.sso_emergency_window",f.principal.tenantId);
  await expect(publicUse(f,commandId)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await canonical("identity.sso_emergency_window",f.principal.tenantId)).toEqual(open);
  expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[f.principal.tenantId])).rows[0].cause_code).toBe("EMERGENCY_ALREADY_USED");
  await f.service.command(f.command(true,2),f.bound!);const pastCommand=randomUUID();await pastUse(f,pastCommand);const past=await canonical("identity.sso_emergency_window",f.principal.tenantId);
  await expect(publicUse(f,pastCommand)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[f.principal.tenantId])).rows[0].cause_code).toBe("EMERGENCY_COMMAND_REPLAYED");expect(await canonical("identity.sso_emergency_window",f.principal.tenantId)).toEqual(past);
  const request=await requestSigninCode(f.provider,f.email),input={...inputV2(f),code:request.fixtureCode};await f.service.emergency(input,origin);const after=await beforeUse(f);
  await expect(f.service.emergency(input,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(f)).toEqual(after);
  const current=await canonical("identity.sso_emergency_window",f.principal.tenantId);expect(current).toHaveLength(past.length+1);expect(current.filter(x=>past.includes(x))).toEqual(past);
 });
 it("[E7] one owner rule is immutable, other seeds refused and application roles cannot insert approvals",async()=>{
  expect((await admin.query("SELECT id,version,definition FROM identity.sso_emergency_approver_rule")).rows).toEqual([{id:"14300000-0000-4000-8000-000000000001",version:"company-owner-only.v1",definition:{approver:"company_owner"}}]);
  expect((await admin.query("SELECT count(*)::int n FROM pg_constraint WHERE conname='sso_emergency_approver_rule_held'")).rows[0].n).toBe(0);
  const c=await admin.connect();for(const sql of ["INSERT INTO identity.sso_emergency_approver_rule(id,version,definition) VALUES(gen_random_uuid(),'other.v1','{}')","UPDATE identity.sso_emergency_approver_rule SET version='other.v1'","DELETE FROM identity.sso_emergency_approver_rule"]){try{await c.query("BEGIN");await c.query("SET LOCAL ROLE jobguard_migration");await expect(c.query(sql)).rejects.toThrow();}finally{await c.query("ROLLBACK");}}c.release();
  for(const role of ["jobguard_identity","jobguard_runtime"]){for(const table of ["sso_emergency_approver_rule","sso_emergency_approval"]){expect((await admin.query("SELECT has_table_privilege($1,$2,'INSERT') yes",[role,`identity.${table}`])).rows[0].yes).toBe(false);}const client=await admin.connect();try{await client.query("BEGIN");await client.query(`SET LOCAL ROLE ${role}`);await expect(client.query("INSERT INTO identity.sso_emergency_approval DEFAULT VALUES")).rejects.toMatchObject({code:"42501"});}finally{await client.query("ROLLBACK");client.release();}}
  expect((await admin.query("SELECT has_table_privilege('jobguard_identity','identity.sso_emergency_approver_rule','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed")).rows[0].allowed).toBe(false);
  const sql=await readFile(new URL("../migrations/0143_sso_emergency_owner_window.sql",import.meta.url),"utf8"),routine=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION identity.sso_emergency_use"),sql.indexOf("CREATE FUNCTION identity.sso_required_detail"));
  expect(sql.match(/INSERT INTO identity\.sso_emergency_approver_rule/gu)).toHaveLength(1);expect(sql.match(/INSERT INTO identity\.sso_emergency_approval/gu)).toHaveLength(1);expect(routine.match(/INSERT INTO identity\.sso_emergency_approval/gu)).toHaveLength(1);
 });
 it("[E8] refused and successful uses preserve all existing history and authority",async()=>{
  // S11 above proves nonempty journal and evidence preservation; this adds canonical microsecond identity comparison.
  const f=await fixture();await f.enable();const names=["identity.sso_connection","identity.verified_domain","identity.idp_group_role_mapping","identity.sso_subject","identity.sso_session_binding","identity.sso_grant","identity.session","app.membership","app.role_grant","app.journal","app.evidence_object"],before=await Promise.all(names.map(n=>canonical(n))),events=await canonical("app.audit_event",f.principal.tenantId);
  for(const table of ["app.journal","app.evidence_object"])expect((await admin.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBeGreaterThan(0);
  await expect(f.service.emergency({...inputV2(f),version:"sso-emergency.v1",code:"0".repeat(8)},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});await publicUse(f);
  expect(await Promise.all(names.map(n=>canonical(n)))).toEqual(before);expect((await canonical("app.audit_event",f.principal.tenantId)).filter(x=>events.includes(x))).toEqual(events);
  const body=(await admin.query("SELECT pg_get_functiondef('identity.sso_emergency_use(uuid,jsonb)'::regprocedure) text")).rows[0].text;expect(body).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE)\b|journal|evidence/iu);
 });
 it("[E9] retired v1, unknown mailbox, invalid code, switch off and invalid setting have identical public bodies",async()=>{
  const f=await fixture(),controller=new (await import("../../../apps/api/src/auth/sso/sso-required.controller.js")).SsoRequiredController(()=>f.service);
  const request=await requestSigninCode(f.provider,f.email),raw={...inputV2(f),code:request.fixtureCode};
  for(const input of [{...raw,code:undefined},{...raw,code:"0".repeat(8)},{...raw,email:"unknown@fixture.invalid"},{...raw,version:"sso-emergency.v1"},raw]){const error=await controller.emergency(input,{headers:{origin}}).catch(e=>e);expect(error.getStatus()).toBe(403);expect(error.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"});}
  await f.enable();const invalid=new SsoRequiredApplication(f.provider,new SsoRequiredRepository(identity),origin,"synthetic_demo","invalid");await expect(publicUse(f,randomUUID(),invalid)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[f.principal.tenantId])).rows[0].cause_code).toBe("EMERGENCY_WINDOW_INVALID");
  await publicUse(f);const fresh=await requestSigninCode(f.provider,f.email);
  const open=await controller.emergency({...inputV2(f),code:fresh.fixtureCode},{headers:{origin}}).catch(e=>e);expect(open.getStatus()).toBe(403);expect(open.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"});
 });
});
