import { expect, it, vi } from "vitest";
import { DurableNativeQueue } from "./durable-queue";
import { WorkspaceDocument } from "./workspace-document";
import { localData } from "./lifecycle-contracts";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function setup() {
 const p = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: "fictional-device" };
 let bytes = JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition: p, localSchemaVersion: 1 }, notes: [], files: [], unsyncedWork: "none" }));
 const store = { encryption: "sqlcipher" as const, read: async () => bytes, write: async (s: string) => { bytes = s; }, close: async () => {} };
 const document = new WorkspaceDocument(store, p), authority = { assertCurrent: vi.fn(async () => {}) };
 const hash = { sha256: async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("") };
 const transport = { upload: vi.fn(async (raw: unknown) => {
  const upload = raw as { commandId: string }; expect(JSON.parse(bytes).queue.some((v: { reconciliation: { item: { status: string } } }) => v.reconciliation.item.status === "sending")).toBe(true);
  return { version: "offline-upload-result.v1", commandId: upload.commandId, state: "acknowledged", code: "RECORDED", realExternalActions: 0 };
 }) };
 return { make: () => new DurableNativeQueue(document, authority, transport, hash), transport, authority, read: () => JSON.parse(bytes), change: (f: (v: ReturnType<typeof localData.parse>) => void) => { const v = JSON.parse(bytes); f(v); bytes = JSON.stringify(v); } };
}
const note = (n: number) => ({ version: "log-site-extra.v1", commandId: id(n), note: "Fictional pending note", description: "Fictional extra" });
it("stores exact body/hash/revision and recovers lost-response replay without replacement IDs", async () => {
 const f = setup(), q = f.make(); await q.enqueue(id(8), note(10)); await q.enqueue(id(8), note(10)); expect(f.read().queue).toHaveLength(1);
 f.transport.upload.mockRejectedValueOnce(new Error("unknown outcome")); expect((await q.flushOne(0))!.state).toBe("retried");
 const reopened = f.make(); await reopened.restore(); expect((await reopened.flushOne(1000))!.state).toBe("recorded");
 expect(f.transport.upload.mock.calls[0]).toEqual(f.transport.upload.mock.calls[1]); expect(await reopened.flushOne(2000)).toBeNull();
 await expect(q.enqueue(id(8), { ...note(10), note: "Changed" })).rejects.toThrow();
});
it("preserves terminal conflicts and malformed items while unrelated jobs continue", async () => {
 const f = setup(), q = f.make(); await q.enqueue(id(8), note(10)); await q.enqueue(id(9), note(11));
 f.change(v => { const entries = v.queue as { upload: { body: { note: string } } }[]; entries[0]!.upload.body.note = "tampered"; });
 expect((await q.flushOne(0))!.state).toBe("recorded"); expect(f.transport.upload).toHaveBeenCalledOnce();
 expect((f.transport.upload.mock.calls[0]![0] as { jobId: string }).jobId).toBe(id(9)); expect((await q.views())[0]!.state).toBe("needs_review");
});
it("current refusal blocks uploads; commercial acknowledgment never becomes a recorded financial fact", async () => {
 const f = setup(), q = f.make();
 await q.enqueue(id(8), { version: "offline-commercial-intent.v1", commandId: id(10), expectedRevision: 2,
  acceptedQuoteVersionId: null, authorizationId: id(12), actionType: "send_quote", recipient: "fictional@example.invalid", contentHash: "a".repeat(64), amountPence: 100, currency: "GBP", policyVersion: "fictional.v1" });
 expect((await q.flushOne(0))!.state).toBe("conflicted"); expect(f.read().queue[0].reconciliation.item.status).toBe("needs_review");
 f.authority.assertCurrent.mockRejectedValueOnce(new Error("revoked")); await expect(q.flushOne(1)).rejects.toMatchObject({ code: "MOBILE_DENIED" }); expect(f.transport.upload).toHaveBeenCalledOnce();
 expect(localData.safeParse({ ...f.read(), unsyncedWork: "none" }).success).toBe(false);
});
it("unknown/late result cannot clear review, and interrupted sending restores the same identity", async () => {
 const f = setup(), q = f.make(); await q.enqueue(id(8), note(10));
 f.change(v => { const entries = v.queue as { reconciliation: { item: { status: string; attemptCount: number } } }[]; entries[0]!.reconciliation.item.status = "sending"; entries[0]!.reconciliation.item.attemptCount = 1; });
 await f.make().restore(); expect(f.read().queue[0].reconciliation.item).toMatchObject({ status: "queued", attemptCount: 1, commandId: id(10) });
 f.transport.upload.mockResolvedValueOnce({ version: "offline-upload-result.v1", commandId: id(99), state: "acknowledged", code: "RECORDED", realExternalActions: 0 });
 expect((await q.flushOne(0))!.state).toBe("needs_review"); expect(await q.flushOne(1)).toBeNull(); expect(f.transport.upload).toHaveBeenCalledOnce();
});
it("partition invalidation while upload is in flight prevents a late acknowledgment from rewriting the store", async () => {
 const f = setup();
 // A separately assembled document demonstrates the lifecycle cleanup hook's required invalidation.
 const p = f.read().metadata.partition; let bytes = JSON.stringify(f.read());
 const d = new WorkspaceDocument({ encryption: "sqlcipher", read: async () => bytes, write: async s => { bytes = s; }, close: async () => {} }, p);
 const hash = { sha256: async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("") };
 const q = new DurableNativeQueue(d, { assertCurrent: async () => {} }, { upload: async () => { d.invalidate(); return { version: "offline-upload-result.v1", commandId: id(10), state: "acknowledged", code: "RECORDED", realExternalActions: 0 }; } }, hash);
 await q.enqueue(id(8), note(10)); await expect(q.flushOne(0)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 expect(JSON.parse(bytes).queue[0].reconciliation.item.status).toBe("sending");
 await expect(q.restore()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
});
it("operative capture retains original UUIDv7/HLC metadata and refuses to rewrite it on retry", async () => {
 const f = setup(), queue = f.make();
 const intent = { version: "offline-intent.v1", jobId: id(8), clientMetadata: { capturedAt: "2000-01-01T00:00:00Z", hlc: { wallTimeMs: 0, logical: 0, nodeId: "fictional" } }, body: { ...note(10), commandId: "01960000-0000-7000-8000-000000000010" } };
 await queue.enqueueNote(intent); expect(f.read().queue[0].offlineIntent).toEqual(intent);
 await f.make().restore(); await queue.flushOne(0);
 expect(f.read().queue[0].offlineIntent).toEqual(intent);
 expect(f.transport.upload.mock.calls[0]![0]).not.toHaveProperty("offlineIntent");
 await expect(queue.enqueueNote({ ...intent, clientMetadata: { ...intent.clientMetadata, hlc: { ...intent.clientMetadata.hlc, logical: 1 } } })).rejects.toThrow();
});
