// Real PostgreSQL coverage for CI; deliberately not executed in the builder sandbox.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { EvidencePackRepository, RecoveryMessageRepository, withTenant, MIGRATION_URLS } from "../src/index.js";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { chainWorld, submitted } from "./extra-approval-chain-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testBoundTenantContext, testTenantContext } from "./tenant-context-test-utils.js";
import proof from "./migration-proofs/0757_lp6d_worker_binding_presence.proof.json" with { type: "json" };

const migration = "0757_lp6d_worker_binding_presence.sql";
const environment = "extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database())";
const refused = { code: "42501", message: "REQUEST_BINDING_REFUSED" };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let db: JobDoorsDatabase;
let recovery: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
let world: Awaited<ReturnType<typeof chainWorld>>;
let slow: Awaited<ReturnType<typeof submitted>>, outbox: string;
let upgradeSql: string;
let escalateAfter = 0;
let bindingPosture: unknown;
async function bindingBoundary() {
  return (await db.owner.query(`SELECT
    pg_get_functiondef('app.bind_request(text,text,uuid)'::regprocedure) definition,
    (SELECT proacl::text FROM pg_proc WHERE oid='app.bind_request(text,text,uuid)'::regprocedure) acl,
    (SELECT row_to_json(r) FROM pg_roles r WHERE rolname='jobguard_binding_owner') owner,
    (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member),'[]'::jsonb) FROM pg_auth_members m
      WHERE roleid='jobguard_binding_owner'::regrole OR member='jobguard_binding_owner'::regrole) memberships`)).rows[0];
}
const calls = () => [
  { sql: "SELECT * FROM app.lp6d_escalate_overdue_worker()", args: [] as unknown[], tenant: world.p.tenantId },
  { sql: "SELECT app.lp6d_recovery_message_sink_worker($1,$2)", args: [outbox, "fictional-presence-worker"], tenant: recovery.tenantId },
];
async function failure(c: PoolClient, sql: string, args: unknown[], expected: object) {
  await c.query("SAVEPOINT refusal");
  try { await expect(c.query(sql, args), sql).rejects.toMatchObject(expected); }
  finally { await c.query("ROLLBACK TO refusal; RELEASE refusal"); }
}
async function transaction(tenant: string, work: (c: PoolClient) => Promise<void>) {
  const c = await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    await work(c);
  } finally { await c.query("ROLLBACK"); c.release(); }
}
async function counts(c: PoolClient) {
  const result: Record<string, number> = {};
  for (const table of ["extra_escalation_fact", "recovery_message_sink", "audit_event", "action_attempt", "action_outbox"])
    result[table] = Number((await c.query(`SELECT count(*) n FROM app.${table}`)).rows[0].n);
  return result;
}
async function waitForEscalation() {
  while (Date.now() < escalateAfter) await pause(Math.min(1000, escalateAfter - Date.now()));
}

beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  db = await jobDoorsDatabase(true, "0749_lp6d_remaining_routines.sql");
  await installLegacySyntheticPartyFixtures(db.owner);
  // Use existing real domain fixtures before the LP6D cutover, as in lp6d-routines.
  const cluster = { admin: db.owner, runtime: db.runtime } as Cluster;
  world = await chainWorld(cluster);
  slow = await submitted(cluster, world, 40000);
  escalateAfter = Date.now() + 61_500;
  recovery = await seedEvidencePackFixture(db.owner);
  const context = testTenantContext(recovery.tenantId, { membershipId: recovery.memberId });
  const caseId = recovery.caseId, actorRef = `membership:${recovery.memberId}`;
  // The fixture's merchant case has a claim; add the normal opening event.
  await withTenant(db.owner, context, tx => tx.$client.query(`INSERT INTO app.recovery_case_event
    (id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash)
    VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)`,
    [randomUUID(), recovery.tenantId, recovery.jobId, caseId, randomUUID(), createHash("sha256").update(caseId).digest("hex")]));
  const packs = new EvidencePackRepository(db.runtime);
  const pack = await packs.generate(context, caseId, { commandId: randomUUID() }, actorRef);
  await packs.approveAttachment(context, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actorRef);
  const messages = new RecoveryMessageRepository(db.runtime), actor = { membershipId: recovery.memberId, actorRef };
  const readiness = (await messages.read(context, caseId)).readiness;
  const preview = (await messages.preview(context, caseId, { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: readiness.caseRevision, packId: readiness.packId! }, actor)).latest!;
  const approved = (await messages.command(context, caseId, { version: "recovery-message-command.v1", commandId: randomUUID(), action: "approve", messageId: preview.id, expectedRevision: preview.revision,
    recipient: preview.message.recipient, body: preview.message.body, amountPence: preview.message.amountPence, packId: preview.message.packId, contentHash: preview.message.contentHash }, actor)).latest!;
  outbox = approved.approval!.outboxActionId;
  await db.owner.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE id=$1", [outbox]);
  // Apply every intervening main migration too; this exercises the actual upgrade order.
  for (const url of MIGRATION_URLS.filter(u => u.pathname.split("/").at(-1)! >= "0749_lp6d_remaining_routines.sql" && u.pathname.split("/").at(-1)! < migration))
    await db.owner.query(await readFile(url, "utf8"));
  bindingPosture = await bindingBoundary();
  upgradeSql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
  await db.owner.query(upgradeSql);
}, 300_000);
afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });

it("refuses a genuinely bound request after its binding expires, although the old probe returns false", async () => {
  await waitForEscalation();
  for (const call of calls()) {
    const actor = await jobDoorsActor(db.owner, call.tenant as ReturnType<typeof randomUUID>);
    const credential = createHash("sha256").update(randomUUID()).digest("hex");
    await testBoundTenantContext(db.owner, actor.tenant, actor.member, credential);
    await db.owner.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '2 seconds' WHERE token_digest=$1", [credential]);
    await transaction(call.tenant, async c => {
      await c.query("SELECT app.bind_request('real',$1,$2)", [credential, actor.tenant]);
      expect((await c.query("SELECT app.lp6d_request_bound() old")).rows[0].old).toBe(true);
      await pause(2200);
      expect((await c.query("SELECT app.lp6d_request_bound() old")).rows[0].old).toBe(false);
      const before = await counts(c);
      await failure(c, call.sql, call.args, refused);
      expect(await counts(c)).toEqual(before);
    });
  }
}, 180_000);

it.each(["live", "expired", "revoked", "delegated", "wrong-tenant"])("refuses %s binding fixtures at BOTH entrypoints with zero writes", async state => {
  await waitForEscalation();
  for (const call of calls()) {
    const actor = await jobDoorsActor(db.owner, call.tenant as ReturnType<typeof randomUUID>);
    if (state === "revoked") await db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [actor.tenant, actor.member]);
    await transaction(call.tenant, async c => {
      const { xid } = (await c.query("SELECT pg_current_xact_id()::text xid")).rows[0];
      // Owner-only synthetic setup, never a runtime table grant. The actual worker
      // call uses the non-owner, non-superuser lp2_login connection throughout.
      await db.owner.query(`INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at,scope_job_id,scope_command_type)
        VALUES((${environment}),$1::xid8,$2,'fictional-presence',$3,$4,clock_timestamp()+$5::interval,$6,$7)`,
        [xid, state === "delegated" ? "customer_portal_delegated" : "real", state === "wrong-tenant" ? randomUUID() : actor.tenant, actor.member,
          state === "expired" ? "-1 second" : "1 hour", state === "delegated" ? randomUUID() : null, state === "delegated" ? "JobSource.customer_message" : null]);
      if (state === "delegated") expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBeNull();
      await failure(c, "SELECT app.lp6e_request_binding_present()", [], { code: "42501", message: "permission denied for function lp6e_request_binding_present" });
      const before = await counts(c);
      await failure(c, call.sql, call.args, refused);
      expect(await counts(c)).toEqual(before);
    });
  }
}, 180_000);

it("keeps the unbound queue worker positive paths, retries and transaction rollback", async () => {
  await waitForEscalation();
  await transaction(world.p.tenantId, async c => {
    await failure(c, "SELECT app.lp6e_request_binding_present()", [], { code: "42501", message: "permission denied for function lp6e_request_binding_present" });
    expect((await c.query(calls()[0]!.sql)).rows.filter(r => r.request_id === slow.requestId)).toHaveLength(1);
    expect((await c.query(calls()[0]!.sql)).rows).toEqual([]);
    expect(Number((await c.query("SELECT count(*) n FROM app.extra_escalation_fact WHERE request_id=$1", [slow.requestId])).rows[0].n)).toBe(1);
  });
  expect((await db.owner.query("SELECT 1 FROM app.extra_escalation_fact WHERE request_id=$1", [slow.requestId])).rows).toEqual([]);
  await transaction(recovery.tenantId, async c => {
    await c.query(calls()[1]!.sql, calls()[1]!.args);
    expect(Number((await c.query("SELECT count(*) n FROM app.recovery_message_sink WHERE outbox_action_id=$1", [outbox])).rows[0].n)).toBe(1);
    await failure(c, calls()[1]!.sql, calls()[1]!.args, { code: "23505" });
    expect(Number((await c.query("SELECT count(*) n FROM app.recovery_message_sink WHERE outbox_action_id=$1", [outbox])).rows[0].n)).toBe(1);
  });
  expect((await db.owner.query("SELECT 1 FROM app.recovery_message_sink WHERE outbox_action_id=$1", [outbox])).rows).toEqual([]);
  expect((await db.owner.query("SELECT status FROM app.action_outbox WHERE id=$1", [outbox])).rows[0].status).toBe("executing");
}, 180_000);

it("does not grant business or binding-store authority merely because a worker is unbound", async () => {
  await transaction(recovery.tenantId, async c => {
    await failure(c, "SELECT * FROM control_plane.request_binding", [], { code: "42501" });
    await failure(c, "SELECT app.lp6d_share_sink_authorization_worker($1,$2)", [recovery.tenantId, outbox], { code: "42501" });
    await failure(c, "SELECT app.lp6d_xa_escalate()", [], { code: "42501" });
    for (const tenant of [randomUUID(), "", "malformed"]) {
      await c.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      await failure(c, calls()[1]!.sql, calls()[1]!.args, { code: "23514" });
    }
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [recovery.tenantId]);
    await failure(c, calls()[1]!.sql, [outbox, ""], { code: "23514" });
    await failure(c, calls()[1]!.sql, [randomUUID(), "fictional"], { code: "23514" });
  });
});

it("retains expired approval refusals and their zero-write result", async () => {
  const owner = await db.owner.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("SET LOCAL session_replication_role=replica");
    await owner.query("UPDATE app.action_authorization SET expires_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT authorization_id FROM app.action_outbox WHERE id=$1)", [outbox]);
    await owner.query("SET LOCAL session_replication_role=origin");
    // Same transaction sees the fixture alteration; worker is still called as runtime.
    await owner.query("SET LOCAL ROLE jobguard_runtime");
    await owner.query("SELECT set_config('app.tenant_id',$1,true)", [recovery.tenantId]);
    const before = await counts(owner);
    await failure(owner, calls()[1]!.sql, calls()[1]!.args, { code: "23514" });
    expect(await counts(owner)).toEqual(before);
  } finally { await owner.query("ROLLBACK"); owner.release(); }
});

it("pins installed helper metadata/hash and upgrades with an already-installed identical helper", async () => {
  const before = (await db.owner.query("SELECT pg_get_functiondef('app.lp6e_request_binding_present()'::regprocedure) definition")).rows[0].definition as string;
  // The helper now exists exactly as LP-6e may have installed it. Reapplication
  // must retain its definition, owner, grants, and all existing worker guarantees.
  await db.owner.query(upgradeSql);
  const row = (await db.owner.query(`SELECT pg_get_functiondef(p.oid) definition,r.rolname owner,p.prosecdef,p.proconfig,
    has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
    has_function_privilege('jobguard_identity',p.oid,'EXECUTE') identity,
    has_function_privilege('jobguard_migration',p.oid,'EXECUTE') migration
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='app.lp6e_request_binding_present()'::regprocedure`)).rows[0];
  expect(row).toMatchObject({ definition: before, owner: "jobguard_binding_owner", prosecdef: true, proconfig: ["search_path=pg_catalog"], runtime: false, identity: false, migration: true });
  expect(await bindingBoundary()).toEqual(bindingPosture);
  const acl = (await db.owner.query(`SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,
    a.privilege_type privilege,a.is_grantable grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid='app.lp6e_request_binding_present()'::regprocedure ORDER BY grantee`)).rows;
  expect(acl).toEqual([
    { grantee: "jobguard_binding_owner", privilege: "EXECUTE", grantable: false },
    { grantee: "jobguard_migration", privilege: "EXECUTE", grantable: false },
  ]);
  const callers = (await db.owner.query(`SELECT n.nspname||'.'||p.proname name,r.rolname owner,p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.prosrc LIKE '%app.lp6e_request_binding_present()%'
    ORDER BY name`)).rows;
  expect(callers).toEqual([
    { name: "app.lp6d_escalate_overdue_worker", owner: "jobguard_migration", prosecdef: true },
    { name: "app.lp6d_recovery_message_sink_worker", owner: "jobguard_migration", prosecdef: true },
  ]);
  await transaction(recovery.tenantId, async c => {
    await failure(c, "SET ROLE jobguard_migration", [], { code: "42501" });
    await failure(c, "SET ROLE jobguard_binding_owner", [], { code: "42501" });
    await failure(c, "SELECT app.lp6e_request_binding_present()", [], { code: "42501", message: "permission denied for function lp6e_request_binding_present" });
  });
  for (const change of proof.lp0.filter(r => r.section === "routines")) {
    const after = change.after as { identity: string; definitionSha256: string };
    const definition = (await db.owner.query("SELECT pg_get_functiondef($1::regprocedure) definition", [after.identity.slice("function:".length)])).rows[0].definition as string;
    expect(createHash("sha256").update(definition).digest("hex")).toBe(after.definitionSha256);
  }
  await transaction(recovery.tenantId, async c => {
    const { xid } = (await c.query("SELECT pg_current_xact_id()::text xid")).rows[0];
    await db.owner.query(`INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at)
      VALUES((${environment})||':foreign',$1::xid8,'real','foreign-environment',$2,$3,clock_timestamp()+interval '1 hour'),
        ((${environment}),($1::xid8::text::bigint+1000000)::text::xid8,'real','foreign-xid',$2,$3,clock_timestamp()+interval '1 hour')`, [xid, recovery.tenantId, recovery.memberId]);
    await c.query(calls()[1]!.sql, calls()[1]!.args);
    expect(Number((await c.query("SELECT count(*) n FROM app.recovery_message_sink WHERE outbox_action_id=$1", [outbox])).rows[0].n)).toBe(1);
    await failure(c, "SELECT app.lp6e_request_binding_present()", [], { code: "42501", message: "permission denied for function lp6e_request_binding_present" });
  });
});

// Fresh-install path also preserves the original production-mode refusal.
it("fresh installs retain worker mode and role refusals", async () => {
  const fresh = await jobDoorsDatabase();
  try {
    const c = await fresh.runtime.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id',$1,true)", [randomUUID()]);
      await failure(c, "SELECT app.lp6e_request_binding_present()", [], { code: "42501", message: "permission denied for function lp6e_request_binding_present" });
      for (const call of calls()) await failure(c, call.sql, call.args, { code: "42501", message: "MODE_FORBIDDEN" });
    } finally { await c.query("ROLLBACK"); c.release(); }
    for (const role of ["jobguard_identity", "jobguard_infrastructure", "jobguard_shadow"]) {
      expect((await fresh.owner.query("SELECT has_function_privilege($1,'app.lp6d_recovery_message_sink_worker(uuid,text)','EXECUTE') allowed", [role])).rows[0].allowed).toBe(false);
    }
  } finally { await fresh.close(); }
}, 300_000);
