import { expect, it, vi } from "vitest";
import { NativeProbe } from "./sync";
import { localApi, type LocalRequest } from "./local-api";
import type { EncryptedStore } from "./store";
// Explicit test double; never exported to the app as an unencrypted fallback.
function setup() {
 let bytes: string | null = null;
 const store: EncryptedStore = { encryption: "sqlcipher", read: async () => bytes, write: async s => { bytes = s; }, close: async () => {} };
 const transport = { assignedJobs: vi.fn(async () => ({ version: "site-assigned-jobs.v1", environment: "synthetic_demo", realExternalActions: 0, jobs: [], truncated: false })),
  upload: vi.fn(async () => ({ version: "offline-upload-result.v1", commandId: intent.body.commandId, state: "acknowledged", code: "RECORDED", realExternalActions: 0 })) };
 const hash = { sha256: async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("") };
 return { store, transport, hash, probe: new NativeProbe(store, transport, hash) };
}
const intent = { version: "offline-intent.v1", jobId: "00000000-0000-4000-8000-000000000001", clientMetadata: { capturedAt: "2000-01-01T00:00:00Z", hlc: { wallTimeMs: 0, logical: 0, nodeId: "fictional" } }, body: { version: "log-site-extra.v1", commandId: "01960000-0000-7000-8000-000000000001", note: "Fictional note", description: "Fictional extra" } };
it("queues before network, preserves unknown outcomes and exact identity across restart", async () => {
 const { probe, store, transport, hash } = setup();
 expect((await probe.readAuthorized()).jobs).toEqual([]);
 await probe.queue(intent); expect(transport.upload).not.toHaveBeenCalled();
 transport.upload.mockRejectedValueOnce(new Error("response lost"));
 expect((await probe.roundTrip(0)).status).toBe("queued");
 const reopened = new NativeProbe(store, transport, hash); await reopened.recover();
 expect((await reopened.roundTrip(1000)).status).toBe("recorded");
 expect(transport.upload.mock.calls[0]).toEqual(transport.upload.mock.calls[1]);
 expect((await reopened.roundTrip(2000)).status).toBe("recorded"); expect(transport.upload).toHaveBeenCalledTimes(2);
});
it("refuses financial commands, persisted payload tampering and replacing pending work", async () => {
 const { probe, store, transport } = setup();
 await expect(probe.queue({ ...intent, body: { ...intent.body, version: "approve-payment.v1" } })).rejects.toThrow();
 await probe.queue(intent); await expect(probe.queue(intent)).rejects.toThrow("PROBE_ALREADY_QUEUED");
 const saved = JSON.parse((await store.read())!); saved.intent.body.note = "Changed fictional text"; await store.write(JSON.stringify(saved));
 await expect(probe.roundTrip(0)).rejects.toThrow("QUEUE_BINDING_INVALID"); expect(transport.upload).not.toHaveBeenCalled();
});
it("does not retry conflicts or reinterpret revocation as recorded", async () => {
 for (const [state, code] of [["conflict", "IDEMPOTENCY_CONFLICT"], ["rejected", "PERMISSION_REVOKED"], ["acknowledged", "UNKNOWN_CODE"]]) {
  const { probe, transport } = setup(); transport.upload.mockResolvedValue({ version: "offline-upload-result.v1", commandId: intent.body.commandId, state: state!, code: code!, realExternalActions: 0 });
  await probe.queue(intent); expect((await probe.roundTrip(0)).status).toBe("needs_review");
  await probe.roundTrip(1000); expect(transport.upload).toHaveBeenCalledOnce();
 }
});
it("forbids remote API endpoints and redirect following", async () => {
 const request = vi.fn<LocalRequest>();
 for (const base of ["https://example.invalid", "http://user:pass@localhost", "http://localhost/other", "http://localhost/?token=x"]) expect(() => localApi(base, request)).toThrow("LOCAL_API_ONLY");
 request.mockResolvedValue(new Response("{}", { status: 403 }));
 await expect(localApi("http://localhost:3001", request).assignedJobs()).rejects.toThrow("AUTHORIZED_READ_REFUSED");
 expect(request.mock.calls[0]![1]?.redirect).toBe("error");
});
it("refuses overlapping ownership of a pending queue operation", async () => {
 const { probe, store } = setup();
 let unblock!: () => void;
 const gate = new Promise<void>(resolve => { unblock = resolve; });
 const write = store.write;
 store.write = async value => { await gate; await write(value); };
 const pending = probe.queue(intent);
 await expect(probe.roundTrip(0)).rejects.toThrow("PROBE_BUSY");
 unblock(); await pending;
});
