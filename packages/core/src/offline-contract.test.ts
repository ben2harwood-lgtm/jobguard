import { describe, expect, it } from "vitest";
import { logSiteExtraV1 } from "./site-extra.js";
import { OfflineContractError, offlineClientMetadataV1, offlineIntentV1, offlinePolicyV1, parseOfflineIntentV1, toLogSiteExtraV1 } from "./offline-contract.js";

const intent = () => ({
 version: "offline-intent.v1", jobId: "10000000-0000-4000-8000-000000000001",
 clientMetadata: { capturedAt: "2000-01-01T00:00:00Z", hlc: { wallTimeMs: 0, logical: 0, nodeId: "fictional-crew" } },
 body: { version: "log-site-extra.v1", commandId: "01960000-0000-7000-8000-000000000001", note: " Fictional note\n", description: " Fictional extra " },
});
function refusal(raw: unknown, code: string) {
 try { parseOfflineIntentV1(raw); throw new Error("unexpected success"); }
 catch (error) { expect(error).toBeInstanceOf(OfflineContractError); expect(error).toMatchObject({ code, message: code }); }
}
describe("M3-1 pure server profile", () => {
 it("M31-S01 strict versioned boundary", () => {
  const raw = intent(); expect(offlineIntentV1.parse(raw)).toEqual(raw);
  for (const value of [null, [], {}, { ...raw, authority: {} }, { ...raw, body: { anything: true } }]) refusal(value, "OFFLINE_INVALID_INTENT");
  refusal({ ...raw, version: "offline-intent.v2" }, "OFFLINE_UNSUPPORTED_VERSION");
  for (const field of ["tenantId", "actor", "role", "grantId", "environment", "serverTime", "origin", "settlementState"]) {
   for (const value of [
    { ...raw, [field]: "tampered" }, { ...raw, body: { ...raw.body, [field]: "tampered" } },
    { ...raw, clientMetadata: { ...raw.clientMetadata, [field]: "tampered" } },
    { ...raw, clientMetadata: { ...raw.clientMetadata, hlc: { ...raw.clientMetadata.hlc, [field]: "tampered" } } },
   ]) refusal(value, "OFFLINE_INVALID_INTENT");
  }
 });
 it("M31-S02 client identity is not authority", () => {
  const raw = intent(); expect(parseOfflineIntentV1(raw).body.commandId).toBe(raw.body.commandId);
  for (const commandId of ["invalid", "01960000-0000-4000-8000-000000000001", "01960000-0000-7000-7000-000000000001"]) refusal({ ...raw, body: { ...raw.body, commandId } }, "OFFLINE_INVALID_INTENT");
  for (const variant of ["8", "9", "a", "b"]) expect(parseOfflineIntentV1({ ...raw, body: { ...raw.body, commandId: `00000000-0000-7000-${variant}000-000000000001` } }).body.commandId).toContain("-7000-");
  const changed = parseOfflineIntentV1({ ...raw, body: { ...raw.body, note: "Fictional changed input" } });
  expect(changed.body.commandId).toBe(raw.body.commandId); expect(changed.body).not.toEqual(raw.body);
  // Pure parsing supplies no receipt or replay verdict; the existing repository detects this conflict.
 });
 it("M31-S03 metadata cannot become server facts", () => {
  const raw = intent();
  for (const field of ["wallTimeMs", "logical"]) for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "1"]) {
   refusal({ ...raw, clientMetadata: { ...raw.clientMetadata, hlc: { ...raw.clientMetadata.hlc, [field]: value } } }, "OFFLINE_INVALID_INTENT");
  }
  for (const capturedAt of ["yesterday", "2026-02-30T00:00:00Z", "2026-01-01"]) expect(offlineClientMetadataV1.safeParse({ ...raw.clientMetadata, capturedAt }).success).toBe(false);
  for (const nodeId of ["", " ", "x".repeat(101)]) expect(offlineClientMetadataV1.safeParse({ ...raw.clientMetadata, hlc: { ...raw.clientMetadata.hlc, nodeId } }).success).toBe(false);
  const future = { ...raw, clientMetadata: { capturedAt: "2099-01-01T00:00:00Z", hlc: { wallTimeMs: Number.MAX_SAFE_INTEGER, logical: Number.MAX_SAFE_INTEGER, nodeId: "future" } } };
  expect(toLogSiteExtraV1(future)).toEqual(toLogSiteExtraV1(raw));
 });
 it("M31-S04 three classes and no enabled field merge", () => {
  expect(offlinePolicyV1.classes).toEqual(["allowlisted_non_commercial_field_merge", "append_only_facts", "validated_state_financial_commands"]);
  expect(offlinePolicyV1.fieldMergeAllowlist).toEqual([]);
  expect(offlinePolicyV1.operations).toEqual([{ version: "log-site-extra.v1", class: "append_only_facts" }]);
  expect(offlinePolicyV1.validatedCommandsRequire).toEqual(["current_server_authority", "applicable_revision_state_and_exact_approval"]);
  for (const field of ["money", "approval", "origin", "evidenceState", "permissions"]) refusal({ ...intent(), body: { version: "merge-fields.v1", [field]: "tampered" } }, "OFFLINE_UNSUPPORTED_OPERATION");
 });
 it("M31-S05 unsupported means refused", () => {
  for (const version of ["log-site-extra.v2", "issue-invoice.v1", "approve-payment.v1", "merge-fields.v1"]) refusal({ ...intent(), body: { ...intent().body, version } }, "OFFLINE_UNSUPPORTED_OPERATION");
  refusal({ ...intent(), version: "offline-intent.v999" }, "OFFLINE_UNSUPPORTED_VERSION");
  refusal({ ...intent(), body: { ...intent().body, version: 1 } }, "OFFLINE_INVALID_INTENT");
 });
 it("M31-S06 exact existing command conversion", () => {
  const raw = intent(), converted = toLogSiteExtraV1(parseOfflineIntentV1(raw));
  expect(converted).toEqual({ jobId: raw.jobId, body: raw.body });
  expect(logSiteExtraV1.parse(converted.body)).toEqual(raw.body);
  expect(Object.keys(converted)).toEqual(["jobId", "body"]);
  expect(() => toLogSiteExtraV1({ ...raw, tenantId: raw.jobId })).toThrow(OfflineContractError);
  expect(() => toLogSiteExtraV1({ ...raw, body: { ...raw.body, actorMembershipId: raw.jobId } })).toThrow(OfflineContractError);
 });
 it("M31-S17 compatibility", () => {
  const old = { ...intent().body, commandId: "10000000-0000-4000-8000-000000000001" };
  expect(logSiteExtraV1.parse(old)).toEqual(old); // v7 is required only by the new transport profile.
  expect(offlinePolicyV1.resultVersions).toEqual(["site-extra-logged.v1", "site-assigned-jobs.v1", "audit.v1"]);
  const raw = intent(), before = JSON.stringify(raw); toLogSiteExtraV1(raw); expect(JSON.stringify(raw)).toBe(before);
 });
 it("M31-S19 documented executable profile", async () => {
  const fileModule = "node:fs";
  const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string };
  const doc = readFileSync(new URL("../../../docs/contracts/offline-contract-v1.md", import.meta.url), "utf8");
  for (const topic of ["offline-intent.v1", "log-site-extra.v1", "UUIDv7", "HLC", "Fictional text", "Identifiers", "Client metadata", "Credentials", "Evidence", "Financial data", "D08", "HELD"]) expect(doc).toContain(topic);
  expect(doc).toContain("No retention period or offline access lease is selected");
 });
});
