import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ContractorRepository, northsideFacts, northsideTargets, northsideName, seedNorthsideDemo, type NorthsideSeed } from "../src/index.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { siteExtraContentSha256V1 } from "@jobguard/core";
import { startSession } from "./contractor-practice-session-fixtures.js";
import { photo } from "./site-extra-evidence-fixtures.js";
import { ExtraApprovalRepository, SiteExtraRepository, PracticeWorkerSwitchRepository, northsideApprovalArtifact, northsideExtras, northsideRun, northsideLocalLinks, northsideSettings, registerNorthsideRun, contractorSessionContext, ContractorPracticeSessionRepository, withTenant, verifyAuditChain, type AuthenticatedMembership } from "../src/index.js";

let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("ENT11A-01 the generated contractor is seeded through commands: 3 clients, 40 operatives, 2,000 orders in the month, all counted back from the rows", async () => {
  const session = await startSession(c), owner = session.p;
  const started = Date.now();
  const seed: NorthsideSeed = await seedNorthsideDemo(c.runtime, owner, session.context);
  console.log("seed ms", Date.now() - started);
  const facts = await northsideFacts(c.runtime, owner, session.context);
  expect(facts).toMatchObject({ companyName: northsideName, clients: northsideTargets.clients, operatives: northsideTargets.operatives, ordersThisMonth: northsideTargets.ordersPerMonth, extras: 0 });
  expect(facts.orderValuePence).toBeGreaterThan(0);
  expect(seed.clientIds).toHaveLength(3);
  // Practice data only: every stored address ends in .invalid, and nothing is queued to go out.
  const emails = (await c.admin.query("SELECT email FROM app.contractor_member WHERE tenant_id=$1", [owner.tenantId])).rows.map(r => r.email as string);
  expect(emails.length).toBeGreaterThan(40); expect(emails.every(e => e.endsWith(".invalid"))).toBe(true);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.action_outbox WHERE tenant_id=$1", [owner.tenantId])).rows[0].n).toBe(0);
  // A second call writes nothing.
  const audits = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [owner.tenantId])).rows[0].n;
  expect(await seedNorthsideDemo(c.runtime, owner, session.context)).toEqual(seed);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [owner.tenantId])).rows[0].n).toBe(audits);
}, 600_000);

async function reworkWorld() {
  const f = await startSession(c), seed = await seedNorthsideDemo(c.runtime, f.p, f.context);
  const switches = new PracticeWorkerSwitchRepository(c.runtime), repo = new ExtraApprovalRepository(c.runtime);
  const act = async (target?: string) => {
    if ((await switches.state(f.context, f.session)).state !== "owner") await switches.switchOff(f.context, f.p, f.session, { version: "practice-worker-switch-off.v1", commandId: randomUUID() });
    if (target) await switches.switchOn(f.context, f.p, f.session, { version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: target });
    return new ContractorRepository(c.runtime).resolveSession(f.session);
  };
  const ctx = () => contractorSessionContext(c.runtime, f.session);
  const log = async (jobId: string, actor: AuthenticatedMembership) => {
    const context = await ctx(), image = await photo(c, { ctx: context, jobId });
    const commandId = randomUUID(), description = "Fictional additional clearance", note = "Practice resident shown the generated image";
    const result = await new SiteExtraRepository(c.runtime).logSiteExtra(context, actor, { commandId, jobId, description, note, photoEvidenceId: image.id,
      shownContentSha256: siteExtraContentSha256V1({ jobId, description, note, photoSha256: image.sha256 }) });
    return { commandId, jobId, extraId: result.variationId };
  };
  return { f, seed, act, ctx, log, repo };
}
type ReworkWorld = Awaited<ReturnType<typeof reworkWorld>>;
let world: ReworkWorld;

it("ACTION-ATTRIBUTION durably binds every journey command to the persisted tester, fictional actor and switch, with no delivery attempts", async () => {
  world = await reworkWorld(); const { f, seed, act, ctx, log, repo } = world;
  const op = await act(seed.journey.operativeMembershipId), extra = await log(seed.journey.jobId, op);
  const originBefore = (await c.admin.query("SELECT row_to_json(o)::text bytes FROM app.extra_origin o WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, extra.extraId])).rows;
  const sv = await act(seed.surveyorMembershipId), priceId = randomUUID();
  await repo.priceExtra(await ctx(), sv, { version: "price-extra.v1", commandId: priceId, jobId: extra.jobId, extraId: extra.extraId, netPence: 108000 });
  const sup = await act(seed.supervisorMembershipId), submitId = randomUUID();
  const submitted = await repo.submitExtra(await ctx(), sup, { version: "submit-extra.v1", commandId: submitId, jobId: extra.jobId, extraId: extra.extraId });
  const approveId = randomUUID();
  await repo.approveExtraStep(await ctx(), sup, { version: "approve-extra-step.v1", commandId: approveId, jobId: extra.jobId, requestId: submitted.requestId, stepIndex: 0, revisionHash: submitted.revisionHash, netPence: 108000 });
  await expect(repo.issueClientApproval(await ctx(), sup, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: extra.jobId, requestId: submitted.requestId,
    approverMembershipId: seed.clientApproverMembershipId, recipient: seed.clientApproverEmail, linkToken: "a".repeat(40), expiresAt: new Date(Date.now() + 600000) })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  const owner = await act(), sendId = randomUUID(), token = randomUUID().replaceAll("-", "").repeat(2);
  await repo.issueClientApproval(await ctx(), owner, { version: "issue-client-approval.v1", commandId: sendId, jobId: extra.jobId, requestId: submitted.requestId,
    approverMembershipId: seed.clientApproverMembershipId, recipient: seed.clientApproverEmail, linkToken: token, expiresAt: new Date(Date.now() + northsideSettings.linkLifetimeMinutes * 60000) });
  const replay = await northsideApprovalArtifact(c.runtime, owner, await ctx(), sendId);
  expect(replay).toMatchObject({ jobId: extra.jobId, extraId: extra.extraId, revisionHash: submitted.revisionHash, artifact: { token } });
  const sendRows = await c.admin.query("SELECT row_to_json(r)::text bytes FROM app.command_receipt r WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, sendId]);
  const sendAudits = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows;
  await repo.issueClientApproval(await ctx(), owner, { version: "issue-client-approval.v1", commandId: sendId, jobId: extra.jobId, requestId: submitted.requestId,
    approverMembershipId: seed.clientApproverMembershipId, recipient: replay!.artifact.recipient, linkToken: replay!.artifact.token, expiresAt: new Date(replay!.artifact.expiresAt) });
  expect((await c.admin.query("SELECT row_to_json(r)::text bytes FROM app.command_receipt r WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, sendId])).rows).toEqual(sendRows.rows);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows).toEqual(sendAudits);
  expect(await northsideLocalLinks(c.runtime, owner, await ctx())).toEqual([{ extraId: extra.extraId, recipient: seed.clientApproverEmail, path: `/extra-approval/${extra.jobId}/${submitted.requestId}#t=${token}` }]);
  expect(await northsideLocalLinks(c.runtime, sup, await ctx())).toEqual([]);
  const client = await act(seed.clientApproverMembershipId), decideId = randomUUID();
  await repo.decideClientApproval(await ctx(), client, { version: "decide-client-approval.v1", commandId: decideId, jobId: extra.jobId, requestId: submitted.requestId,
    linkToken: token, email: seed.clientApproverEmail, revisionHash: submitted.revisionHash, netPence: 108000, decision: "approve", fictionalRoleName: "Fictional client approver", actualTesterReference: `membership:${f.p.membershipId}` });
  const ids = [extra.commandId, priceId, submitId, approveId, sendId, decideId];
  const rows = (await c.admin.query(`SELECT a.*,r.status FROM app.northside_action_attribution a JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(a.tenant_id,a.command_id)
    WHERE a.tenant_id=$1 AND a.command_id=ANY($2::uuid[]) ORDER BY array_position($2::uuid[],a.command_id)`, [f.p.tenantId, ids])).rows;
  expect(rows.map(r => r.actor_role)).toEqual(["operative", "surveyor", "supervisor", "supervisor", "owner", "client_approver"]);
  expect(rows.map(r => r.actor_membership_id)).toEqual([op.membershipId, sv.membershipId, sup.membershipId, sup.membershipId, owner.membershipId, client.membershipId]);
  for (const row of rows) {
    expect(row.status).toBe("succeeded"); expect(row.tester_membership_id).toBe(f.p.membershipId); expect(row.tester_identity_user_id).toBe(f.p.identityUserId);
    expect(row.switch_id === null).toBe(row.actor_role === "owner"); expect(row.classification).toBe("demo_settings"); expect(row.settings_version).toBe(northsideSettings.version);
    if (row.switch_id) expect((await c.admin.query("SELECT worker_membership_id FROM control_plane.practice_worker_switch WHERE id=$1", [row.switch_id])).rows[0].worker_membership_id).toBe(row.actor_membership_id);
  }
  expect((await c.admin.query("SELECT row_to_json(o)::text bytes FROM app.extra_origin o WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, extra.extraId])).rows).toEqual(originBefore);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1", [f.p.tenantId])).rows[0].n).toBe(0);
  expect((await c.admin.query("SELECT adapter,status FROM app.action_outbox WHERE tenant_id=$1", [f.p.tenantId])).rows).toEqual([{ adapter: "fake_email", status: "pending" }]);
  // A cached fictional actor cannot create a command while the trusted session is acting as somebody else.
  await expect(repo.priceExtra(await ctx(), sv, { version: "price-extra.v1", commandId: randomUUID(), jobId: extra.jobId, extraId: extra.extraId, netPence: 108000 })).rejects.toBeDefined();
  const currentActor = await new ContractorRepository(c.runtime).resolveSession(f.session);
  expect(currentActor.membershipId).toBe(client.membershipId);
  await act(seed.surveyorMembershipId);
  await repo.priceExtra(await ctx(), sv, { version: "price-extra.v1", commandId: priceId, jobId: extra.jobId, extraId: extra.extraId, netPence: 108000 });
  expect((await c.admin.query("SELECT * FROM app.northside_action_attribution WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, priceId])).rows[0].switch_id).toBe(rows[1].switch_id);
}, 600_000);

it("CLIENT-ISOLATION permits a second client's own extra and denies cross-client presentation, view and decision", async () => {
  const { f, seed, act, ctx, log, repo } = world;
  await act();
  const secondOrder = (await c.admin.query(`SELECT w.job_id,w.client_id,w.contract_id,a.membership_id FROM app.work_order w JOIN app.job_assignment a ON(a.tenant_id,a.job_id)=(w.tenant_id,w.job_id)
    JOIN app.membership m ON(m.tenant_id,m.id)=(a.tenant_id,a.membership_id)
    JOIN app.work_order_current cur ON(cur.tenant_id,cur.work_order_id,cur.revision_id)=(w.tenant_id,w.id,a.revision_id)
    WHERE w.tenant_id=$1 AND w.reference='NS-2-0001' AND m.role='operative' ORDER BY m.id LIMIT 1`, [f.p.tenantId])).rows[0];
  expect(secondOrder?.membership_id).toBeTruthy();
  const contractors = new ContractorRepository(c.runtime);
  const invite = async (fields: Record<string, unknown>) => {
    const v = await contractors.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" });
    return contractors.command(f.p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: v.revision, ...fields });
  };
  const team = await withTenant(c.runtime, await ctx(), async db => (await db.$client.query("SELECT app.contractor_job_team($1) team_id", [secondOrder.job_id])).rows[0].team_id);
  const sv = (await invite({ kind: "member.invite", role: "surveyor", email: "second.surveyor@fictional.invalid", scope: { kind: "team", id: team }, clientId: null, contractId: null })).id;
  const sup = (await invite({ kind: "member.invite", role: "supervisor", email: "second.supervisor@fictional.invalid", scope: { kind: "team", id: team }, clientId: null, contractId: null })).id;
  const clientId = (await invite({ kind: "member.invite", role: "client_approver", email: "second.approver@fictional.invalid", scope: { kind: "client", id: secondOrder.client_id }, clientId: secondOrder.client_id, contractId: secondOrder.contract_id })).id;
  const op = await act(secondOrder.membership_id), extra = await log(secondOrder.job_id, op);
  await repo.priceExtra(await ctx(), await act(sv), { version: "price-extra.v1", commandId: randomUUID(), jobId: extra.jobId, extraId: extra.extraId, netPence: 108000 });
  const supervisor = await act(sup);
  const submitted = await repo.submitExtra(await ctx(), supervisor, { version: "submit-extra.v1", commandId: randomUUID(), jobId: extra.jobId, extraId: extra.extraId });
  await repo.approveExtraStep(await ctx(), supervisor, { version: "approve-extra-step.v1", commandId: randomUUID(), jobId: extra.jobId, requestId: submitted.requestId, stepIndex: 0, revisionHash: submitted.revisionHash, netPence: 108000 });
  const owner = await act(), token = randomUUID().replaceAll("-", "").repeat(2);
  await repo.issueClientApproval(await ctx(), owner, { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: extra.jobId, requestId: submitted.requestId,
    approverMembershipId: clientId, recipient: "second.approver@fictional.invalid", linkToken: token, expiresAt: new Date(Date.now() + 600000) });
  const view = { version: "client-approval-view.v1", jobId: extra.jobId, requestId: submitted.requestId, linkToken: token, email: "second.approver@fictional.invalid" };
  const decision = { ...view, version: "decide-client-approval.v1", commandId: randomUUID(), revisionHash: submitted.revisionHash, netPence: 108000, decision: "approve", fictionalRoleName: "Fictional client approver", actualTesterReference: `membership:${f.p.membershipId}` };
  const wrong = await act(seed.clientApproverMembershipId);
  expect((await northsideExtras(c.runtime, wrong, "client_approver", await ctx())).some(e => e.extraId === extra.extraId)).toBe(false);
  await expect(repo.clientApprovalView(await ctx(), wrong, view)).rejects.toMatchObject({ code: "LINK_INVALID" });
  await expect(repo.decideClientApproval(await ctx(), wrong, decision)).rejects.toBeDefined();
  const right = await act(clientId);
  expect((await northsideExtras(c.runtime, right, "client_approver", await ctx())).map(e => e.extraId)).toEqual([extra.extraId]);
  expect(await repo.clientApprovalView(await ctx(), right, view)).toMatchObject({ netPence: 108000, doneWithoutRequiredPreapproval: "not_derived" });
  await repo.decideClientApproval(await ctx(), right, { ...decision, commandId: randomUUID() });
  expect((await northsideExtras(c.runtime, right, "client_approver", await ctx()))).toEqual([]); // no historical-read entitlement from this presentation
}, 120_000);

it("SWITCH-REFERENCE rejects invented, cross-actor, cross-session and out-of-window references without masking the existing switch TRUNCATE guard", async () => {
  const { f, act, ctx } = world; await act();
  const { rolledBack } = await import("./upgrade-proof-utils.js");
  const overrides = [{ switch_id: randomUUID() }, { actor_membership_id: f.p.membershipId }, { session_ref: randomUUID() }, { tenant_id: randomUUID() }, { tester_membership_id: randomUUID() }, { recorded_at: "2000-01-01T00:00:00Z" }];
  for (const change of overrides) await rolledBack(c.admin, async db => {
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
    await db.query("SET LOCAL ROLE jobguard_migration");
    await expect(db.query(`INSERT INTO app.northside_action_attribution
      SELECT (jsonb_populate_record(NULL::app.northside_action_attribution,to_jsonb(a)||$2::jsonb)).*
      FROM app.northside_action_attribution a WHERE a.tenant_id=$1 AND a.switch_id IS NOT NULL LIMIT 1`, [f.p.tenantId, JSON.stringify(change)])).rejects.toMatchObject({ code: "23503", message: "NORTHSIDE_SWITCH_REFERENCE_INVALID" });
  });
  await expect(withTenant(c.admin, await ctx(), async db => {
    await db.$client.query("SET LOCAL ROLE jobguard_migration");
    await db.$client.query("TRUNCATE control_plane.practice_worker_switch");
  })).rejects.toMatchObject({ message: "SWITCH_RECORD_IMMUTABLE" });
});

it("SETTINGS-SNAPSHOT retains the stored definition, contract references and immutable requirement snapshots", async () => {
  const { f, act } = world; await act();
  const before = await northsideRun(c.runtime, f.p, await world.ctx());
  expect(before?.settings).toEqual(northsideSettings);
  const stored = (await c.admin.query("SELECT row_to_json(a)::text bytes FROM app.extra_approval_request a WHERE tenant_id=$1 ORDER BY id", [f.p.tenantId])).rows;
  await registerNorthsideRun(c.runtime, f.p, await world.ctx());
  const context = await world.ctx();
  await expect(withTenant(c.runtime, context, db => db.$client.query("SELECT app.northside_register($1,$2::jsonb)", [f.p.membershipId, JSON.stringify({ ...northsideSettings, linkLifetimeMinutes: 1 })]))).rejects.toMatchObject({ message: "NORTHSIDE_SETTINGS_CONFLICT" });
  await expect(withTenant(c.runtime, context, db => db.$client.query("UPDATE app.northside_run SET settings_version='changed'"))).rejects.toMatchObject({ code: "42501" });
  for (const statement of ["UPDATE app.northside_action_attribution SET actor_role='spoofed'", "DELETE FROM app.northside_action_attribution", "TRUNCATE app.northside_action_attribution", "UPDATE app.northside_run SET settings_version='changed'"]) {
    await expect(withTenant(c.admin, context, async db => { await db.$client.query("SET LOCAL ROLE jobguard_migration"); await db.$client.query(statement); })).rejects.toMatchObject({ code: "55000", message: "NORTHSIDE_HISTORY_IMMUTABLE" });
  }
  expect(await northsideRun(c.runtime, f.p, await world.ctx())).toEqual(before);
  expect((await c.admin.query("SELECT row_to_json(a)::text bytes FROM app.extra_approval_request a WHERE tenant_id=$1 ORDER BY id", [f.p.tenantId])).rows).toEqual(stored);
  const contracts = (await c.admin.query(`SELECT count(*)::int n FROM app.work_order w JOIN app.northside_action_attribution a ON a.tenant_id=w.tenant_id AND a.contract_version_id=w.contract_version_id
    WHERE w.tenant_id=$1 AND a.settings_version=$2 AND a.settings_hash=$3`, [f.p.tenantId, before!.settings.version, before!.settingsHash])).rows[0].n;
  expect(contracts).toBe(2000);
});

it("RESET-HISTORY starts a new run while retaining earlier attribution, settings, evidence, origins and the audit prefix", async () => {
  const { f, act } = world; await act();
  const { proofBefore, proofDifferences } = await import("./upgrade-proof-utils.js");
  const before = await proofBefore(c.admin, ["app.northside_run", "app.northside_action_attribution", "app.extra_origin", "app.evidence_object", "app.audit_event"]);
  await new ContractorPracticeSessionRepository(c.runtime).revoke(f.context, f.session);
  const fresh = await startSession(c); await seedNorthsideDemo(c.runtime, fresh.p, fresh.context);
  expect(fresh.p.tenantId).not.toBe(f.p.tenantId);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  expect((await northsideFacts(c.runtime, fresh.p, fresh.context)).extras).toBe(0);
  const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.p.tenantId])).rows;
  verifyAuditChain(rows.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash })));
}, 600_000);
