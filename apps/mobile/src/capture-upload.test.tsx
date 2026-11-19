import React, { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { NativeCaptureUpload } from "./capture-upload";
import { NativeCaptures } from "./capture";
import { CaptureScreen } from "./CaptureScreen";
import { localData } from "./lifecycle-contracts";
import { WorkspaceDocument } from "./workspace-document";

vi.mock("react-native", () => ({ View: "View", Text: "Text", TextInput: "TextInput", Button: "Button" }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const digest = async (data: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
 byte => byte.toString(16).padStart(2, "0")).join("");
function flatten(node: ReactNode): unknown[] {
 if (Array.isArray(node)) return node.flatMap(flatten);
 if (isValidElement<{ children?: ReactNode; title?: string }>(node)) return [node.props.title, ...flatten(node.props.children)];
 return [node];
}

it.each(["verified", "rejected", "conflict"] as const)("renders %s from a reopened workspace instead of inferring success from status", async outcome => {
 const partition = { userId: id(1), tenantId: id(2), membershipId: id(3), mobileSessionId: id(4), deviceInstanceId: "fictional" };
 let saved = JSON.stringify({ version: "mobile-cache.v1", metadata: { version: "mobile-local-metadata.v1", partition, localSchemaVersion: 1 },
  notes: [], files: [], unsyncedWork: "none" });
 const inMemoryCipherStoreDouble = { encryption: "sqlcipher" as const, read: async () => saved,
  write: async (value: string) => { saved = value; }, close: async () => {} };
 const auth = { assertCurrent: async () => {} };
 const uploadId = id(5), jobId = id(6), scopeItemId = id(7);
 const status = { status: { version: "resumable-evidence.v1", state: "verified", nextOffset: 3 }, checkedAtMs: 2 };
 let dropped = true;
 const transport = { transfer: vi.fn(async (raw: unknown) => {
  const { version: _version, action, ...fields } = raw as { version: string; action: string };
  if (action === "begin") return fields;
  if (action === "status") return status;
  if (dropped) throw new Error("fictional dropped reply");
  if (outcome === "rejected") return { outcome: "rejected" };
  return { evidenceId: uploadId, jobId, scopeItemId, objectVersionId: "fictional-server-version", byteLength: 3,
   sha256: outcome === "conflict" ? "0".repeat(64) : await digest(Uint8Array.of(1, 2, 3)) };
 }) };
 const open = () => new WorkspaceDocument(inMemoryCipherStoreDouble, partition);
 const driver = () => new NativeCaptureUpload(open(), auth, transport, digest);
 const captures = () => new NativeCaptures(open(), auth, { sha256: async text => digest(Uint8Array.from(new TextEncoder().encode(text))) });
 const render = async (online = true) => flatten(CaptureScreen({ online, rows: await captures().views(), draft: "", onDraft() {},
  onCapture() {}, onMedia() {}, onTransfer() {} }));
 await driver().keep({ version: "native-capture-upload.v1", environment: "synthetic_demo", attachment: { id: uploadId, base64: "AQID" },
  jobId, scopeItemId, capturedAtMs: 1, expiresAtMs: 3, contentType: "audio/wav", finalizeCommandId: id(8) });
 await captures().text({ uploadId: id(9), jobId, scopeItemId, capturedAtMs: 1, text: "Fictional local note" });
 expect(await render()).toEqual(expect.arrayContaining(["Local only", "Upload attachment", "Voice processing queued"]));
 await driver().transfer(uploadId);
 expect(await render()).toEqual(expect.arrayContaining(["Uploading", "Resume upload", "Voice processing queued"]));
 expect(await render()).not.toContain("Server verified");
 dropped = false;
 await driver().transfer(uploadId);
 const labels = { verified: "Server verified", rejected: "Rejected", conflict: "Conflict" };
 expect(await render()).toEqual(expect.arrayContaining([labels[outcome], "Local only", "Voice processing queued"]));
 expect(await render()).not.toContain("Resume upload");
 expect(await render(false)).not.toContain(labels[outcome]);
 expect(localData.parse(JSON.parse(saved)).files).toEqual([{ id: uploadId, base64: "AQID" }]);
 expect(localData.parse(JSON.parse(saved)).unsyncedWork).toBe("present");
});
