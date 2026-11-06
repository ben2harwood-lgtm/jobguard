import { createHash, randomUUID } from "node:crypto";
import { chooseOfflineQueueItemV1, restoreOfflineQueueV1 } from "../../core/src/offline-client-queue.js";
import { reconcileOfflineResultV1, offlineReconciliationViewV1 } from "../../core/src/offline-reconciliation.js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { OfflineUploadApplication } from "../../../apps/api/src/offline-upload.application.js";
import { offlineUploadPayloadHash } from "../../../apps/api/src/offline-upload.contracts.js";
import { ResumableEvidenceService } from "../src/resumable-evidence.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { seedWorkPractice, commandCounts } from "./job-work-state-command-fixtures.js";

// Server half of M3-7 only. No native transport, cache, encryption or device claim.
// Minimal synthetic PCM WAV, using the format exercised by resumable-evidence.test.ts.
const bytes = Buffer.from("524946462600000057415645666d74201000000001000100401f0000803e00000200100064617461020000000000", "hex");
const hash = createHash("sha256").update(bytes).digest("hex");
let f: WorkFixture;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  f = await createWorkFixture();
}, 120_000);
afterAll(async () => { await closeWorkFixture(f); vi.unstubAllEnvs(); });

async function queuedCapture(deviceCapturedAt = new Date("2099-01-01T00:00:00Z")) {
  const p = await seedWorkPractice(f), scopeId = randomUUID();
  await f.admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",
    [scopeId, p.auth.context.tenantId, p.jobId]);
  const service = new ResumableEvidenceService(f.runtime, true);
  const access = { version: "resumable-evidence.v1", uploadId: randomUUID(), jobId: p.jobId, actorMembershipId: p.auth.membershipId };
  const actor = { membershipId: p.auth.membershipId, identityUserId: p.auth.identityUserId };
  const begun = await service.begin(p.auth.context, actor, { version: access.version, id: access.uploadId,
    jobId: p.jobId, actorMembershipId: access.actorMembershipId, scopeItemId: scopeId,
    expectedSha256: hash, contentType: "audio/wav", maximumBytes: bytes.length, deviceCapturedAt,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  const body = { version: "job-work-state-command.v1" as const, commandId: randomUUID(), expectedRevision: 0, action: "finish" as const };
  const command = { version: "offline-upload.v1", commandId: body.commandId, jobId: p.jobId,
    expectedRevision: 0, body, payloadHash: offlineUploadPayloadHash(p.jobId, body) };
  const finalize = { ...access, commandId: randomUUID(), evidenceType: "site_voice" };
  return { p, actor, service, access, begun, command, finalize, app: new OfflineUploadApplication(f.runtime, p.sessionId) };
}

// Observe persisted server state, not the local queue's claim about success.
async function serverState(q: Awaited<ReturnType<typeof queuedCapture>>) {
  const args = [q.p.auth.context.tenantId, q.p.jobId];
  return {
    counts: await commandCounts(f, q.p),
    events: (await f.admin.query(`SELECT e.sequence::int revision,e.command_id,e.audit_event_id,a.event_hash
      FROM app.job_work_state_event e JOIN app.audit_event a ON (a.tenant_id,a.id)=(e.tenant_id,e.audit_event_id)
      WHERE e.tenant_id=$1 AND e.job_id=$2 ORDER BY e.sequence`, args)).rows,
    audit: (await f.admin.query("SELECT id,sequence,event_hash,previous_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [args[0]])).rows,
  };
}
async function replayAndRefuseStale(q: Awaited<ReturnType<typeof queuedCapture>>) {
  const committed = await serverState(q);
  expect(committed.events).toEqual([expect.objectContaining({ revision: 1, command_id: q.command.commandId,
    audit_event_id: expect.any(String), event_hash: expect.stringMatching(/^[a-f0-9]{64}$/u) })]);
  expect(await q.app.upload(q.command)).toMatchObject({ state: "acknowledged", code: "RECORDED", realExternalActions: 0 });
  const body = { ...q.command.body, commandId: randomUUID() };
  expect(await q.app.upload({ ...q.command, commandId: body.commandId, body,
    payloadHash: offlineUploadPayloadHash(q.p.jobId, body) })).toMatchObject({ state: "conflict", code: "STALE_REVISION", realExternalActions: 0 });
  expect(await serverState(q)).toEqual(committed);
}

it.each(["airplane mode mid-upload", "app kill and restart", "duplicate replay"])("%s resumes original bytes and queue identity against the server", async scenario => {
  const q = await queuedCapture(), context = q.p.auth.context;
  const before = await serverState(q);
  await q.service.append(context, q.actor, { ...q.access, offset: 0, bytes: bytes.subarray(0, 20) });
  await expect(q.service.finalize(context, q.actor, q.finalize)).rejects.toMatchObject({ code: "INCOMPLETE" });
  expect(await serverState(q)).toEqual(before);
  // Drop the response/process references; fresh service reads the persisted offset.
  const restarted = new ResumableEvidenceService(f.runtime, true);
  expect(await restarted.status(context, q.actor, q.access)).toMatchObject({ state: "pending", nextOffset: 20 });
  await restarted.append(context, q.actor, { ...q.access, offset: 0, bytes: bytes.subarray(0, 20) });
  await expect(restarted.append(context, q.actor, { ...q.access, offset: 0, bytes: Buffer.alloc(20, 1) }))
    .rejects.toMatchObject({ code: "CONFLICT" });
  expect(await serverState(q)).toEqual(before);
  await restarted.append(context, q.actor, { ...q.access, offset: 20, bytes: bytes.subarray(20) });
  const evidence = await restarted.finalize(context, q.actor, q.finalize);
  expect(await restarted.finalize(context, q.actor, q.finalize)).toEqual(evidence);
  expect((await f.admin.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2",
    [context.tenantId, q.access.uploadId])).rows).toHaveLength(1);
  const metadata = { version: "offline-queue-item.v1" as const, environment: "synthetic_demo" as const,
    commandId: q.command.commandId, jobId: q.p.jobId, payloadHash: q.command.payloadHash,
    expectedRevision: 0, kind: "work_state" as const, status: "queued" as const, attemptCount: 0, nextAttemptAtMs: 0 };
  const first = chooseOfflineQueueItemV1([metadata], 0);
  const beforeCommand = await serverState(q);
  if (scenario === "app kill and restart") {
    // Server commits; process dies before it saves the acknowledgment.
    expect(await q.app.upload(q.command)).toMatchObject({ state: "acknowledged", code: "RECORDED" });
  } else if (scenario === "duplicate replay") {
    const responses = await Promise.all([q.app.upload(q.command), q.app.upload(q.command)]);
    for (const response of responses) expect(response).toMatchObject({ state: "acknowledged", code: "RECORDED" });
  }
  // Airplane mode has not delivered the command; other cases lost the response.
  // Restore only serialized metadata, keeping the exact separately retained body.
  const restored = restoreOfflineQueueV1(JSON.parse(JSON.stringify(first.items)));
  expect(restored.refused).toEqual([]);
  const replay = chooseOfflineQueueItemV1(restored.items, 0).next!;
  expect(replay).toEqual({ ...metadata, status: "sending", attemptCount: 2 });
  const response = await new OfflineUploadApplication(f.runtime, q.p.sessionId).upload(q.command);
  const reconciled = reconcileOfflineResultV1({ version: "offline-reconciliation.v1", item: replay, reason: null }, response, 0);
  expect(offlineReconciliationViewV1(reconciled).state).toBe("recorded");
  await replayAndRefuseStale(q);
  const after = await serverState(q);
  expect(after.counts.command_receipt).toBe(beforeCommand.counts.command_receipt! + 1);
  expect(after.counts.job_work_state_event).toBe(beforeCommand.counts.job_work_state_event! + 1);
  expect(after.audit.slice(0, beforeCommand.audit.length)).toEqual(beforeCommand.audit);
  expect(after.audit).toHaveLength(beforeCommand.audit.length + 1);
  for (const table of ["journal", "recovery_fee_journal", "synthetic_obligation", "action_outbox"]) {
    expect(after.counts[table]).toBe(beforeCommand.counts[table]);
  }
});

it("full synthetic queue preserves blocked work while an unrelated job records once", async () => {
  const blocked = await queuedCapture(), safe = await queuedCapture();
  const before = await serverState(blocked);
  // 128 pending identities for one job: fixture backlog, not an invented queue capacity.
  const queue = Array.from({ length: 128 }, (_, index) => ({
    version: "offline-queue-item.v1" as const, environment: "synthetic_demo" as const,
    commandId: index ? randomUUID() : blocked.command.commandId, jobId: blocked.p.jobId,
    payloadHash: blocked.command.payloadHash, expectedRevision: 0, kind: "work_state" as const,
    status: index ? "queued" as const : "needs_review" as const, attemptCount: 0, nextAttemptAtMs: 0,
  }));
  queue.push({ ...queue[1]!, commandId: safe.command.commandId, jobId: safe.p.jobId, payloadHash: safe.command.payloadHash });
  const chosen = chooseOfflineQueueItemV1(restoreOfflineQueueV1(queue).items, 0);
  expect(chosen.next?.commandId).toBe(safe.command.commandId);
  expect(chosen.items.slice(0, 128)).toEqual(queue.slice(0, 128));
  expect(await safe.app.upload(safe.command)).toMatchObject({ state: "acknowledged", code: "RECORDED" });
  await replayAndRefuseStale(safe);
  // The shared tenant audit advances for safe work; blocked job revision does not.
  expect((await serverState(blocked)).events).toEqual(before.events);
  expect(chosen.items).toHaveLength(129);
});

it("schema upgrade refuses unknown envelopes without consuming pending bytes or a command identity", async () => {
  const q = await queuedCapture(), context = q.p.auth.context;
  await q.service.append(context, q.actor, { ...q.access, offset: 0, bytes: bytes.subarray(0, 20) });
  const unchanged = await serverState(q);
  const before = await commandCounts(f, q.p);
  await expect(q.app.upload({ ...q.command, version: "offline-upload.v2" })).rejects.toMatchObject({ code: "INVALID_OFFLINE_UPLOAD" });
  await expect(q.app.upload({ ...q.command, body: { ...q.command.body, version: "job-work-state-command.v2" } })).rejects.toMatchObject({ code: "INVALID_OFFLINE_UPLOAD" });
  await expect(q.service.append(context, q.actor, { ...q.access, version: "resumable-evidence.v2", offset: 20, bytes: bytes.subarray(20) })).rejects.toMatchObject({ name: "ZodError" });
  expect(await commandCounts(f, q.p)).toEqual(before);
  expect(await serverState(q)).toEqual(unchanged);
  // A fresh server object accepts the still-supported format without resetting durable work.
  const current = new ResumableEvidenceService(f.runtime, true);
  expect(await current.status(context, q.actor, q.access)).toMatchObject({ state: "pending", nextOffset: 20 });
  await current.append(context, q.actor, { ...q.access, offset: 20, bytes: bytes.subarray(20) });
  await expect(current.finalize(context, q.actor, q.finalize)).resolves.toMatchObject({ sha256: hash });
  await expect(q.app.upload(q.command)).resolves.toMatchObject({ state: "acknowledged", code: "RECORDED", realExternalActions: 0 });
  const committed = await commandCounts(f, q.p);
  expect(committed.command_receipt).toBe(before.command_receipt! + 1);
  expect(committed.job_work_state_event).toBe(before.job_work_state_event! + 1);
  expect(committed.action_outbox).toBe(before.action_outbox);
  await replayAndRefuseStale(q);
});

it("offline membership revocation refuses state, remaining bytes, finalization and command replay without effects", async () => {
  const q = await queuedCapture(), context = q.p.auth.context;
  await q.service.append(context, q.actor, { ...q.access, offset: 0, bytes });
  await expect(q.app.upload(q.command)).resolves.toMatchObject({ state: "acknowledged", code: "RECORDED" });
  const before = await commandCounts(f, q.p);
  const unchanged = await serverState(q);
  const pendingBody = { ...q.command.body, commandId: randomUUID() };
  const pending = { ...q.command, commandId: pendingBody.commandId, body: pendingBody,
    payloadHash: offlineUploadPayloadHash(q.p.jobId, pendingBody) };
  await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
    [context.tenantId, q.access.actorMembershipId]);
  try {
    await expect(q.service.status(context, q.actor, q.access)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(q.service.append(context, q.actor, { ...q.access, offset: 0, bytes })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(q.service.finalize(context, q.actor, q.finalize)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(q.app.upload(q.command)).resolves.toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED", realExternalActions: 0 });
    expect(await commandCounts(f, q.p)).toEqual(before);
    const response = await q.app.upload(pending);
    expect(response).toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED", realExternalActions: 0 });
    const reconciled = reconcileOfflineResultV1({ version: "offline-reconciliation.v1", reason: null, item: {
      version: "offline-queue-item.v1", environment: "synthetic_demo", commandId: pending.commandId,
      jobId: pending.jobId, payloadHash: pending.payloadHash, expectedRevision: pending.expectedRevision,
      kind: "work_state", status: "sending", attemptCount: 1, nextAttemptAtMs: 0,
    } }, response, 0);
    expect(offlineReconciliationViewV1(reconciled)).toMatchObject({ state: "refused", reason: "PERMISSION_REVOKED" });
    expect(chooseOfflineQueueItemV1([reconciled.item], Number.MAX_SAFE_INTEGER).next).toBeNull();
    expect(await serverState(q)).toEqual(unchanged);
    expect((await f.admin.query("SELECT state FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2", [context.tenantId, q.access.uploadId])).rows).toEqual([{ state: "pending" }]);
    expect((await f.admin.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2", [context.tenantId, q.access.uploadId])).rows).toEqual([]);
  } finally {
    // Restore this shared synthetic fixture member for other cases; no product recovery policy implied.
    await f.admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [context.tenantId, q.access.actorMembershipId]);
  }
});

it.each(["1970-01-01T00:00:00Z", "2099-01-01T00:00:00Z"])("clock skew %s remains labelled metadata and cannot extend server expiry", async capturedAt => {
  const start = Date.now(), q = await queuedCapture(new Date(capturedAt)), context = q.p.auth.context;
  const expiry = q.begun.upload.expiresAt.getTime();
  expect(expiry).toBeGreaterThanOrEqual(start + 24 * 60 * 60 * 1000);
  expect(expiry).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
  await q.service.append(context, q.actor, { ...q.access, offset: 0, bytes });
  const original = await q.service.finalize(context, q.actor, q.finalize);
  expect(original.device_captured_at).toEqual(new Date(capturedAt));
  expect(original.server_received_at.getTime()).toBeGreaterThanOrEqual(start);
  expect(original.server_verified_at.getTime()).toBeLessThanOrEqual(Date.now());
  expect(original.sha256.trim()).toBe(hash);
  expect(await q.app.upload(q.command)).toMatchObject({ state: "acknowledged", code: "RECORDED" });
  await replayAndRefuseStale(q);
  // Expire a second transfer using server state, leaving the device's far-off clock unchanged.
  const expired = await queuedCapture(new Date(capturedAt));
  await expired.service.append(expired.p.auth.context, expired.actor, { ...expired.access, offset: 0, bytes });
  await f.admin.query("UPDATE app.evidence_upload SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",
    [context.tenantId, expired.access.uploadId]);
  const before = await commandCounts(f, expired.p);
  const unchanged = await serverState(expired);
  await expect(expired.service.append(expired.p.auth.context, expired.actor, { ...expired.access, offset: 0, bytes })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(expired.service.finalize(expired.p.auth.context, expired.actor, expired.finalize)).rejects.toMatchObject({ code: "UPLOAD_EXPIRED" });
  expect(await commandCounts(f, expired.p)).toEqual(before);
  expect(await serverState(expired)).toEqual(unchanged);
  expect((await f.admin.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2",
    [context.tenantId, expired.access.uploadId])).rows).toEqual([]);
});
