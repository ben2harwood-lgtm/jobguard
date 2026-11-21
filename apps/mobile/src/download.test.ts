import { expect, it, vi } from "vitest";
import { evaluateSyncDownloadV1, pageSyncDownloadV1, planSyncReconcileV1 } from "@jobguard/core";
import { NativeDownloads, type NativeDownloadTransport } from "./download";
import { WorkspaceDocument } from "./workspace-document";
import { localData } from "./lifecycle-contracts";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const p = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: "fictional-device" };
it("persists minimal admitted rows, clears revoked scope, resubscribes after restart and refuses offline reads", async () => {
 let data = JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition: p, localSchemaVersion: 1 }, notes: [], files: [], unsyncedWork: "none" }));
 const store = { encryption: "sqlcipher" as const, read: async () => data, write: async (s: string) => { data = s; }, close: async () => {} };
 const document = new WorkspaceDocument(store, p); let active = true;
 const request = { version: "sync-subscription-request.v1", requestedTenantId: p.tenantId, profile: "contractor_assigned_jobs.v1" };
 const transport: NativeDownloadTransport = { assertCurrent: vi.fn(async () => { if (!active) throw new Error("secret"); }),
  subscribe: vi.fn(async () => ({ partition: p, generation: 1, schemaVersion: 1, token: "fictional-token" })),
  page: vi.fn(async () => {
   expect(JSON.parse(data).sync.pending).not.toBeNull();
   const facts = { version: "sync-download-facts.v1", environment: "synthetic_demo", request,
    authority: { userId: p.userId, tenantId: p.tenantId, membershipId: p.membershipId, role: "operative", status: "active", assignedJobIds: [id(8)] },
    source: [{ tenantId: p.tenantId, jobId: id(8), workOrderId: id(9), reference: "Fictional order", priority: "routine", issuedOn: "2026-11-05", dueOn: null, openVisitId: null, pricePence: 9000 }] };
   const decision = evaluateSyncDownloadV1(facts);
   return { version: "sync-server-download-result.v1", page: pageSyncDownloadV1({ facts, afterJobId: null, pageSize: 100 }), cleanup: planSyncReconcileV1({ version: "sync-reconcile.v1", delivered: [], decision }), resync: "none" };
  }) };
 const client = new NativeDownloads(document, transport); expect((await client.pull()).jobs).toHaveLength(1);
 expect(data).not.toContain("fictional-token"); expect(data).not.toContain("pricePence");
 await new NativeDownloads(document, transport).pull(); expect(transport.subscribe).toHaveBeenCalledTimes(2);
 expect(() => client.offlineRead()).toThrow("NATIVE_OFFLINE_READS_HELD_D08");
 active = false; await expect(client.pull()).rejects.toMatchObject({ code: "MOBILE_DENIED" }); expect(JSON.parse(data).sync).toBeNull();
});
it("wrong-user subscription cannot write data or return rows", async () => {
 let data = JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition: p, localSchemaVersion: 1 }, notes: [], files: [], unsyncedWork: "none" }));
 const page = vi.fn(); const d = new WorkspaceDocument({ encryption: "sqlcipher", read: async () => data, write: async s => { data = s; }, close: async () => {} }, p);
 const client = new NativeDownloads(d, { assertCurrent: async () => {}, subscribe: async () => ({ partition: { ...p, userId: id(99) }, generation: 1, schemaVersion: 1, token: "fictional" }), page });
 await expect(client.pull()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" }); expect(page).not.toHaveBeenCalled(); expect(JSON.parse(data).sync).toBeNull();
});
