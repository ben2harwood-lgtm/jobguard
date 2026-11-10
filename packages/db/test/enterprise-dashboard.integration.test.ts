import { testActorContext } from "./tenant-context-test-utils.js";
// Real PostgreSQL acceptance. NOT RUN in the builder sandbox: localhost/PostgreSQL unavailable.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dashboardFactsV1, projectEnterpriseDashboard } from "@jobguard/core";
import { ExtraApprovalRepository, ExtraRepository, SiteExtraRepository, SiteVisitRepository, contractorSessionContext, withTenant } from "../src/index.js";
import { EnterpriseDashboardRepository } from "../src/enterprise-dashboard-repository.js";
import { enterpriseDashboardSourceSql, enterpriseDashboardScopeLockSql } from "../src/enterprise-dashboard-queries.js";
import { chainWorld, submitted, approveInput, cluster, command, type Cluster } from "./extra-approval-chain-fixtures.js";
import { world as billingWorld } from "./contractor-billing-fixtures.js";
import { direct } from "./site-extra-fixtures.js";
vi.setConfig({ testTimeout: 120000, hookTimeout: 240000 });
let c: Cluster;
const query = { version: "enterprise-dashboard-query.v1", from: "2000-01-01T00:00:00Z", until: "2099-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await cluster(); });
afterAll(async () => { await c?.close(); });
/** Session fixture only: no commercial facts are owner-inserted. Application and SQL still resolve the stored session. */
async function session(w: Awaited<ReturnType<typeof chainWorld>>, member = w.members.supervisor.member) {
  const value = randomUUID(), digest = createHash("sha256").update(value).digest("hex");
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`, [randomUUID(), member.tenantId, member.membershipId, member.identityUserId, digest]);
  return value;
}
async function read(s: string, q: unknown = query) {
  const context = await contractorSessionContext(c.runtime, s);
  return new EnterpriseDashboardRepository(c.runtime).read(context, s, q);
}
describe("ENT-9B scoped persisted reads", () => {
  it("[LATER-SAFETY-58] Friday working-day waits show Tuesday at the same London time, matching the queue deadline", async () => {
    const { demoRules, reviseRules } = await import("./extra-approval-chain-fixtures.js");
    const w = await chainWorld(c), s = await session(w), rules = structuredClone(demoRules);
    rules.bands[0]!.steps[0]!.waitWorkingDays = 2;
    await reviseRules(c, w, rules);
    const pending = await submitted(c, w, 10000);
    // Owner-only clock fixture: Friday 14:00 London crosses the spring DST weekend.
    const owner = await c.admin.connect();
    try {
      await owner.query("BEGIN");
      await owner.query("ALTER TABLE app.extra_approval_request DISABLE TRIGGER immutable");
      await owner.query("UPDATE app.extra_approval_request SET server_recorded_at='2026-03-27T14:00:00Z' WHERE id=$1", [pending.requestId]);
      await owner.query("ALTER TABLE app.extra_approval_request ENABLE TRIGGER immutable");
      await owner.query("COMMIT");
    } catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }
    expect((await c.runtime.query("SELECT has_function_privilege(current_user,'app.xa_wait_deadline(timestamptz,jsonb)','EXECUTE') allowed")).rows[0].allowed).toBe(true);
    const context = await contractorSessionContext(c.runtime, s);
    await withTenant(c.runtime, context, async db => {
      await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
      const facts = dashboardFactsV1.parse((await db.$client.query(enterpriseDashboardSourceSql, [s, context.tenantId])).rows[0].facts);
      const expected = (await db.$client.query(`SELECT requirement->'steps'->0 step,
        to_char(app.xa_wait_deadline(server_recorded_at,requirement->'steps'->0) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') deadline
        FROM app.extra_approval_request WHERE id=$1`, [pending.requestId])).rows[0];
      expect(expected.step.waitWorkingDays).toBe(2);
      expect(expected.deadline).toBe("2026-03-31T13:00:00.000000Z");
      expect(facts.extras.find(extra => extra.extraId === pending.extraId)!.steps).toMatchObject([{ dueAt: expected.deadline, outcome: "pending" }]);
    });
  });
  it("[LATER-SAFETY-58] old snapshots without working-day waits retain their elapsed-minute deadline", async () => {
    const w = await chainWorld(c), s = await session(w), pending = await submitted(c, w, 10000);
    // Owner-only predecessor snapshot and clock fixture; runtime cannot rewrite immutable requests.
    const owner = await c.admin.connect();
    try {
      await owner.query("BEGIN");
      await owner.query("ALTER TABLE app.extra_approval_request DISABLE TRIGGER immutable");
      await owner.query(`UPDATE app.extra_approval_request SET server_recorded_at='2026-03-27T14:00:00Z',
        requirement=requirement #- '{steps,0,waitWorkingDays}' WHERE id=$1`, [pending.requestId]);
      await owner.query("ALTER TABLE app.extra_approval_request ENABLE TRIGGER immutable");
      await owner.query("COMMIT");
    } catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }
    const context = await contractorSessionContext(c.runtime, s);
    await withTenant(c.runtime, context, async db => {
      await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
      const facts = dashboardFactsV1.parse((await db.$client.query(enterpriseDashboardSourceSql, [s, context.tenantId])).rows[0].facts);
      const expected = (await db.$client.query(`SELECT requirement->'steps'->0 step,
        to_char((server_recorded_at+((requirement->'steps'->0->>'timeLimitMinutes')::integer*interval '1 minute')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') deadline
        FROM app.extra_approval_request WHERE id=$1`, [pending.requestId])).rows[0];
      expect(expected.step).not.toHaveProperty("waitWorkingDays");
      expect(expected.step.timeLimitMinutes).toBe(1);
      expect(expected.deadline).toBe("2026-03-27T14:01:00.000000Z");
      expect(facts.extras.find(extra => extra.extraId === pending.extraId)!.steps).toMatchObject([{ dueAt: expected.deadline, outcome: "pending" }]);
    });
  });
  it.each([false, true])("[LATER-SAFETY-22] dashboard and xa_queue share weekend deadlines (legacy snapshot: %s)", async legacy => {
    const w = await chainWorld(c), s = await session(w);
    const { demoRules, reviseRules } = await import("./extra-approval-chain-fixtures.js");
    const rules = structuredClone(demoRules);
    // An absent field in a new rule defaults to two working days in xa_requirement.
    for (const band of rules.bands) for (const step of band.steps) delete step.waitWorkingDays;
    await reviseRules(c, w, rules);
    const pending = await submitted(c, w, 10000);
    // Owner-only historical clock/snapshot fixture; runtime cannot edit immutable requests.
    const owner = await c.admin.connect();
    try {
      await owner.query("BEGIN");
      await owner.query("ALTER TABLE app.extra_approval_request DISABLE TRIGGER immutable");
      await owner.query(`UPDATE app.extra_approval_request SET server_recorded_at='2026-11-06T14:00:00Z',
        requirement=CASE WHEN $2 THEN jsonb_set(requirement,'{steps,0}',(requirement->'steps'->0)-'waitWorkingDays') ELSE requirement END
        WHERE id=$1`, [pending.requestId, legacy]);
      await owner.query("ALTER TABLE app.extra_approval_request ENABLE TRIGGER immutable");
      await owner.query("COMMIT");
    } catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }
    const context = await contractorSessionContext(c.runtime, s);
    const facts = await withTenant(c.runtime, context, async db => {
      await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
      const row = (await db.$client.query(enterpriseDashboardSourceSql, [s, context.tenantId])).rows[0];
      expect(row.authorized).toBe(true);
      return dashboardFactsV1.parse(row.facts);
    });
    const extra = facts.extras.find(extra => extra.extraId === pending.extraId)!;
    const deadline = (await c.admin.query(`SELECT app.xa_wait_deadline(server_recorded_at,requirement->'steps'->0) due
      FROM app.extra_approval_request WHERE id=$1`, [pending.requestId])).rows[0].due.toISOString();
    expect(deadline).toBe(legacy ? "2026-11-06T14:01:00.000Z" : "2026-11-10T14:00:00.000Z");
    expect(extra.steps).toHaveLength(1);
    expect(new Date(extra.steps[0]!.dueAt!).toISOString()).toBe(deadline);
    const queued = await withTenant(c.runtime, context, async db => (await db.$client.query(
      "SELECT q.*,clock_timestamp()>=$2::timestamptz expected_overdue FROM app.xa_queue($1) q WHERE request_id=$3",
      [w.members.supervisor.member.membershipId, deadline, pending.requestId])).rows);
    expect(queued).toHaveLength(1);
    expect(queued[0].overdue).toBe(queued[0].expected_overdue);
    // Replay the SQL deadline at fixed observation times with a matching synthetic capture clock.
    const clockedFacts = { ...facts, extras: [{ ...extra, capturedAt: "2026-11-06T13:00:00Z" }] };
    // Between the old minute deadline and Tuesday, only the old snapshot is overdue.
    const weekend = projectEnterpriseDashboard({ ...clockedFacts, cutoff: "2026-11-07T14:00:00Z" }, query);
    expect(weekend.totals.overdue.count).toBe(legacy ? 1 : 0);
    const afterDeadline = projectEnterpriseDashboard({ ...clockedFacts, cutoff: "2026-11-10T14:01:00Z" }, query);
    expect(afterDeadline.totals.overdue.count).toBe(1);
    const other = await chainWorld(c);
    const foreignContext = await contractorSessionContext(c.runtime, await session(other));
    await expect(new EnterpriseDashboardRepository(c.runtime).read(foreignContext, s, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("[E9-02] counts command-created active duplicate groups once and restores two captures after an authorized unlink", async () => {
    const w = await chainWorld(c), s = await session(w), repo = new ExtraRepository(c.runtime);
    const a = await repo.raiseExtra(await testActorContext(c.admin, w.ctx, w.members.operative.member), direct(w, w.members.operative)), b = await repo.raiseExtra(await testActorContext(c.admin, w.ctx, w.members.operative.member), direct(w, w.members.operative));
    expect((await read(s)).report.totals.captured.count).toBe(2);
    const link = await new ExtraApprovalRepository(c.runtime).markDuplicate(await testActorContext(c.admin, w.ctx, w.members.supervisor.member), w.members.supervisor.member, { version: "mark-duplicate.v1", commandId: randomUUID(), jobId: w.jobId, duplicateId: b.variationId, canonicalId: a.variationId });
    const grouped = await read(s);
    expect(grouped.report.totals.captured.count).toBe(1);
    expect(grouped.report.contributions.find(c => c.stage === "captured")?.extraIds.slice().sort()).toEqual([a.variationId, b.variationId].sort());
    await repo.unlinkDuplicate(await testActorContext(c.admin,w.ctx,w.members.supervisor.member), { version: "extra-duplicate-unlink.v1", commandId: randomUUID(), jobId: w.jobId, actorMembershipId: w.members.supervisor.member.membershipId, linkId: link.linkId, expectedRevision: 1, reasonCode: "linked_in_error" });
    expect((await read(s)).report.totals.captured.count).toBe(2);
  });
  it("[E9-01 E9-03 E9-07] reads command-created captures, current approvals and immutable deadlines; billing stays held", async () => {
    const w = await chainWorld(c), s = await session(w), pending = await submitted(c, w, 10000);
    const before = await read(s);
    expect(before.report.totals.captured.count).toBeGreaterThan(0);
    expect(before.report.totals.backlog.count).toBeGreaterThan(0);
    await new ExtraApprovalRepository(c.runtime).approveExtraStep(await testActorContext(c.admin, w.ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput(pending, 0));
    const after = await read(s);
    expect(after.report.totals.approved.known.pence).toBe(10000);
    expect(after.report.contributions.some(row => row.extraIds.includes(pending.extraId) && row.stage === "approved")).toBe(true);
    expect(after.report.billing.status).toBe("held");
    expect(after.report.totals.paid).toBeNull();
  });
  it("[E9-09 E9-10 E9-11 E9-13] applies covering dashboard grants and tenant scope before all output", async () => {
    const a = await chainWorld(c), b = await chainWorld(c);
    const ae = await new ExtraRepository(c.runtime).raiseExtra(await testActorContext(c.admin, a.ctx, a.members.operative.member), direct(a, a.members.operative));
    const be = await new ExtraRepository(c.runtime).raiseExtra(await testActorContext(c.admin, b.ctx, b.members.operative.member), direct(b, b.members.operative));
    const sa = await session(a), sb = await session(b);
    const [ar, br] = await Promise.all([read(sa), read(sb)]);
    expect(JSON.stringify(ar)).toContain(ae.variationId);
    expect(JSON.stringify(ar)).not.toContain(be.variationId);
    expect(JSON.stringify(br)).not.toContain(ae.variationId);
    for (const role of ["owner", "admin", "operative", "finance", "client_approver"] as const) {
      const s = await session(a, role === "owner" ? a.p : a.members[role].member);
      await expect(read(s)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    for (const operative of [b.members.operative.member.membershipId, randomUUID()])
      await expect(read(sa, { ...query, filters: { operative } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("[E9-12 E9-15] revocation takes effect on the next request and a session cannot choose a foreign context", async () => {
    const w = await chainWorld(c), other = await chainWorld(c), s = await session(w);
    const foreignContext = await contractorSessionContext(c.runtime, await session(other));
    await expect(new EnterpriseDashboardRepository(c.runtime).read(foreignContext, s, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await read(s);
    await command(c, w, { kind: "grant.revoke", grantId: w.members.supervisor.grant });
    await expect(read(s)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("[E9-10 E9-12] a reassigned operative disappears even while the old job remains in scope; unrelated grants cannot supply scope", async () => {
    const w = await chainWorld(c), s = await session(w);
    const extra = await new ExtraRepository(c.runtime).raiseExtra(await testActorContext(c.admin, w.ctx, w.members.operative.member), direct(w, w.members.operative));
    expect(JSON.stringify(await read(s))).toContain(extra.variationId);
    await command(c, w, { kind: "team.move", membershipId: w.members.operative.member.membershipId, fromTeamId: w.demo.teamId, toTeamId: w.otherDemo.teamId });
    expect(JSON.stringify(await read(s))).not.toContain(extra.variationId);
    await command(c, w, { kind: "grant.create", membershipId: w.members.supervisor.member.membershipId, role: "operative", scope: { kind: "team", id: w.otherDemo.teamId }, contractId: null });
    expect(JSON.stringify(await read(s))).not.toContain(extra.variationId);
  });
  it("[E9-08] derives close-out answers from visit commands and does not change job state", async () => {
    const w = await chainWorld(c), s = await session(w), visits = new SiteVisitRepository(c.runtime), actor = w.members.operative.member;
    const started = await visits.startVisit(await testActorContext(c.admin, w.ctx, actor), actor, { commandId: randomUUID(), jobId: w.jobId });
    const before = (await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [w.p.tenantId, w.jobId])).rows;
    await visits.completeVisit(await testActorContext(c.admin, w.ctx, actor), actor, { commandId: randomUUID(), jobId: w.jobId, visitId: started.visitId, closeoutAnswer: "yes" });
    expect((await read(s)).report.closeoutRate).toMatchObject({ status: "computed", numerator: 1, denominator: 1 });
    expect((await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [w.p.tenantId, w.jobId])).rows).toEqual(before);
  });
  it("[E9D] close-out observations cite only covered visits, are replay-stable and disappear after reassignment", async () => {
    const w = await chainWorld(c), other = await chainWorld(c), s = await session(w), visits = new SiteVisitRepository(c.runtime);
    for (const subject of [w, other]) for (let i = 0; i < 5; i++) {
      const actor = subject.members.operative.member;
      const started = await visits.startVisit(await testActorContext(c.admin, subject.ctx, actor), actor, { commandId: randomUUID(), jobId: subject.jobId });
      await visits.completeVisit(await testActorContext(c.admin, subject.ctx, actor), actor, { commandId: randomUUID(), jobId: subject.jobId, visitId: started.visitId, closeoutAnswer: "no" });
    }
    const first = (await read(s)).signals;
    expect(first.observations.filter(o => o.kind === "no_closeout_observation")).toHaveLength(1);
    expect(first.observations[0]!.jobId).toBe(w.jobId);
    const sources = (await c.admin.query("SELECT id FROM app.closeout_answer WHERE tenant_id=$1 ORDER BY id", [w.p.tenantId])).rows.map(r => r.id);
    expect(first.observations[0]!.sourceIds).toEqual(sources);
    expect(JSON.stringify(first)).not.toContain(other.jobId);
    expect((await read(s)).signals).toEqual(first);
    await command(c, w, { kind: "team.move", membershipId: w.members.operative.member.membershipId, fromTeamId: w.demo.teamId, toTeamId: w.otherDemo.teamId });
    const after = (await read(s)).signals;
    expect(after.observations).toEqual([]);
    for (const source of sources) expect(JSON.stringify(after)).not.toContain(source);
  });
  it("[E9-14 E9-26 E9-28 E9-31] reads and observations preserve canonical business rows and give runtime no new privilege", async () => {
    const w = await chainWorld(c), s = await session(w);
    await new SiteExtraRepository(c.runtime).logSorSiteExtra(await testActorContext(c.admin, w.ctx, w.members.operative.member), w.members.operative.member, { commandId: randomUUID(), jobId: w.jobId, sorCode: "REPAIR-DOOR", quantity: "3", note: "Fictional ENT3A note canary" });
    const snapshot = async () => {
      const out: Record<string, unknown> = {};
      const tables = (await c.admin.query<{ table_name: string }>(`SELECT p.tablename table_name FROM pg_tables p JOIN information_schema.columns c
        ON(c.table_schema,c.table_name,c.column_name)=(p.schemaname,p.tablename,'tenant_id') WHERE p.schemaname='app' ORDER BY p.tablename`)).rows;
      for (const { table_name: table } of tables) {
        const quoted = '"' + table.replaceAll('"', '""') + '"';
        out[table] = (await c.admin.query(`SELECT row_to_json(t)::text bytes FROM app.${quoted} t WHERE tenant_id=$1 ORDER BY row_to_json(t)::text`, [w.p.tenantId])).rows;
      }
      expect(out.variation).toEqual(expect.arrayContaining([expect.anything()]));
      expect(out.extra_origin).toEqual(expect.arrayContaining([expect.anything()]));
      return out;
    };
    const before = await snapshot(), result = await read(s);
    expect(result.signals.observations.some(o => o.kind === "order_matches_unlinked_extra")).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("fictional.invalid");
    expect(JSON.stringify(result)).not.toContain(s);
    expect(JSON.stringify(result)).not.toContain("Fictional ENT3A note canary");
    const context = await contractorSessionContext(c.runtime, s);
    await expect(withTenant(c.runtime, context, async db => db.$client.query("UPDATE app.extra_origin SET kind='office_entry' WHERE tenant_id=$1", [w.p.tenantId]))).rejects.toMatchObject({ code: "42501" });
    const role = (await c.runtime.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

// ENT-9E: real command-created stored facts, not owner-inserted billing rows. Runs in CI.
it("[E9E] a billed variation matched to a JobGuard extra has no missing-extra advisory", async () => {
  const own = await billingWorld(c), s = await session(own.w);
  await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput([await own.invoice()]));
  const context = await contractorSessionContext(c.runtime, s), repo = new EnterpriseDashboardRepository(c.runtime);
  const before = await repo.readBilling(context, s, query);
  expect(before.totals.billed.known.pence).toBe(24000);
  const activity = await read(s);
  expect(activity.signals.billing.status).toBe("supplied_stored_facts");
  expect(activity.signals.observations.filter(o => o.kind === "billed_variation_without_extra")).toEqual([]);
  expect(await repo.readBilling(context, s, query)).toEqual(before);
});

it("[E9E] original orders stay silent and unrelated credits cannot erase a possible variation", async () => {
  const own = await billingWorld(c), s = await session(own.w);
  const original = { externalInvoiceLineId: "order-only", kind: "original_order", existedAt: "2026-10-01T00:00:00Z",
    netPence: 100000, vatPence: 20000, grossPence: 120000, match: null };
  const amount = { netPence: 100000, vatPence: 20000, grossPence: 120000 };
  const orderInvoice = own.event("invoiced", { invoiceNumber: "FICTIONAL-ORDER-ONLY", amount,
    composition: { declared: amount, lines: [original] } });
  await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput([orderInvoice]));
  expect((await read(s)).signals.observations.filter(o => o.kind === "billed_variation_without_extra")).toEqual([]);

  const raw = await own.invoice();
  const composition = raw.composition as { declared: unknown; lines: unknown[] };
  const invoice = { ...raw, amount: { netPence: 124100, vatPence: 24820, grossPence: 148920 },
    composition: { declared: { netPence: 124100, vatPence: 24820, grossPence: 148920 }, lines: [...composition.lines,
      { ...original, externalInvoiceLineId: "possible-variation", kind: "other", netPence: 100, vatPence: 20, grossPence: 120 }] } };
  await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput([invoice]));
  const observations = (await read(s)).signals.observations.filter(o => o.kind === "billed_variation_without_extra");
  expect(observations).toHaveLength(1);
  const credit = own.event("credited", { originalEventId: invoice.sourceEventId,
    effectiveAt: "2026-10-03T12:00:00Z", amount,
    lineAdjustments: [{ externalInvoiceLineId: "order", ...amount }] });
  await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput([credit]));

  // Snapshot every tenant-owned business table, including fees, prices and meter records.
  // The dashboard must perform no business writes even when it returns this advisory.
  const snapshot = async () => {
    const tables = (await c.admin.query<{ tablename: string }>(`SELECT p.tablename FROM pg_tables p
      JOIN information_schema.columns col ON (col.table_schema,col.table_name,col.column_name)=(p.schemaname,p.tablename,'tenant_id')
      WHERE p.schemaname='app' ORDER BY p.tablename`)).rows;
    const rows: Record<string, unknown> = {};
    for (const { tablename } of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      rows[tablename] = (await c.admin.query(`SELECT row_to_json(t)::text bytes FROM app.${quoted} t WHERE tenant_id=$1 ORDER BY row_to_json(t)::text`, [own.w.p.tenantId])).rows;
    }
    return rows;
  };
  const before = await snapshot();
  const result = await read(s);
  const remaining = result.signals.observations.filter(o => o.kind === "billed_variation_without_extra");
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).toMatchObject({ jobId: own.s.jobId, extraIds: [] });
  // A new allocation run legitimately changes the citation, but never the invoice fact.
  expect(remaining[0]!.sourceIds.filter(id => observations[0]!.sourceIds.includes(id))).toHaveLength(1);
  expect(remaining[0]!.sourceIds).toHaveLength(2);
  expect((await read(s)).signals.observations).toEqual(result.signals.observations);
  const context = await contractorSessionContext(c.runtime, s);
  expect((await new EnterpriseDashboardRepository(c.runtime).readBilling(context, s, query)).totals.billed.known.pence).toBe(24000);
  expect(await snapshot()).toEqual(before);
});
it("[E9E] unmatched other invoice lines are advisory, scoped, replay-stable and removed by current credits/rejections", async () => {
  const a = await billingWorld(c), b = await billingWorld(c);
  const sa = await session(a.w), sb = await session(b.w);
  const imported: { own: typeof a; invoice: Record<string, unknown> }[] = [];
  for (const own of [a, b]) {
    const raw = await own.invoice();
    const composition = raw.composition as { declared: { netPence: number; vatPence: number; grossPence: number }; lines: unknown[] };
    const amount = { netPence: 124100, vatPence: 24820, grossPence: 148920 };
    const invoice = { ...raw, amount, composition: { declared: amount, lines: [...composition.lines,
      { externalInvoiceLineId: "unmatched-other", kind: "other", existedAt: "2026-10-01T00:00:00Z", netPence: 100, vatPence: 20, grossPence: 120, match: null }] } };
    await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput([invoice]));
    imported.push({ own, invoice });
  }
  const first = (await read(sa)).signals;
  const missingExtras = first.observations.filter(o => o.kind === "billed_variation_without_extra");
  expect(missingExtras).toHaveLength(1);
  const observation = missingExtras[0]!;
  expect(observation).toMatchObject({ jobId: a.s.jobId, extraIds: [] });
  expect(observation.sourceIds).toHaveLength(2);
  expect(JSON.stringify(first)).not.toContain(b.s.jobId);
  expect(JSON.stringify((await read(sb)).signals)).not.toContain(a.s.jobId);
  await a.repo.import(a.ctx, a.session, a.s.jobId, a.importInput([imported[0]!.invoice]));
  expect((await read(sa)).signals.observations).toEqual(first.observations);
  // The advisory never changes the authoritative matched-extra billing, fee base or job state.
  const authoritative = await a.repo.read(a.ctx, a.session, a.s.jobId);
  const context = await contractorSessionContext(c.runtime, sa), repo = new EnterpriseDashboardRepository(c.runtime);
  const activityFacts = await withTenant(c.runtime, context, async db => {
    await db.$client.query(enterpriseDashboardScopeLockSql, [context.tenantId]);
    const row = (await db.$client.query(enterpriseDashboardSourceSql, [sa, context.tenantId])).rows[0];
    expect(row.authorized).toBe(true);
    return dashboardFactsV1.parse(row.facts);
  });
  const billed = await repo.readBilling(context, sa, query), activity = await read(sa);
  expect(billed.totals.billed.known.pence).toBe(24000); // The unmatched 100p never enters this total.
  expect(billed.contributions.filter(row => row.stage === "billed").map(row => row.extraId)).toEqual([a.s.extraId]);
  expect(await repo.readBilling(context, sa, query)).toEqual(billed);
  // Each SELECT has a fresh cutoff, which legitimately changes both report hashes.
  // Compare every field against the original facts at that read's cutoff instead.
  for (const report of [activity.report, (await read(sa)).report])
    expect(report).toEqual(projectEnterpriseDashboard({ ...activityFacts, cutoff: report.cutoff }, query));
  expect(await a.repo.read(a.ctx, a.session, a.s.jobId)).toEqual(authoritative);
  for (const [i, type] of ["credited", "rejected"].entries()) {
    const { own, invoice } = imported[i]!;
    const adjustment = own.event(type, { effectiveAt: "2026-10-03T12:00:00Z", originalEventId: invoice.sourceEventId,
      amount: { netPence: 100, vatPence: 20, grossPence: 120 },
      lineAdjustments: [{ externalInvoiceLineId: "unmatched-other", netPence: 100, vatPence: 20, grossPence: 120 }] });
    await own.repo.import(own.ctx, own.session, own.s.jobId, own.importInput([adjustment]));
    expect((await read(i === 0 ? sa : sb)).signals.observations.some(o => o.kind === "billed_variation_without_extra")).toBe(false);
  }
  await command(c, a.w, { kind: "grant.revoke", grantId: a.w.members.supervisor.grant });
  await expect(read(sa)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
