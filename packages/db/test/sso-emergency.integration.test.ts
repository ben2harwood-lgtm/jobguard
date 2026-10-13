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
  const prior=await snapshot(admin),earlier=await audit(f.principal.tenantId),request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});
  await expect(f.service.emergency({version:"sso-emergency.v1",requested_tenant_id:f.principal.tenantId,email:f.email,code:request.fixtureCode!,reason:"Synthetic outage with held approval rule"},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});
  expect(await snapshot(admin)).toEqual(prior);expect((await audit(f.principal.tenantId)).slice(0,earlier.length)).toEqual(earlier);
  const client=await admin.connect();try {
   await client.query("BEGIN");await client.query("ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held");const rule=randomUUID();
   await client.query("INSERT INTO identity.sso_emergency_approver_rule VALUES($1,'fixture.v1','{}',clock_timestamp())",[rule]);
   await client.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) VALUES($1,$2,$3,$4,'fixture',$5,clock_timestamp(),clock_timestamp()+interval '20 minutes')",[f.principal.tenantId,randomUUID(),f.principal.membershipId,rule,"a".repeat(64)]);
   const result=(await client.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[f.principal.identityUserId,JSON.stringify({version:"sso-emergency.v1",requested_tenant_id:f.principal.tenantId,email:f.email,code:"12345678",reason:"Synthetic owner fixture confirms sole OFF effect"})])).rows[0].result;
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
