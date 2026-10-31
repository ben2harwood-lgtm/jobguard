import { randomBytes, randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { ActionExecutor } from "../src/outbox.js";
import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
const refusal = { code: "42501", message: "MEMBER_ADMIN_REFUSED" };
async function member(tenant?: string, role = "owner") {
  const a = await jobDoorsActor(db.owner, tenant), digest = randomBytes(32).toString("hex"), sessionId = randomUUID();
  await db.owner.query("UPDATE app.membership SET role=$3 WHERE tenant_id=$1 AND id=$2", [a.tenant,a.member,role]);
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@fictional.invalid`,a.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person,a.tenant,a.member]);
  await db.owner.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,environment,expires_at) VALUES($1,$2,$3,'fictional','synthetic_demo',clock_timestamp()+interval '1 hour')", [sessionId,a.person,digest]);
  return {...a,digest,sessionId};
}
type Member = Awaited<ReturnType<typeof member>>;
const invoke = (c: Pick<PoolClient,"query">, a: Member, target: Member, role?: string) => role === undefined
  ? c.query("SELECT identity.member_remove($1,$2,$3) result", [a.digest,a.tenant,target.member])
  : c.query("SELECT identity.member_change_role($1,$2,$3,$4) result", [a.digest,a.tenant,target.member,role]);
async function administration(a: Member, target: Member, role?: string) {
  const c = await db.owner.connect();
  try { await c.query("BEGIN; SET LOCAL ROLE jobguard_identity"); const r=await invoke(c,a,target,role); await c.query("COMMIT"); return r; }
  catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
const events = async (a: Member) => (await db.owner.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [a.tenant])).rows;

it("rejects non-owners, forged tenants/targets, expired/revoked sessions and owner creation", async () => {
  const a=await member(), nonOwner=await member(a.tenant,"admin"), outsider=await member();
  await expect(administration(nonOwner,a)).rejects.toMatchObject(refusal);
  await expect(administration(nonOwner,a,"finance")).rejects.toMatchObject(refusal);
  await expect(administration(a,outsider)).rejects.toMatchObject(refusal);
  await expect(administration(outsider,a)).rejects.toMatchObject(refusal);
  await expect(administration(a,nonOwner,"owner")).rejects.toMatchObject(refusal);
  for (const sql of ["UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",
    "UPDATE identity.session SET revoked_at=NULL,expires_at=clock_timestamp()-interval '1 second' WHERE id=$1"]) {
    await db.owner.query(sql,[a.sessionId]);
    await expect(administration(a,nonOwner)).rejects.toMatchObject(refusal);
  }
  expect(await events(a)).toEqual([]);
  await expect(invoke(db.runtime,a,nonOwner)).rejects.toMatchObject({code:"42501"});
});

it.each([undefined,"finance"])("protects the last active owner from %s, ignoring expired or contractor-revoked owners", async role => {
  const a=await member(), b=await member(a.tenant);
  await db.owner.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[a.tenant,b.member]);
  await expect(administration(a,a,role)).rejects.toMatchObject(refusal);
  await db.owner.query("UPDATE app.membership SET expires_at=NULL WHERE tenant_id=$1 AND id=$2",[a.tenant,b.member]);
  await db.owner.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'fictional@builder.invalid')",[a.tenant,b.member]);
  await db.owner.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)",[a.tenant,randomUUID(),b.member]);
  await expect(administration(a,a,role)).rejects.toMatchObject(refusal);
});

it.each([undefined,"finance"])("serializes mutual %s behind a two-backend barrier and retains an owner", async role => {
  const a=await member(), b=await member(a.tenant), barrier=await db.runtime.connect();
  const clients=await Promise.all([db.owner.connect(),db.owner.connect()]);
  let results: PromiseSettledResult<unknown>[]=[];
  try {
    await barrier.query("BEGIN");
    await barrier.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[a.tenant]);
    const tasks=clients.map(async (c,i)=>{
      try { await c.query("BEGIN; SET LOCAL ROLE jobguard_identity"); const r=await invoke(c,i===0?a:b,i===0?b:a,role); await c.query("COMMIT"); return r; }
      catch(e) { await c.query("ROLLBACK"); throw e; }
    });
    const settled=Promise.allSettled(tasks);
    // Prove both calls reached the same lock before releasing either one.
    for(let i=0;i<100;i++) {
      const n=(await barrier.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].n;
      if(n===2) break;
      if(i===99) throw new Error("Both administration calls must reach the barrier");
      await new Promise(r=>setTimeout(r,10));
    }
    await barrier.query("COMMIT"); results=await settled;
  } finally { await barrier.query("ROLLBACK"); barrier.release(); clients.forEach(c=>c.release()); }
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  expect((await db.owner.query("SELECT count(*)::int n FROM app.membership WHERE tenant_id=$1 AND role='owner' AND revoked_at IS NULL",[a.tenant])).rows[0].n).toBe(1);
  expect(await events(a)).toHaveLength(1);
});

it("removal rejects the very next bind; demotion rejects stale privileged administration", async () => {
  const a=await member(), b=await member(a.tenant), c=await member(a.tenant);
  // A binding/context from a completed request is not reusable after removal.
  const client=await db.runtime.connect();
  try { await client.query("BEGIN"); await client.query("SELECT app.bind_request('real',$1,$2)",[b.digest,b.tenant]); await client.query("COMMIT"); }
  finally { client.release(); }
  await administration(a,b);
  await expect(db.runtime.query("SELECT app.bind_request('real',$1,$2)",[b.digest,b.tenant])).rejects.toMatchObject({code:"42501",message:"REQUEST_BINDING_REFUSED"});
  await administration(a,c,"finance");
  await expect(administration(c,a)).rejects.toMatchObject(refusal);
  const audit=await events(a);
  expect(audit).toHaveLength(2);
  expect(audit.every(e=>e.actor_ref===`membership:${a.member}` && e.payload.references.auditTrust==="checked_operation")).toBe(true);
});

it("rolls back membership and audit together, including a failure at the final audit write", async () => {
  const a=await member(), b=await member(a.tenant), c=await db.owner.connect();
  try {
    await c.query("BEGIN; SET LOCAL ROLE jobguard_identity"); await invoke(c,a,b); await c.query("ROLLBACK");
    expect(await events(a)).toHaveLength(0);
    // Owner-only fixture denies audit INSERT without changing product grants permanently.
    await c.query("BEGIN; REVOKE INSERT ON app.audit_event FROM jobguard_audit_writer; SET LOCAL ROLE jobguard_identity");
    await expect(invoke(c,a,b,"finance")).rejects.toMatchObject({code:"42501"}); await c.query("ROLLBACK");
    expect((await db.owner.query("SELECT role,revoked_at FROM app.membership WHERE tenant_id=$1 AND id=$2",[b.tenant,b.member])).rows[0]).toEqual({role:"owner",revoked_at:null});
    expect(await events(a)).toHaveLength(0);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it.each([undefined,"read_only"])("keeps preapproved invitations valid and prevents queued owner sends after %s", async role => {
  const a=await member(), b=await member(a.tenant), recipient=`${randomUUID()}@fictional.invalid`;
  const invitation=(await db.owner.query("SELECT identity.invite_member($1,$2,$3,'finance') id",[b.digest,b.tenant,recipient])).rows[0].id;
  const decision=randomUUID(), resolution=randomUUID(), auth=randomUUID(), outbox=randomUUID();
  const content="Fictional approved quote", hash=createHash("sha256").update(content).digest("hex");
  await db.owner.query("INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','fictional','send_quote')",[b.tenant,decision]);
  await db.owner.query("INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[b.tenant,resolution,decision,b.member]);
  await db.owner.query("INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'send_quote',$6,1,'synthetic.v1','2099-01-01')",[b.tenant,auth,decision,resolution,b.member,hash]);
  await db.owner.query("INSERT INTO app.action_outbox(tenant_id,id,authorization_id,adapter,provider_effect_key,action_type,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at) VALUES($1,$2,$3,'fake_capture',$2::text,'send_quote',$4,$5,1,'synthetic.v1','2099-01-01')",[b.tenant,outbox,auth,hash,content]);
  const deliver=vi.fn(async()=>({kind:"succeeded" as const,providerReference:"fictional-provider-ref"}));
  const control=randomUUID();
  await db.owner.query("INSERT INTO app.action_outbox(tenant_id,id,authorization_id,adapter,provider_effect_key,action_type,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at) VALUES($1,$2,$3,'fake_capture',$2::text,'send_quote',$4,$5,1,'synthetic.v1','2099-01-01')",[b.tenant,control,auth,hash,content]);
  const executor=new ActionExecutor(db.runtime,new Map([["fake_capture",{name:"fake_capture",supportsProviderDeduplication:false,deliver,reconcile:async()=>"unknown" as const}]]),{emit:()=>undefined});
  await executor.execute(verifiedTenantContextForQueuedJob(b.tenant),control);
  expect(deliver).toHaveBeenCalledOnce(); deliver.mockClear();
  await administration(a,b,role);
  await executor.execute(verifiedTenantContextForQueuedJob(b.tenant),outbox);
  expect(deliver).not.toHaveBeenCalled();
  expect((await db.owner.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",[b.tenant,outbox])).rows[0].status).toBe("pending");
  expect((await db.owner.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2",[b.tenant,outbox])).rows[0].n).toBe(0);
  // Existing invitation contract checks immutable grant/expiry, not the issuer's current role.
  const challenge=randomUUID();
  await db.owner.query("INSERT INTO identity.challenge(id,email,purpose,invitation_id,digest,requested_at,expires_at,consumed_at,verified) VALUES($1,$2,'invitation',$3,$4,clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp(),true)",[challenge,recipient,invitation,'a'.repeat(64)]);
  const person=(await db.owner.query("SELECT identity.provision_verified_challenge($1) id",[challenge])).rows[0].id;
  expect(person).toBeTruthy();
  expect((await db.owner.query("SELECT role FROM app.membership WHERE tenant_id=$1 AND identity_user_id=$2",[b.tenant,person])).rows[0].role).toBe("finance");
});

it("refuses snapshot isolation that could retain authority from before the tenant lock", async () => {
  const a=await member(), b=await member(a.tenant), c=await db.owner.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE jobguard_identity");
    await expect(invoke(c,a,b)).rejects.toMatchObject(refusal); await c.query("ROLLBACK");
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it.each([undefined,"finance"])("revokes delegated grants atomically with %s", async role => {
  const a=await member(), b=await member(a.tenant), grantId=randomUUID();
  await db.owner.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'fictional@builder.invalid')",[b.tenant,b.member]);
  await db.owner.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'admin','tenant',$1)",[b.tenant,grantId,b.member]);
  await administration(a,b,role);
  expect((await db.owner.query("SELECT grant_id FROM app.role_grant_revocation WHERE tenant_id=$1",[b.tenant])).rows).toEqual([{grant_id:grantId}]);
});

it("exposes only the two identity entry points with fixed paths and no runtime write capability", async () => {
  const paths=(await db.owner.query("SELECT p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,has_function_privilege('jobguard_identity',p.oid,'EXECUTE') identity_allowed,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_allowed,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure_allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname IN ('member_remove','member_change_role')")).rows;
  expect(paths).toHaveLength(2);
  for(const row of paths) expect(row).toMatchObject({prosecdef:true,proconfig:["search_path=pg_catalog, pg_temp"],owner:"jobguard_migration",identity_allowed:true,runtime_allowed:false,infrastructure_allowed:false});
  const a=await member(), b=await member(a.tenant);
  await expect(invoke(db.runtime,a,b,"finance")).rejects.toMatchObject({code:"42501"});
  await expect(administration({...a,digest:'f'.repeat(64)},b)).rejects.toMatchObject(refusal);
});
