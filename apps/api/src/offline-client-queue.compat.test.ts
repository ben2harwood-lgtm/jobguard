import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { offlineQueueResultCodesV1, applyOfflineUploadResultV1, offlineQueueItemV1 } from "@jobguard/core";
import { offlineUploadPayloadHash, offlineUploadResultV1 } from "./offline-upload.contracts.js";
import { OfflineUploadController } from "./offline-upload.controller.js";
import { PracticeAccess } from "./practice-access.js";
import { JobWorkStateApplication } from "./job-work-state.application.js";

it("M3-4 client rules explicitly know every API result code and handle every state", () => {
 expect([...offlineQueueResultCodesV1].sort()).toEqual([...offlineUploadResultV1.shape.code.options].sort());
 const item = offlineQueueItemV1.parse({ version: "offline-queue-item.v1", environment: "synthetic_demo",
  commandId: "00000000-0000-7000-8000-000000000001", jobId: "00000000-0000-7000-8000-000000000002",
  payloadHash: "a".repeat(64), expectedRevision: null, kind: "site_extra", attemptCount: 1, nextAttemptAtMs: 0, status: "sending" });
 for (const code of offlineUploadResultV1.shape.code.options) {
  for (const state of offlineUploadResultV1.shape.state.options) {
   const response = offlineUploadResultV1.parse({ version: "offline-upload-result.v1", commandId: item.commandId, state, code, realExternalActions: 0 });
   const expected = state === "acknowledged" && code === "RECORDED" ? "recorded"
    : state === "retryable" && code === "UNAVAILABLE" ? "queued" : "needs_review";
   expect(applyOfflineUploadResultV1(item, response, 0).status, `${state}/${code}`).toBe(expected);
  }
 }
});

it("the composed queue uses the authenticated PostgreSQL upload boundary and replays a committed lost response once", async () => {
 // URL imports keep device code and database test infrastructure outside API compilation.
 const { createWorkFixture, closeWorkFixture } = await import(new URL("../../../packages/db/test/job-work-state-fixtures.ts", import.meta.url).href);
 const { seedWorkPractice, commandCounts } = await import(new URL("../../../packages/db/test/job-work-state-command-fixtures.ts", import.meta.url).href);
 const { NativeComposition } = await import(new URL("../../mobile/src/composition.ts", import.meta.url).href);
 const { localData } = await import(new URL("../../mobile/src/lifecycle-contracts.ts", import.meta.url).href);
 const { localSmallBuilderQueue } = await import(new URL("../../mobile/src/local-api.ts", import.meta.url).href);
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "http://localhost:3000");
 const db = await createWorkFixture();
 let closeHttp: (() => Promise<void>) | undefined;
 try {
  const owned = await seedWorkPractice(db), unrelated = await seedWorkPractice(db);
  Reflect.defineMetadata("design:paramtypes", [Pool], OfflineUploadController);
  const module = await Test.createTestingModule({
   controllers: [OfflineUploadController], providers: [{ provide: Pool, useValue: db.runtime }],
  }).compile();
  const http = module.createNestApplication({ logger: false });
  closeHttp = () => http.close();
  await http.listen(0, "127.0.0.1");
  const access = new PracticeAccess(db.runtime, owned.sessionId);
  const partition = { userId: owned.auth.identityUserId, tenantId: owned.auth.context.tenantId, membershipId: owned.auth.membershipId,
   mobileSessionId: randomUUID(), deviceInstanceId: "fictional-m34-builder" };
  let bytes = JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: {
   version: "mobile-local-metadata.v1", partition, localSchemaVersion: 1,
  }, notes: [], files: [], unsyncedWork: "none" }));
  const store = { encryption: "sqlcipher", read: async () => bytes, write: async (value: string) => { bytes = value; }, close: async () => {} };
  const requests: unknown[] = [], statuses: number[] = [];
  let loseResponse = false, revokeAtUpload = false;
  const revoke = () => db.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [partition.tenantId, partition.membershipId]);
  const transport = localSmallBuilderQueue(await http.getUrl(), async (url: string, init: RequestInit) => {
   requests.push(JSON.parse(String(init.body)));
   if (revokeAtUpload) { revokeAtUpload = false; await revoke(); }
   const headers = new Headers(init.headers);
   headers.set("Cookie", `jg_session=${owned.sessionId}`);
   const response = await fetch(url, { ...init, headers });
   statuses.push(response.status);
   if (loseResponse) { loseResponse = false; await response.arrayBuffer(); throw new Error("Fictional response dropped after commit"); }
   return response;
  });
  const note = { version: "log-site-extra.v1" as const, commandId: randomUUID(), note: "Fictional note", description: "Fictional extra" };
  expect(await transport.upload({ version: "offline-upload.v1", jobId: owned.jobId, commandId: note.commandId, expectedRevision: null,
   body: note, payloadHash: offlineUploadPayloadHash(owned.jobId, note) })).toMatchObject({ state: "rejected", code: "INVALID_INTENT" });
  expect(requests).toEqual([]);
  const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
  const openReview = vi.fn();
  const owner = new NativeComposition({
   partition, store, uuid: randomUUID, online: false, authEpoch: 0,
   source: { assertCurrent: async () => { await access.session(); }, load: vi.fn() },
   queue: { transport, hash: { sha256: async (value: string) => sha256(value) },
    review: {
     load: async (_partition: unknown, target: { jobId: string; flow: string }) => {
      expect(target.flow).toBe("work_state");
      const facts = await new JobWorkStateApplication(db.runtime, owned.sessionId).get(target.jobId);
      expect(facts.events.some(event => event.kind === "finished_on_site")).toBe(true);
      const connectionId = randomUUID();
      return { partition, target, context: {
       version: "core-loop-action-context.v1", environment: "synthetic_demo", online: true, authorized: true,
       connectionId, refreshedConnectionId: connectionId, review: null,
       current: { tenantId: partition.tenantId, jobId: facts.jobId, subjectId: facts.jobId,
        revision: Math.max(0, ...facts.events.map(event => event.sequence)), contentHash: sha256(JSON.stringify(facts)) },
      } };
     },
     open: openReview,
    } },
   lifecycle: { provider: {}, vault: {}, resources: {}, options: { enabled: false, environment: "synthetic_demo",
    deviceInstanceId: partition.deviceInstanceId,
    policy: { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1",
     accessDurationMs: 100, refreshDurationMs: 500, sessionDurationMs: 1000, readLeaseDurationMs: 200 },
   } },
  });
  const finish = () => ({ version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "finish" } as const);
  const permitted = finish(), refused = finish();
  await owner.binding.queue.enqueue(unrelated.jobId, refused);
  await owner.binding.queue.enqueue(owned.jobId, permitted);
  let queue = owner.updateAuthority({ online: true, authEpoch: 0 }).queue;
  expect(await queue.flushOne(0)).toMatchObject({ state: "refused", reason: "PERMISSION_REVOKED" });
  const before = await commandCounts(db, owned);
  loseResponse = true;
  expect(await queue.flushOne(0)).toMatchObject({ state: "retried" });
  expect(statuses).toEqual([403, 200]);
  const committed = await commandCounts(db, owned);
  expect(committed.command_receipt).toBe(before.command_receipt + 1);
  expect(committed.job_work_state_event).toBe(before.job_work_state_event + 1);
  for (const table of ["journal", "recovery_fee_journal", "synthetic_obligation", "action_outbox"]) expect(committed[table]).toBe(before[table]);

  owner.updateAuthority({ online: false, authEpoch: 0 });
  queue = owner.updateAuthority({ online: true, authEpoch: 0 }).queue;
  await queue.restore();
  expect(await queue.flushOne(999)).toBeNull();
  expect(await queue.flushOne(1000)).toMatchObject({ state: "recorded" });
  expect(requests[1]).toEqual(requests[2]);
  expect(requests[2]).toMatchObject({ commandId: permitted.commandId, body: permitted,
   payloadHash: offlineUploadPayloadHash(owned.jobId, permitted) });
  expect(await commandCounts(db, owned)).toEqual(committed);
  expect(await queue.views()).toMatchObject([{ state: "refused", commandId: refused.commandId }, { state: "recorded", commandId: permitted.commandId }]);

  const stale = finish();
  await queue.enqueue(owned.jobId, stale);
  expect(await queue.flushOne(2000)).toMatchObject({ state: "stale", reason: "STALE_REVISION" });
  const beforeReview = await commandCounts(db, owned);
  expect(await owner.binding.onReconcileChoice(stale.commandId, "review_current_snapshot")).toMatchObject({
   kind: "review", review: { target: { flow: "work_state", jobId: owned.jobId, commandId: stale.commandId }, original: { upload: { body: stale } } },
  });
  expect(openReview).toHaveBeenCalledOnce();
  expect(await commandCounts(db, owned)).toEqual(beforeReview);

  const otherOwnedJob = (await db.admin.query(
   "SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND id<>$3 ORDER BY id LIMIT 1",
   [partition.tenantId, owned.auth.digest, owned.jobId],
  )).rows[0].id as string;
  await access.job(otherOwnedJob);
  await queue.enqueue(otherOwnedJob, finish());
  revokeAtUpload = true;
  expect(await queue.flushOne(3000)).toMatchObject({ state: "refused", reason: "PERMISSION_REVOKED" });
  expect(await commandCounts(db, owned)).toEqual(beforeReview);
  await expect(queue.views()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  expect(bytes).not.toContain(owned.sessionId);
 } finally {
  await closeHttp?.();
  await closeWorkFixture(db);
  vi.unstubAllEnvs();
 }
}, 120_000);
