// Real PostgreSQL tests. Supplied authority stays closed; only checked stored-source assessment is allowed.
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { createLockFixture,closeLockFixture,asFixtureTenant,storedAttributionFixture,LOCK_OWNER,type LockFixture } from "./recovery-attribution-fixture.js";
let f:LockFixture;
beforeAll(async()=>{f=await createLockFixture();},90000);
afterAll(async()=>{if(f)await closeLockFixture(f);});
it("SV6-20 tenant context and composite bindings fail closed (private storage)",async()=>{
 const {p,document,command}=await storedAttributionFixture(f),other=await storedAttributionFixture(f);
 for(const tenant of ["", "malformed",other.p.tenantId])await expect(asFixtureTenant(f.owner,tenant,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[document,LOCK_OWNER,command]))).rejects.toThrow();
 for(const [sql,values] of [["SELECT document FROM app.recovery_attribution_revision",[]],["SELECT app.assess_recovery_attribution($1,$2,$3)",[p.jobId,"forged",command]]] as const){
  const db=await f.runtime.connect();try{await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[p.tenantId]);if(values.length)await expect(db.query(sql,[...values])).rejects.toThrow("DEPENDENCY_BOUND");else expect((await db.query(sql)).rows).toEqual([]);}finally{await db.query("ROLLBACK");db.release();}
 }
 const client=await f.runtime.connect();try{expect((await client.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();}finally{client.release();}
});
it("SV6-19 runtime history refuses unowned fixture jobs without disclosing stored sources",async()=>{
 const {p,document,command}=await storedAttributionFixture(f);
 await asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[document,LOCK_OWNER,command]));
 const repo=new RecoveryAttributionRepository(f.runtime);
 for(const job of [p.jobId,randomUUID()])await expect(repo.history(p.context,job,"a".repeat(64))).rejects.toThrow("NOT_FOUND");
});
it("SV6-18 direct runtime routine never accepts supplied authority",async()=>{
 for(const raw of [{},{tenantId:randomUUID(),actor:randomUUID(),mode:"production",rate:10,settlement:true,fee:8000},{version:"recovery-attribution-command.v1",action:"assess",tenantId:randomUUID(),actor:randomUUID(),settlement:true,fee:8000}])await expect(f.runtime.query("SELECT app.assess_recovery_attribution($1,$2,$3)",[randomUUID(),"forged",raw])).rejects.toThrow("DEPENDENCY_BOUND");
});

it("SV6-19 expired and revoked sessions cannot read even with an earlier verified context",async()=>{
 const {DEMO_TENANT_ID:T,DEMO_ACCOUNT_ID:A,DEMO_IDENTITY_USER_ID:U,DEMO_MEMBERSHIP_ID:M}=await import("../src/demo-seed.js");
 const {issuePracticeSession,authenticatePracticeSession}=await import("../src/practice-session.js");
 const prior=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
 try{
  await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[T]);
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[U]);
  await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional attribution access') ON CONFLICT DO NOTHING",[A,T]);
  await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[M,T,A,U]);
  const token=await issuePracticeSession(f.runtime),auth=await authenticatePracticeSession(f.runtime,token);
  const job=(await f.admin.query("SELECT id FROM app.job WHERE practice_session_digest=$1 LIMIT 1",[auth.digest])).rows[0].id;
  const repo=new RecoveryAttributionRepository(f.runtime);expect(await repo.history(auth.context,job,auth.digest)).toEqual([]);
  for(const update of ["UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2","UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2"]){
   try{await f.admin.query(update,[T,M]);await expect(repo.history(auth.context,job,auth.digest)).rejects.toThrow("NOT_FOUND");}
   finally{await f.admin.query("UPDATE app.membership SET revoked_at=null,expires_at=null WHERE tenant_id=$1 AND id=$2",[T,M]);}
  }
  for(const update of ["UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1","UPDATE control_plane.practice_session SET revoked_at=null,expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1"]){
   await f.admin.query(update,[auth.digest]);await expect(repo.history(auth.context,job,auth.digest)).rejects.toThrow("NOT_FOUND");
  }
 }finally{if(prior===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=prior;}
});


it("SV6-22 pre lock attribution reveals no shadow existence with zero and many signals",async()=>{
 const {DEMO_TENANT_ID:T,DEMO_ACCOUNT_ID:A,DEMO_IDENTITY_USER_ID:U,DEMO_MEMBERSHIP_ID:M}=await import("../src/demo-seed.js");
 const {issuePracticeSession,authenticatePracticeSession}=await import("../src/practice-session.js");
 const prior=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
 try{
  await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[T]);
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[U]);
  await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional attribution query path') ON CONFLICT DO NOTHING",[A,T]);
  await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[M,T,A,U]);
  const token=await issuePracticeSession(f.runtime),auth=await authenticatePracticeSession(f.runtime,token);
  const job=(await f.admin.query("SELECT id FROM app.job WHERE practice_session_digest=$1 LIMIT 1",[auth.digest])).rows[0].id;
  await f.admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')",[T,job]);
  const statements:string[]=[];
  const pool=new Proxy(f.runtime,{get(target,key){
   if(key==="connect")return async()=>{
    const client=await target.connect();return new Proxy(client,{get(connection,property){
     if(property==="query")return (sql:string,values?:unknown[])=>{statements.push(sql);return connection.query(sql,values);};
     const value=Reflect.get(connection,property);return typeof value==="function"?value.bind(connection):value;
    }});
   };
   const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }}) as Pool;
  const repo=new RecoveryAttributionRepository(pool),zero=await repo.history(auth.context,job,auth.digest),before=[...statements];
  await asFixtureTenant(f.shadow,T,async client=>{for(let n=0;n<25;n++)await client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:SV6',clock_timestamp(),'Fictional held extra','low','held_for_final_check')",[T,job,randomUUID()]);});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2",[T,job])).rows[0].n).toBe(25);
  statements.length=0;
  expect(await repo.history(auth.context,job,auth.digest)).toEqual(zero);expect(statements).toEqual(before);
  expect(statements.join("\n")).not.toMatch(/app\.(?:shadow|recovery_attribution)/u);
 }finally{if(prior===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=prior;}
});
