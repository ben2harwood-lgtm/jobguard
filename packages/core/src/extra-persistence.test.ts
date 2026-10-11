import { describe, expect, it } from "vitest";
import { raiseExtraV1, extraRecordV1, extraDuplicateLinkV1, extraOrderLineLinkV1, extraOriginHashV1, extraOriginHashFields, type ExtraOriginHashInput } from "./extra-persistence.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const minimal = { version: "raise-extra.v1", commandId: id(1), commandType: "LogSiteExtra", jobId: id(2), actorMembershipId: id(3), grantId: id(4), note: "Fictional capture", description: "Fictional additional repair" };
export const hashVector: ExtraOriginHashInput = {
 tenantId: id(1), jobId: id(2), variationId: id(3), jobTrack: "contractor", kind: "site_user", provenance: "command", commandId: id(4), commandType: "LogSiteExtra",
 raisingMembershipId: id(5), raisingRole: "operative", raisingGrantId: id(6), raiserAssigned: true, serverRecordedAt: "2026-10-11T12:34:56.123456Z",
 deviceId: "fictional-device", deviceCapturedAt: "2026-10-11T12:30:00.000001Z", clientCaptureId: id(7), workOrderId: id(8), workOrderRevisionId: id(9),
 siteVisitId: null, evidenceId: null, evidenceHash: null, residentConfirmationEvidenceId: null, sourceCaptureKind: "text", sourceCaptureHash: "a".repeat(64),
};
// Literal digest computed independently with Python hashlib, before implementation.
export const hashVectorDigest = "461292ec6f37346ad387cf7499f2e15f538b564d7f18adf86de26524fb358654";
describe("extra persistence boundaries", () => {
 it("[S7] strict raise schema accepts minimal/full inputs and refuses authority keys", () => {
  expect(raiseExtraV1.safeParse(minimal).success).toBe(true);
  expect(raiseExtraV1.safeParse({ ...minimal, sorItem: { versionId: id(8), code: "FIT-LOCK" }, excessOfScopeItemId: id(9), clientCaptureId: id(10), deviceId: "fictional-device", deviceCapturedAt: "2026-10-11T12:00:00.123456Z", siteVisitId: id(11), evidenceId: id(12), residentConfirmationEvidenceId: id(13) }).success).toBe(true);
  for (const key of ["kind", "track", "serverRecordedAt", "role", "tenantId", "originHash", "workOrderRevisionId", "assignment", "state", "price", "pricePence", "rate", "netValue", "variationId"]) expect(raiseExtraV1.safeParse({ ...minimal, [key]: "tampered" }).success, key).toBe(false);
  for (const value of [{ ...minimal, note: "x".repeat(5001) }, { ...minimal, description: "x".repeat(501) }, { ...minimal, commandType: "ImportOrderLine" }, { ...minimal, sorItem: { versionId: id(8), code: "FIT-LOCK", rate: 1 } }]) expect(raiseExtraV1.safeParse(value).success).toBe(false);
 });
 it("[S7] strict link/read schemas refuse unknown keys and accept valid records", () => {
  const link = { version: "extra-duplicate-link.v1", commandId: id(1), jobId: id(2), actorMembershipId: id(3), duplicateId: id(4), canonicalId: id(5) };
  const order = { version: "extra-order-line-link.v1", commandId: id(1), jobId: id(2), actorMembershipId: id(3), variationId: id(4), workOrderId: id(5), revisionId: id(6), scopeItemId: id(7) };
  const record = { version: "extra-record.v1", origin: { version: "extra-origin.v1", tenantId: id(1), jobId: id(2), variationId: id(3), origin: { version: "variation-origin.v1", jobTrack: "contractor", kind: "site_user" }, commandId: id(4), raisingMembershipId: id(5), raisingRole: "operative", serverRecordedAt: hashVector.serverRecordedAt, deviceId: null, deviceCapturedAt: null, evidenceHash: null }, contractorProvenance: { commandType: "LogSiteExtra", raisingGrantId: id(6), raiserAssigned: true, workOrderId: id(8), workOrderRevisionId: id(9), siteVisitId: null, evidenceId: null, residentConfirmationEvidenceId: null, clientCaptureId: null, originHash: hashVectorDigest }, latestEventKind: "logged" };
  for (const [schema, input] of [[extraDuplicateLinkV1, link], [extraOrderLineLinkV1, order], [extraRecordV1, record]] as const) {
   expect(schema.safeParse(input).success).toBe(true);
   for (const key of ["kind", "track", "serverRecordedAt", "role", "tenantId", "originHash", "workOrderRevisionId", "assignment", "state", "price"]) expect(schema.safeParse({ ...input, [key]: "tampered" }).success).toBe(false);
  }
 });
 it("[S6] fixed hash vector binds every field and distinguishes NULL from empty text", () => {
  expect(extraOriginHashV1(hashVector)).toBe(hashVectorDigest);
  for (const field of extraOriginHashFields) {
   const changed = { ...hashVector, [field]: hashVector[field] === null ? "" : hashVector[field] === true ? false : `${hashVector[field]}x` };
   expect(extraOriginHashV1(changed as ExtraOriginHashInput), field).not.toBe(hashVectorDigest);
  }
  expect(extraOriginHashV1({ ...hashVector, deviceId: null })).not.toBe(extraOriginHashV1({ ...hashVector, deviceId: "" }));
 });
});
