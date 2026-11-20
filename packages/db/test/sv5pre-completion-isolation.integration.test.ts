import { randomUUID } from "node:crypto";
import { cp, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { asFixtureTenant, createLockFixture, LOCK_HASH, LOCK_OWNER, prepareLock, publishFixtureCompletion, seedAccount } from "./sv5pre-fixtures.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { bindTestClient } from "./tenant-context-test-utils.js";
import { rolledBack } from "./upgrade-proof-utils.js";

it("r8 zero and 25 hidden signals leave every non-shadow table byte-identical after authoritative completion", async () => {
 const f=await createLockFixture(true,true), copies=await mkdtemp(join(tmpdir(),"sv5pre-isolation-"));
 const received="2026-10-01T00:00:00Z", cutoff="2026-10-13T00:00:00Z";
 let a:Awaited<ReturnType<typeof seedAccount>>, evidenceId:string;
 try {
  try {
   // Both copies use the real synthetic database name and the same stored
   // database identity. Freeze timestamps only inside the disposable cluster.
   await f.admin.query(`CREATE OR REPLACE FUNCTION pg_catalog.clock_timestamp() RETURNS timestamptz LANGUAGE sql AS 'SELECT ''${cutoff}''::timestamptz';
    CREATE OR REPLACE FUNCTION pg_catalog.pg_postmaster_start_time() RETURNS timestamptz LANGUAGE sql AS 'SELECT ''${cutoff}''::timestamptz'`);
   a=await seedAccount(f.admin); evidenceId=randomUUID(); const uploadId=randomUUID();
   await asFixtureTenant(f.admin,a.tenantId,async db=>{
    await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,server_received_at,state,server_verified_at,object_version_id) VALUES($1,$2,$3::uuid,$3::text,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01',$4,'verified',$4,'isolation.v1')",[a.tenantId,a.jobId,uploadId,received]);
    await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4::uuid,'original','photo',$4::text,'isolation.v1',repeat('a',64),1,'image/png','standard_evidence',$5,$5)",[a.tenantId,a.jobId,evidenceId,uploadId,received]);
   });
   const repo=await prepareLock(f,a); await repo.lock(a.context,a.input);
   await f.admin.query("CREATE OR REPLACE FUNCTION pg_catalog.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT ''99000000-0000-4000-8000-000000000001''::uuid'");
  } finally {
   await closeTestPools(f.runtime,f.shadow,f.owner,f.admin);
   await f.postgres.stop();
  }

  async function replay(signalCount:number) {
   const directory=join(copies,String(signalCount)), port=await freePort(58400,250);
   await cp(f.directory,directory,{recursive:true});
   const postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:f.credential,persistent:false,
    createPostgresUser:process.getuid?.()===0,onLog:()=>undefined});
   const pool=(role:"admin"|"runtime"|"shadow")=>new Pool({...f[role].options,port,password:f.credential,max:2});
   const admin=pool("admin"),shadow=pool("shadow"),runtime=pool("runtime");
   try {
    await postgres.start();
    await asFixtureTenant(shadow, a.tenantId, async db => {
     await db.query("SELECT app.lp11_bind_shadow_job($1,$2)",[a.tenantId,a.jobId]);
     for(let n=1;n<=signalCount;n++) {
      const id=`77000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
      await db.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic-isolation.v1',$4,'Private fictional extra','low','held_for_final_check')",[a.tenantId,a.jobId,id,cutoff]);
      await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'isolation.v1',$5,$6)",[a.tenantId,a.jobId,id,evidenceId,LOCK_HASH,received]);
     }
    });
    const checkId=await publishFixtureCompletion(shadow,admin,a.tenantId,a.jobId,{deterministicIds:true});
    expect((await admin.query("SELECT status,id FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows).toEqual([{status:"completed",id:checkId}]);
    const certificate=(await admin.query("SELECT result_hash FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0];
    expect(certificate.result_hash).toMatch(/^[a-f0-9]{64}$/u);
    for(const name of ["source_attempt","reveal_proof","run_binding","completion"])
     await expect(runtime.query(`SELECT * FROM app.shadow_final_check_${name}`)).rejects.toMatchObject({code:"42501"});
    const audit=(await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='final_check.completed'",[a.tenantId])).rows;
    const check=(await admin.query("SELECT id,run_id,lock_id FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0];
    expect(audit).toEqual([{payload:{references:{auditTrust:"checked_operation",auditActorKind:"system",auditActorRef:expect.stringMatching(/^system:database:[A-Za-z0-9_]+$/u),checkId:check.id,runId:check.run_id,lockId:check.lock_id}}}]);
    const gate=await rolledBack(admin,async db=>{
     // The assertion's own request is an observation. Undo its private binding
     // before comparing the complete committed state of the two replays.
     await bindTestClient(admin,db,a.tenantId,LOCK_OWNER);
     await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
     return (await db.query("SELECT * FROM app.require_authoritative_final_check($1,$2)",[a.tenantId,a.jobId])).rows;
    });
    expect(gate).toEqual([{complete:true,check_id:check.id,run_id:check.run_id,lock_id:check.lock_id}]);
    await expect(runtime.query("SELECT * FROM app.require_authoritative_final_check($1,$2)",[a.tenantId,a.jobId])).rejects.toMatchObject({code:"42501"});
    const snapshot: Record<string, unknown> = {};
    const tables=(await admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema' AND tablename NOT LIKE 'shadow_%' ORDER BY schemaname,tablename")).rows;
    for(const table of tables) {
     const relation=`"${table.schemaname}"."${table.tablename}"`;
     // No field stripping, normalisation or table exclusions: canonical PostgreSQL bytes, including the complete audit chain.
     snapshot[relation]=(await admin.query(`SELECT row_to_json(t)::text bytes FROM ${relation} t ORDER BY 1`)).rows;
    }
    expect(Object.keys(snapshot)).toContain('"app"."final_check_manifest"');
    expect(Object.keys(snapshot)).toContain('"audit_control"."audit_head"');
    return {snapshot,resultHash:certificate.result_hash};
   } finally { await closeTestPools(runtime,shadow,admin); await postgres.stop(); }
  }
  const zero=await replay(0),many=await replay(25);
  expect(many.resultHash).not.toBe(zero.resultHash); // Exercise the content-derived private difference, not just two empty runs.
  expect(many.snapshot).toEqual(zero.snapshot);
 } finally { await rm(copies,{recursive:true,force:true}); await rm(f.directory,{recursive:true,force:true}); }
}, 120_000);
