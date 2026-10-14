import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { evaluateExtraApprovalRequirement } from "@jobguard/core";
import { ExtraApprovalRepository, withTenant, sha256Hex, canonicalJson, type VerifiedTenantContext } from "../src/index.js";
import { chainWorld, cluster, chain, command, reviseRules, submitted, approveInput, newToken, emailOf, newJob, raiseOn, sleep, demoRules, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";

let c: Cluster, w: ChainWorld, ctx: VerifiedTenantContext, repo: ExtraApprovalRepository;
let tSlow = 0;
let slow: Awaited<ReturnType<typeof submitted>>;
const sup = () => w.members.supervisor.member, sup2 = () => w.supervisor2.member, surveyor = () => w.members.surveyor.member, owner = () => w.members.owner.member, cm = () => w.members.commercial_manager.member, client = () => w.members.client_approver.member;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));
const sql = async (text: string, args: unknown[] = []) => (await c.admin.query(text, args)).rows;
const outcome = async (request: string) => (await sql("SELECT kind,actor_kind,by_rule FROM app.extra_approval_outcome WHERE request_id=$1", [request]));
const lastEvent = async (extra: string) => (await sql("SELECT kind FROM app.extra_event WHERE variation_id=$1 ORDER BY sequence DESC LIMIT 1", [extra]))[0]?.kind as string;
const issue = (s: { jobId: string; requestId: string }, over: Record<string, unknown> = {}) => {
  const token = newToken();
  return emailOf(c, w, client().membershipId).then(async recipient => ({ token, recipient, run: () => repo.issueClientApproval(ctx, owner(), { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId, approverMembershipId: client().membershipId, recipient, linkToken: token, expiresAt: new Date(Date.now() + 3600_000), ...over }) }));
};
const decide = (s: { jobId: string; requestId: string; hash: string; net: number }, token: string, email: string, over: Record<string, unknown> = {}, by = client()) =>
  repo.decideClientApproval(ctx, by, { version: "decide-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId, linkToken: token, email, revisionHash: s.hash, netPence: s.net, decision: "approve", fictionalRoleName: "Fictional Housing Approver", actualTesterReference: "tester:practice-ben", ...over });
/** An extra whose company steps are done so the client step is next (net 150000: supervisor, supervisor, client). */
async function atClientStep() {
  const s = await submitted(c, w, 150000);
  await repo.approveExtraStep(ctx, sup(), approveInput(s, 0)); await repo.approveExtraStep(ctx, sup2(), approveInput(s, 1));
  return s;
}
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await chainWorld(c); ctx = await w.ctx; repo = new ExtraApprovalRepository(c.runtime);
  slow = await submitted(c, w, 40000); tSlow = Date.now(); // its one-minute step wait runs while the other tests run
}, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("E5B-01 journey: price, submit, grant-filtered queue, company steps, owner-approved send, client approval as the client", async () => {
  const s = await submitted(c, w, 150000);
  expect(s.result).toMatchObject({ state: "awaiting_approval", requestRevision: 1, stepCount: 3 });
  const mine = (await repo.queue(ctx, sup().membershipId)).filter(x => x.request_id === s.requestId);
  expect(mine).toHaveLength(1); expect(mine[0]).toMatchObject({ lane: "mandatory", step_index: 0, step_role: "supervisor", escalated: false });
  expect((await repo.queue(ctx, surveyor().membershipId)).filter(x => x.request_id === s.requestId)).toEqual([]);
  expect((await repo.queue(ctx, w.otherSupervisor.member.membershipId)).filter(x => x.request_id === s.requestId)).toEqual([]);
  await repo.approveExtraStep(ctx, sup(), approveInput(s, 0));
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s, 1)))).toBe("REUSED_APPROVER");
  await repo.approveExtraStep(ctx, sup2(), approveInput(s, 1));
  expect(await code(repo.approveExtraStep(ctx, cm(), approveInput(s, 2)))).toBe("CLIENT_STEP_REQUIRES_CLIENT");
  expect(await outcome(s.requestId)).toEqual([]);
  const i = await issue(s), sent = await i.run();
  const box = (await sql("SELECT status,adapter,recipient,action_type FROM app.action_outbox WHERE id=$1", [sent.outboxActionId]))[0];
  expect(box).toMatchObject({ status: "pending", adapter: "fake_email", action_type: "extra.client_approval_request.send" }); expect(box.recipient).toMatch(/\.invalid$/u);
  const view = await repo.clientApprovalView(ctx, client(), { version: "client-approval-view.v1", jobId: s.jobId, requestId: s.requestId, linkToken: i.token, email: i.recipient });
  expect(view).toMatchObject({ netPence: 150000, revisionHash: s.hash, doneWithoutRequiredPreapproval: "not_derived" }); expect((view.companyApprovals as unknown[]).length).toBe(2);
  const cmd = randomUUID(), done = await decide(s, i.token, i.recipient, { commandId: cmd });
  expect(done).toMatchObject({ state: "approved", stepIndex: 2 });
  expect(await decide(s, i.token, i.recipient, { commandId: cmd })).toEqual(done);
  const facts = await sql("SELECT step_index,actor_kind,actor_membership_id,fictional_role_name,actual_tester_reference,approved_net_pence::int net FROM app.extra_approval_step_fact WHERE request_id=$1 ORDER BY step_index", [s.requestId]);
  expect(facts.map(f => f.actor_kind)).toEqual(["member", "member", "client_approver"]);
  expect(facts[2]).toMatchObject({ actor_membership_id: client().membershipId, fictional_role_name: "Fictional Housing Approver", actual_tester_reference: "tester:practice-ben", net: 150000 });
  expect(await outcome(s.requestId)).toEqual([{ kind: "approved", actor_kind: "client_approver", by_rule: false }]);
  expect(await lastEvent(s.extraId)).toBe("approved");
  expect(await sql("SELECT 1 FROM app.variation_approval WHERE variation_id=$1", [s.extraId])).toEqual([]); // never a contractor attestation
  expect((await sql("SELECT status FROM app.action_outbox WHERE id=$1", [sent.outboxActionId]))[0].status).toBe("pending"); // nothing was really sent
  expect(await sql("SELECT d.id FROM app.decision d LEFT JOIN app.decision_resolution r ON(r.tenant_id,r.decision_id)=(d.tenant_id,d.id) WHERE d.subject_ref LIKE $1 AND r.id IS NULL", [`${s.requestId}:%`])).toEqual([]);
  expect(await chain(c, w)).toBeTruthy();
}, 120_000);

it("E5B-02 stale revision, wrong hash/net, unpriced and replay semantics", async () => {
  const s = await submitted(c, w, 40000);
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s, 0, { revisionHash: "a".repeat(64) })))).toBe("HASH_MISMATCH");
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s, 0, { netPence: 40001 })))).toBe("HASH_MISMATCH");
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s, 0)))).toBe("ok"); // approved at 40000 by the supervisor
  const revise = { version: "revise-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, netPence: 60000 };
  const second = await repo.reviseExtra(ctx, surveyor(), revise);
  expect(second).toMatchObject({ state: "awaiting_approval", requestRevision: 2, stepCount: 2 });
  expect(await repo.reviseExtra(ctx, surveyor(), revise)).toEqual(second); // replay returns the first answer
  expect(await code(repo.reviseExtra(ctx, surveyor(), { ...revise, netPence: 60001 }))).toBe("COMMAND_CONFLICT"); // same command id, different content
  expect(await code(repo.approveExtraStep(ctx, sup2(), approveInput(s, 0)))).toBe("STALE_REVISION"); // revision 1 after 2 exists (even though it was decided)
  const s2 = { ...s, requestId: second.requestId as string, hash: second.revisionHash as string, net: 60000 };
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s2, 0)))).toBe("REPEAT_HELD"); // same person, same slot, later version: held, refused
  expect(await code(repo.approveExtraStep(ctx, sup2(), approveInput(s2, 0)))).toBe("ok");
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s2, 1)))).toBe("REUSED_APPROVER"); // approved step 0 of the first version, may not fill step 1 of the next
  const bindings = await sql("SELECT logical_revision,source_kind FROM app.extra_approval_revision_binding WHERE variation_id=$1 ORDER BY logical_revision", [s.extraId]);
  expect(bindings).toEqual([{ logical_revision: 1, source_kind: "ordinary" }, { logical_revision: 2, source_kind: "ordinary" }]);
  const un = await submitted(c, w, null);
  expect(un.result).toMatchObject({ netPence: null, stepCount: 3 });
  expect(await code(repo.approveExtraStep(ctx, sup(), { ...approveInput({ ...un, net: 1 }, 0), netPence: 1 }))).toBe("HASH_MISMATCH");
  const row = (await sql("SELECT requirement,comparisons,net_pence FROM app.extra_approval_request WHERE id=$1", [un.requestId]))[0];
  expect(row.net_pence).toBeNull(); expect(row.requirement.clientRequired).toBe(true); expect(row.comparisons).toMatchObject({ withinProceedLimit: false, aboveClientThreshold: true, aboveClientBeforeWorkThreshold: true });
  expect(await sql("SELECT 1 FROM app.extra_approval_step_fact WHERE request_id=$1", [un.requestId])).toEqual([]);
});

it("E5B-03 thresholds exact at pence equality, SQL snapshot equals the pure evaluator", async () => {
  const doc = demoRules, hash = sha256Hex(JSON.stringify(doc));
  for (const net of [1, 25000, 25001, 49999, 50000, 50001, 99999, 100000, 100001, 149999, 150000, 150001, null]) {
    const sqlSnap = (await sql("SELECT app.xa_requirement($1::jsonb,$2::bigint) r", [JSON.stringify(doc), net]))[0].r;
    const pure = evaluateExtraApprovalRequirement({ version: "extra-approval-input.v1", ruleVersionId: randomUUID(), ruleDocumentHash: hash, clientContractVersionId: randomUUID(), rules: doc,
      revision: { id: randomUUID(), hash: "b".repeat(64), net: net === null ? null : { pence: net, currency: "GBP" } } });
    const companyRoles = (sqlSnap.steps as { role: string; kind: string }[]).filter(x => x.role !== "client_approver").map(x => x.role);
    expect(companyRoles, `net ${net}`).toEqual(pure.companySteps.map(x => x.role));
    expect(sqlSnap.comparisons, `net ${net}`).toEqual(pure.comparisons);
  }
  expect((await sql("SELECT app.xa_requirement($1::jsonb,100000) r", [JSON.stringify(doc)]))[0].r.clientRequired).toBe(false);
  expect((await sql("SELECT app.xa_requirement($1::jsonb,100001) r", [JSON.stringify(doc)]))[0].r.clientRequired).toBe(true);
  expect((await sql("SELECT app.xa_requirement($1::jsonb,NULL) r", [JSON.stringify(doc)]))[0].r.steps).toHaveLength(3); // last band + client
});

it("E5B-04 refused approvers: self, wrong role, grant not covering the job, revoked member, out of order", async () => {
  const mine = await submitted(c, w, 40000, "supervisor"); // the supervisor raised it
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(mine, 0)))).toBe("SELF_APPROVAL");
  const s = await submitted(c, w, 150000);
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s, 1)))).toBe("STEP_OUT_OF_ORDER");
  expect(await code(repo.approveExtraStep(ctx, surveyor(), approveInput(s, 0)))).toBe("PERMISSION_DENIED"); // not the step's role, no escalation
  expect(await code(repo.approveExtraStep(ctx, w.otherSupervisor.member, approveInput(s, 0)))).toBe("PERMISSION_DENIED"); // grant is on another team
  expect(await code(repo.approveExtraStep(ctx, w.members.operative.member, approveInput(s, 0)))).toBe("PERMISSION_DENIED");
  const gone = await (async () => { const a = (await import("./site-extra-fixtures.js")).invite; return a(c, w, "supervisor", { kind: "team", id: w.demo.teamId }); })();
  await command(c, w, { kind: "grant.revoke", grantId: gone.grant });
  expect(await code(repo.approveExtraStep(ctx, gone.member, approveInput(s, 0)))).toBe("PERMISSION_DENIED"); // revoked
  expect(await sql("SELECT 1 FROM app.extra_approval_step_fact WHERE request_id=$1", [s.requestId])).toEqual([]);
  expect(await code(repo.approveExtraStep({ tenantId: randomUUID() } as VerifiedTenantContext, sup(), approveInput(s, 0)))).not.toBe("ok");
});

it("E5B-05 races: approve vs withdraw gives one effect; two approvers on one step give one fact", async () => {
  const a = await submitted(c, w, 40000);
  const raceA = await Promise.allSettled([repo.approveExtraStep(ctx, sup(), approveInput(a, 0)), repo.withdrawExtra(ctx, sup2(), { version: "withdraw-extra.v1", commandId: randomUUID(), jobId: a.jobId, extraId: a.extraId, reasonCode: "not_done" })]);
  expect(raceA.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((raceA.find(r => r.status === "rejected") as PromiseRejectedResult).reason.code).toBe("ALREADY_DECIDED");
  expect(await outcome(a.requestId)).toHaveLength(1);
  const events = (await sql("SELECT kind FROM app.extra_event WHERE variation_id=$1 AND kind IN('approved','withdrawn')", [a.extraId])).length; expect(events).toBe(1);
  const b = await submitted(c, w, 40000);
  const raceB = await Promise.allSettled([repo.approveExtraStep(ctx, sup(), approveInput(b, 0)), repo.approveExtraStep(ctx, sup2(), approveInput(b, 0))]);
  expect(raceB.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((raceB.find(r => r.status === "rejected") as PromiseRejectedResult).reason.code).toBe("ALREADY_DECIDED");
  expect(await sql("SELECT 1 FROM app.extra_approval_step_fact WHERE request_id=$1 AND step_index=0", [b.requestId])).toHaveLength(1);
});

it("E5B-06 client approval refusals: forged, expired, revoked, replaced, other email, other person, other extra, replayed, revoked member", async () => {
  const s = await atClientStep(), i = await issue(s); await i.run();
  expect(await code(decide(s, newToken(), i.recipient))).toBe("LINK_INVALID"); // forged
  expect(await code(decide(s, i.token, i.recipient, {}, w.client2.member))).toBe("LINK_INVALID"); // someone else's link
  expect(await code(decide(s, i.token, "someone.else@fictional.invalid"))).toBe("EMAIL_MISMATCH");
  expect(await code(decide(s, i.token, i.recipient, { jobId: w.otherJob }))).toBe("NOT_FOUND"); // not this link's extra
  expect(await code(decide(s, i.token, i.recipient, { revisionHash: "c".repeat(64) }))).toBe("HASH_MISMATCH");
  expect(await code(decide(s, i.token, i.recipient, { decision: "reject" }))).toBe("INVALID_COMMAND"); // a rejection needs a reason
  expect(await sql("SELECT 1 FROM app.extra_client_link_closure c JOIN app.extra_client_link k ON(k.tenant_id,k.id)=(c.tenant_id,c.link_id) WHERE k.request_id=$1", [s.requestId])).toEqual([]); // every refusal left no closure
  expect(await code(decide(s, i.token, i.recipient))).toBe("ok");
  expect(await code(decide(s, i.token, i.recipient))).toBe("LINK_REPLAYED"); // new command id, same link
  const r = await atClientStep(), j = await issue(r), sent = await j.run();
  await repo.revokeClientApproval(ctx, owner(), { version: "revoke-client-approval.v1", commandId: randomUUID(), jobId: r.jobId, linkId: sent.linkId });
  expect(await code(decide(r, j.token, j.recipient))).toBe("LINK_REVOKED");
  expect((await sql("SELECT status FROM app.action_outbox WHERE id=$1", [sent.outboxActionId]))[0].status).toBe("cancelled");
  const q = await atClientStep(), first = await (await issue(q)).run(), again = await issue(q), second = await again.run();
  expect(second.replacedOutboxIds).toEqual([first.outboxActionId]);
  expect((await sql("SELECT status FROM app.action_outbox WHERE id=$1", [first.outboxActionId]))[0].status).toBe("cancelled");
  expect(await sql("SELECT kind FROM app.extra_client_link_closure WHERE link_id=$1", [first.linkId])).toEqual([{ kind: "replaced" }]);
  expect(await code(decide(q, again.token, again.recipient))).toBe("ok");
  const e = await atClientStep(), soon = await issue(e, { expiresAt: new Date(Date.now() + 1500) }); await soon.run(); await sleep(1700);
  expect(await code(decide(e, soon.token, soon.recipient))).toBe("LINK_EXPIRED");
  expect(await code(repo.clientApprovalView(ctx, client(), { version: "client-approval-view.v1", jobId: e.jobId, requestId: e.requestId, linkToken: soon.token, email: soon.recipient }))).toBe("LINK_EXPIRED");
  const k = await atClientStep(), live = await issue(k); await live.run();
  await command(c, w, { kind: "grant.revoke", grantId: w.members.client_approver.grant });
  expect(await code(decide(k, live.token, live.recipient))).toBe("PERMISSION_DENIED");
  // A revoked client can no longer read the description, price or approval history through the still-open link.
  expect(await code(repo.clientApprovalView(ctx, client(), { version: "client-approval-view.v1", jobId: k.jobId, requestId: k.requestId, linkToken: live.token, email: live.recipient }))).toBe("PERMISSION_DENIED");
  expect(await sql("SELECT 1 FROM app.extra_approval_outcome WHERE request_id=$1", [k.requestId])).toEqual([]);
});

it("E5B-07 the send is owner-only and exact", async () => {
  const s = await atClientStep();
  const notOwner = await issue(s); expect(await code(repo.issueClientApproval(ctx, sup(), { version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId, approverMembershipId: client().membershipId, recipient: notOwner.recipient, linkToken: notOwner.token, expiresAt: new Date(Date.now() + 3600_000) }))).toBe("PERMISSION_DENIED");
  expect(await code((await issue(s, { recipient: "real.person@example.com" })).run())).toBe("INVALID_COMMAND"); // practice recipients are .invalid only
  expect(await code((await issue(s, { approverMembershipId: w.client2.member.membershipId })).run())).toBe("PERMISSION_DENIED"); // approver's stored email is not the recipient
  const early = await submitted(c, w, 150000);
  expect(await code((await issue(early)).run())).toBe("STEP_OUT_OF_ORDER"); // company steps first
  expect(await sql("SELECT 1 FROM app.extra_client_link WHERE request_id=ANY($1)", [[s.requestId, early.requestId]])).toEqual([]);
  expect(await sql("SELECT 1 FROM app.action_outbox WHERE action_type='extra.client_approval_request.send' AND recipient LIKE 'real.person%'")).toEqual([]);
});

it("E5B-08 withdraw (supervisors only), reject, and duplicate", async () => {
  const s = await submitted(c, w, 40000), w2 = { version: "withdraw-extra.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, reasonCode: "not_done" };
  expect(await code(repo.withdrawExtra(ctx, w.members.operative.member, w2))).toBe("PERMISSION_DENIED");
  expect(await code(repo.withdrawExtra(ctx, surveyor(), { ...w2, commandId: randomUUID() }))).toBe("PERMISSION_DENIED"); // wider roles held
  expect(await code(repo.withdrawExtra(ctx, sup(), w2))).toBe("ok");
  expect(await outcome(s.requestId)).toEqual([{ kind: "withdrawn", actor_kind: "member", by_rule: false }]);
  expect(await code(repo.withdrawExtra(ctx, sup(), { ...w2, commandId: randomUUID() }))).toBe("ALREADY_DECIDED");
  const d1 = await submitted(c, w, 40000), d2 = await submitted(c, w, 40000);
  const mark = { version: "mark-duplicate.v1", commandId: randomUUID(), jobId: d1.jobId, duplicateId: d1.extraId, canonicalId: d1.extraId };
  expect(await code(repo.markDuplicate(ctx, sup(), mark))).toBe("NOT_FOUND"); // itself
  const other = await raiseOn(c, w, d1.jobId, "operative");
  expect(await code(repo.markDuplicate(ctx, w.members.operative.member, { ...mark, commandId: randomUUID(), canonicalId: other }))).toBe("PERMISSION_DENIED");
  expect(await code(repo.markDuplicate(ctx, sup(), { ...mark, commandId: randomUUID(), canonicalId: other }))).toBe("ok");
  expect(await lastEvent(d1.extraId)).toBe("duplicate"); expect(await outcome(d1.requestId)).toEqual([{ kind: "duplicate", actor_kind: "member", by_rule: false }]);
  expect(await sql("SELECT kind FROM app.extra_duplicate_link WHERE duplicate_id=$1", [d1.extraId])).toEqual([{ kind: "link" }]);
  expect(await code(repo.markDuplicate(ctx, sup(), { ...mark, commandId: randomUUID(), jobId: d2.jobId, duplicateId: d2.extraId, canonicalId: d1.extraId }))).toBe("NOT_FOUND"); // different job
  const rej = await submitted(c, w, 40000);
  expect(await code(repo.rejectExtra(ctx, sup(), { ...approveInput(rej, 0), version: "reject-extra.v1", reasonCode: "Not Valid" }))).toBe("INVALID_COMMAND");
  await repo.rejectExtra(ctx, sup(), { ...approveInput(rej, 0), version: "reject-extra.v1", reasonCode: "price_not_agreed" });
  expect(await lastEvent(rej.extraId)).toBe("rejected");
  expect(await chain(c, w)).toBeTruthy();
});

it("E5B-09 Standard F: runtime reads only, routines re-check the actor, helpers are not callable", async () => {
  const tables = ["extra_approval_request", "extra_approval_step_fact", "extra_approval_outcome", "extra_client_link", "extra_client_link_closure", "extra_escalation_fact"];
  for (const t of tables) {
    expect((await sql("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name=$1", [t]))).toEqual([{ privilege_type: "SELECT" }]);
    expect((await sql("SELECT r.rolname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relnamespace='app'::regnamespace AND c.relname=$1", [t]))[0]).toEqual({ rolname: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true });
    await expect(withTenant(c.runtime, ctx, db => db.$client.query(`DELETE FROM app.${t}`))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(c.runtime, ctx, db => db.$client.query(`INSERT INTO app.${t}(tenant_id) VALUES($1)`, [w.p.tenantId]))).rejects.toMatchObject({ code: "42501" });
  }
  const s = await submitted(c, w, 40000);
  // A runtime caller who skips the repository (no processing receipt) or names someone else's receipt is refused by the routine itself.
  await expect(withTenant(c.runtime, ctx, db => db.$client.query("SELECT app.xa_approve($1,$2,$3,$4,0,$5,$6,false,NULL)", [s.jobId, s.requestId, randomUUID(), sup().membershipId, s.hash, s.net]))).rejects.toMatchObject({ message: "INVALID_COMMAND" });
  await expect(withTenant(c.runtime, ctx, async db => {
    const id = randomUUID();
    await db.$client.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'ApproveExtraStep',$3,$4,'processing',$5)", [w.p.tenantId, id, `forged:${id}`, "a".repeat(64), sup2().membershipId]);
    await db.$client.query("SELECT app.xa_approve($1,$2,$3,$4,0,$5,$6,false,NULL)", [s.jobId, s.requestId, id, sup().membershipId, s.hash, s.net]);
  })).rejects.toMatchObject({ message: "INVALID_COMMAND" });
  for (const fn of ["xa_begin", "xa_open_request", "xa_event", "xa_open_decision", "xa_resolve_decision", "xa_requirement", "xa_fact_guard"])
    expect((await sql("SELECT has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') x FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname=$1", [fn]))[0].x).toBe(false);
  for (const fn of ["xa_submit", "xa_price", "xa_approve", "xa_withdraw", "xa_mark_duplicate", "xa_issue_link", "xa_revoke_link", "xa_client_decide", "xa_escalate"])
    expect((await sql("SELECT p.prosecdef,r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.pronamespace='app'::regnamespace AND p.proname=$1", [fn]))[0]).toEqual({ prosecdef: true, rolname: "jobguard_migration" });
  expect((await sql("SELECT pg_get_functiondef(p.oid) d FROM pg_proc p WHERE p.proname='xa_queue'"))[0].d).not.toMatch(/finding|suppress|advisory/iu); // nothing advisory can hide a mandatory item
  for (const t of ["extra_approval_request", "extra_approval_step_fact", "extra_approval_outcome"]) await expect(c.admin.query(`UPDATE app.${t} SET tenant_id=tenant_id`)).rejects.toMatchObject({ code: "55000" });
});

it("E5B-10 a later rule version leaves an existing snapshot unchanged (runs last: it changes the contract's rules)", async () => {
  const s = await submitted(c, w, 40000);
  const before = (await sql("SELECT rule_version_id,rule_document_hash,requirement::text r,comparisons::text x FROM app.extra_approval_request WHERE id=$1", [s.requestId]))[0];
  await reviseRules(c, w, { ...demoRules, proceedLimit: { pence: 99, currency: "GBP" }, bands: [{ upToPence: null, steps: [{ role: "surveyor", timeLimitMinutes: 5, escalationRole: "surveyor", alternateRoles: [] }] }] });
  expect((await sql("SELECT rule_version_id,rule_document_hash,requirement::text r,comparisons::text x FROM app.extra_approval_request WHERE id=$1", [s.requestId]))[0]).toEqual(before);
  expect(await code(repo.approveExtraStep(ctx, sup(), approveInput(s, 0)))).toBe("ok"); // still judged by its own snapshot (supervisor), not the new surveyor-only rule
  const fresh = await submitted(c, w, 40000);
  expect((await sql("SELECT requirement->'steps'->0->>'role' role FROM app.extra_approval_request WHERE id=$1", [fresh.requestId]))[0].role).toBe("surveyor");
});

it("E5B-11 escalation fires once, only listed alternates gain authority, original approvers keep it", async () => {
  const wait = 61_000 - (Date.now() - tSlow); if (wait > 0) await sleep(wait + 500);
  expect(await code(repo.approveExtraStep(ctx, surveyor(), approveInput(slow, 0)))).toBe("PERMISSION_DENIED"); // before any escalation
  const first = (await repo.escalateOverdue(ctx)).filter(x => x.request_id === slow.requestId);
  expect(first).toHaveLength(1); expect(first[0]!.eligible_roles).toEqual(["commercial_manager", "surveyor"]);
  const restarted = new ExtraApprovalRepository(c.runtime); // a restarted worker
  expect((await restarted.escalateOverdue(ctx)).filter(x => x.request_id === slow.requestId)).toEqual([]);
  expect(await sql("SELECT 1 FROM app.extra_escalation_fact WHERE request_id=$1", [slow.requestId])).toHaveLength(1);
  const q = (await repo.queue(ctx, surveyor().membershipId)).filter(x => x.request_id === slow.requestId);
  expect(q).toHaveLength(1); expect(q[0]).toMatchObject({ lane: "mandatory", escalated: true, overdue: true });
  expect((await repo.queue(ctx, sup().membershipId)).filter(x => x.request_id === slow.requestId)).toHaveLength(1); // original approver still eligible
  expect((await repo.queue(ctx, w.members.finance.member.membershipId)).filter(x => x.request_id === slow.requestId)).toEqual([]);
  expect(await code(repo.approveExtraStep(ctx, w.members.finance.member, approveInput(slow, 0)))).toBe("PERMISSION_DENIED");
  expect(await code(repo.approveExtraStep(ctx, surveyor(), approveInput(slow, 0)))).toBe("ok"); // an agreed backup, after the wait
  expect(await chain(c, w)).toBeTruthy();
}, 180_000);
