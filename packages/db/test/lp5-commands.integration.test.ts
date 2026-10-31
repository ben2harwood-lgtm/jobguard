import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdoptInFlightJobMutation } from "../src/job-import-repository.js";
import { ConfirmProposalReview } from "../src/review-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { withTenant, type TenantTransaction } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { adoptionFixture, reviewFixture, jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); await installLegacySyntheticPartyFixtures(db.owner); }, 300_000);
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
    const commands=[f.command, f.command, { ...f.command, commandId: randomUUID() }];
    const results = await Promise.all(commands.map(c => f.dispatcher.dismissDecision(f.context, c)));
    expect(results).toEqual(Array(3).fill({ decisionId: f.command.decisionId, resolution: "dismissed", authorizedAction: false }));
    expect(await counts(f.actor.tenant)).toMatchObject({ receipts: 1, resolutions: 1, authorizations: 0, audits: 2 });
    const audits = (await db.owner.query("SELECT version,payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='command.succeeded'", [f.actor.tenant])).rows;
    expect(audits).toHaveLength(1);
    const receipts=(await db.owner.query("SELECT command_id FROM app.command_receipt WHERE tenant_id=$1",[f.actor.tenant])).rows;
    expect(receipts).toHaveLength(1);
    expect(commands.map(c=>c.commandId)).toContain(receipts[0].command_id);
    expect(audits[0]).toMatchObject({ version: "audit.v2", payload: { references: { commandId: receipts[0].command_id, auditTrust: "checked_operation" } } });
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
  it.each(["recovery.message.approve", "other.family"])("requires an unconverted %s receipt to finish before commit", async commandType => {
    const f = await fixture(), commandId = randomUUID();
    let inserted = 0;
    const insert = async (tx: TenantTransaction) => { const result = await tx.$client.query(`INSERT INTO app.command_receipt
      (command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
      VALUES($1::uuid,$2::uuid,$3::text,$1::uuid::text,repeat('a',64),'processing',$4::uuid)`, [commandId, f.actor.tenant, commandType, f.actor.member]); inserted++; return result; };
    await expect(withTenant(db.owner, f.context, insert)).rejects.toMatchObject({ code: "23514", message: "COMMAND_CONFLICT" });
    expect(inserted).toBe(1); // The deferred guard, rather than parameter parsing, refuses commit.
    await withTenant(db.owner, f.context, async tx => {
      await insert(tx);
      await tx.$client.query("UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [f.actor.tenant, commandId]);
    });
    const receipt = await withTenant(db.runtime, f.context, tx => tx.$client.query(
      "SELECT command_type,status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.actor.tenant, commandId]));
    expect(receipt.rows).toEqual([{ command_type: commandType, status: "succeeded" }]);
    expect((await db.owner.query("SELECT count(*)::int n FROM app.command_lifecycle_claim WHERE tenant_id=$1 AND command_id=$2", [f.actor.tenant, commandId])).rows)
      .toEqual([{ n: 0 }]);
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
  it("replays review confirmation with a fresh server-generated expiry and keeps the original result contract", async () => {
    const f = await reviewFixture(db), dispatcher = new UserCommandDispatcher(db.runtime);
    const mutation = new ConfirmProposalReview(f.review);
    let calls = 0, expected: Record<string, unknown> | undefined;
    const handler = { mutate: async (tx: Parameters<typeof mutation.mutate>[0], command: Parameters<typeof mutation.mutate>[1]) => {
      calls++; expected = await mutation.mutate(tx, command); return expected;
    } };
    const first = await dispatcher.dispatch(f.context, f.command, handler);
    expect(first).toEqual(expected);
    expect(await dispatcher.dispatch(f.context, { ...f.command, action: { ...f.command.action, expiresAt: new Date("2099-01-01T00:01:00Z") } }, handler)).toEqual(first);
    expect(calls).toBe(1);
    expect(await counts(f.actor.tenant)).toMatchObject({ receipts: 1, authorizations: 1 });
  });
  it("replays legacy adoption with a fresh server-generated expiry and retains its base result contract", async () => {
    const f = await adoptionFixture(db), context = testTenantContext(f.actor.tenant), dispatcher = new UserCommandDispatcher(db.runtime);
    const mutation = new AdoptInFlightJobMutation(f.actor.tenant, "synthetic_candidate", f.input);
    let calls = 0, expected: Record<string, unknown> | undefined;
    const handler = { auditEvents: mutation.auditEvents.bind(mutation), mutate: async (tx: Parameters<typeof mutation.mutate>[0], command: Parameters<typeof mutation.mutate>[1]) => {
      calls++; expected = await mutation.mutate(tx, command); return expected;
    } };
    const first = await dispatcher.dispatch(context, f.command, handler);
    expect(first).toEqual(expected);
    expect(await dispatcher.dispatch(context, { ...f.command, action: { ...f.command.action, expiresAt: new Date("2099-01-01T00:01:00Z") } }, handler)).toEqual(first);
    expect(calls).toBe(1);
    expect((await db.owner.query("SELECT count(*)::int n FROM app.imported_job_baseline WHERE tenant_id=$1", [f.actor.tenant])).rows[0].n).toBe(1);
  });
  it("cannot bypass a completed receipt's proof by switching tenant before commit", async () => {
    const f = await fixture(), other = await jobDoorsActor(db.owner), c = commercial(f, { commandType: "synthetic.lock" });
    const first = await f.dispatcher.dispatch(f.context, c, { mutate: async () => ({ locked: f.job }) });
    await expect(withTenant(db.runtime, f.context, async tx => {
      await tx.$client.query("UPDATE app.command_receipt SET result='{\"forged\":true}' WHERE command_id=$1", [c.commandId]);
      await tx.$client.query("SELECT set_config('app.tenant_id',$1,true)", [other.tenant]);
    })).rejects.toMatchObject({ code: "23514", message: "AUTHORIZATION_INVALID" });
    expect((await db.owner.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.actor.tenant, c.commandId])).rows[0].result).toEqual(first);
  });
  it.each(["foreign", "", "not-a-uuid"])("checks the receipt tenant and restores the caller's %j setting", async setting => {
    const f = await fixture(), other = await jobDoorsActor(db.owner), c = commercial(f, { commandType: "synthetic.lock" });
    const callerSetting = setting === "foreign" ? other.tenant : setting;
    await withTenant(db.runtime, f.context, async tx => {
      await tx.$client.query("SELECT app.begin_command($1,$2,$3,$4,$5,$6,$7)", [c.version, c.commandId, c.commandType, c.semanticKey,
        { tenantId: f.actor.tenant, actorMembershipId: f.actor.member, subjectType: c.subjectType, subjectRef: c.subjectRef }, { aggregateRevision: c.action.aggregateRevision }, c]);
      await tx.$client.query("SELECT app.complete_command($1,$2)", [c.commandId, { locked: f.job }]);
      await tx.$client.query("SELECT set_config('app.tenant_id',$1,true)", [callerSetting]);
      await tx.$client.query("SET CONSTRAINTS ALL IMMEDIATE");
      expect((await tx.$client.query("SELECT current_setting('app.tenant_id',true) tenant")).rows[0].tenant).toBe(callerSetting);
    });
  });
  it("keeps the legacy transition fixture unavailable to a runtime owner", async () => {
    const f = await fixture();
    await expect(withTenant(db.runtime, f.context, tx => tx.$client.query(
      "SELECT * FROM app.transition_job($1,$2,1,'live','switch_live',$3,10000,'pilot-no-charge-v1',0)", [f.actor.tenant, f.job, randomUUID()]))).rejects.toMatchObject({ code: "42501" });
  });

});
