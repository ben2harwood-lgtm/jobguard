import { randomUUID } from "node:crypto";
import { proofEvidenceTypeSchema } from "@jobguard/core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { migrate } from "../src/migrate.js";
import { freePort, closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

export const CH4_HASH = "a".repeat(64);
export async function createWorkFixture(install = true) {
 const directory = await mkdtemp(join(tmpdir(), "ch4-pg16-")), port = await freePort(59000, 400), credential = randomUUID();
 const connection = { host: "127.0.0.1", port, database: "postgres", user: "postgres", password: credential };
 const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: true, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start();
 const admin = new Pool(connection), login = `ch4_${randomUUID().replaceAll("-", "")}`;
 if (install) { await migrate(admin); await installLegacySyntheticPartyFixtures(admin); }
 if (install) await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT jobguard_runtime TO ${login}`);
 const runtime = new Pool({ ...connection, user: install ? login : "postgres", max: 4 });
 return { postgres, directory, admin, runtime };
}
export type WorkFixture = Awaited<ReturnType<typeof createWorkFixture>>;
/** Preserve the temporary cluster for dispatcher inspection; no deletion by this piece. */
export async function closeWorkFixture(f?: WorkFixture) { if (f) { await closeTestPools(f.runtime, f.admin); await f.postgres.stop(); } }
export async function workTenant<T>(pool: Pool, tenantId: string, work: (db: PoolClient) => Promise<T>) {
 const db = await pool.connect();
 try { await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]); const result = await work(db); await db.query("COMMIT"); return result; }
 catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
export async function seedWorkJob(f: WorkFixture, tenantId = randomUUID()) {
 const userId = randomUUID(), actorId = randomUUID(), accountId = randomUUID(), jobId = randomUUID(), scopeId = randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenantId]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
 await workTenant(f.admin, tenantId, async db => {
  await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional CH-4')", [accountId, tenantId]);
  await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [actorId, tenantId, accountId, userId]);
  await db.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional CH-4 site','live')", [jobId, tenantId]);
  await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenantId, jobId]);
 });
 return { tenantId, actorId, jobId, scopeId, context: testTenantContext(tenantId) };
}
export type WorkJob = Awaited<ReturnType<typeof seedWorkJob>>;
export async function insertPhoto(f: WorkFixture, a: WorkJob, receivedAt = "2026-10-13T10:00:00.000001Z", type: string = proofEvidenceTypeSchema.options[0]!) {
 const id = randomUUID(), version = randomUUID();
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
   VALUES($1,$2,$3,$4,$5,$6,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$7,$8,clock_timestamp())`, [id,a.tenantId,a.jobId,a.scopeId,`synthetic/ch4/${id}`,CH4_HASH,version,receivedAt]);
  await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   VALUES($1,$2,$1,$3,$4,'original',$5,$6,$7,$8,80,'image/png','standard_evidence',$9,clock_timestamp())`,[id,a.tenantId,a.jobId,a.scopeId,type,`synthetic/ch4/${id}`,version,CH4_HASH,receivedAt]);
 }); return id;
}
export async function workEvents(f: WorkFixture, a: WorkJob) {
 return workTenant(f.runtime,a.tenantId, async db => (await db.query(`SELECT id,kind,source_receipt_id,sequence::text,to_char(fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') fact_at FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence`, [a.tenantId,a.jobId])).rows);
}
/** Explicit held lifecycle storage only: no runtime command or permission is inferred. */
export async function fixtureLifecycle(f: WorkFixture,a: WorkJob,kind: string, predecessor: string | null = null) {
 const id=randomUUID();
 await workTenant(f.admin,a.tenantId,async db=> {
  // Constraint-valid references use a pre-existing receipt/audit from an explicitly labelled fixture.
  await db.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'ch4.fixture',$2::uuid::text,$3,'succeeded',$4,'{}',clock_timestamp())`,[a.tenantId,id,CH4_HASH,a.actorId]);
  await db.query(`INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,command_id,predecessor_id,close_reason,close_note,request_hash,audit_event_id)
   SELECT $1::uuid,$2::uuid,$3::uuid,coalesce(max(sequence),0)+1,$4::text,clock_timestamp(),$5::uuid,$3::uuid,$6::uuid,CASE WHEN $4='closed' THEN 'other' END,CASE WHEN $4='closed' THEN 'Fictional customer stopped work' END,$7,$3 FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId,id,kind,a.actorId,predecessor,CH4_HASH]);
 });return id;
}

export async function boundaryLock(f:WorkFixture,a:Awaited<ReturnType<typeof seedWorkJob>>) {
 // Explicit fixture lock with FK parents outside this boundary test. SV-4 owns the real command journey.
 await workTenant(f.admin,a.tenantId,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$6,$6,$6,'{}','I''ve reviewed the work and extras on this job and this is my complete final account.','final_account_declaration.v1','synthetic_final_check_terms.v1',$7,clock_timestamp(),$8,$9)`,[a.tenantId,a.jobId,randomUUID(),randomUUID(),randomUUID(),CH4_HASH,a.actorId,randomUUID(),randomUUID()]);
 });
}

export async function prepareWorkAccount(f:WorkFixture,a:WorkJob) {
 const baselineId=randomUUID(),draftId=randomUUID(),revisionId=randomUUID(),lineId=randomUUID();
 await workTenant(f.admin,a.tenantId,async db=>{
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1000,'accepted')",[baselineId,a.tenantId,a.jobId,CH4_HASH]);
  await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)",[draftId,a.tenantId,a.jobId]);
  await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1000,200,1200,false,'[]')`,[revisionId,a.tenantId,a.jobId,draftId,CH4_HASH,baselineId]);
  await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',1000,1)",[lineId,a.tenantId,a.jobId,revisionId,baselineId,a.scopeId]);
  await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3",[revisionId,a.tenantId,draftId]);
 });
 return {baselineId,draftId,revisionId,lineId};
}

/** Authenticate through the product's issued synthetic session, never a fabricated stamp. */
export async function seedWorkPractice(f:WorkFixture) {
 const {DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_MEMBERSHIP_ID,DEMO_IDENTITY_USER_ID}=await import("../src/demo-seed.js");
 const {issuePracticeSession,authenticatePracticeSession}=await import("../src/practice-session.js");
 process.env.JOBGUARD_ENV="synthetic_demo";
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_TENANT_ID]);
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
 await workTenant(f.admin,DEMO_TENANT_ID,async db=>{
  await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional CH-4 practice') ON CONFLICT DO NOTHING",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
  await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 });
 const sessionId=await issuePracticeSession(f.runtime),auth=await authenticatePracticeSession(f.runtime,sessionId);
 const jobId=(await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live' AND practice_scenario='home'",[DEMO_TENANT_ID,auth.digest])).rows[0].id as string;
 return {sessionId,jobId,auth};
}
