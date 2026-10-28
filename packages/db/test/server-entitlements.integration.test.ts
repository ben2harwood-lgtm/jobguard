import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository, WorkOrderRepository, AuditExportRepository, withTenant } from "../src/index.js";
import { serverEntitlement } from "../src/plan-entitlement-service.js";
import { cluster, startSession, status, unchanged, type Cluster } from "./contractor-entitlement-fixtures.js";
import { currentCommand } from "./contractor-practice-session-fixtures.js";
import { company } from "./practice-worker-switch-fixtures.js";
import { ownerTx, memberSession, track } from "./contractor-retained-read-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); });
const features = ["operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"] as const;
async function decision(f: Awaited<ReturnType<typeof startSession>>, feature: typeof features[number]) {
  return withTenant(c.runtime, f.context, db => serverEntitlement(db, f.p.membershipId, feature));
}
async function invite(f: Awaited<ReturnType<typeof startSession>>) {
  return currentCommand(c, f, { kind: "member.invite", role: "operative", email: `${randomUUID()}@fixture.invalid`, clientId: null, contractId: null,
    scope: { kind: "team", id: (await c.admin.query("SELECT id FROM app.team WHERE tenant_id=$1", [f.p.tenantId])).rows[0].id } });
}
it("MON-8 missing agreement refuses every contractor capability and operative creation with no effects", async () => {
  const f = await startSession(c);
  for (const feature of features) expect(await decision(f, feature)).toMatchObject({ executable: false, entitlement: "held" });
  await unchanged(c, async () => {
    await expect(new ContractorRepository(c.runtime).command(f.p, await invite(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
it("MON-8 cross-company membership cannot receive a grant even with an active agreement", async () => {
  const a = await startSession(c), b = await startSession(c);
  await status(c, a, "active");
  const command = await currentCommand(c, a, { kind: "grant.create", membershipId: b.p.membershipId, role: "operative", contractId: null,
    scope: { kind: "tenant", id: a.p.tenantId } });
  await unchanged(c, () => expect(new ContractorRepository(c.runtime).command(a.p, command)).rejects.toMatchObject({ code: "NOT_FOUND" }));
  await expect(withTenant(c.runtime, a.context, db => serverEntitlement(db, b.p.membershipId, "operative_roles"))).rejects.toThrow("FORBIDDEN");
});
it("MON-8 agreement suspension refuses successful-command replay before looking up its receipt", async () => {
  const f = await startSession(c); await status(c, f, "active");
  const repository = new ContractorRepository(c.runtime), command = await invite(f);
  const first = await repository.command(f.p, command);
  expect(await repository.command(f.p, command)).toEqual(first);
  await status(c, f, "suspended");
  await unchanged(c, () => expect(repository.command(f.p, command)).rejects.toMatchObject({ code: "FORBIDDEN" }));
  for (const feature of features) expect((await decision(f, feature)).executable).toBe(false);
});
it("MON-8 downgrade invalidates cached eligibility while preserving scoped records and order exports", async () => {
  const f = await startSession(c); await status(c, f, "active");
  const repository = new ContractorRepository(c.runtime), query = { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" };
  const before = await repository.query(f.p, query);
  expect((await decision(f, "operative_roles")).executable).toBe(true);
  await track(c, f);
  for (const feature of features) expect(await decision(f, feature)).toMatchObject({ executable: false, entitlement: "excluded" });
  expect(await repository.query(f.p, query)).toEqual(before);
  expect((await new WorkOrderRepository(c.runtime).overview(f.p)).orders).toEqual([]);
  expect(await new AuditExportRepository(c.runtime).list(f.context, { membershipId: f.p.membershipId, identityUserId: f.p.identityUserId })).toEqual([]);
  await unchanged(c, async () => {
    await expect(repository.command(f.p, await invite(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
it("MON-8 a blocked check observes a committed suspension, rather than stale eligibility", async () => {
  const f = await startSession(c); await status(c, f, "active");
  const writer = await c.admin.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await writer.query("BEGIN");
    await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.p.tenantId]);
    pending = decision(f, "work_orders");
    let waiting = false;
    for (let i = 0; i < 200; i++) {
      waiting = (await c.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) waiting")).rows[0].waiting;
      if (waiting) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await writer.query(`INSERT INTO app.contractor_agreement_status_revision
      SELECT tenant_id,$2,assignment_id,2,'suspended',schema_version,environment,clock_timestamp(),$3
      FROM app.contractor_agreement_status_revision WHERE tenant_id=$1`, [f.p.tenantId, randomUUID(), `fictional-fixture:${randomUUID()}`]);
    await writer.query("COMMIT");
    expect(await pending).toMatchObject({ executable: false, entitlement: "held" });
  } finally { await writer.query("ROLLBACK"); writer.release(); await pending; }
});
it("MON-8 real installed guards reference the one service; no public or infrastructure execution grant", async () => {
  const names = ["app.ef_actor", "app.enterprise_baseline_actor", "app.ent3a_extra_authority", "app.practice_worker_switch_decision", "app.practice_worker_switch_on", "app.link_contractor_customer", "app.lp_authority", "app.lp_visit_evaluate", "app.cb_authority", "app.contractor_admin_command", "app.guard_contractor_grant", "app.work_order_begin", "app.work_order_commit", "app.ent4b_origin_provenance", "app.xa_begin", "identity.sso_admin_command", "identity.sso_required_command", "identity.sso_complete"];
  for (const name of names) {
    const [schema, routine] = name.split(".");
    const rows = (await c.admin.query("SELECT pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2", [schema, routine])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].definition).toContain("app.mon8_require_feature");
  }
  expect((await c.admin.query(`SELECT has_function_privilege('jobguard_infrastructure','app.mon8_feature_decision(uuid,text,text)','EXECUTE') allowed,
    EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE p.oid='app.mon8_feature_decision(uuid,text,text)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') public`)).rows[0]).toEqual({ allowed: false, public: false });
});
it("MON-8 an operative email invitation cannot provision after its agreement is suspended", async () => {
  const f=await startSession(c);await status(c,f,"active");
  const digest=randomUUID().replaceAll("-","").repeat(2),email=`${randomUUID()}@invitation.invalid`;
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')",[randomUUID(),f.p.identityUserId,digest,randomUUID()]);
  const invitation=(await c.admin.query("SELECT identity.invite_member($1,$2,$3,'operative') id",[digest,f.p.tenantId,email])).rows[0].id;
  await status(c,f,"suspended");
  const challenge=randomUUID();
  await c.admin.query(`INSERT INTO identity.challenge(id,email,purpose,invitation_id,digest,requested_at,expires_at,consumed_at,verified,delivery_state)
    VALUES($1,$2,'invitation',$3,$4,clock_timestamp(),clock_timestamp()+interval '10 minutes',clock_timestamp(),true,'fixture_delivered')`,[challenge,email,invitation,"a".repeat(64)]);
  const before=(await c.admin.query("SELECT count(*)::int n FROM app.membership WHERE tenant_id=$1",[f.p.tenantId])).rows[0].n;
  expect((await c.admin.query("SELECT identity.provision_verified_challenge($1) user_id",[challenge])).rows[0].user_id).toBeNull();
  expect((await c.admin.query("SELECT count(*)::int n FROM app.membership WHERE tenant_id=$1",[f.p.tenantId])).rows[0].n).toBe(before);
  expect((await c.admin.query("SELECT accepted_at FROM identity.invitation WHERE id=$1",[invitation])).rows[0].accepted_at).toBeNull();
  expect((await c.admin.query("SELECT verified FROM identity.challenge WHERE id=$1",[challenge])).rows[0].verified).toBe(false);
  expect((await c.admin.query("SELECT 1 FROM identity.user_email WHERE email=$1",[email])).rows).toEqual([]);
});

it("MON-8 track reassignment refuses legacy contractor writers while retaining reads and revocations", async () => {
  const f = await company(c);
  const finance = await memberSession(c, f, f.members.finance!);
  const supervisor = await memberSession(c, f, f.members.supervisor!);
  const query = { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" };
  const before = await new ContractorRepository(c.runtime).query(f.p, query);
  // Positive authority controls: this is a real contractor company, finance grant,
  // site job and switchable worker, not a refusal caused by missing membership.
  await ownerTx(c, f.p.tenantId, async db => {
    expect((await db.$client.query("SELECT app.ef_actor($1) actor", [finance.session])).rows[0].actor).toBe(finance.p.membershipId);
    expect((await db.$client.query("SELECT app.enterprise_baseline_actor($1) actor", [finance.session])).rows[0].actor).toBe(finance.p.membershipId);
    expect((await db.$client.query("SELECT decision FROM app.ent3a_extra_authority($1,'LogSiteExtra',$2)", [supervisor.p.membershipId, f.jobId])).rows[0].decision).toBe("allowed");
    expect((await db.$client.query("SELECT decision FROM app.practice_worker_switch_decision($1,$2)", [f.sessionRef, f.members.operative])).rows[0].decision).toBe("allowed");
  });
  const agreement = randomUUID(), deriveCommand = randomUUID(), prepareCommand = randomUUID();
  await ownerTx(c, f.p.tenantId, db => db.$client.query(`INSERT INTO app.enterprise_agreement_version
    (tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-agreement',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01',false,$3,'synthetic_demo','operations:fictional')`,
    [f.p.tenantId, agreement, "c".repeat(64)]));
  const derivation = (await ownerTx(c, f.p.tenantId, db => db.$client.query("SELECT app.ef_derive($1,$2,$3,'2026-10') result", [finance.session, deriveCommand, agreement]))).rows[0].result.derivationId;
  const statement = (await ownerTx(c, f.p.tenantId, db => db.$client.query("SELECT app.ef_prepare_statement($1,$2,'2026-10') result", [finance.session, prepareCommand]))).rows[0].result.statementId;
  const readFees = () => withTenant(c.runtime, finance.context, db => db.$client.query("SELECT app.ef_read($1,$2) derivation,app.ef_read_statement($1,$3) statement", [finance.session, derivation, statement]));
  const feesBefore = (await readFees()).rows;
  await track(c, f);
  expect((await readFees()).rows).toEqual(feesBefore);
  const command = randomUUID(), subject = statement;
  const calls: [string, unknown[]][] = [
    ["SELECT app.ef_actor($1)", [finance.session]],
    ["SELECT app.ef_derive($1,$2,$3,'2026-10')", [finance.session, deriveCommand, agreement]],
    ["SELECT app.ef_prepare_statement($1,$2,'2026-10')", [finance.session, prepareCommand]],
    ["SELECT app.ef_approve_statement($1,$2,$3,$4,0,clock_timestamp()+interval '1 hour')", [finance.session, command, subject, "a".repeat(64)]],
    ["SELECT app.ef_dispute_statement($1,$2,$3,'fixture')", [finance.session, command, subject]],
    ["SELECT app.enterprise_baseline_actor($1)", [finance.session]],
    ["SELECT app.enterprise_baseline_import($1,'{}','fixture','[]'::jsonb)", [finance.session]],
    ["SELECT * FROM app.ent3a_extra_authority($1,'LogSiteExtra',$2)", [supervisor.p.membershipId, f.jobId]],
    ["SELECT * FROM app.ent3d_record_resident_confirmation($1,$2,$3,$4,'Fictional extra','Fictional note',$5,$6)", [supervisor.p.membershipId, f.jobId, command, subject, randomUUID(), "a".repeat(64)]],
    ["SELECT * FROM app.practice_worker_switch_decision($1,$2)", [f.sessionRef, f.members.operative]],
    ["SELECT app.practice_worker_switch_on($1,$2,$3)", [f.session, command, f.members.operative]],
    // Writers using contractor_allowed / contractor_job_allowed retain scope
    // checks, but may no longer treat that membership-only scope as entitlement.
    ["SELECT app.link_contractor_customer($1,$2,$3::jsonb)", [f.p.membershipId, f.demo.clientId, JSON.stringify({ environment: "synthetic_demo" })]],
    ["SELECT app.lp_authority($1,$2,'confirm')", [supervisor.session, f.jobId]],
    ["SELECT app.lp_visit_evaluate($1,$2,$3)", [supervisor.p.membershipId, f.jobId, command]],
    ["SELECT app.cb_authority($1,$2,true)", [finance.session, f.jobId]],
  ];
  await unchanged(c, async () => {
    for (const [sql, args] of calls) {
      // Use the owner only for private helper coverage; each routine must refuse
      // on entitlement, before malformed/missing business input can hide a bypass.
      await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql, args)), sql).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
    }
  });
  expect(await new ContractorRepository(c.runtime).query(f.p, query)).toEqual(before);
  const grant = (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2", [f.p.tenantId, f.members.second])).rows[0].id;
  const repository = new ContractorRepository(c.runtime);
  await repository.command(f.p, await currentCommand(c, f, { kind: "grant.revoke", grantId: grant }));
  await repository.command(f.p, await currentCommand(c, f, { kind: "membership.revoke", membershipId: f.members.second! }));
  expect((await c.admin.query("SELECT count(*)::int n FROM app.role_grant_revocation WHERE tenant_id=$1 AND grant_id=$2", [f.p.tenantId, grant])).rows[0].n).toBe(1);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.contractor_membership_revocation WHERE tenant_id=$1 AND membership_id=$2", [f.p.tenantId, f.members.second])).rows[0].n).toBe(1);
});
