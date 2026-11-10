import { testBoundTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// CH-2 (C5 and the replay Done-when) for proof completion: a replay is a request like any other, so the actor's membership is
// checked, active and unexpired, before ANY result is returned, and a Decision that the server derives is recorded with the first
// result so a later Decision cannot change what a replay returns.
const h = createWatchdogHarness("proof-replay", 62000);
beforeAll(() => h.boot(), 120000);
afterAll(() => h.stop());

const memberContexts = new Map<string, Awaited<ReturnType<typeof testBoundTenantContext>>>();
const contextFor = (actor: string) => {
  const context = memberContexts.get(actor);
  if (!context) throw new Error("Synthetic proof member has no credential");
  return context;
};
const completeProof = (command: { actorMembershipId: string; [key: string]: unknown }) => h.repos.proof.complete(contextFor(command.actorMembershipId), command);
const invalidateProof = (command: { actorMembershipId: string; [key: string]: unknown }) => h.repos.proof.invalidate(contextFor(command.actorMembershipId), command);

async function newMember(options: { revoked?: boolean; expired?: boolean } = {}) {
  const user = randomUUID(), account = randomUUID(), id = randomUUID();
  await h.admin.query("INSERT INTO identity.identity_user(id)VALUES($1)", [user]);
  await h.admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional proof actor')", [account, h.tenant]);
  await h.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at,expires_at)VALUES($1,$2,$3,$4,'owner',$5,$6)", [id, h.tenant, account, user, options.revoked ? new Date(Date.now() - 1000) : null, options.expired ? new Date(Date.now() - 1000) : null]);
  memberContexts.set(id, await testBoundTenantContext(h.admin,h.tenant,id));
  return id;
}
const complete = (job: string, actor: string, commandId = randomUUID(), extra: Record<string, unknown> = {}) => ({
  version: "proof.complete.v1" as const, commandId, actorMembershipId: actor, jobId: job, scopeItemId: h.st(job).scope, stage: "electrical-stage", evidenceId: h.st(job).upload.id,
  requiredEvidenceType: "electrical_certificate", decisionId: null, ...extra,
});
const rows = async (job: string) => ({
  receipts: Number((await h.admin.query("SELECT count(*) n FROM app.command_receipt WHERE command_type='proof.complete' AND semantic_key LIKE $1", [`${job}:%`])).rows[0].n),
  completions: Number((await h.admin.query("SELECT count(*) n FROM app.stage_completion WHERE job_id=$1", [job])).rows[0].n),
  identities: Number((await h.admin.query("SELECT count(*) n FROM app.watchdog_command_identity WHERE job_id=$1 AND command_type='proof.complete'", [job])).rows[0].n),
});
const revoke = (id: string) => h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [h.tenant, id]);
const expire = (id: string) => h.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [h.tenant, id]);
const FORBIDDEN = { code: "FORBIDDEN" };

describe("proof completion re-checks the actor's membership before every replay", () => {
  it("an unchanged replay by a member revoked since the first run is refused and changes nothing", async () => {
    const job = await h.live(); await h.pre.evidence(job);
    const actor = await newMember(), command = complete(job, actor);
    const first = await completeProof(command);
    expect(await completeProof(command)).toEqual(first); // still active: the first result
    const before = await rows(job);
    await revoke(actor);
    await expect(completeProof(command)).rejects.toMatchObject(FORBIDDEN);
    expect(await rows(job)).toEqual(before);
  });
  it("an unchanged replay by a member whose membership has since expired is refused and changes nothing", async () => {
    const job = await h.live(); await h.pre.evidence(job);
    const actor = await newMember(), command = complete(job, actor);
    const first = await completeProof(command);
    const before = await rows(job);
    await expire(actor);
    await expect(completeProof(command)).rejects.toMatchObject(FORBIDDEN);
    expect(await rows(job)).toEqual(before);
    expect(first).toMatchObject({ state: "complete" });
  });
  it("a first run by a revoked or an expired member is refused and leaves no identity, receipt or completion", async () => {
    for (const state of [{ revoked: true }, { expired: true }]) {
      const job = await h.live(); await h.pre.evidence(job);
      await expect(completeProof(complete(job, await newMember(state)))).rejects.toMatchObject(FORBIDDEN);
      expect(await rows(job)).toEqual({ receipts: 0, completions: 0, identities: 0 });
    }
  });
  it("a revoked member's replay is refused for the id of a command whose payload changed too: the membership is checked first", async () => {
    const job = await h.live(); await h.pre.evidence(job);
    const actor = await newMember(), command = complete(job, actor);
    await completeProof(command);
    await revoke(actor);
    await expect(completeProof({ ...command, stage: "other-stage" })).rejects.toMatchObject(FORBIDDEN);
  });
  it("invalidation by an expired member is refused and records nothing", async () => {
    const job = await h.live(); await h.pre.evidence(job);
    const actor = await newMember({ expired: true });
    await expect(invalidateProof({ version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: actor, evidenceId: h.st(job).upload.id, reasonCode: "verification_invalid" })).rejects.toMatchObject(FORBIDDEN);
    expect(Number((await h.admin.query("SELECT count(*) n FROM app.evidence_invalidation WHERE evidence_id=$1", [h.st(job).upload.id])).rows[0].n)).toBe(0);
  });
});

describe("a Decision the server derives is recorded with the first result", () => {
  it("complete resolves the latest proof Decision it finds, and its replay returns that result after a newer Decision exists", async () => {
    const job = await h.live(), actor = await newMember();
    await h.pre.evidence(job);
    const firstUpload = h.st(job).upload.id;
    // An invalidation opens a proof Decision (the rework Decision) for the scope item.
    await invalidateProof({ version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: actor, evidenceId: firstUpload, reasonCode: "verification_invalid" });
    const opened = (await h.admin.query("SELECT d.id FROM app.decision d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.id) WHERE f.job_id=$1 AND d.action_type='proof.capture' ORDER BY f.created_at DESC LIMIT 1", [job])).rows[0].id as string;
    // Replacement proof, completed with the Decision derived on the server (the caller does not name it).
    delete h.st(job).upload; delete h.st(job).evidence; await h.pre.evidence(job);
    const command = complete(job, actor, randomUUID(), { stage: "electrical-stage-2", decisionId: null, deriveDecision: true });
    const first = await completeProof(command) as Record<string, unknown>;
    expect(first).toMatchObject({ state: "complete", decisionId: opened });
    expect((await h.admin.query("SELECT resolution FROM app.decision_resolution WHERE decision_id=$1", [opened])).rows.map(row => row.resolution)).toEqual(["approved"]);
    // Invalidating the replacement opens a NEWER Decision. The unchanged request still returns the first result.
    await invalidateProof({ version: "proof.invalidate.v1", commandId: randomUUID(), actorMembershipId: actor, evidenceId: h.st(job).upload.id, reasonCode: "verification_invalid" });
    expect(Number((await h.admin.query("SELECT count(DISTINCT d.id) n FROM app.decision d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.id) WHERE f.job_id=$1 AND d.action_type='proof.capture'", [job])).rows[0].n)).toBe(2);
    expect(await completeProof(command)).toEqual(first);
    // A changed request, and the same id on another stage, still conflict.
    await expect(completeProof({ ...command, stage: "electrical-stage-3" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  });
});
