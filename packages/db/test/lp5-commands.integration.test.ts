import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserCommandDispatcher } from "../src/commands.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
async function fixture() {
  const actor = await jobDoorsActor(db.owner), context = testTenantContext(actor.tenant);
  const job = randomUUID(), decision = randomUUID(), finding = randomUUID();
  const fingerprint = createHash("sha256").update(finding).digest("hex");
  await db.owner.query(`INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional command fixture','live')`, [actor.tenant, job]);
  await db.owner.query(`INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'review')`, [actor.tenant, decision, job]);
  await db.owner.query(`INSERT INTO app.job_finding(tenant_id,id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision)
    VALUES($1,$2,$3,$4,$5,'unresolved_question','mandatory','Fictional','','synthetic','review',1)`, [actor.tenant, finding, job, decision, fingerprint]);
  const command = { version: "decision-resolution-command.v1", commandId: randomUUID(), semanticKey: `resolve:${decision}`,
    actorMembershipId: actor.member, decisionId: decision, findingFingerprint: fingerprint, resolution: "dismissed", expectedSnapshotRevision: 1 };
  return { actor, context, job, command, dispatcher: new UserCommandDispatcher(db.runtime) };
}
const counts = async (tenant: string) => (await db.owner.query(`SELECT
 (SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$1) receipts,
 (SELECT count(*)::int FROM app.decision_resolution WHERE tenant_id=$1) resolutions,
 (SELECT count(*)::int FROM app.action_authorization WHERE tenant_id=$1) authorizations,
 (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits`, [tenant])).rows[0];
const commercial = (f: Awaited<ReturnType<typeof fixture>>, override: Record<string, unknown> = {}) => ({ version: "command.v1", commandId: randomUUID(),
  commandType: "job.switch_live", semanticKey: `switch:${randomUUID()}`, actorMembershipId: f.actor.member, subjectType: "job", subjectRef: f.job,
  action: { actionType: "job.switch_live", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 1,
    amountPence: null, currency: null, policyVersion: "synthetic_demo_activation.v3", expiresAt: new Date("2099-01-01T00:00:00Z") }, ...override });
async function begin(f: Awaited<ReturnType<typeof fixture>>, command = commercial(f)) {
  return withTenant(db.runtime, f.context, tx => tx.$client.query(`SELECT app.begin_command($1,$2,$3,$4,$5,$6,$7)`, [command.version, command.commandId,
    command.commandType, command.semanticKey, { tenantId: f.actor.tenant, actorMembershipId: command.actorMembershipId, subjectType: command.subjectType, subjectRef: command.subjectRef },
    { aggregateRevision: command.action.aggregateRevision }, command]));
}

describe("LP-5a actual PostgreSQL command lifecycle", () => {
  it("concurrent duplicate IDs and semantic keys commit one resolution, no grant and the first result", async () => {
    const f = await fixture();
    const results = await Promise.all([f.command, f.command, { ...f.command, commandId: randomUUID() }].map(c => f.dispatcher.dismissDecision(f.context, c)));
    expect(results).toEqual(Array(3).fill({ decisionId: f.command.decisionId, resolution: "dismissed", authorizedAction: false }));
    expect(await counts(f.actor.tenant)).toMatchObject({ receipts: 1, resolutions: 1, authorizations: 0, audits: 2 });
    await expect(f.dispatcher.dismissDecision(f.context, { ...f.command, resolution: "rejected" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(f.dispatcher.dismissDecision(f.context, { ...f.command, expectedSnapshotRevision: 2 })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  });
  it.each(["revoked", "expired", "demoted"])("rechecks %s access on ordinary dispatch AND dismissal replay", async state => {
    const f = await fixture();
    await f.dispatcher.dismissDecision(f.context, f.command);
    // Explicit registry-proven synthetic no-op keeps the existing commands lock test unchanged.
    const c = commercial(f, { commandType: "synthetic.lock" });
    await f.dispatcher.dispatch(f.context, c, { mutate: async () => ({ locked: f.job }) });
    const before = await counts(f.actor.tenant);
    await db.owner.query(`UPDATE app.membership SET revoked_at=$3,expires_at=$4,role=$5 WHERE tenant_id=$1 AND id=$2`,
      [f.actor.tenant, f.actor.member, state === "revoked" ? new Date(0) : null, state === "expired" ? new Date(0) : null, state === "demoted" ? "member" : "owner"]);
    await expect(f.dispatcher.dispatch(f.context, c, { mutate: async () => { throw new Error("must not run"); } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.dispatcher.dismissDecision(f.context, f.command)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await counts(f.actor.tenant)).toEqual(before);
  });
  it("does not disclose another owner's or tenant's replay", async () => {
    const f = await fixture(), other = await jobDoorsActor(db.owner, f.actor.tenant), foreign = await fixture();
    await f.dispatcher.dismissDecision(f.context, f.command);
    await expect(f.dispatcher.dismissDecision(f.context, { ...f.command, actorMembershipId: other.member })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(f.dispatcher.dismissDecision(foreign.context, f.command)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("resolves both keys and refuses a command ID and semantic key belonging to different receipts", async () => {
    const f = await fixture(), c = commercial(f, { commandType: "synthetic.lock", semanticKey: "first" });
    const handler = { mutate: async () => ({ locked: f.job }) };
    await f.dispatcher.dispatch(f.context, c, handler);
    await f.dispatcher.dispatch(f.context, { ...c, commandId: randomUUID(), semanticKey: "second" }, handler);
    const before = await counts(f.actor.tenant);
    await expect(f.dispatcher.dispatch(f.context, { ...c, semanticKey: "second" }, handler)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect(await counts(f.actor.tenant)).toEqual(before);
  });
  it("refuses unknown types before mutation, with authority-first refusals", async () => {
    const f = await fixture(), before = await counts(f.actor.tenant);
    const handler = { mutate: async () => { throw new Error("unknown type ran"); } };
    await expect(f.dispatcher.dispatch(f.context, commercial(f, { commandType: "unknown.command" }), handler)).rejects.toMatchObject({ code: "AUTHORIZATION_INVALID" });
    await expect(f.dispatcher.dispatch(f.context, commercial(f, { commandType: "unknown.command", actorMembershipId: randomUUID() }), handler)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await counts(f.actor.tenant)).toEqual(before);
  });
  it("refuses fabricated completion and a committed processing claim; cancellation rolls back and permits retry", async () => {
    const f = await fixture(), before = await counts(f.actor.tenant), c = commercial(f);
    await expect(f.dispatcher.dispatch(f.context, c, { mutate: async () => ({ jobId: f.job, activationId: randomUUID(), state: "live" }) })).rejects.toMatchObject({ code: "AUTHORIZATION_INVALID" });
    await expect(begin(f, c)).rejects.toMatchObject({ code: "23514" });
    await expect(f.dispatcher.dispatch(f.context, c, { mutate: async () => { throw new Error("synthetic cancellation"); } })).rejects.toThrow("synthetic cancellation");
    expect(await counts(f.actor.tenant)).toEqual(before);
    await expect(f.dispatcher.dispatch(f.context, { ...c, commandType: "synthetic.lock" }, { mutate: async () => ({ locked: f.job }) })).resolves.toEqual({ locked: f.job });
  });
  it("a handler cannot store arbitrary success JSON, nor rewrite the terminal receipt", async () => {
    const f = await fixture(), c = commercial(f, { commandType: "synthetic.lock" });
    await expect(f.dispatcher.dispatch(f.context, c, { mutate: async () => ({ locked: f.job, injected: "not stored" }) })).resolves.toEqual({ locked: f.job });
    await expect(withTenant(db.runtime, f.context, tx => tx.$client.query(`UPDATE app.command_receipt SET result='{"forged":true}' WHERE command_id=$1`, [c.commandId]))).rejects.toThrow();
  });
  it("validates operational no-op input without minting a commercial authorization", async () => {
    const f = await fixture(), c = commercial(f, { commandType: "synthetic.lock" });
    await expect(begin(f, { ...c, unexpected: true } as typeof c)).rejects.toMatchObject({ message: "AUTHORIZATION_INVALID" });
    await f.dispatcher.dispatch(f.context, c, { mutate: async () => ({ locked: f.job }) });
    expect(await counts(f.actor.tenant)).toMatchObject({ receipts: 1, authorizations: 0 });
  });
  it("keeps the registry, claim rows and result helper private", async () => {
    const f = await fixture();
    for (const sql of ["SELECT * FROM app.command_type_registry", "SELECT * FROM app.command_lifecycle_claim", "SELECT app.lp5_command_result(gen_random_uuid(),'{}')", "SET ROLE jobguard_command_writer"]) {
      await expect(withTenant(db.runtime, f.context, tx => tx.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
  });
});
