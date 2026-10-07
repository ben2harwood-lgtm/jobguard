import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { withTenant, verifiedTenantContextFromMembership } from "../src/tenant-context.js";
import { closeTestPools } from "./pool-test-utils.js";
const T=randomUUID(), O=randomUUID(), J=randomUUID(), K=randomUUID(), L=randomUUID(), M=randomUUID(), U=randomUUID(), H="a".repeat(64);
const context=(tenantId:string=T)=>verifiedTenantContextFromMembership({tenantId,membershipId:M,identityUserId:U} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
let postgres:EmbeddedPostgres, admin:Pool, runtime:Pool, shadow:Pool, emergency:Pool, directory:string, port:number;
const migrationURL=new URL("../migrations/0100_shadow_persistence.sql",import.meta.url);
async function signal(jobId:string=J,tenantId:string=T,state="candidate") {
 const id=randomUUID();await admin.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
 VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-v1',clock_timestamp(),'Fictional outside tap','low',$5)`,[tenantId,jobId,id,randomUUID(),state]);return id;
}
async function setup() {
 directory=await mkdtemp(join(tmpdir(),"sv2-pg16-"));port=59000+Math.floor(Math.random()*500);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);
 for(const [tenant,job] of [[T,J],[T,K],[O,L]]) {
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[tenant]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional SV-2 job','live')",[job,tenant]);
 }
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);const a=randomUUID();
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SV-2')",[a,T]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,a,U]);
 for(const [login,role] of [["sv2_runtime","jobguard_runtime"],["sv2_shadow","jobguard_shadow"],["sv2_emergency","jobguard_shadow_emergency_access"]]) {
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT ${role} TO ${login}`);
 }
 // Name the database: with none, pg connects to a database called after the login, which does not exist.
 const pool=(user:string)=>new Pool({host:"127.0.0.1",port,database:"postgres",user,password:"synthetic",max:4});
 runtime=pool("sv2_runtime");shadow=pool("sv2_shadow");emergency=pool("sv2_emergency");
}
async function cleanup(){await closeTestPools(runtime,shadow,emergency,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});}
import { ShadowRepository } from "../src/shadow-repository.js";
import { verifyAuditChain, type AuditEvent } from "../src/audit.js";
describe("SV-2 real PostgreSQL persistence (DW3–DW7)",()=>{
 beforeAll(setup,60000);afterAll(cleanup);
 it("returns nothing before a lock even with own revealed rows present (DW3 split)",async()=>{
  for(const [tenant,job,state] of [[T,J,"revealed"],[T,J,"candidate"],[T,J,"held_for_final_check"],[T,K,"revealed"],[O,L,"revealed"]])await signal(job,tenant,state);
  expect((await admin.query("SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND state='revealed'",[T,J])).rowCount).toBeGreaterThan(0);
  expect((await admin.query("SELECT to_regclass('app.final_account_lock') AS lock")).rows[0].lock).toBeNull();
  expect(await new ShadowRepository(runtime).reveal(context(),{version:"shadow-read.v1",jobId:J})).toEqual([]);
  expect(await new ShadowRepository(runtime).reveal(context(),{version:"shadow-read.v1",jobId:K})).toEqual([]);
  await expect(runtime.query("SELECT * FROM app.reveal_shadow_signals($1,$2)",[T,J])).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(runtime,context(O),db=>db.$client.query("SELECT * FROM app.reveal_shadow_signals($1,$2)",[T,J]))).rejects.toMatchObject({code:"42501"});
 });
 it("requires separate emergency permission and nonempty reason, atomically auditing before read",async()=>{
  const id=await signal(),request={version:"shadow-emergency-read.v1",jobId:J,reason:"Synthetic support investigation"};
  await expect(new ShadowRepository(runtime).emergencyRead(context(),request)).rejects.toMatchObject({code:"42501"});
  await expect(new ShadowRepository(shadow).emergencyRead(context(),request)).rejects.toMatchObject({code:"42501"});
  await expect(withTenant(emergency,context(),db=>db.$client.query("SELECT * FROM app.read_shadow_emergency($1,$2,' ')",[T,J]))).rejects.toMatchObject({code:"22023"});
  expect(await new ShadowRepository(emergency).emergencyRead(context(),request)).toEqual(expect.arrayContaining([expect.objectContaining({id,tenant_id:T,job_id:J})]));
  const access=(await admin.query("SELECT * FROM app.shadow_break_glass_access WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[T])).rows[0];
  expect(access).toMatchObject({actor_ref:"role:sv2_emergency",job_id:J,reason:request.reason});
  const event=(await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND id=$2",[T,access.id])).rows[0];
  expect(event.payload.hashes.reason).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(event)).not.toContain(request.reason);
  const count=(await admin.query("SELECT count(*)::int n FROM app.shadow_break_glass_access")).rows[0].n;
  await expect(withTenant(emergency,context(),async db=>{await db.$client.query("SELECT * FROM app.read_shadow_emergency($1,$2,'Synthetic rollback')",[T,J]);throw new Error("rollback")})).rejects.toThrow("rollback");
  expect((await admin.query("SELECT count(*)::int n FROM app.shadow_break_glass_access")).rows[0].n).toBe(count);
 });
 it("support disclosure is replay-safe and permanently ineligible (Test R)",async()=>{
  const id=await signal(),eventId=randomUUID(),repo=new ShadowRepository(emergency),request={version:"shadow-support-disclosure.v1",jobId:J,signalId:id,eventId};
  await expect(new ShadowRepository(runtime).supportDisclosure(context(),request)).rejects.toMatchObject({code:"42501"});
  await expect(new ShadowRepository(shadow).supportDisclosure(context(),request)).rejects.toMatchObject({code:"42501"});
  await repo.supportDisclosure(context(),request);await repo.supportDisclosure(context(),request);
  expect((await admin.query("SELECT * FROM app.shadow_disclosure_event WHERE id=$1",[eventId])).rows).toEqual([expect.objectContaining({signal_id:id,route:"support_conversation",before_lock:true,actor_ref:"role:sv2_emergency"})]);
  expect((await admin.query("SELECT * FROM app.shadow_commercial_signal WHERE id=$1",[id])).rows[0]).toMatchObject({disclosed_before_lock:true,state:"surfaced_early",first_builder_visible_at:expect.any(Date)});
  expect((await admin.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE signal_id=$1",[id])).rows).toEqual(expect.arrayContaining([{reason:"disclosed_before_lock"},{reason:"surfaced_early"}]));
  await expect(admin.query("UPDATE app.shadow_commercial_signal SET disclosed_before_lock=false WHERE id=$1",[id])).rejects.toMatchObject({code:"55000"});
  await expect(admin.query("UPDATE app.shadow_commercial_signal SET first_builder_visible_at=NULL WHERE id=$1",[id])).rejects.toMatchObject({code:"55000"});
  await expect(withTenant(shadow,context(),db=>db.$client.query("UPDATE app.shadow_commercial_signal SET state='revealed' WHERE id=$1",[id]))).rejects.toMatchObject({code:"55000"});
  await expect(repo.supportDisclosure(context(),{...request,signalId:await signal()})).rejects.toMatchObject({code:"23505"});
  for(const route of ["must_surface_override","export","data_subject_access","defect"]) {
   const s=await signal();await withTenant(shadow,context(),db=>db.$client.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,$5)",[T,J,s,randomUUID(),route]));
   expect((await admin.query("SELECT disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[s])).rows[0].disclosed_before_lock).toBe(true);
  }
 });
 it("an ADMIN-only membership of the support role (PostgreSQL 16's automatic creator shape) cannot use the support route",async()=>{
  // The creator membership has no INHERIT and no SET. pg_has_role MEMBER is true for it; USAGE and SET are false.
  await admin.query(`CREATE ROLE sv2_admin_only LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
   GRANT jobguard_shadow TO sv2_admin_only;
   GRANT jobguard_shadow_emergency_access TO sv2_admin_only WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`);
  expect((await admin.query("SELECT pg_has_role('sv2_admin_only','jobguard_shadow_emergency_access','MEMBER') AS member,pg_has_role('sv2_admin_only','jobguard_shadow_emergency_access','USAGE') AS usage,pg_has_role('sv2_admin_only','jobguard_shadow_emergency_access','SET') AS \"set\"")).rows)
   .toEqual([{member:true,usage:false,set:false}]);
  const adminOnly=new Pool({host:"127.0.0.1",port,database:"postgres",user:"sv2_admin_only",password:"synthetic",max:2});
  try{
   const id=await signal(),eventId=randomUUID();
   await expect(new ShadowRepository(adminOnly).supportDisclosure(context(),{version:"shadow-support-disclosure.v1",jobId:J,signalId:id,eventId})).rejects.toMatchObject({code:"42501",message:"separate support permission required"});
   expect((await admin.query("SELECT * FROM app.shadow_disclosure_event WHERE id=$1",[eventId])).rowCount).toBe(0);
   expect((await admin.query("SELECT disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[id])).rows[0].disclosed_before_lock).toBe(false);
   // The same login is otherwise a working shadow-worker principal, so the refusal is the support permission alone.
   await withTenant(adminOnly,context(),db=>db.$client.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'defect')",[T,J,id,randomUUID()]));
   expect((await admin.query("SELECT disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[id])).rows[0].disclosed_before_lock).toBe(true);
  }finally{await closeTestPools(adminOnly)}
 });
 it("binds immutable evidence to exact tenant/job, object version, hash and authoritative receive time",async()=>{
  const id=await signal(),upload=randomUUID(),e=randomUUID(),received=new Date("2026-09-30T10:00:00Z");
  await admin.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day')`,[upload,T,J,`synthetic/${upload}`,H]);
  await admin.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','proof_photo',$5,'version-v1',$6,10,'image/png','standard_evidence',$7,clock_timestamp())`,[e,T,upload,J,`synthetic/${upload}`,H,received]);
  const link=(jobId=J,tenantId=T,version="version-v1",hash=H,time=received)=>withTenant(shadow,context(tenantId),db=>db.$client.query(`INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,[tenantId,jobId,id,e,version,hash,time]));
  for(const [job,tenant,version,hash,time] of [[K,T,"version-v1",H,received],[L,O,"version-v1",H,received],[J,T,"wrong",H,received],[J,T,"version-v1","b".repeat(64),received],[J,T,"version-v1",H,new Date("1900-01-01")]] as const)await expect(link(job,tenant,version,hash,time)).rejects.toMatchObject({code:"23503"});
  await link();await expect(link()).rejects.toMatchObject({code:"23505"});
  await expect(admin.query("UPDATE app.shadow_signal_evidence SET source_received_at=clock_timestamp() WHERE signal_id=$1",[id])).rejects.toMatchObject({code:"55000"});
 });
 it("qualifies every shadow link by tenant/job, and classifications by run/signal",async()=>{
  const id=await signal(),other=await signal(K),run=randomUUID();
  await withTenant(shadow,context(),db=>db.$client.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at) VALUES($1,$2,$3,'synthetic-v1',clock_timestamp())",[T,J,run]));
  const statements=[
   ["INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES($1,$2,$3,$4,'attribution_disputed','synthetic')",[T,K,randomUUID(),id]],
   ["INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES($1,$2,$3,$4,$5,'not_enough_evidence')",[T,J,randomUUID(),run,other]],
   ["INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES($1,$2,$3,$4,$5,'not_enough_evidence')",[T,K,randomUUID(),run,other]],
   ["INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES($1,$2,$3,$4,$5,'not_completed')",[T,J,randomUUID(),run,other]],
   ["INSERT INTO app.shadow_disclosure_event(tenant_id,job_id,id,signal_id,route,actor_ref,before_lock) VALUES($1,$2,$3,$4,'defect','synthetic',true)",[T,K,randomUUID(),id]],
   ["UPDATE app.shadow_commercial_signal SET coalesced_into_signal_id=$1 WHERE id=$2",[other,id]],
  ] as const;
  for(const [sql,args] of statements)await expect(withTenant(shadow,context(),db=>db.$client.query(sql,[...args]))).rejects.toMatchObject({code:sql.includes("shadow_disclosure_event")?"42501":"23503"});
  // The controlled disclosure routine also rejects same-tenant wrong-job references.
  await expect(withTenant(shadow,context(),db=>db.$client.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'defect')",[T,K,id,randomUUID()]))).rejects.toMatchObject({code:"23503"});
  const classify=()=>withTenant(shadow,context(),db=>db.$client.query("INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES($1,$2,$3,$4,$5,'not_enough_evidence')",[T,J,randomUUID(),run,id]));
  await classify();await expect(classify()).rejects.toMatchObject({code:"23505"});
  // Superuser fixtures isolate FK behavior from RLS denial and routine permission checks.
  // A still-unclassified signal keeps the (tenant, run, signal) uniqueness from raising 23505 ahead of the foreign key.
  const unclassified=await signal();
  for(const [tenant,job] of [[T,K],[O,L]]) {
   for(const [sql,args] of [
    ["INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES($1,$2,$3,$4,'attribution_disputed','synthetic')",[tenant,job,randomUUID(),id]],
    ["INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES($1,$2,$3,$4,$5,'reveal')",[tenant,job,randomUUID(),run,unclassified]],
    ["INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES($1,$2,$3,$4,$5,'not_completed')",[tenant,job,randomUUID(),run,id]],
    ["INSERT INTO app.shadow_disclosure_event(tenant_id,job_id,id,signal_id,route,actor_ref,before_lock) VALUES($1,$2,$3,$4,'defect','synthetic',true)",[tenant,job,randomUUID(),id]],
   ] as const)await expect(admin.query(sql,[...args])).rejects.toMatchObject({code:"23503"});
  }
  await expect(admin.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at) VALUES($1,$2,$3,'synthetic',clock_timestamp())",[O,J,randomUUID()])).rejects.toMatchObject({code:"23503"});
  await expect(admin.query("INSERT INTO app.shadow_break_glass_access(tenant_id,job_id,id,actor_ref,reason) VALUES($1,$2,$3,'synthetic','Synthetic wrong tenant')",[O,J,randomUUID()])).rejects.toMatchObject({code:"23503"});
  // Catalog definition proves all new business FKs include tenant, and all subject FKs include job.
  const fks=(await admin.query(`SELECT c.relname,pg_get_constraintdef(f.oid) AS def FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid WHERE f.contype='f' AND c.relname LIKE 'shadow_%'`)).rows;
  expect(fks.length).toBeGreaterThan(10);for(const row of fks){expect(row.def).toContain("tenant_id");if(!row.def.includes("audit_event"))expect(row.def).toContain("job_id");}
 });
 it("keeps routine audit events atomic and verifiable in the existing chain format",async()=>{
  const rows=(await admin.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`,[T])).rows as AuditEvent[];
  expect(rows.length).toBeGreaterThan(0);expect(()=>verifyAuditChain(rows)).not.toThrow();
  const id=await signal(),event=randomUUID();
  await expect(withTenant(shadow,context(),async db=>{await db.$client.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'defect')",[T,J,id,event]);throw new Error("fault after routine")})).rejects.toThrow("fault after routine");
  expect((await admin.query("SELECT * FROM app.shadow_disclosure_event WHERE id=$1",[event])).rowCount).toBe(0);
  expect((await admin.query("SELECT * FROM app.audit_event WHERE id=$1",[event])).rowCount).toBe(0);
  expect((await admin.query("SELECT disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[id])).rows[0].disclosed_before_lock).toBe(false);
 });
});

it("rejects malformed versioned shadow inputs before opening a database transaction",async()=>{
 const pool=new Pool(),repo=new ShadowRepository(pool);
 try{
  await expect(repo.reveal(context(),{version:"wrong",jobId:J})).rejects.toMatchObject({code:"INVALID_SHADOW_REQUEST"});
  await expect(repo.reveal(context(),{version:"shadow-read.v1",jobId:J,tenantId:O})).rejects.toMatchObject({code:"INVALID_SHADOW_REQUEST"});
  await expect(repo.emergencyRead(context(),{version:"shadow-emergency-read.v1",jobId:J,reason:" "})).rejects.toMatchObject({code:"INVALID_SHADOW_REQUEST"});
  await expect(repo.supportDisclosure(context(),{version:"shadow-support-disclosure.v1",jobId:J,signalId:"not-an-id",eventId:randomUUID()})).rejects.toMatchObject({code:"INVALID_SHADOW_REQUEST"});
 }finally{await pool.end()}
});
