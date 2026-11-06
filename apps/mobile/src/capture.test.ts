import { expect, it } from "vitest";
import { NativeCaptures } from "./capture";
import { WorkspaceDocument } from "./workspace-document";
import { localData } from "./lifecycle-contracts";
it("restores encrypted fictional text metadata with stable identity/hash and never invents proof", async () => {
 const p = { userId: "10000000-0000-4000-8000-000000000001", tenantId: "10000000-0000-4000-8000-000000000002", membershipId: "10000000-0000-4000-8000-000000000003", mobileSessionId: "10000000-0000-4000-8000-000000000004", deviceInstanceId: "fictional" };
 let bytes = JSON.stringify(localData.parse({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition: p, localSchemaVersion: 1 }, notes: [], files: [], unsyncedWork: "none" }));
 const document = new WorkspaceDocument({ encryption: "sqlcipher", read: async () => bytes, write: async s => { bytes = s; }, close: async () => {} }, p);
 const hash = { sha256: async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("") };
 const make = () => new NativeCaptures(document, { assertCurrent: async () => {} }, hash), capture = make();
 const text = { uploadId: p.userId, jobId: p.tenantId, scopeItemId: null, text: "Fictional 🧱 note", capturedAtMs: 0 };
 await capture.text(text); await capture.text(text); expect(JSON.parse(bytes).captures).toHaveLength(1);
 expect(JSON.parse(bytes).captures[0].item.byteLength).toBe(new TextEncoder().encode(text.text).length);
 expect((await make().views())[0]).toMatchObject({ status: "local_only", isServerProof: false });
 expect(await make().planTextUpload(text.uploadId, 0)).toMatchObject({ step: "review", reason: "text_transport_unavailable" });
 await expect(capture.text({ ...text, text: "Fictional changed" })).rejects.toThrow();
 expect(localData.safeParse({ ...JSON.parse(bytes), unsyncedWork: "none" }).success).toBe(false);
 for (const kind of ["photo", "voice"] as const) for (const permission of ["granted", "denied", "unavailable"] as const) expect(capture.media(kind, permission)).toMatchObject({ state: "held", realExternalActions: 0 });
});
