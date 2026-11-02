import { createHash, randomUUID } from "node:crypto";
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
  const begun = await service.begin(p.auth.context, { version: access.version, id: access.uploadId,
    jobId: p.jobId, actorMembershipId: access.actorMembershipId, scopeItemId: scopeId,
    expectedSha256: hash, contentType: "audio/wav", maximumBytes: bytes.length, deviceCapturedAt,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  const body = { version: "job-work-state-command.v1" as const, commandId: randomUUID(), expectedRevision: 0, action: "finish" as const };
  const command = { version: "offline-upload.v1", commandId: body.commandId, jobId: p.jobId,
    expectedRevision: 0, body, payloadHash: offlineUploadPayloadHash(p.jobId, body) };
  const finalize = { ...access, commandId: randomUUID(), evidenceType: "site_voice" };
  return { p, service, access, begun, command, finalize, app: new OfflineUploadApplication(f.runtime, p.sessionId) };
}

it("schema upgrade refuses unknown envelopes without consuming pending bytes or a command identity", async () => {
  const q = await queuedCapture(), context = q.p.auth.context;
  await q.service.append(context, { ...q.access, offset: 0, bytes: bytes.subarray(0, 20) });
  const before = await commandCounts(f, q.p);
  await expect(q.app.upload({ ...q.command, version: "offline-upload.v2" })).rejects.toMatchObject({ code: "INVALID_OFFLINE_UPLOAD" });
  await expect(q.app.upload({ ...q.command, body: { ...q.command.body, version: "job-work-state-command.v2" } })).rejects.toMatchObject({ code: "INVALID_OFFLINE_UPLOAD" });
  await expect(q.service.append(context, { ...q.access, version: "resumable-evidence.v2", offset: 20, bytes: bytes.subarray(20) })).rejects.toMatchObject({ name: "ZodError" });
  expect(await commandCounts(f, q.p)).toEqual(before);
  // A fresh server object accepts the still-supported format without resetting durable work.
  const current = new ResumableEvidenceService(f.runtime, true);
  expect(await current.status(context, q.access)).toMatchObject({ state: "pending", nextOffset: 20 });
  await current.append(context, { ...q.access, offset: 20, bytes: bytes.subarray(20) });
  await expect(current.finalize(context, q.finalize)).resolves.toMatchObject({ sha256: hash });
  await expect(q.app.upload(q.command)).resolves.toMatchObject({ state: "acknowledged", code: "RECORDED", realExternalActions: 0 });
  const committed = await commandCounts(f, q.p);
  expect(committed.command_receipt).toBe(before.command_receipt! + 1);
  expect(committed.job_work_state_event).toBe(before.job_work_state_event! + 1);
  expect(committed.action_outbox).toBe(before.action_outbox);
});

it("offline membership revocation refuses state, remaining bytes, finalization and command replay without effects", async () => {
  const q = await queuedCapture(), context = q.p.auth.context;
  await q.service.append(context, { ...q.access, offset: 0, bytes });
  await expect(q.app.upload(q.command)).resolves.toMatchObject({ state: "acknowledged", code: "RECORDED" });
  const before = await commandCounts(f, q.p);
  await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
    [context.tenantId, q.access.actorMembershipId]);
  try {
    await expect(q.service.status(context, q.access)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(q.service.append(context, { ...q.access, offset: 0, bytes })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(q.service.finalize(context, q.finalize)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(q.app.upload(q.command)).resolves.toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED", realExternalActions: 0 });
    expect(await commandCounts(f, q.p)).toEqual(before);
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
  await q.service.append(context, { ...q.access, offset: 0, bytes });
  const original = await q.service.finalize(context, q.finalize);
  expect(original.device_captured_at).toEqual(new Date(capturedAt));
  expect(original.server_received_at.getTime()).toBeGreaterThanOrEqual(start);
  expect(original.server_verified_at.getTime()).toBeLessThanOrEqual(Date.now());
  expect(original.sha256.trim()).toBe(hash);
  // Expire a second transfer using server state, leaving the device's far-off clock unchanged.
  const expired = await queuedCapture(new Date(capturedAt));
  await expired.service.append(expired.p.auth.context, { ...expired.access, offset: 0, bytes });
  await f.admin.query("UPDATE app.evidence_upload SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",
    [context.tenantId, expired.access.uploadId]);
  const before = await commandCounts(f, expired.p);
  await expect(expired.service.append(expired.p.auth.context, { ...expired.access, offset: 0, bytes })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(expired.service.finalize(expired.p.auth.context, expired.finalize)).rejects.toMatchObject({ code: "UPLOAD_EXPIRED" });
  expect(await commandCounts(f, expired.p)).toEqual(before);
  expect((await f.admin.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2",
    [context.tenantId, expired.access.uploadId])).rows).toEqual([]);
});
