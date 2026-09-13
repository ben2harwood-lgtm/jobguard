import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CommandError, UserCommandDispatcher, executeAuthorizedCommercialAction, migrate, withTenant, type VerifiedTenantContext } from "../src/index.js";

const TENANT="81000000-0000-4000-8000-000000000001", ACCOUNT="82000000-0000-4000-8000-000000000001";
const USER="83000000-0000-4000-8000-000000000001", MEMBER="84000000-0000-4000-8000-000000000001";
const JOB="85000000-0000-4000-8000-000000000001", QUOTE="86000000-0000-4000-8000-000000000001";
const HASH="a".repeat(64), context=({tenantId:TENANT}) as VerifiedTenantContext;
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jobguard-commands-"));const port=57000+Math.floor(Math.random()*500);postgres=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"test-only",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"test-only"});admin.on("error",()=>undefined);await migrate(admin);await admin.query(`
 INSERT INTO control_plane.tenant(id) VALUES('${TENANT}'); INSERT INTO identity.identity_user(id) VALUES('${USER}');
 INSERT INTO app.account(id,tenant_id,name) VALUES('${ACCOUNT}','${TENANT}','Synthetic');
 INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES('${MEMBER}','${TENANT}','${ACCOUNT}','${USER}','owner');
 INSERT INTO app.job(id,tenant_id,title,status,revision) VALUES('${JOB}','${TENANT}','Test','accepted',1);
 INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES('${QUOTE}','${TENANT}','${JOB}',1,'${HASH}',10000,'accepted');
 UPDATE app.job SET accepted_quote_version_id='${QUOTE}' WHERE tenant_id='${TENANT}' AND id='${JOB}';
 CREATE ROLE command_test LOGIN PASSWORD 'runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS; GRANT jobguard_runtime TO command_test;`);
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"command_test",password:"runtime-only",max:5});runtime.on("error",()=>undefined);
},60_000);
afterAll(async()=>{await runtime?.end();await admin?.end();await postgres?.stop();await rm(dir,{recursive:true,force:true})});
const command=(commandId:string,overrides:Record<string,unknown>={})=>({version:"command.v1",commandId,commandType:"job.switch_live",semanticKey:`job:${JOB}:switch_live`,actorMembershipId:MEMBER,subjectType:"job",subjectRef:JOB,action:{actionType:"switch_live",recipient:null,contentHash:HASH,aggregateRevision:1,amountPence:10000,currency:"GBP",policyVersion:"pilot-no-charge-v1",expiresAt:new Date("2099-01-01T00:00:00Z")},...overrides});
const transition={mutate:async(d:any)=>{const row=(await d.$client.query(`SELECT * FROM app.transition_job($1,$2,1,'live','switch_live',$3,10000,'pilot-no-charge-v1',0)`,[TENANT,JOB,QUOTE])).rows[0];return{jobId:JOB,revision:row.revision,status:row.status}}};

describe("consequential command authorization",()=>{
 it("keeps aggregate locking before audit while two competing commands produce one atomic inline approval, mutation, audit, and receipt",async()=>{
  const dispatcher=new UserCommandDispatcher(runtime), first=command("87000000-0000-4000-8000-000000000001");
  await expect(Promise.all([dispatcher.dispatch(context,first,transition),dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000003"),transition)])).resolves.toEqual([
   expect.objectContaining({status:"live",revision:2}),expect.objectContaining({status:"live",revision:2})]);
  await expect(dispatcher.dispatch(context,first,transition)).resolves.toMatchObject({status:"live",revision:2});
  await withTenant(runtime,context,async d=>{expect((await d.$client.query("SELECT count(*)::int n FROM app.command_receipt")).rows[0].n).toBe(1);expect((await d.$client.query("SELECT count(*)::int n FROM app.action_authorization")).rows[0].n).toBe(1);expect((await d.$client.query("SELECT count(*)::int n FROM app.audit_event")).rows[0].n).toBe(1)});
 });
 it("does not deadlock when two consequential commands contend for an aggregate before audit append",async()=>{
  // The dispatcher itself locks the shared membership/permission aggregate before this mutation.
  const dispatcher=new UserCommandDispatcher(runtime), locking={mutate:async(d:any)=>{await d.$client.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2",[TENANT,JOB]);await d.$client.query("SELECT pg_sleep(0.05)");return{locked:JOB}}};
  await expect(Promise.all([
   dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000010",{commandType:"synthetic.lock",semanticKey:"lock:a"}),locking),
   dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000011",{commandType:"synthetic.lock",semanticKey:"lock:b"}),locking),
  ])).resolves.toEqual([{locked:JOB},{locked:JOB}]);
 });
 it("deduplicates simultaneous different command ids by semantic effect and conflicts on changed payload",async()=>{
  const dispatcher=new UserCommandDispatcher(runtime), base=command("87000000-0000-4000-8000-000000000002");
  await expect(dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000004",{action:{...base.action,contentHash:"b".repeat(64)}}),transition)).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
 });
 it("rejects dismissed, changed, expired, revoked, and expired-member grants before invocation",async()=>{
  await withTenant(runtime,context,async d=>{
   const auth=(await d.$client.query<{id:string}>("SELECT id FROM app.action_authorization LIMIT 1")).rows[0]!.id;
   let calls=0; const requested=command("87000000-0000-4000-8000-000000000005").action;
   await expect(executeAuthorizedCommercialAction(d,auth,requested,async()=>++calls)).resolves.toBe(1);
   for(const changed of [{...requested,recipient:"changed@example.test"},{...requested,contentHash:"b".repeat(64)},{...requested,aggregateRevision:2},{...requested,amountPence:9999}])
    await expect(executeAuthorizedCommercialAction(d,auth,changed,async()=>++calls)).rejects.toBeInstanceOf(CommandError);
   await d.$client.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE id=$1",[auth]);
   await expect(executeAuthorizedCommercialAction(d,auth,requested,async()=>++calls)).rejects.toMatchObject({code:"AUTHORIZATION_INVALID"}); expect(calls).toBe(1);
   await d.$client.query(`INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(gen_random_uuid(),$1,'job',$2,'send') RETURNING id`,[TENANT,JOB]).then(async x=>{
    const decision=x.rows[0].id,resolution="89000000-0000-4000-8000-000000000001";await d.$client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'dismissed',$4)",[resolution,TENANT,decision,MEMBER]);
    await expect(d.$client.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,'send',$5,1,'v1',clock_timestamp()+interval '1 hour')`,[TENANT,decision,resolution,MEMBER,HASH])).rejects.toMatchObject({code:"23514"});
   });
  });
 });
 it("rolls back approval, mutation, audit, and receipt when mutation fails",async()=>{
  const before=await withTenant(runtime,context,async d=>(await d.$client.query("SELECT count(*)::int n FROM app.decision")).rows[0].n);
  await expect(new UserCommandDispatcher(runtime).dispatch(context,command("87000000-0000-4000-8000-000000000006",{semanticKey:"failed-effect"}),{mutate:async()=>{throw new Error("synthetic rollback")}})).rejects.toThrow("synthetic rollback");
  await withTenant(runtime,context,async d=>{expect((await d.$client.query("SELECT count(*)::int n FROM app.decision")).rows[0].n).toBe(before);expect((await d.$client.query("SELECT count(*)::int n FROM app.command_receipt WHERE semantic_key='failed-effect'")).rows[0].n).toBe(0)});
 });
 it("fails closed for expired inline grants and expired or revoked membership permission",async()=>{
  let calls=0; const dispatcher=new UserCommandDispatcher(runtime), handler={mutate:async()=>{calls++;return{ok:true}}};
  const expired=command("87000000-0000-4000-8000-000000000007",{semanticKey:"expired-grant",action:{...command("87000000-0000-4000-8000-000000000007").action,expiresAt:new Date("2000-01-01T00:00:00Z")}});
  await expect(dispatcher.dispatch(context,expired,handler)).rejects.toMatchObject({code:"AUTHORIZATION_INVALID"});
  await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[TENANT,MEMBER]);
  await expect(dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000008",{semanticKey:"expired-member"}),handler)).rejects.toMatchObject({code:"FORBIDDEN"});
  await admin.query("UPDATE app.membership SET expires_at=NULL,revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[TENANT,MEMBER]);
  await expect(dispatcher.dispatch(context,command("87000000-0000-4000-8000-000000000009",{semanticKey:"revoked-member"}),handler)).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(calls).toBe(0);
 });
});
