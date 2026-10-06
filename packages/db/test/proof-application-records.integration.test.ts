import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ProofApplicationRecords, withTenant } from "../src/index.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// The proof application answers three live-only commands (select a generated file, finalise it, complete the stage). Each answer is the
// application's projection of the job, which changes as the job moves on, so the first one is recorded with the request it answered
// (bound to the command's claimed identity, job and action) and replayed as is. Recording it is append-only; the first writer wins.
const h = createWatchdogHarness("proof-records", 62500);
let records: ProofApplicationRecords;
beforeAll(async () => { await h.boot(); records = new ProofApplicationRecords(h.observed.pool); }, 120000);
afterAll(() => h.stop());

const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function member(options: { revoked?: boolean } = {}) {
  const user = randomUUID(), account = randomUUID(), id = randomUUID();
  await h.admin.query("INSERT INTO identity.identity_user(id)VALUES($1)", [user]);
  await h.admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional recorder')", [account, h.tenant]);
  await h.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at)VALUES($1,$2,$3,$4,'owner',$5)", [id, h.tenant, account, user, options.revoked ? new Date(Date.now() - 1000) : null]);
  return id;
}
/** One claimed command id per action, through the real commands. */
async function claimed(job: string, actor: string) {
  const upload = await h.pre.upload(job), finalizeId = randomUUID(), completeId = randomUUID();
  await h.repos.evidence.finalize(h.ctx, { commandId: finalizeId, uploadId: upload.id, objectVersionId: "v1", evidenceType: "electrical_certificate" });
  await h.repos.proof.complete(h.ctx, { version: "proof.complete.v1", commandId: completeId, actorMembershipId: actor, jobId: job, scopeItemId: h.st(job).scope, stage: "electrical-stage", evidenceId: upload.id, requiredEvidenceType: "electrical_certificate", decisionId: null });
  return { select_generated: upload.id, finalize: finalizeId, complete: completeId } as const;
}
const actions = ["select_generated", "finalize", "complete"] as const;

describe("proof application records", () => {
  it.each(actions)("%s: the first response is recorded once and replayed unchanged for the same request", async action => {
    const job = await h.live(), actor = await member(), ids = await claimed(job, actor), commandId = ids[action];
    const request = hashOf({ job, action, commandId });
    expect(await records.replay(h.ctx, { commandId, jobId: job, action, requestHash: request, actorMembershipId: actor })).toBeNull();
    const first = { version: "practice-proof-view.v1", note: "as first answered", upload: { state: "pending" } };
    expect(await records.record(h.ctx, { commandId, jobId: job, action, requestHash: request, response: first })).toEqual(first);
    // A later answer cannot replace it: the recorded one comes back.
    expect(await records.record(h.ctx, { commandId, jobId: job, action, requestHash: request, response: { note: "a later projection" } })).toEqual(first);
    expect(await records.replay(h.ctx, { commandId, jobId: job, action, requestHash: request, actorMembershipId: actor })).toEqual({ response: first });
  });

  it("refuses to replay for another request, another job or another action, and for a member who is no longer active", async () => {
    const job = await h.live(), other = await h.live(), actor = await member(), ids = await claimed(job, actor);
    const commandId = ids.complete, request = hashOf({ job, commandId });
    await records.record(h.ctx, { commandId, jobId: job, action: "complete", requestHash: request, response: { ok: true } });
    const spec = { commandId, jobId: job, action: "complete" as const, requestHash: request, actorMembershipId: actor };
    await expect(records.replay(h.ctx, { ...spec, requestHash: hashOf("changed") })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(records.replay(h.ctx, { ...spec, jobId: other })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(records.replay(h.ctx, { ...spec, action: "finalize" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    await expect(records.replay(h.ctx, { ...spec, actorMembershipId: await member({ revoked: true }) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await h.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [h.tenant, actor]);
    await expect(records.replay(h.ctx, spec)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cannot record a response for a command nothing has claimed, or for another job's or another kind's claim", async () => {
    const job = await h.live(), other = await h.live(), actor = await member(), ids = await claimed(job, actor);
    await expect(records.record(h.ctx, { commandId: randomUUID(), jobId: job, action: "complete", requestHash: hashOf("x"), response: {} })).rejects.toThrow();
    await expect(records.record(h.ctx, { commandId: ids.complete, jobId: other, action: "complete", requestHash: hashOf("x"), response: {} })).rejects.toThrow();
    await expect(records.record(h.ctx, { commandId: ids.complete, jobId: job, action: "finalize", requestHash: hashOf("x"), response: {} })).rejects.toThrow();
    expect(Number((await h.admin.query("SELECT count(*) n FROM app.proof_application_response WHERE command_id=ANY($1::uuid[])", [[ids.complete]])).rows[0].n)).toBe(0);
  });

  it("parallel writers leave one response and every caller gets that one", async () => {
    const job = await h.live(), actor = await member(), ids = await claimed(job, actor), commandId = ids.finalize;
    const request = hashOf({ job, commandId });
    const answers = await Promise.all([1, 2, 3, 4].map(n => records.record(h.ctx, { commandId, jobId: job, action: "finalize", requestHash: request, response: { writer: n } })));
    expect(new Set(answers.map(answer => JSON.stringify(answer))).size).toBe(1);
    expect(Number((await h.admin.query("SELECT count(*) n FROM app.proof_application_response WHERE command_id=$1", [commandId])).rows[0].n)).toBe(1);
  });

  it("an answer recorded in the completing transaction commits with its command, and a failure there rolls the command back", async () => {
    // Codex P2 4197245501: the effect used to commit before the answer was recorded in a separate transaction, so a failure between the
    // two left a completed command without its answer, and the retry recorded whatever the job looked like by then.
    const job = await h.live(), actor = await member(), upload = await h.pre.upload(job), lost = async () => { throw new Error("lost before the answer was stored"); };
    const finalizeId = randomUUID(), finalize = { commandId: finalizeId, uploadId: upload.id, objectVersionId: "v1", evidenceType: "electrical_certificate" };
    const finalizeSpec = { commandId: finalizeId, jobId: job, action: "finalize" as const, requestHash: hashOf({ job, finalizeId }) };
    await expect(h.repos.evidence.finalize(h.ctx, finalize, lost)).rejects.toThrow("lost before the answer was stored");
    expect((await h.admin.query("SELECT 1 FROM app.evidence_object WHERE tenant_id=$1 AND id=$2", [h.tenant, upload.id])).rowCount).toBe(0);
    await h.repos.evidence.finalize(h.ctx, finalize, async db => { await records.recordIn(db, h.tenant, { ...finalizeSpec, response: { as: "first answered" } }); });
    expect((await h.admin.query("SELECT 1 FROM app.evidence_object WHERE tenant_id=$1 AND id=$2", [h.tenant, upload.id])).rowCount).toBe(1);
    expect(await records.replay(h.ctx, { ...finalizeSpec, actorMembershipId: actor })).toEqual({ response: { as: "first answered" } });
    const replayedFinalize = vi.fn(async () => {});
    await h.repos.evidence.finalize(h.ctx, finalize, replayedFinalize);
    expect(replayedFinalize).not.toHaveBeenCalled();

    const completeId = randomUUID(), completeSpec = { commandId: completeId, jobId: job, action: "complete" as const, requestHash: hashOf({ job, completeId }) };
    const completion = { version: "proof.complete.v1", commandId: completeId, actorMembershipId: actor, jobId: job, scopeItemId: h.st(job).scope, stage: "electrical-stage", evidenceId: upload.id, requiredEvidenceType: "electrical_certificate", decisionId: null };
    await expect(h.repos.proof.complete(h.ctx, completion, lost)).rejects.toThrow("lost before the answer was stored");
    expect((await h.admin.query("SELECT 1 FROM app.stage_completion WHERE tenant_id=$1 AND command_id=$2", [h.tenant, completeId])).rowCount).toBe(0);
    await h.repos.proof.complete(h.ctx, completion, async db => { await records.recordIn(db, h.tenant, { ...completeSpec, response: { as: "completed" } }); });
    expect((await h.admin.query("SELECT 1 FROM app.stage_completion WHERE tenant_id=$1 AND command_id=$2", [h.tenant, completeId])).rowCount).toBe(1);
    expect(await records.replay(h.ctx, { ...completeSpec, actorMembershipId: actor })).toEqual({ response: { as: "completed" } });
    const replayedCompletion = vi.fn(async () => {});
    await h.repos.proof.complete(h.ctx, completion, replayedCompletion);
    expect(replayedCompletion).not.toHaveBeenCalled();
  });

  it("is append-only for the runtime role and tenant-isolated", async () => {
    const job = await h.live(), actor = await member(), ids = await claimed(job, actor), commandId = ids.complete;
    await records.record(h.ctx, { commandId, jobId: job, action: "complete", requestHash: hashOf("a"), response: { ok: true } });
    for (const sql of ["UPDATE app.proof_application_response SET response='{}'::jsonb", "DELETE FROM app.proof_application_response", "TRUNCATE app.proof_application_response"])
      await expect(withTenant(h.runtime, h.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
    const stranger = { tenantId: randomUUID() } as typeof h.ctx;
    expect((await withTenant(h.runtime, stranger, db => db.$client.query("SELECT 1 FROM app.proof_application_response"))).rowCount).toBe(0);
  });
});
