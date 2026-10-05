import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeTestPools } from "./pool-test-utils.js";
import { appendAuditBatch, migrate, MIGRATION_URLS, DEMO_TENANT_ID, DEMO_IDENTITY_USER_ID, DEMO_ACCOUNT_ID, DEMO_MEMBERSHIP_ID, CaptureRepository, SandboxRepository, listDecisionInbox, withTenant, issuePracticeSession, authenticatePracticeSession, authorizePracticeJob } from "../src/index.js";
const priorEnvironment=process.env.JOBGUARD_ENV;
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string;
beforeAll(async () => {
 dir = await mkdtemp(join(tmpdir(), "sbox-session-pg-")); const port=57000+Math.floor(Math.random()*500);
 pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await pg.initialise(); await pg.start(); admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
 // Upgrade from the immediately preceding supported schema with an unbound legacy job.
 for (const url of MIGRATION_URLS.slice(0,-1)) await admin.query(await (await import("node:fs/promises")).readFile(url,"utf8"));
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[DEMO_TENANT_ID]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional builder')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Unbound legacy')",[legacyJob,DEMO_TENANT_ID]);
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.slice(0,-1))await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
 await migrate(admin);
 await admin.query("CREATE ROLE sbox_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO sbox_login");
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"sbox_login",password:"synthetic"});
 process.env.JOBGUARD_ENV="synthetic_demo";
},60000);
afterAll(async()=>{if(priorEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=priorEnvironment;await closeTestPools(runtime,admin);await pg?.stop();if(dir)await rm(dir,{recursive:true,force:true});});
const legacyJob=randomUUID();
async function captured(){
 const creator=await issuePracticeSession(runtime), stranger=await issuePracticeSession(runtime);
 const auth=await authenticatePracticeSession(runtime,creator),captureId=randomUUID();
 const provenance={kind:"extracted" as const,span:{sourceId:captureId,sourceVersion:1 as const,start:5,end:12}};
 const input={captureId,text:"JOB: Fictional\nITEM: Paint",proposal:{title:{value:"Fictional",provenance},lines:[{description:{value:"Paint",provenance},quantity:{value:null,provenance:{kind:"defaulted" as const,note:"unknown"}},unit:{value:null,provenance:{kind:"defaulted" as const,note:"unknown"}},unitPricePence:{value:null,provenance:{kind:"defaulted" as const,note:"unknown"}}}],materials:[],questions:[]},promptVersion:"fixture",schemaVersion:"fixture",model:"fixture",practiceSessionDigest:auth.digest};
 const saved=await new CaptureRepository(runtime).persist(auth.context,input);
 return {creator,stranger,auth,input,jobId:saved.job_id};
}
it("stranger first GET and POST authorization fail before any first-touch effect; creator and replay work",async()=>{
 const x=await captured();
 for(let attempt=0;attempt<2;attempt++)await expect(authorizePracticeJob(runtime,x.stranger,x.jobId)).rejects.toThrow("NOT_FOUND");
 const [owner,other]=await Promise.allSettled([authorizePracticeJob(runtime,x.creator,x.jobId),authorizePracticeJob(runtime,x.stranger,x.jobId)]);
 expect(owner.status).toBe("fulfilled");expect(other.status).toBe("rejected");
 expect((await new CaptureRepository(runtime).persist(x.auth.context,x.input)).job_id).toBe(x.jobId);
 const strangerAuth=await authenticatePracticeSession(runtime,x.stranger);
 await expect(new CaptureRepository(runtime).persist(strangerAuth.context,{...x.input,practiceSessionDigest:strangerAuth.digest})).rejects.toThrow("NOT_FOUND");
 expect((await admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1",[DEMO_TENANT_ID])).rows[0].n).toBe(0);
});
it("unknown, missing, expired and revoked sessions fail closed; legacy jobs cannot be claimed",async()=>{
 for(const token of [undefined,randomUUID()])await expect(authorizePracticeJob(runtime,token,legacyJob)).rejects.toThrow("UNAUTHENTICATED");
 const token=await issuePracticeSession(runtime);await expect(authorizePracticeJob(runtime,token,legacyJob)).rejects.toThrow("NOT_FOUND");
 const auth=await authenticatePracticeSession(runtime,token);
 await admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[auth.digest]);
 await expect(authenticatePracticeSession(runtime,token)).rejects.toThrow("UNAUTHENTICATED");
 const expired=await issuePracticeSession(runtime),e=await authenticatePracticeSession(runtime,expired);
 await admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1",[e.digest]);
 await expect(authenticatePracticeSession(runtime,expired)).rejects.toThrow("UNAUTHENTICATED");
});
it("raw runtime SQL cannot transfer or backfill ownership even with forged session settings",async()=>{
 const x=await captured(), stranger=await authenticatePracticeSession(runtime,x.stranger);
 for(const jobId of [x.jobId,legacyJob])await expect(withTenant(runtime,stranger.context,async db=>{
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${stranger.membershipId}`,eventType:"practice.owner.claim_attempt",subjectType:"job",subjectRef:jobId,payload:{references:{jobId},classifications:{claim:"operational"}}}]);
  await db.$client.query("SELECT set_config('app.practice_feed_session',$1,true)",[x.stranger]);
  await db.$client.query("UPDATE app.job SET practice_session_digest=$1 WHERE tenant_id=$2 AND id=$3",[stranger.digest,DEMO_TENANT_ID,jobId]);
 })).rejects.toMatchObject({code:"42501"});
 expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE event_type='practice.owner.claim_attempt'")).rows[0].n).toBe(0);
 await expect(runtime.query("SELECT * FROM control_plane.practice_session")).rejects.toMatchObject({code:"42501"});
 const tables=await admin.query("SELECT relforcerowsecurity,relrowsecurity FROM pg_class WHERE oid='app.job'::regclass");
 expect(tables.rows[0]).toMatchObject({relforcerowsecurity:true,relrowsecurity:true});
 const role=await admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='sbox_login'");expect(role.rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
});

it("rechecks current owner role, identity, membership expiry and revocation",async()=>{
 const token=await issuePracticeSession(runtime);
 for(const [column,value] of [["revoked_at",new Date()],["expires_at",new Date(0)],["role","member"]] as const){
  try{
   await admin.query(`UPDATE app.membership SET ${column}=$1 WHERE tenant_id=$2 AND id=$3`,[value,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID]);
   await expect(authenticatePracticeSession(runtime,token)).rejects.toThrow("UNAUTHENTICATED");
  }finally{
   await admin.query("UPDATE app.membership SET revoked_at=NULL,expires_at=NULL,role='owner' WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID]);
  }
 }
 expect((await authenticatePracticeSession(runtime,token)).membershipId).toBe(DEMO_MEMBERSHIP_ID);
});
it("migration-owner writes cannot reinterpret an unbound legacy creator",async()=>{
 const auth=await authenticatePracticeSession(runtime,await issuePracticeSession(runtime));
 const client=await admin.connect();try{
  await client.query("BEGIN");await client.query("SET LOCAL ROLE jobguard_migration");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[DEMO_TENANT_ID]);
  await expect(client.query("UPDATE app.job SET practice_session_digest=$1,practice_scenario='capture' WHERE tenant_id=$2 AND id=$3",[auth.digest,DEMO_TENANT_ID,legacyJob])).rejects.toThrow("PRACTICE_OWNER_IMMUTABLE");
 }finally{await client.query("ROLLBACK");client.release();}
});

it("the unscoped decision inbox selects only creation-owned jobs in SQL",async()=>{
 const a=await captured(),b=await captured();
 for(const x of [a,b]){
  const decision=randomUUID();
  await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'finding',$3,'check')",[decision,DEMO_TENANT_ID,x.jobId]);
  await admin.query("INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision) VALUES($1,$2,$3,$4,$5,'unresolved_question','mandatory','Fictional question','Fictional only',$3,'check',0)",[randomUUID(),DEMO_TENANT_ID,x.jobId,decision,randomUUID().replaceAll('-','').repeat(2)]);
 }
 for(const x of [a,b]){
  const rows=await withTenant(runtime,x.auth.context,db=>listDecisionInbox(db,undefined,x.auth.digest));
  expect(rows.map((row:any)=>row.job_id)).toEqual([x.jobId]);
 }
});

it("sandbox runs bind at creation and store no bearer token in run/audit references",async()=>{
 const creator=await issuePracticeSession(runtime),stranger=await issuePracticeSession(runtime);
 const run=await new SandboxRepository(runtime).create(creator,randomUUID());
 await expect(authorizePracticeJob(runtime,stranger,run.jobId)).rejects.toThrow("NOT_FOUND");
 await expect(new SandboxRepository(runtime).read(stranger,run.id)).rejects.toMatchObject({code:"NOT_FOUND"});
 expect((await authorizePracticeJob(runtime,creator,run.jobId)).membershipId).toBe(DEMO_MEMBERSHIP_ID);
 const stored=(await admin.query("SELECT session_id::text FROM app.sandbox_run WHERE id=$1",[run.id])).rows[0];expect(stored.session_id).not.toBe(creator);
 expect((await admin.query("SELECT actor_ref FROM app.audit_event WHERE subject_ref=$1",[run.id])).rows.every((row:any)=>!row.actor_ref.includes(creator))).toBe(true);
});
