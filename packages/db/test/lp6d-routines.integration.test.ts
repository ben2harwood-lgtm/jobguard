import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import routines from "./lp6d-routines.json";
import classification from "./lp6d-runtime-classification.json";
import { withTenant } from "../src/tenant-context.js";
import { beginRepositoryCommand, completeRepositoryCommand } from "../src/repository-command.js";
import { appendAuditBatch } from "../src/audit.js";
import { canonicalJson } from "../src/work-order-repository.js";
import { visitFixture } from "./site-visit-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
import { company, start } from "./practice-worker-switch-fixtures.js";

let db: JobDoorsDatabase, visit: Awaited<ReturnType<typeof visitFixture>>, switched: Awaited<ReturnType<typeof company>>;
beforeAll(async () => {
  db = await jobDoorsDatabase(true, "0526_lp6d_remaining_routines.sql");
  // Product fixture routes run against the predecessor, before the cutover.
  // No broad runtime fixture write is introduced or restored.
  const predecessor = { admin: db.owner, runtime: db.runtime } as Cluster;
  visit = await visitFixture(predecessor);
  switched = await company(predecessor);
  await start(predecessor, switched, "operative");
  await db.owner.query(await readFile(new URL("../migrations/0526_lp6d_remaining_routines.sql", import.meta.url), "utf8"));
}, 300_000);
afterAll(async () => { await db?.close(); });
const refused = { code: "42501", message: "REQUEST_BINDING_REFUSED" };
async function credential(tenant: string, member: string, person: string) {
  const digest = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [`${person}@fictional.invalid`, person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [person, tenant, member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), person, digest]);
  return digest;
}
async function request(tenant: string, digest: string | null, work: (c: PoolClient) => Promise<void>) {
  const c = await db.runtime.connect();
  try {
    await c.query("BEGIN");
    if (digest) await c.query("SELECT app.bind_request('real',$1,$2)", [digest, tenant]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    await work(c);
  } finally { await c.query("ROLLBACK"); c.release(); }
}
async function failure(c: PoolClient, sql: string, params: unknown[], expected: object = refused) {
  await c.query("SAVEPOINT attack");
  try { await expect(c.query(sql, params), sql).rejects.toMatchObject(expected); }
  finally { await c.query("ROLLBACK TO attack; RELEASE attack"); }
}

it("refuses every callable remaining entry point before business validation when unbound, actor-forged or cross-tenant", async () => {
  const actor = await jobDoorsActor(db.owner);
  const digest = await credential(actor.tenant, actor.member, actor.person);
  const rows = (await db.owner.query(`SELECT n.nspname||'.'||p.proname name,p.proargnames names,
    oidvectortypes(p.proargtypes) types FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.prokind='f' AND p.prorettype<>'trigger'::regtype
    AND has_function_privilege('jobguard_runtime',p.oid,'EXECUTE')`)).rows;
  const guarded = new Set([...routines.map(r => r.name), "app.revoke_recovery_message_authorization"]);
  const callable = rows.filter(row => guarded.has(row.name));
  expect(callable.length).toBeGreaterThan(40);
  for (const row of callable) {
    const types = row.types ? row.types.split(", ") as string[] : [];
    const names = row.names as string[] | null;
    const expression = `SELECT * FROM ${row.name}(${types.map((type, i) => `$${i + 1}::${type}`).join(",")})`;
    const values = types.map((_type, i) => ["p_actor", "actor", "p_owner"].includes(names?.[i] ?? "") ? actor.member
      : ["p_tenant", "t"].includes(names?.[i] ?? "") ? actor.tenant : null);
    await request(actor.tenant, null, c => failure(c, expression, values));
    await request(actor.tenant, digest, async c => {
      await c.query("SELECT set_config('app.tenant_id',$1,true)", [randomUUID()]);
      await failure(c, expression, values);
    });
    const index = names?.findIndex(name => ["p_actor", "actor", "p_owner"].includes(name)) ?? -1;
    if (index >= 0 && row.name !== "app.ent3a_extra_authority") {
      const forged = [...values]; forged[index] = randomUUID();
      await request(actor.tenant, digest, c => failure(c, expression, forged));
    }
  }
});

it("keeps ordinary bound members' scope progress permission and fails wrong-tenant resources", async () => {
  const actor = await jobDoorsActor(db.owner), job = randomUUID(), scope = randomUUID();
  await db.owner.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2", [actor.tenant, actor.member]);
  await db.owner.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional bound progress')", [actor.tenant, job]);
  await db.owner.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)", [actor.tenant, job, scope]);
  await db.owner.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3)", [actor.tenant, job, scope]);
  const digest = await credential(actor.tenant, actor.member, actor.person);
  await request(actor.tenant, digest, async c => {
    expect((await c.query("SELECT * FROM app.transition_scope_progress($1,$2,$3,0,'in_progress','start')", [actor.tenant, job, scope])).rows[0]).toMatchObject({ stage: "in_progress", revision: 1 });
    await failure(c, "SELECT * FROM app.transition_scope_progress($1,$2,$3,1,'complete','complete')", [randomUUID(), job, scope]);
  });
  expect((await db.owner.query("SELECT stage FROM app.scope_progress WHERE tenant_id=$1 AND scope_item_id=$2", [actor.tenant, scope])).rows[0].stage).toBe("not_started");
});

it("retains the operative's assigned visit and site-extra permissions while refusing office authority and owner substitution", async () => {
  const actor = visit.members.operative.member;
  const digest = await credential(actor.tenantId, actor.membershipId, actor.identityUserId);
  await request(actor.tenantId, digest, async c => {
    expect((await c.query("SELECT * FROM app.ent3b_visit_authority($1,$2)", [actor.membershipId, visit.jobId])).rows).toEqual([{ decision: "allowed", reason_code: "allowed" }]);
    expect((await c.query("SELECT * FROM app.ent3a_extra_authority($1,'LogSiteExtra',$2)", [actor.membershipId, visit.jobId])).rows[0].decision).toBe("allowed");
    expect((await c.query("SELECT * FROM app.ent3a_extra_authority($1,'RecordOfficeExtra',$2)", [actor.membershipId, visit.jobId])).rows[0].decision).toBe("forbidden");
    await failure(c, "SELECT app.work_order_begin($1,$2,'Fictional forged import')", [visit.p.membershipId, randomUUID()]);
    await failure(c, "SELECT app.work_order_begin($1,$2,'Fictional operative import')", [actor.membershipId, randomUUID()], { code: "P0002", message: "NOT_FOUND" });
  });
});

it("commits and replays an operative visit through the checked command and audit path", async () => {
  const actor = visit.members.operative.member;
  const digest = await credential(actor.tenantId, actor.membershipId, actor.identityUserId);
  const commandId = randomUUID();
  const run = () => withTenant(db.runtime, visit.ctx, async tx => {
    await tx.$client.query("SELECT app.bind_request('real',$1,$2)", [digest, actor.tenantId]);
    const claim = await beginRepositoryCommand<{ visitId: string; startedAt: string }>(tx, {
      tenantId: actor.tenantId, actorMembershipId: actor.membershipId, commandId,
      commandType: "StartSiteVisit", semanticKey: `site-visit-start:${visit.jobId}:${actor.membershipId}:${commandId}`,
      jobId: visit.jobId, legacyJson: canonicalJson({ commandType: "StartSiteVisit", jobId: visit.jobId, membershipId: actor.membershipId }),
    });
    if (claim.kind === "replay") return claim.result;
    const visitId = (await tx.$client.query("SELECT app.ent3b_start_visit($1,$2,$3) id", [actor.membershipId, commandId, visit.jobId])).rows[0].id as string;
    await appendAuditBatch(tx, [{ id: visitId, version: "audit.v1", actorRef: `membership:${actor.membershipId}`,
      eventType: "contractor.visit.started", subjectType: "site-visit", subjectRef: visitId,
      payload: { references: { command: commandId, job: visit.jobId, visit: visitId, environment: "synthetic_demo" } } }]);
    return completeRepositoryCommand<{ visitId: string; startedAt: string }>(tx, commandId);
  });
  const first = await run();
  expect(first.visitId).toBeTruthy();
  expect(await run()).toEqual(first);
  expect((await db.owner.query("SELECT count(*)::int n FROM app.site_visit WHERE tenant_id=$1 AND id=$2", [actor.tenantId, first.visitId])).rows[0].n).toBe(1);
});

it("binds the effective practice operative and cannot substitute its owning member", async () => {
  const c = await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('contractor_practice',$1,$2)", [switched.session, switched.p.tenantId]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [switched.p.tenantId]);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(switched.members.operative);
    expect((await c.query("SELECT membership_id FROM app.contractor_session($1)", [switched.session])).rows[0].membership_id).toBe(switched.members.operative);
    await failure(c, "SELECT app.work_order_begin($1,$2,'Fictional owner substitution')", [switched.p.membershipId, randomUUID()]);
    await failure(c, "SELECT * FROM app.lp6d_contractor_session_identity($1)", [switched.session], { code: "42501" });
  } finally { await c.query("ROLLBACK"); c.release(); }
  // Public credential bridge also works on a fresh, initially unbound request.
  expect((await db.runtime.query("SELECT membership_id FROM app.contractor_session($1)", [switched.session])).rows[0].membership_id).toBe(switched.members.operative);
});

it("binds invitations to their credential and refuses a different session in the same transaction", async () => {
  const a = await jobDoorsActor(db.owner), b = await jobDoorsActor(db.owner);
  const da = await credential(a.tenant, a.member, a.person), dbb = await credential(b.tenant, b.member, b.person);
  // Identity bridge has an identity-role EXECUTE grant, not a runtime grant.
  const c = await db.owner.connect();
  try {
    await c.query("BEGIN; SET LOCAL ROLE jobguard_identity");
    const first = await c.query("SELECT identity.invite_member($1,$2,'fictional-recipient@builder.invalid','worker') id", [da, a.tenant]);
    expect(first.rows[0].id).toBeTruthy();
    await failure(c, "SELECT identity.invite_member($1,$2,'other-fictional@builder.invalid','worker')", [dbb, b.tenant]);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("classifies live pg_proc, including post-inventory additions, and detects an unassigned definer", async () => {
  const assigned: Record<string, string> = classification;
  const unknown = async (c: { query: PoolClient["query"] }) => (await c.query(`SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane')
    AND p.prokind IN('f','p') AND p.prosecdef AND has_function_privilege('jobguard_runtime',p.oid,'EXECUTE')`)).rows
    .map(row => row.signature as string).filter(signature => !(signature.replaceAll(", ", ",") in assigned));
  expect(await unknown(db.owner)).toEqual([]);
  const c = await db.owner.connect();
  try {
    await c.query("BEGIN; CREATE FUNCTION app.lp6d_unassigned_probe() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION app.lp6d_unassigned_probe() TO jobguard_runtime");
    expect(await unknown(c)).toEqual(["app.lp6d_unassigned_probe()"]);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("keeps worker and break-glass paths unavailable to runtime without blocking their separate roles", async () => {
  for (const [signature, role] of [
    ["app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text)", "jobguard_shadow"],
    ["app.read_shadow_emergency(uuid,uuid,text)", "jobguard_shadow_emergency_access"],
    ["app.read_final_check_manifest(uuid,uuid,uuid)", "jobguard_shadow"],
    ["app.prepare_evidence_pack_v3(uuid,uuid)", "jobguard_shadow"],
    ["app.complete_evidence_pack_v3_check(uuid,uuid,text)", "jobguard_shadow"],
    ["app.finish_evidence_pack_v3(uuid,uuid,jsonb,text,text)", "jobguard_shadow"],
  ]) {
    expect((await db.owner.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') runtime,has_function_privilege($2,$1,'EXECUTE') worker", [signature, role])).rows[0]).toEqual({ runtime: false, worker: true });
  }
});

it("withdraws the direct revocation column and rejects a fabricated revoke command", async () => {
  expect((await db.owner.query("SELECT has_column_privilege('jobguard_runtime','app.action_authorization','revoked_at','UPDATE') allowed")).rows[0].allowed).toBe(false);
  const a = await jobDoorsActor(db.owner), digest = await credential(a.tenant, a.member, a.person);
  await request(a.tenant, digest, async c => {
    await failure(c, "UPDATE app.action_authorization SET revoked_at=clock_timestamp()", [], { code: "42501" });
    await failure(c, "SELECT app.revoke_recovery_message_authorization($1,$2,$3,$4)", [a.tenant, a.member, randomUUID(), randomUUID()], { code: "23514", message: "AUTHORIZATION_INVALID" });
  });
});
