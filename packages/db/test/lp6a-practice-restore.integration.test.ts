import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { ContractorRepository, ContractorPracticeSessionRepository, contractorSessionContext, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID } from "../src/index.js";

const execute = promisify(execFile);
let db: JobDoorsDatabase;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  db=await jobDoorsDatabase(true);
  await seedHomePrincipal(db.owner);
},300_000);
async function seedHomePrincipal(owner: Pool) {
  await owner.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_TENANT_ID]);
  await owner.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
  await owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional home') ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,DEMO_ACCOUNT_ID]);
  await owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
}
afterAll(async()=>{await db?.close();},300_000);

// The saved-sample INSERT trigger requires its migration-owner invoker.
// Pin the role switch and seed to one transaction on one fixture client.
async function seedHomeSession(owner: Pool, digest: string, expired = false) {
  const client = await owner.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE jobguard_migration");
    await client.query(expired
      ? "INSERT INTO control_plane.practice_session(token_digest,expires_at) VALUES($1,clock_timestamp()-interval '1 second')"
      : "INSERT INTO control_plane.practice_session(token_digest) VALUES($1)",[digest]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const refused={code:"42501",message:"REQUEST_BINDING_REFUSED"};

it("home digests and raw contractor IDs bind only their practice principals, never a real session",async()=>{
  const digest=randomBytes(32).toString("hex"),raw=randomUUID();
  await seedHomeSession(db.owner,digest);
  const { tenantId: tenant } = await new ContractorRepository(db.runtime).startPractice(raw);
  const contractor=(await db.owner.query("SELECT membership_id FROM control_plane.contractor_practice_session WHERE tenant_id=$1",[tenant])).rows[0];
  const foreign=await jobDoorsActor(db.owner);
  // Deliberately duplicate the home digest in the real credential table. Kind
  // selection must still use the practice principal, not this real owner.
  await db.owner.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')",[randomUUID(),foreign.person,digest]);
  for(const [kind,credential,t,actor] of [["practice",digest,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID],["contractor_practice",raw,tenant,contractor.membership_id]]){
    const c=await db.runtime.connect();
    try{
      await c.query("BEGIN");await c.query("SELECT app.bind_request($1,$2,$3)",[kind,credential,t]);
      expect((await c.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows[0]).toEqual({actor,tenant:t});
      await c.query("ROLLBACK; BEGIN");
      await expect(c.query("SELECT app.bind_request($1,$2,$3)",[kind,credential,foreign.tenant])).rejects.toMatchObject(refused);
    }finally{await c.query("ROLLBACK");c.release();}
  }
  // A stored contractor digest is not its raw bearer UUID.
  const stored=(await db.owner.query("SELECT session_digest FROM control_plane.contractor_practice_session WHERE tenant_id=$1",[tenant])).rows[0].session_digest;
  await expect(db.runtime.query("SELECT app.bind_request('contractor_practice',$1,$2)",[stored,tenant])).rejects.toMatchObject(refused);
  await db.owner.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[digest]);
  await expect(db.runtime.query("SELECT app.bind_request('practice',$1,$2)",[digest,DEMO_TENANT_ID])).rejects.toMatchObject(refused);
  await new ContractorPracticeSessionRepository(db.runtime).revoke(await contractorSessionContext(db.runtime,raw),raw);
  await expect(db.runtime.query("SELECT app.bind_request('contractor_practice',$1,$2)",[raw,tenant])).rejects.toMatchObject(refused);
});

it("upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8",async()=>{
  const source=await db.runtime.connect(),other=await jobDoorsDatabase(false,"0564_lp6a_request_binding.sql");
  try{
    const old=(await other.owner.query("SELECT pg_get_functiondef('app.contractor_session(uuid)'::regprocedure) definition")).rows[0].definition;
    await other.owner.query(await readFile(new URL("../migrations/0564_lp6a_request_binding.sql",import.meta.url),"utf8"));
    expect((await other.owner.query("SELECT pg_get_functiondef('app.contractor_session(uuid)'::regprocedure) definition")).rows[0].definition).toBe(old);
    const digest=randomBytes(32).toString("hex");
    await seedHomeSession(db.owner,digest);
    await source.query("BEGIN");await source.query("SELECT app.bind_request('practice',$1,$2)",[digest,DEMO_TENANT_ID]);
    await source.query("COMMIT");
    // A real logical dump must carry stale UNLOGGED rows without carrying
    // authority into the destination postmaster/database. No credentials in argv.
    const dumpFile=join(db.directory,"binding.sql");
    const connectionArgs=(database:JobDoorsDatabase)=>[
      "--host=127.0.0.1",`--port=${database.owner.options.port}`,
      "--username=postgres",`--dbname=${database.owner.options.database}`,
    ];
    await execute("pg_dump",[...connectionArgs(db),"--data-only","--inserts",
      "--no-owner","--no-privileges","--table=control_plane.request_binding",`--file=${dumpFile}`],
      {env:{...process.env,PGPASSWORD:String(db.owner.options.password)},timeout:30_000});
    await execute("psql",[...connectionArgs(other),"-X","--set=ON_ERROR_STOP=on",`--file=${dumpFile}`],
      {env:{...process.env,PGPASSWORD:String(other.owner.options.password)},timeout:30_000});
    const dump=(await db.owner.query("SELECT coalesce(json_agg(row_to_json(b)),'[]'::json) payload FROM control_plane.request_binding b")).rows[0].payload;
    expect(dump.length).toBeGreaterThan(0);
    expect((await other.owner.query("SELECT count(*)::int n FROM control_plane.request_binding")).rows[0].n).toBe(dump.length);
    expect((await other.owner.query("SELECT extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database()) environment")).rows[0].environment).not.toBe(dump[0].environment_id);
    console.info("LP-6a real logical restore", {
      sourcePort: db.owner.options.port, targetPort: other.owner.options.port,
      sourceVersion: (await db.owner.query("SHOW server_version")).rows[0].server_version,
      targetVersion: (await other.owner.query("SHOW server_version")).rows[0].server_version,
      restoredRows: dump.length,
    });
    const target=await other.runtime.connect();
    try{
      await target.query("BEGIN");
      const xid=(await target.query("SELECT pg_current_xact_id()::text xid")).rows[0].xid;
      await other.owner.query(`INSERT INTO control_plane.request_binding SELECT environment_id,$1::xid8,credential_kind,session_ref,tenant_id,actor_id,expires_at
        FROM control_plane.request_binding LIMIT 1 ON CONFLICT DO NOTHING`,[xid]);
      await expect(target.query("SELECT app.current_actor()")).rejects.toMatchObject(refused);
      await target.query("ROLLBACK");
      // Practice records copied into another database name still confer nothing.
      await seedHomePrincipal(other.owner);
      await seedHomeSession(other.owner,digest);
      await expect(target.query("SELECT app.bind_request('practice',$1,$2)",[digest,DEMO_TENANT_ID])).rejects.toMatchObject(refused);
      await expect(target.query("SELECT app.bind_request('contractor_practice',$1,$2)",[randomUUID(),randomUUID()])).rejects.toMatchObject(refused);
    }finally{await target.query("ROLLBACK");target.release();}
  }finally{await source.query("ROLLBACK");source.release();await other.close();}
},300_000);

it("refuses expired home and contractor credentials, including linked-home expiry",async()=>{
  const digest=randomBytes(32).toString("hex");
  await seedHomeSession(db.owner,digest,true);
  await expect(db.runtime.query("SELECT app.bind_request('practice',$1,$2)",[digest,DEMO_TENANT_ID])).rejects.toMatchObject(refused);
  const raw=randomUUID(),actor=await jobDoorsActor(db.owner);
  await db.owner.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES(gen_random_uuid(),$1,$2,$3,app.contractor_practice_session_digest($4),clock_timestamp(),clock_timestamp()+interval '150ms')`,[actor.tenant,actor.member,actor.person,raw]);
  await db.owner.query("SELECT pg_sleep(0.2)");
  await expect(db.runtime.query("SELECT app.bind_request('contractor_practice',$1,$2)",[raw,actor.tenant])).rejects.toMatchObject(refused);
  const linkedRaw=randomUUID(),linkedDigest=(await db.owner.query("SELECT app.contractor_practice_session_digest($1) digest",[linkedRaw])).rows[0].digest;
  await seedHomeSession(db.owner,linkedDigest);
  const { tenantId: linkedTenant } = await new ContractorRepository(db.runtime).startPractice(linkedRaw);
  await db.owner.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[linkedDigest]);
  await expect(db.runtime.query("SELECT app.bind_request('contractor_practice',$1,$2)",[linkedRaw,linkedTenant])).rejects.toMatchObject(refused);
});
