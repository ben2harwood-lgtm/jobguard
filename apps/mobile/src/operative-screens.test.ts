import { expect, it, vi } from "vitest";
import { NativeOperativeScreens } from "./operative-screens";
const id = (n: number) => `01960000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const p = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: "fictional" };
const job = { jobId: id(5), workOrderId: id(6), reference: "Fictional order", priority: "routine" as const, issuedOn: "2026-11-05", dueOn: null, openVisitId: id(7) };
const assigned = { version: "site-assigned-jobs.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, jobs: [job], truncated: false };
it("native operative plans require current assignment, preserve the caller's own visit, and never complete offline", async () => {
 const queue = { enqueueNote: vi.fn(async () => {}) }, photo = vi.fn();
 const reader = { partition: p, pull: vi.fn(async () => assigned) }, screens = new NativeOperativeScreens(reader, queue, { verifiedPhoto: photo });
 expect((await screens.assigned(true)).jobs[0]!.visitState).toBe("open");
 expect(await screens.visit({ jobId: job.jobId, commandId: id(8), closeoutAnswer: null }, true)).toMatchObject({ state: "held", reason: "closeout_answer_required", recorded: false });
 expect(await screens.visit({ jobId: job.jobId, commandId: id(8), closeoutAnswer: "yes" }, true)).toMatchObject({ intent: { path: `/contractor/jobs/${job.jobId}/site-visits/${job.openVisitId}/complete`, body: { commandId: id(8), closeoutAnswer: "yes" } } });
 await expect(screens.assigned(false)).rejects.toThrow();
 const intent = { version: "offline-intent.v1", jobId: job.jobId, clientMetadata: { capturedAt: "2000-01-01T00:00:00Z", hlc: { wallTimeMs: 0, logical: 0, nodeId: "fictional" } }, body: { version: "log-site-extra.v1", commandId: id(9), note: "Fictional note", description: "Fictional extra" } };
 expect(await screens.note(intent, true, job.jobId)).toMatchObject({ state: "queued_intent", recorded: false }); expect(queue.enqueueNote).toHaveBeenCalledWith(intent);
 reader.pull.mockResolvedValueOnce({ ...assigned, jobs: [] }); await expect(screens.note(intent, true, job.jobId)).rejects.toThrow(); expect(queue.enqueueNote).toHaveBeenCalledOnce();
 await expect(screens.extra({ jobId: id(99), draft: {}, photoId: id(10), shownContentSha256: null }, true)).rejects.toThrow(); expect(photo).not.toHaveBeenCalled();
 expect(await screens.extra({ jobId: job.jobId, draft: {}, photoId: null, shownContentSha256: null }, true)).toMatchObject({ state: "held", recorded: false });
});
it("a local or uploading photo cannot become a confirmed extra", async () => {
 const photo = { version: "offline-capture-item.v1", environment: "synthetic_demo", uploadId: id(10), jobId: job.jobId, scopeItemId: null, kind: "photo", clientSha256: "a".repeat(64), clientMetadata: { deviceCapturedAtMs: 0 }, contentType: "image/jpeg", byteLength: 10, status: "local_only", serverVerification: null };
 const screens = new NativeOperativeScreens({ partition: p, pull: async () => assigned }, { enqueueNote: async () => {} }, { verifiedPhoto: async () => photo });
 expect(await screens.extra({ jobId: job.jobId, draft: { version: "log-site-extra.v4", commandId: id(11), description: "Fictional latch", note: "Fictional request", workStatus: "not_started" }, photoId: id(10), shownContentSha256: null }, true)).toMatchObject({ state: "held", reason: "photo_not_verified", recorded: false });
});
