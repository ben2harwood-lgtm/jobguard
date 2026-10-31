import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID } from "../src/index.js";

let db: JobDoorsDatabase;
beforeAll(async () => {
  db=await jobDoorsDatabase(true);
  await db.owner.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_TENANT_ID]);
  await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
  await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional home') ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,DEMO_ACCOUNT_ID]);
  await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
},300_000);
afterAll(async()=>{await db?.close();});
const refused={code:"42501",message:"REQUEST_BINDING_REFUSED"};

it("home digests and raw contractor IDs bind only their practice principals, never a real session",async()=>{
  const digest=randomBytes(32).toString("hex"),raw=randomUUID();
  await db.owner.query("INSERT INTO control_plane.practice_session(token_digest) VALUES($1)",[digest]);
  const tenant=(await db.runtime.query("SELECT app.start_contractor_practice($1) tenant",[raw])).rows[0].tenant;
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
  await db.owner.query("UPDATE control_plane.contractor_practice_session SET revoked_at=clock_timestamp() WHERE tenant_id=$1",[tenant]);
  await expect(db.runtime.query("SELECT app.bind_request('contractor_practice',$1,$2)",[raw,tenant])).rejects.toMatchObject(refused);
});

it("upgrades dark, round-trips a logical binding-table dump into a fresh cluster and rejects carried rows even at a colliding xid8",async()=>{
  const source=await db.runtime.connect(),other=await jobDoorsDatabase(false,"0520_lp6a_request_binding.sql");
  try{
    const old=(await other.owner.query("SELECT pg_get_functiondef('app.contractor_session(uuid)'::regprocedure) definition")).rows[0].definition;
    await other.owner.query(await readFile(new URL("../migrations/0520_lp6a_request_binding.sql",import.meta.url),"utf8"));
    expect((await other.owner.query("SELECT pg_get_functiondef('app.contractor_session(uuid)'::regprocedure) definition")).rows[0].definition).toBe(old);
    const digest=randomBytes(32).toString("hex");
    await db.owner.query("INSERT INTO control_plane.practice_session(token_digest) VALUES($1)",[digest]);
    await source.query("BEGIN");await source.query("SELECT app.bind_request('practice',$1,$2)",[digest,DEMO_TENANT_ID]);
    await source.query("COMMIT");
    // SQL logical dump and restore of this table's rows, deliberately including
    // stale UNLOGGED data (a logical dump can carry it, unlike physical backup).
    const dump=(await db.owner.query("SELECT coalesce(json_agg(row_to_json(b)),'[]'::json) payload FROM control_plane.request_binding b")).rows[0].payload;
    expect(dump.length).toBeGreaterThan(0);
    await other.owner.query("INSERT INTO control_plane.request_binding SELECT * FROM json_populate_recordset(NULL::control_plane.request_binding,$1::json)",[JSON.stringify(dump)]);
    expect((await other.owner.query("SELECT extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database()) environment")).rows[0].environment).not.toBe(dump[0].environment_id);
    const target=await other.runtime.connect();
    try{
      await target.query("BEGIN");
      const xid=(await target.query("SELECT pg_current_xact_id()::text xid")).rows[0].xid;
      await other.owner.query(`INSERT INTO control_plane.request_binding SELECT environment_id,$1::xid8,credential_kind,session_ref,tenant_id,actor_id,expires_at
        FROM control_plane.request_binding LIMIT 1 ON CONFLICT DO NOTHING`,[xid]);
      await expect(target.query("SELECT app.current_actor()")).rejects.toMatchObject(refused);
      await target.query("ROLLBACK");
      // Practice records copied into another database name still confer nothing.
      await other.owner.query("INSERT INTO control_plane.practice_session(token_digest) VALUES($1)",[digest]);
      await expect(target.query("SELECT app.bind_request('practice',$1,$2)",[digest,DEMO_TENANT_ID])).rejects.toMatchObject(refused);
      await expect(target.query("SELECT app.bind_request('contractor_practice',$1,$2)",[randomUUID(),randomUUID()])).rejects.toMatchObject(refused);
    }finally{await target.query("ROLLBACK");target.release();}
  }finally{await source.query("ROLLBACK");source.release();await other.close();}
},300_000);

it("refuses expired home and contractor credentials, including linked-home expiry",async()=>{
  const digest=randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO control_plane.practice_session(token_digest,expires_at) VALUES($1,clock_timestamp()-interval '1 second')",[digest]);
  await expect(db.runtime.query("SELECT app.bind_request('practice',$1,$2)",[digest,DEMO_TENANT_ID])).rejects.toMatchObject(refused);
  const raw=randomUUID(),actor=await jobDoorsActor(db.owner);
  await db.owner.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES(gen_random_uuid(),$1,$2,$3,app.contractor_practice_session_digest($4),clock_timestamp(),clock_timestamp()+interval '150ms')`,[actor.tenant,actor.member,actor.person,raw]);
  await db.owner.query("SELECT pg_sleep(0.2)");
  await expect(db.runtime.query("SELECT app.bind_request('contractor_practice',$1,$2)",[raw,actor.tenant])).rejects.toMatchObject(refused);
  const linkedRaw=randomUUID(),linkedDigest=(await db.owner.query("SELECT app.contractor_practice_session_digest($1) digest",[linkedRaw])).rows[0].digest;
  await db.owner.query("INSERT INTO control_plane.practice_session(token_digest) VALUES($1)",[linkedDigest]);
  const linkedTenant=(await db.runtime.query("SELECT app.start_contractor_practice($1) tenant",[linkedRaw])).rows[0].tenant;
  await db.owner.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[linkedDigest]);
  await expect(db.runtime.query("SELECT app.bind_request('contractor_practice',$1,$2)",[linkedRaw,linkedTenant])).rejects.toMatchObject(refused);
});
