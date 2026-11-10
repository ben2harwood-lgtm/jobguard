import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";
import { DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID } from "../src/demo-seed.js";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { sourcesFixture, closeWorkFixture, type SourceFixture } from "./job-sources-fixture.js";
import { seedWorkPractice } from "./job-work-state-fixtures.js";

let f: SourceFixture;
beforeAll(async () => { f = await sourcesFixture(); }, 120_000);
afterAll(async () => { await closeWorkFixture(f); });
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const denied = { code: "42501" };
const bindingRefusal = { code: "42501", message: "REQUEST_BINDING_REFUSED" };
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const binder = "app.lp6_bind_customer_portal(uuid,uuid,uuid,text)";
const reader = "app.lp6_delegated_actor(uuid,text,uuid)";
async function customer() {
  const p = await seedWorkPractice(f), t = p.auth.context.tenantId, j = p.jobId;
  const c = (await f.admin.query(`SELECT b.customer_id FROM app.job_party_current p
    JOIN app.job_party_binding b ON (b.tenant_id,b.id)=(p.tenant_id,p.binding_id)
    WHERE p.tenant_id=$1 AND p.job_id=$2`, [t,j])).rows[0].customer_id as string;
  const link = hash(randomUUID()), digest = hash(randomUUID());
  const grant = (await f.admin.query("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) id",
    [t,p.bindingCredential,j,c,link,`customer-signin-reference.v1:${t}/${j}/${c}/${"a".repeat(43)}`])).rows[0].id as string;
  await f.admin.query("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem')", [t,j,c,link,digest]);
  return { t,j,c,digest,grant,sponsor:p.auth.membershipId,sponsorDigest:p.bindingCredential };
}
type Customer = Awaited<ReturnType<typeof customer>>;
const input = (w: Customer) => ({version:"customer-portal-message.v1",jobId:w.j,commandId:randomUUID(),text:"Please fit an outside tap."});
async function transaction<T>(work: (c: PoolClient) => Promise<T>) {
  const c = await f.admin.connect();
  try { await c.query("BEGIN"); return await work(c); }
  finally { await c.query("ROLLBACK"); c.release(); }
}
async function refuse(c: PoolClient, sql: string, values: unknown[], error = bindingRefusal as object) {
  await c.query("SAVEPOINT refused_call");
  try { await expect(c.query(sql,values)).rejects.toMatchObject(error); }
  finally { await c.query("ROLLBACK TO refused_call"); await c.query("RELEASE refused_call"); }
}
const bind = (c: PoolClient,w: Customer) => c.query("SELECT app.lp6_bind_customer_portal($1,$2,$3,$4) actor",[w.t,w.j,w.c,w.digest]);
// Inspect the private reader as its sole authorized definer owner. Restore the
// migration role before exercising the separately authorized binder/caller.
async function scopedActor(c: PoolClient, tenant: unknown, type: unknown, job: unknown) {
  await c.query("SET LOCAL ROLE jobguard_command_writer");
  try { return (await c.query("SELECT app.lp6_delegated_actor($1,$2,$3) actor",[tenant,type,job])).rows[0].actor; }
  finally { await c.query("SET LOCAL ROLE jobguard_migration"); }
}

const message = async(w: Customer, raw = input(w)) => {
  const c = await f.admin.connect();
  try {
    await c.query("BEGIN"); await c.query("SET LOCAL ROLE jobguard_identity");
    const result = await c.query("SELECT identity.customer_portal_message($1,$2,$3,$4,$5::jsonb) result",[w.t,w.j,w.c,w.digest,raw]);
    await c.query("COMMIT"); return result.rows[0].result;
  } catch(error) { await c.query("ROLLBACK"); throw error; }
  finally { c.release(); }
};
async function facts(w: Customer) {
  const tables=["command_receipt","command_lifecycle_claim","customer_message_source","job_source_original","evidence_upload","evidence_object","audit_event"];
  return Promise.all(tables.map(async name => (await f.admin.query(`SELECT row_to_json(x)::text value FROM app.${name} x WHERE tenant_id=$1 ORDER BY row_to_json(x)::text`,[w.t])).rows));
}

it("a live customer message stores its sponsor, delegated kind, evidence and customer-session audit", async()=>{
  const w=await customer(), raw=input(w), receipt=await message(w,raw);
  expect(receipt).toMatchObject({jobId:w.j,sourceKind:"customer_message",record:{commandId:raw.commandId,text:raw.text}});
  expect(receipt.record).not.toHaveProperty("actualTesterMembershipId");
  const row=(await f.admin.query(`SELECT r.actor_membership_id,c.resource,s.actor_membership_id source_actor
    FROM app.command_receipt r JOIN app.command_lifecycle_claim c USING(tenant_id,command_id)
    JOIN app.customer_message_source s USING(tenant_id,command_id) WHERE r.tenant_id=$1 AND r.command_id=$2`,[w.t,raw.commandId])).rows[0];
  expect(row).toEqual({actor_membership_id:w.sponsor,source_actor:w.sponsor,resource:{tenantId:w.t,actorMembershipId:w.sponsor,subjectType:"job",subjectRef:w.j,credential_kind:"customer_portal_delegated"}});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_portal.message_recorded' AND payload->'references'->>'commandId'=$2",[w.t,raw.commandId])).rows[0].n).toBe(1);
  expect(await message(w,raw)).toEqual(receipt);
});

it("every other non-superuser role, including login roles, is denied both private helpers", async()=>{
  const roles=(await f.admin.query<{rolname:string}>(`SELECT rolname FROM pg_roles WHERE NOT rolsuper
    AND (rolname LIKE 'jobguard_%' OR rolcanlogin)
    AND rolname NOT IN('jobguard_binding_owner') ORDER BY rolname`)).rows;
  expect(roles.some(r=>r.rolname==='jobguard_runtime')).toBe(true);
  const login=`lp6_public_${randomUUID().replaceAll('-','')}`;
  await f.admin.query(`CREATE ROLE ${quote(login)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  roles.push({rolname:login});
  try {
    for(const {rolname} of roles) for(const [signature,sql] of [[binder,"SELECT app.lp6_bind_customer_portal(NULL,NULL,NULL,NULL)"],[reader,"SELECT app.lp6_delegated_actor(NULL,NULL,NULL)"]]) {
      const authorized = signature === binder ? rolname === 'jobguard_migration' : rolname === 'jobguard_command_writer';
      expect((await f.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[rolname,signature])).rows[0].allowed,`${rolname}: ${signature}`).toBe(authorized);
      if (authorized) continue;
      await transaction(async c=>{ await c.query(`SET LOCAL ROLE ${quote(rolname)}`); await refuse(c,sql,[],{code:"42501",message:expect.stringMatching(/permission denied/u)}); });
    }
  } finally { await f.admin.query(`DROP ROLE ${quote(login)}`); }
});

it.each(["wrong","expired","revoked","job","customer"] as const)("a migration-owned definer refuses a %s portal credential and binds nothing",async defect=>{
  const w=await customer(), before=await facts(w);
  if(defect==='expired') await f.admin.query("WITH at AS (SELECT clock_timestamp()-interval '2 hours' issued) UPDATE app.customer_portal_session SET issued_at=at.issued,expires_at=at.issued+interval '1 hour' FROM at WHERE tenant_id=$1 AND token_digest=$2",[w.t,w.digest]);
  if(defect==='revoked') await f.admin.query("UPDATE app.customer_portal_session SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND token_digest=$2",[w.t,w.digest]);
  await transaction(async c=>{
    await c.query(`CREATE FUNCTION app.lp6_test_portal_definer(t uuid,j uuid,c uuid,d text) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT app.lp6_bind_customer_portal(t,j,c,d) $$;
      ALTER FUNCTION app.lp6_test_portal_definer(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
      REVOKE ALL ON FUNCTION app.lp6_test_portal_definer(uuid,uuid,uuid,text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION app.lp6_test_portal_definer(uuid,uuid,uuid,text) TO jobguard_identity`);
    await c.query("SET LOCAL ROLE jobguard_identity");
    await refuse(c,"SELECT app.lp6_test_portal_definer($1,$2,$3,$4)",[w.t,defect==='job'?randomUUID():w.j,defect==='customer'?randomUUID():w.c,defect==='wrong'?hash(randomUUID()):w.digest],denied);
    await c.query("RESET ROLE");
    expect((await c.query("SELECT count(*)::int n FROM control_plane.request_binding WHERE transaction_id=pg_current_xact_id() AND environment_id=extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT oid::text FROM pg_database WHERE datname=current_database())")).rows[0].n).toBe(0);
  });
  expect(await facts(w)).toEqual(before);
});

it("delegation is transaction/job/type/tenant scoped, refuses rebinding and hides the general actor/tenant",async()=>{
  const w=await customer(), before=await facts(w);
  await transaction(async c=>{
    await c.query("SET LOCAL ROLE jobguard_migration");
    expect((await bind(c,w)).rows[0].actor).toBe(w.sponsor);
    expect((await c.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows[0]).toEqual({actor:null,tenant:null});
    expect(await scopedActor(c,w.t,'JobSource.customer_message',w.j)).toBe(w.sponsor);
    for(const [tenant,type,job] of [[randomUUID(),'JobSource.customer_message',w.j],[w.t,'JobSource.diary',w.j],[w.t,'JobSource.customer_message',randomUUID()],[w.t,null,w.j],[w.t,'JobSource.customer_message',null]])
      expect(await scopedActor(c,tenant,type,job)).toBeNull();
    await refuse(c,"SELECT app.lp6_bind_customer_portal($1,$2,$3,$4)",[w.t,w.j,w.c,w.digest]);
  });
  expect(await facts(w)).toEqual(before);
  await transaction(async c=>{await c.query("SET LOCAL ROLE jobguard_migration");expect(await scopedActor(c,w.t,'JobSource.customer_message',w.j)).toBeNull();});
});

async function assertOtherMoneyRefuses(c:PoolClient,w:Customer) {
  expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBeNull();
  await refuse(c,"SELECT app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)",[w.t,w.j,randomUUID(),w.sponsor,randomUUID(),'fictional@example.invalid','2026-11-08']);
  await refuse(c,"SELECT app.post_plan_settlement($1,$2,$3,$4,$5,1,'GBP',$6,$7,$8,$9,$10)",[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID(),'fixture','fixture','a'.repeat(64),randomUUID(),randomUUID()]);
  await refuse(c,"SELECT app.write_recovery_allocation($1,$2,$3,$4::jsonb,$5::jsonb)",[w.t,w.j,hash(randomUUID()),{},{}]);
}
it("a delegated binding cannot reach invoice issue, settlement or recovery allocation",async()=>{
  const w=await customer(), before=await facts(w);
  await transaction(async c=>{await c.query("SET LOCAL ROLE jobguard_migration");await bind(c,w);await assertOtherMoneyRefuses(c,w);});
  expect(await facts(w)).toEqual(before);
});

it("mutation: exposing the sponsor through current_actor breaks the other-money refusal invariant",async()=>{
  const w=await customer();
  await transaction(async c=>{
    const original=(await c.query("SELECT pg_get_functiondef('app.current_actor()'::regprocedure) sql")).rows[0].sql as string;
    const mutant=original.replace("CASE WHEN b.credential_kind IS DISTINCT FROM 'customer_portal_delegated' THEN b.actor_id END","b.actor_id");
    expect(mutant).not.toBe(original); await c.query(mutant); await c.query("SET LOCAL ROLE jobguard_migration"); await bind(c,w);
    await expect(assertOtherMoneyRefuses(c,w)).rejects.toThrow();
  });
});

async function assertScopeRefused(c:PoolClient,w:Customer,tenant:string,type:string,job:string) {
  expect(await scopedActor(c,tenant,type,job)).toBeNull();
  await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  await refuse(c,"SELECT app.begin_command('repository-command.v1',$1,$2,$3,$4::jsonb,'{}'::jsonb,$5::jsonb)",
    [randomUUID(),type,randomUUID(),{tenantId:tenant,actorMembershipId:w.sponsor,subjectType:'job',subjectRef:job},{version:'repository-command.v1',actorMembershipId:w.sponsor,input:{jobId:job}}]);
}
it.each(['type','job','tenant'] as const)('a delegated binding cannot begin a command with another %s',async field=>{
  const w=await customer(),before=await facts(w);
  await transaction(async c=>{
    await c.query('SET LOCAL ROLE jobguard_migration');await bind(c,w);
    await assertScopeRefused(c,w,field==='tenant'?randomUUID():w.t,field==='type'?'JobSource.diary':'JobSource.customer_message',field==='job'?randomUUID():w.j);
  });
  expect(await facts(w)).toEqual(before);
});
it.each(['type','job'] as const)('mutation: dropping the %s scope check makes its refusal assertion fail',async field=>{
  const w=await customer();
  await transaction(async c=>{
    const original=(await c.query("SELECT pg_get_functiondef('app.lp6_delegated_actor(uuid,text,uuid)'::regprocedure) sql")).rows[0].sql as string;
    const predicate=field==='type'?'b.scope_command_type IS NOT DISTINCT FROM p_command_type':'b.scope_job_id IS NOT DISTINCT FROM p_job';
    const mutant=original.replace(predicate,'true');expect(mutant).not.toBe(original);await c.query(mutant);
    await c.query('SET LOCAL ROLE jobguard_migration');await bind(c,w);
    await expect(assertScopeRefused(c,w,w.t,field==='type'?'JobSource.diary':'JobSource.customer_message',field==='job'?randomUUID():w.j)).rejects.toThrow();
  });
});
it('a member binding cannot be replaced by a customer binding',async()=>{
  const w=await customer();
  await transaction(async c=>{
    await c.query('SET LOCAL ROLE jobguard_migration');
    await c.query("SELECT app.bind_request('real',$1,$2)",[w.sponsorDigest,w.t]);
    await refuse(c,'SELECT app.lp6_bind_customer_portal($1,$2,$3,$4)',[w.t,w.j,w.c,w.digest]);
    expect((await c.query('SELECT app.current_actor() actor')).rows[0].actor).toBe(w.sponsor);
  });
});
async function waiting(pid:number) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) {
    if((await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[pid])).rowCount) return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error('Expected the real PostgreSQL session to wait for the portal lock');
}
it('link revocation queued before a message commits first and the message writes nothing',async()=>{
  const w=await customer();await message(w); // Establish that this exact live customer can write.
  const raw=input(w),before=await facts(w),blocker=await f.admin.connect(),revoker=await f.admin.connect();
  let revoke:Promise<unknown>|undefined;
  try {
    await blocker.query('BEGIN');await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,387))",[`${w.t}:${w.j}`]);
    await revoker.query('BEGIN');await revoker.query('SET LOCAL ROLE jobguard_identity');
    const pid=(await revoker.query('SELECT pg_backend_pid() pid')).rows[0].pid as number;
    revoke=revoker.query('SELECT identity.customer_portal_revoke($1,$2,$3,$4)',[w.t,w.sponsorDigest,w.j,w.grant]).then(()=>revoker.query('COMMIT'));
    await waiting(pid);
    const pending=message(w,raw).then(value=>({value}),error=>({error}));
    await blocker.query('COMMIT');await revoke;
    expect(await pending).toMatchObject({error:{code:'42501',message:'CUSTOMER_REFUSED'}});
    const after=await facts(w);expect(after.slice(0,-1)).toEqual(before.slice(0,-1));
    const oldAudit=new Set(before.at(-1)!.map(r=>r.value));
    const added=after.at(-1)!.filter(r=>!oldAudit.has(r.value));
    expect(added).toHaveLength(1);expect(JSON.parse(added[0]!.value)).toMatchObject({event_type:'customer_portal.revoked'});
  } finally {
    await blocker.query('ROLLBACK');await revoke?.catch(()=>undefined);await revoker.query('ROLLBACK');blocker.release();revoker.release();
  }
});
it('upgrade preserves every existing binding tuple, its private owner and UNLOGGED storage; scope fields are exact',async()=>{
  const c=await startBeforeMigration('0724_lp6c_customer_portal_delegation.sql');
  try {
    const credential=hash(randomUUID());await testBoundTenantContext(c.admin,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,credential);
    await c.admin.query("SELECT app.bind_request('real',$1,$2)",[credential,DEMO_TENANT_ID]);
    const tuples=async()=> (await c.admin.query(`SELECT environment_id,transaction_id::text,credential_kind,session_ref,tenant_id,actor_id,expires_at::text,xmin::text
      FROM control_plane.request_binding ORDER BY environment_id,transaction_id`)).rows;
    const storage=async()=> (await c.admin.query("SELECT relpersistence,relowner::regrole::text owner FROM pg_class WHERE oid='control_plane.request_binding'::regclass")).rows[0];
    const before=await tuples(),posture=await storage();expect(before.length).toBeGreaterThan(0);
    await applyMigration(c,'0724_lp6c_customer_portal_delegation.sql');
    expect(await tuples()).toEqual(before);expect(await storage()).toEqual(posture);
    expect(posture).toEqual({relpersistence:'u',owner:'jobguard_binding_owner'});
    expect((await c.admin.query("SELECT count(*)::int n FROM control_plane.request_binding WHERE scope_job_id IS NOT NULL OR scope_command_type IS NOT NULL")).rows[0].n).toBe(0);
    const client=await c.admin.connect();
    try {
      await client.query('BEGIN');
      for(const [kind,job,type] of [['real',randomUUID(),null],['real',null,'JobSource.customer_message'],['customer_portal_delegated',null,'JobSource.customer_message'],['customer_portal_delegated',randomUUID(),null]])
        await refuse(client,`INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at,scope_job_id,scope_command_type)
          VALUES('scope-check',pg_current_xact_id(),$1,'fixture',$2,$3,clock_timestamp()+interval '1 minute',$4,$5)`,[kind,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,job,type],{code:'23514'});
    } finally {await client.query('ROLLBACK');client.release();}
  } finally {await c.close();}
},120000);
it('the public member binder never accepts the delegated customer kind',async()=>{
  const w=await customer(),before=await facts(w);
  await transaction(async c=>{
    await c.query('SET LOCAL ROLE jobguard_runtime');
    await refuse(c,"SELECT app.bind_request('customer_portal_delegated',$1,$2)",[w.digest,w.t]);
    await c.query('RESET ROLE');
    expect((await c.query('SELECT count(*)::int n FROM control_plane.request_binding WHERE transaction_id=pg_current_xact_id()')).rows[0].n).toBe(0);
  });
  expect(await facts(w)).toEqual(before);
});
it('the delegated deadline is short, never outlives the portal session and cannot be renewed in the transaction',async()=>{
  const w=await customer();
  await transaction(async c=>{
    await c.query('SET LOCAL ROLE jobguard_migration');await bind(c,w);await c.query('RESET ROLE');
    const row=(await c.query(`SELECT b.credential_kind,b.scope_job_id,b.scope_command_type,
      b.expires_at>clock_timestamp() live,b.expires_at<=clock_timestamp()+interval '1 minute' short,
      b.expires_at<=s.expires_at within_session FROM control_plane.request_binding b
      JOIN app.customer_portal_session s ON s.id::text=b.session_ref AND s.tenant_id=b.tenant_id
      WHERE b.transaction_id=pg_current_xact_id()`)).rows[0];
    expect(row).toEqual({credential_kind:'customer_portal_delegated',scope_job_id:w.j,scope_command_type:'JobSource.customer_message',live:true,short:true,within_session:true});
    await c.query("UPDATE control_plane.request_binding SET expires_at=clock_timestamp()-interval '1 second' WHERE transaction_id=pg_current_xact_id()");
    expect(await scopedActor(c,w.t,'JobSource.customer_message',w.j)).toBeNull();
    await refuse(c,'SELECT app.current_actor()',[]);
    await refuse(c,'SELECT app.lp6_bind_customer_portal($1,$2,$3,$4)',[w.t,w.j,w.c,w.digest]);
  });
});
it('a forged ordinary tenant is refused before malformed resource fields are parsed',async()=>{
  const w=await customer(),before=await facts(w);
  await transaction(async c=>{
    await c.query("SELECT app.bind_request('real',$1,$2)",[w.sponsorDigest,w.t]);
    const other=randomUUID();await c.query("SELECT set_config('app.tenant_id',$1,true)",[other]);
    await refuse(c,"SELECT app.begin_command('repository-command.v1',$1,'JobSource.customer_message',$2,$3::jsonb,'{}','{}')",
      [randomUUID(),randomUUID(),{tenantId:other,actorMembershipId:'malformed',subjectType:'job',subjectRef:'malformed'}]);
  });
  expect(await facts(w)).toEqual(before);
});
