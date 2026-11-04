import { randomBytes, randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { jobDoorsActor } from "./lp-job-doors-fixtures.js";
import { startLp0Database, RUNTIME_TEST_PASSWORD } from "./lp-0-catalog.js";
import { ActionExecutor } from "../src/outbox.js";
import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";

let db: { owner: Pool; runtime: Pool; identity: Pool; close(): Promise<void> };
beforeAll(async () => {
  const fixture = await startLp0Database(62700);
  await fixture.bootstrapRuntimeLogin();
  const runtime = new Pool({host:"127.0.0.1",port:fixture.port,database:fixture.databaseName,
    user:"jobguard_runtime",password:RUNTIME_TEST_PASSWORD,max:2});
  await fixture.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'identity-fixture'");
  const identity = new Pool({host:"127.0.0.1",port:fixture.port,database:fixture.databaseName,
    user:"jobguard_identity",password:"identity-fixture",max:2});
  db = {owner:fixture.admin,runtime,identity,async close() { await identity.end(); await runtime.end(); await fixture.stop(); }};
}, 300_000);
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
  const c = await db.identity.connect();
  try { await c.query("BEGIN"); const r=await invoke(c,a,target,role); await c.query("COMMIT"); return r; }
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
  const clients=await Promise.all([db.identity.connect(),db.identity.connect()]);
  let results: PromiseSettledResult<unknown>[]=[];
  try {
    await barrier.query("BEGIN");
    await barrier.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[a.tenant]);
    const tasks=clients.map(async (c,i)=>{
      try { await c.query("BEGIN"); const r=await invoke(c,i===0?a:b,i===0?b:a,role); await c.query("COMMIT"); return r; }
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
  await db.runtime.query("SELECT app.bind_request('real',$1,$2)",[c.digest,c.tenant]);
  await expect(administration(c,a)).rejects.toMatchObject(refusal);
  const audit=await events(a);
  expect(audit).toHaveLength(2);
  expect(audit.every(e=>e.version==="audit.v3" && e.actor_ref===`membership:${a.member}` && e.payload.references.auditTrust==="checked_operation" && e.payload.references.auditActorKind==="bound_member")).toBe(true);
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
  // Finance invitations keep their immutable grant; operative invitations recheck the issuer.
  const challenge=randomUUID();
  await db.owner.query("INSERT INTO identity.challenge(id,email,purpose,invitation_id,digest,requested_at,expires_at,consumed_at,verified) VALUES($1,$2,'invitation',$3,$4,clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp(),true)",[challenge,recipient,invitation,'a'.repeat(64)]);
  const person=(await db.owner.query("SELECT identity.provision_verified_challenge($1) id",[challenge])).rows[0].id;
  expect(person).toBeTruthy();
  expect((await db.owner.query("SELECT role FROM app.membership WHERE tenant_id=$1 AND identity_user_id=$2",[b.tenant,person])).rows[0].role).toBe("finance");
  // Owner fixture represents an operative grant issued while b was still an owner.
  // Current MON-8 acceptance must refuse it after revocation/demotion, before entitlement.
  const operativeInvitation=randomUUID(), operativeChallenge=randomUUID();
  const operativeRecipient=`${randomUUID()}@fictional.invalid`;
  await db.owner.query("INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id) VALUES($1,$2,$3,$4,'operative',clock_timestamp()+interval '1 hour',$5)",[operativeInvitation,operativeRecipient,b.tenant,b.account,b.person]);
  await db.owner.query("INSERT INTO identity.challenge(id,email,purpose,invitation_id,digest,requested_at,expires_at,consumed_at,verified) VALUES($1,$2,'invitation',$3,$4,clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp(),true)",[operativeChallenge,operativeRecipient,operativeInvitation,'b'.repeat(64)]);
  expect((await db.owner.query("SELECT identity.provision_verified_challenge($1) id",[operativeChallenge])).rows[0].id).toBeNull();
  expect((await db.owner.query("SELECT accepted_at FROM identity.invitation WHERE id=$1",[operativeInvitation])).rows[0].accepted_at).toBeNull();
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


it("refuses substituting an owner session into an already bound transaction", async () => {
  const a=await member(), b=await member(a.tenant), target=await member(a.tenant,"finance");
  const c=await db.owner.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)",[b.digest,b.tenant]);
    await c.query("SET LOCAL ROLE jobguard_identity");
    await expect(invoke(c,a,target)).rejects.toMatchObject({code:"42501",message:"REQUEST_BINDING_REFUSED"});
    await c.query("ROLLBACK");
    expect((await db.owner.query("SELECT revoked_at FROM app.membership WHERE tenant_id=$1 AND id=$2",[target.tenant,target.member])).rows[0].revoked_at).toBeNull();
    expect(await events(a)).toHaveLength(0);
  } finally { await c.query("ROLLBACK"); c.release(); }
});


it.each([undefined,"finance"])("allows self %s with another owner and seals the original bound actor", async role => {
  const a=await member(); await member(a.tenant);
  await administration(a,a,role);
  expect(await events(a)).toMatchObject([{version:"audit.v3",actor_ref:`membership:${a.member}`,
    subject_ref:a.member,payload:{references:{auditTrust:"checked_operation",auditActorKind:"bound_member"}}}]);
  await expect(administration(a,a)).rejects.toMatchObject({code:"42501"});
});

it.each([undefined,"finance"])("ignores forged actor/tenant GUCs for %s", async role => {
  const owner=await member(), peer=await member(owner.tenant,"admin"), other=await member();
  const c=await db.identity.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true),set_config('app.actor_membership_id',$2,true)",[other.tenant,owner.member]);
    await expect(invoke(c,peer,owner,role)).rejects.toMatchObject(refusal);
    await c.query("ROLLBACK");
    expect(await events(owner)).toEqual([]);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("exposes no actor-accepting or retired administration signature to any caller", async () => {
  const rows=(await db.owner.query("SELECT p.proname,oidvectortypes(p.proargtypes) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname IN ('member_remove','member_change_role') ORDER BY p.proname")).rows;
  expect(rows).toEqual([
    {proname:"member_change_role",args:"character, uuid, uuid, text"},
    {proname:"member_remove",args:"character, uuid, uuid"},
  ]);
  const a=await member(), b=await member(a.tenant,"finance");
  for(const sql of [
    "SELECT identity.member_remove($1::uuid,$2::uuid,$3::uuid)",
    "SELECT identity.member_remove($1::uuid,$2::uuid,$3::uuid,$4::uuid)",
    "SELECT identity.member_change_role($1::uuid,$2::uuid,$3::uuid,'finance'::text)",
    "SELECT identity.member_change_role($1::uuid,$2::uuid,$3::uuid,$4::uuid,'finance'::text)",
  ]) {
    const values=sql.includes('$4')?[a.member,a.tenant,b.member,a.person]:[a.member,a.tenant,b.member];
    await expect(db.identity.query(sql,values)).rejects.toMatchObject({code:"42883"});
  }
  expect(await events(a)).toEqual([]);
});

it.each([undefined,"finance"])("rolls back %s if the binding expires while waiting for the target row", async role => {
  const a=await member(), b=await member(a.tenant,"finance");
  const deadline=(await db.owner.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '5 seconds' WHERE id=$1 RETURNING expires_at",[a.sessionId])).rows[0].expires_at;
  const barrier=await db.owner.connect(), c=await db.identity.connect();
  let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await barrier.query("BEGIN");
    await barrier.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[b.tenant,b.member]);
    await c.query("BEGIN");
    const pid=(await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    pending=Promise.allSettled([invoke(c,a,b,role)]);
    for(let i=0;i<100;i++) {
      if((await barrier.query("SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) blocked",[pid])).rows[0].blocked) break;
      if(i===99) throw new Error("Administration must reach the target row lock");
      await new Promise(r=>setTimeout(r,10));
    }
    await barrier.query("SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)",[deadline]);
    await barrier.query("COMMIT");
    const [result]=await pending;
    expect(result).toMatchObject({status:"rejected",reason:{code:"42501"}});
    await c.query("ROLLBACK");
    expect((await db.owner.query("SELECT role,revoked_at FROM app.membership WHERE tenant_id=$1 AND id=$2",[b.tenant,b.member])).rows[0]).toEqual({role:"finance",revoked_at:null});
    expect(await events(a)).toEqual([]);
  } finally {
    await barrier.query("ROLLBACK");
    if(pending) await pending;
    await c.query("ROLLBACK"); barrier.release(); c.release();
  }
});
