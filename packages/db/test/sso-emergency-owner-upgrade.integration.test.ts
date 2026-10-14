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
 directory=await mkdtemp(join(tmpdir(),"jg-ent10e-upgrade-pg16-"));
 const port=await freePort(61100,200);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 const base={host:"127.0.0.1",port,database:"jobguard_synthetic_demo"};
 const control=new Pool({...base,database:"postgres",user:"postgres",password:"synthetic"});
 try{await control.query("CREATE DATABASE jobguard_synthetic_demo");}finally{await control.end();}
 admin=new Pool({...base,user:"postgres",password:"synthetic"});
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS){const name=url.pathname.split("/").at(-1)!;if(name>="0143_sso_emergency_owner_window.sql")break;const sql=await readFile(url,"utf8");await admin.query(name==="0095_job_parties.sql"?sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);"):sql);await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);}
 await admin.query("CREATE ROLE ent10e_upgrade_identity LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO ent10e_upgrade_identity; CREATE ROLE ent10e_upgrade_runtime LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO ent10e_upgrade_runtime");
 identity=new Pool({...base,user:"ent10e_upgrade_identity",password:"fixture",max:4});runtime=new Pool({...base,user:"ent10e_upgrade_runtime",password:"fixture",max:4});
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
async function state(f:Fixture) {
 const c=await admin.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);return (await c.query("SELECT * FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows[0];}finally{await c.query("ROLLBACK");c.release();}
}
async function bytes(table:string,tenant?:string) {
 return (await admin.query(`SELECT row_to_json(r)::text bytes FROM ${table} r ${tenant?"WHERE tenant_id=$1":""} ORDER BY row_to_json(r)::text`,tenant?[tenant]:[])).rows.map(r=>r.bytes);
}

const migrationName="0143_sso_emergency_owner_window.sql";
const compared=["identity.sso_required_event","identity.sso_emergency_event","identity.sso_subject","identity.session","identity.membership_locator","app.membership"];
const replaced=["sso_session_memberships","sso_code_signin_allowed","sso_invitation_accept_allowed","sso_invite_member","sso_required_refusal_target","sso_required_view","sso_emergency_use"];
const ident=(name:string)=>`"${name.replaceAll('"','""')}"`;
type Capture={columns:{name:string;type:string}[];primary:string[];keys:string[];rows:{key:string;bytes:string}[]};
async function columnTypes(table:string) {
 return (await admin.query<{name:string;type:string}>("SELECT attname::text name,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[table])).rows;
}
async function capturedRows(table:string,c:Pick<Capture,"columns"|"primary">,keys?:string[]) {
 const names=c.columns.map(x=>ident(x.name)).join(","),pk=c.primary.map(ident).join(",");
 return (await admin.query<{key:string;bytes:string}>(`SELECT row_to_json(k)::text key,row_to_json(t)::text bytes FROM (SELECT ${names} FROM ${table}) t CROSS JOIN LATERAL (SELECT ${pk}) k ${keys?"WHERE row_to_json(k)::text=ANY($1::text[])":""} ORDER BY row_to_json(k)::text`,keys?[keys]:[])).rows;
}
async function capture() {
 const result:Record<string,Capture>={};
 for(const table of compared){
  const columns=await columnTypes(table),primary=(await admin.query("SELECT a.attname name FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indisprimary AND i.indrelid=$1::regclass ORDER BY k.position",[table])).rows.map(r=>r.name as string);
  expect(primary.length).toBeGreaterThan(0);const rows=await capturedRows(table,{columns,primary});expect(rows.length).toBeGreaterThan(0);result[table]={columns,primary,rows,keys:rows.map(r=>r.key)};
 }
 return result;
}
async function assertPreserved(before:Record<string,Capture>) {
 for(const [table,c] of Object.entries(before)){
  const current=await columnTypes(table),names=new Set(c.columns.map(x=>x.name));
  expect(current.filter(x=>names.has(x.name))).toEqual(c.columns);
  expect(await capturedRows(table,c,c.keys)).toEqual(c.rows);
 }
}
async function routines() {
 return (await admin.query("SELECT p.oid::regprocedure::text signature,p.proname,pg_get_functiondef(p.oid) body,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('identity','app','control_plane','infrastructure','audit_control') ORDER BY signature")).rows;
}
async function control(work:()=>Promise<void>) {
 const c=await admin.connect();try{await c.query("BEGIN");
  // A single held client owns the rolled-back control; the snapshot code is exactly the production comparison above.
  const pool=admin;admin={query:c.query.bind(c)} as unknown as Pool;
  try{await work();}finally{admin=pool;}
 }finally{await c.query("ROLLBACK");c.release();}
}
describe("ENT-10e own-migration populated upgrade",()=>{
 it("[U1] own step preserves named rows, full types and untouched routines; later changes pass twice with controls",async()=>{
  const on=await fixture(),off=await fixture();await on.enable();
  // As-built v1 routine and repository audit primitive, before 0143: the eligible administrator refusal must exist.
  const legacy=new EnterpriseIdentityRepository(identity);
  await legacy.transaction(async c=>{
   const result=(await c.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[on.principal.identityUserId,JSON.stringify({version:"sso-emergency.v1",requested_tenant_id:on.principal.tenantId,reason})])).rows[0].result;
   expect(result).toEqual({used:false,cause:"EMERGENCY_APPROVER_RULE_UNSET",connectionId:on.connectionId,actorMembershipId:on.principal.membershipId});
   await legacy.audit(c,result.connectionId,"sso.emergency.refused",`membership:${result.actorMembershipId}`,result.cause,createHash("sha256").update(reason).digest("hex"));
  });
  const before=await capture(),functions=await routines();expect((await admin.query("SELECT * FROM identity.sso_emergency_approver_rule")).rows).toEqual([]);
  const url=MIGRATION_URLS.find(u=>u.pathname.endsWith(migrationName));expect(url).toBeDefined();
  await admin.query(await readFile(url!,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[migrationName]);
  await assertPreserved(before);
  const afterFunctions=await routines(),prior=new Map(functions.map(r=>[r.signature,r]));
  for(const row of functions){const after=afterFunctions.find(r=>r.signature===row.signature);expect(after).toBeDefined();
   if(replaced.includes(row.proname)){const {body:beforeBody,...metadata}=row;const {body:afterBody,...current}=after!;expect(current).toEqual(metadata);expect(afterBody).not.toBe(beforeBody);}
   else expect(after).toEqual(prior.get(row.signature));
  }
  expect((await admin.query("SELECT id,version,definition FROM identity.sso_emergency_approver_rule")).rows).toEqual([{id:"14300000-0000-4000-8000-000000000001",version:"company-owner-only.v1",definition:{approver:"company_owner"}}]);
  expect((await admin.query("SELECT conname FROM pg_constraint WHERE conrelid='identity.sso_emergency_approver_rule'::regclass AND conname IN('sso_emergency_approver_rule_held','sso_emergency_approver_rule_owner_only')")).rows).toEqual([{conname:"sso_emergency_approver_rule_owner_only"}]);
  expect((await state(on)).required).toBe(true);expect((await state(off)).required).toBe(false);
  await migrate(admin);await migrate(admin);await assertPreserved(before);
  await control(async()=>{
   await admin.query("UPDATE identity.session SET expires_at=expires_at+interval '1 microsecond' WHERE id=$1",[on.sessionId]);
   await expect(assertPreserved(before)).rejects.toThrow();
  });await assertPreserved(before);
  await control(async()=>{await admin.query("ALTER TABLE identity.sso_emergency_event ALTER COLUMN reason TYPE varchar(500)");await expect(assertPreserved(before)).rejects.toThrow();});await assertPreserved(before);
  await control(async()=>{await admin.query("ALTER TABLE identity.session ADD COLUMN later_nullable text");
   const body=(await admin.query("SELECT pg_get_functiondef('identity.sso_required_state(uuid)'::regprocedure) body")).rows[0].body;
   await admin.query(body.replace("BEGIN","BEGIN\n -- Later reviewed function replacement control"));await assertPreserved(before);
  });await assertPreserved(before);
  await control(async()=>{await admin.query("INSERT INTO identity.sso_emergency_event(tenant_id,id,membership_id,outcome,cause_code,reason) VALUES($1,$2,$3,'refused','EMERGENCY_REFUSED',$4)",[on.principal.tenantId,randomUUID(),on.principal.membershipId,reason]);await assertPreserved(before);});await assertPreserved(before);
  expect((await admin.query("SELECT count(*)::int n FROM identity.sso_emergency_approval")).rows[0].n).toBe(0);expect((await admin.query("SELECT count(*)::int n FROM identity.sso_emergency_use")).rows[0].n).toBe(0);
 });
});
