import { expect, it } from "vitest";
import { SyntheticSyncDownloadApplication } from "./sync/download.application.js";
const { NativeDownloads } = await import(new URL("../../mobile/src/download.ts", import.meta.url).href);
const { WorkspaceDocument } = await import(new URL("../../mobile/src/workspace-document.ts", import.meta.url).href);
const { localData } = await import(new URL("../../mobile/src/lifecycle-contracts.ts", import.meta.url).href);
it("native encrypted-store seam consumes actual DARK server pages and cannot retain revoked assignments", async () => {
 const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
 const p = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: "fictional" };
 const snapshot = { version: "sync-server-snapshot.v1", environment: "synthetic_demo", sessionId: id(5), userId: p.userId, activeTenantId: p.tenantId, generation: 1,
  authority: { userId: p.userId, tenantId: p.tenantId, membershipId: p.membershipId, role: "operative", status: "active", assignedJobIds: [id(6)] },
  source: [{ tenantId: p.tenantId, jobId: id(6), workOrderId: id(7), reference: "Fictional WO", priority: "routine", issuedOn: "2026-11-05", dueOn: null, openVisitId: null, residentContact: "Fictional private contact", amountPence: 100 }] };
 const server = new SyntheticSyncDownloadApplication({ readCurrentSession: async token => { if (token !== "fictional-source-session") throw new Error("refused"); return snapshot; } }, { enabled: true, environment: "synthetic_demo" }, () => 1000);
 const request = { version: "sync-subscription-request.v1", requestedTenantId: p.tenantId, profile: "contractor_assigned_jobs.v1" };
 const transport = {
  assertCurrent: async () => { await server.subscribe("fictional-source-session", { version: "sync-server-subscribe.v1", request }); },
  subscribe: async () => { const result = await server.subscribe("fictional-source-session", { version: "sync-server-subscribe.v1", request }); return { partition: p, generation: snapshot.generation, schemaVersion: 1, token: result.token }; },
  page: (raw: unknown) => server.download("fictional-source-session", raw),
 };
 let data = JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition: p, localSchemaVersion: 1 }, notes: [], files: [], unsyncedWork: "none" }));
 const doc = new WorkspaceDocument({ encryption: "sqlcipher", read: async () => data, write: async (value: string) => { data = value; }, close: async () => {} }, p);
 const client = new NativeDownloads(doc, transport); expect((await client.pull()).jobs).toHaveLength(1);
 expect(data).not.toContain("residentContact"); expect(data).not.toContain("amountPence"); expect(data).not.toContain("token");
 snapshot.authority.assignedJobIds = []; snapshot.generation++;
 expect((await client.pull()).jobs).toEqual([]); expect(JSON.parse(data).sync.rows).toEqual([]);
 snapshot.authority.status = "revoked";
 await expect(new NativeDownloads(doc, transport).pull()).rejects.toMatchObject({ code: "MOBILE_DENIED" }); expect(JSON.parse(data).sync).toBeNull();
});
