import { sha256 } from "./evidence-pack.js";
import { describe, expect, it } from "vitest";
import {
 siteExtraContentSha256V1, residentConfirmationDocumentV1, logSiteExtraV3, siteExtraLoggedV3, logSiteExtraV1,
 siteExtraContentFormatV1, residentConfirmationStatementV1, residentConfirmationContentType, residentConfirmationObjectVersion,
} from "./index.js";
import { SiteExtraError, siteExtraHttpStatus, siteExtraErrorCodes } from "./site-extra.js";

const job = "11111111-1111-4111-8111-111111111111", tenant = "22222222-2222-4222-8222-222222222222", confirmation = "33333333-3333-4333-8333-333333333333";
const photo = "ab".repeat(32);
const description = "Fictional extra door", note = "Fictional note about extra work";
// Expected values were computed outside the implementation, from the written definition.
const fixed = [
 { name: "plain ASCII without a photo", input: { jobId: job, description, note, photoSha256: null }, expected: "ad0f0864361fe93a6130c3d463543745396374ff07dfe06ffc26dcd8948ff90a" },
 { name: "multi-byte text without a photo", input: { jobId: job, description: "Café door \u{1F6AA}", note: "工事 note é\u{1F600}", photoSha256: null }, expected: "7ca55ecb9d8b23a1d442de7da8b16bb8220a050a44d6438f16da3e3d54411b03" },
 { name: "with a photo", input: { jobId: job, description, note, photoSha256: photo }, expected: "e33c42e80a3b56166adf87c799b306553cafa22142425805e0c20005de511fc3" },
 { name: "leading and trailing spaces kept", input: { jobId: job, description: " padded ", note: "\tnote\n", photoSha256: null }, expected: "6b90b4f48721d503f9837df4070e8de3c6c94c55317f84d87ac7a0656afd54a7" },
] as const;
const valid = { version: "log-site-extra.v3", commandId: "00000000-0000-4000-8000-000000000001", note: "Fictional additional work", description: "Fictional extra" };
const both = { ...valid, photoEvidenceId: "00000000-0000-4000-8000-000000000002", residentConfirmation: { shownContentSha256: "c".repeat(64) } };

describe("site-extra-content.v1", () => {
 it.each(fixed)("[E1] fixed input: $name", ({ input, expected }) => { expect(siteExtraContentSha256V1(input)).toBe(expected); });
 describe("[E1] changing one stored fact changes the hash", () => {
  const base = fixed[2].input, digest = siteExtraContentSha256V1(base);
  const changed = [{ ...base, jobId: "11111111-1111-4111-8111-111111111112" }, { ...base, description: `${base.description}!` }, { ...base, note: `${base.note}!` }, { ...base, photoSha256: "ac".repeat(32) }, { ...base, photoSha256: null }];
  it("[E1] changing only the stored job changes the hash", () => { expect(siteExtraContentSha256V1(changed[0]!)).not.toBe(digest); });
  it("[E1] changing only the stored description changes the hash", () => { expect(siteExtraContentSha256V1(changed[1]!)).not.toBe(digest); });
  it("[E1] changing only the stored note changes the hash", () => { expect(siteExtraContentSha256V1(changed[2]!)).not.toBe(digest); });
  it("[E1] changing only the stored photo changes the hash", () => {
   expect(siteExtraContentSha256V1(changed[3]!)).not.toBe(digest);
   expect(siteExtraContentSha256V1(changed[4]!)).not.toBe(digest);
  });
  it("[E1] all five single-fact mutations have distinct hashes", () => { expect(new Set(changed.map(siteExtraContentSha256V1)).size).toBe(changed.length); });
 });
 it("[E1] the version string is part of the hashed input", () => {
  // The framing is the version line + LF, so a different version line cannot give the same value as v1.
  expect(siteExtraContentFormatV1).toBe("site-extra-content.v1");
  // Recomputed outside the implementation: the stored value is the hash of the framing that begins with the version line; the same facts framed under another version line hash differently.
  const frame = (version: string) => `${version}\nS36:${job};S2:ab;S1:c;N;`, digest = sha256;
  expect(siteExtraContentSha256V1({ jobId: job, description: "ab", note: "c", photoSha256: null })).toBe(digest(frame("site-extra-content.v1")));
  expect(digest(frame("site-extra-content.v2"))).not.toBe(digest(frame("site-extra-content.v1")));
  expect(siteExtraContentSha256V1({ jobId: job, description: "ab", note: "c", photoSha256: null })).toBe("352db87e0df3e54e253e0979d15e2ac33db975a136e5b79fdf69a8369b939998");
 });
 it("[E1] the boundary between description and note is framed", () => {
  const a = siteExtraContentSha256V1({ jobId: job, description: "ab", note: "c", photoSha256: null }), b = siteExtraContentSha256V1({ jobId: job, description: "a", note: "bc", photoSha256: null });
  expect(a).toBe("352db87e0df3e54e253e0979d15e2ac33db975a136e5b79fdf69a8369b939998"); expect(b).toBe("a5102f102a7874e8765415e5d93bff0d7bdfd6694ca49d5966aad9b68b782445"); expect(a).not.toBe(b);
 });
 it("[E1] leading and trailing spaces are kept, not trimmed", () => {
  const spaced = siteExtraContentSha256V1({ jobId: job, description: " padded ", note: "\tnote\n", photoSha256: null }), trimmed = siteExtraContentSha256V1({ jobId: job, description: "padded", note: "note", photoSha256: null });
  expect(spaced).not.toBe(trimmed);
 });
 it("[E1] the job id is the canonical lower-case text; a malformed photo hash is refused", () => {
  expect(siteExtraContentSha256V1({ ...fixed[0].input, jobId: job.toUpperCase() })).toBe(fixed[0].expected);
  for (const bad of ["AB".repeat(32), "a".repeat(63), "a".repeat(65), "z".repeat(64), ""]) expect(() => siteExtraContentSha256V1({ ...fixed[0].input, photoSha256: bad })).toThrow();
 });
});

describe("resident-confirmation.v1", () => {
 const expectedDocument = "jobguard-resident-confirmation.v1\ntenant:22222222-2222-4222-8222-222222222222\njob:11111111-1111-4111-8111-111111111111\nconfirmation:33333333-3333-4333-8333-333333333333\ncontent-format:site-extra-content.v1\ncontent-sha256:e33c42e80a3b56166adf87c799b306553cafa22142425805e0c20005de511fc3\nstatement:confirmed on the operative's device; identity not verified\n";
 it("[E2] the document for a fixed input equals the expected text written out in full", () => {
  const document = residentConfirmationDocumentV1({ tenantId: tenant, jobId: job, confirmationId: confirmation, contentSha256: fixed[2].expected });
  expect(document).toBe(expectedDocument);
  expect(document.split("\n")).toHaveLength(8); expect(document.endsWith("\n")).toBe(true); expect(document.endsWith("\n\n")).toBe(false); expect(document).not.toContain("\r");
  expect(document.split("\n")[6]).toBe(`statement:${residentConfirmationStatementV1}`); expect(residentConfirmationStatementV1).toBe("confirmed on the operative's device; identity not verified");
  expect(new TextEncoder().encode(document).length).toBe(355);
  expect(residentConfirmationContentType).toBe("text/plain; charset=utf-8"); expect(residentConfirmationObjectVersion).toBe("resident-confirmation.v1");
 });
 it("[E2] ids are written in canonical lower case and the document holds nothing else", () => {
  expect(residentConfirmationDocumentV1({ tenantId: tenant.toUpperCase(), jobId: job.toUpperCase(), confirmationId: confirmation.toUpperCase(), contentSha256: fixed[2].expected })).toBe(expectedDocument);
  for (const bad of [{ contentSha256: "A".repeat(64) }, { contentSha256: "a".repeat(63) }, { tenantId: "not-a-uuid" }]) expect(() => residentConfirmationDocumentV1({ tenantId: tenant, jobId: job, confirmationId: confirmation, contentSha256: fixed[2].expected, ...bad })).toThrow();
 });
});

describe("log-site-extra.v3", () => {
 it("[E3] accepts the minimal body and a body with both evidence fields", () => { expect(logSiteExtraV3.parse(valid)).toEqual(valid); expect(logSiteExtraV3.parse(both)).toEqual(both); expect(logSiteExtraV3.parse({ ...valid, photoEvidenceId: both.photoEvidenceId })).toEqual({ ...valid, photoEvidenceId: both.photoEvidenceId }); });
 const authority = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance", "jobId", "siteVisitId", "deviceId"];
 it.each(authority)("[E3] refuses authority field %s", field => { expect(logSiteExtraV3.safeParse({ ...valid, [field]: "tampered" }).success).toBe(false); });
 const forbidden = ["evidenceId", "residentConfirmationEvidenceId", "confirmationId", "document", "documentText", "documentSha256", "contentHash", "contentSha256", "content", "label", "statement", "residentName", "name", "signature", "signedAt", "confirmedAt", "confirmedBy", "evidenceType", "contentType", "sha256", "photoSha256", "photo", "objectKey", "objectVersionId", "uploadId"];
 it.each(forbidden)("[E3] refuses top-level key %s", field => { expect(logSiteExtraV3.safeParse({ ...both, [field]: "tampered" }).success).toBe(false); expect(logSiteExtraV3.safeParse({ ...valid, [field]: "tampered" }).success).toBe(false); });
 it.each(["name", "signature", "document", "contentSha256", "confirmed", "time"])("[E3] refuses key %s inside residentConfirmation", field => {
  expect(logSiteExtraV3.safeParse({ ...valid, residentConfirmation: { shownContentSha256: "c".repeat(64), [field]: "tampered" } }).success).toBe(false);
  expect(logSiteExtraV3.safeParse({ ...valid, residentConfirmation: { [field]: "c".repeat(64) } }).success).toBe(false);
 });
 it.each([["upper case", "C".repeat(64)], ["63 characters", "c".repeat(63)], ["65 characters", "c".repeat(65)], ["not hex", "g".repeat(64)], ["empty", ""]])("[E3] refuses a hash shown that is %s", (_name, shownContentSha256) => {
  expect(logSiteExtraV3.safeParse({ ...valid, residentConfirmation: { shownContentSha256 } }).success).toBe(false);
 });
 it.each(["", " \t\n"])("[E3] refuses an empty or whitespace-only note %j, with and without a photo id", noteText => {
  expect(logSiteExtraV3.safeParse({ ...valid, note: noteText }).success).toBe(false); expect(logSiteExtraV3.safeParse({ ...valid, note: noteText, photoEvidenceId: both.photoEvidenceId }).success).toBe(false);
  const missing: Record<string, unknown> = { ...valid, photoEvidenceId: both.photoEvidenceId }; delete missing.note; expect(logSiteExtraV3.safeParse(missing).success).toBe(false);
 });
 it("[E3] text limits and the version literal are the same as v1; v1 still refuses the v3 fields", () => {
  for (const change of [{ version: "log-site-extra.v1" }, { version: "log-site-extra.v2" }, { commandId: "invalid" }, { note: "n".repeat(5001) }, { description: " " }, { description: "d".repeat(501) }, { photoEvidenceId: "invalid" }]) expect(logSiteExtraV3.safeParse({ ...valid, ...change }).success).toBe(false);
  expect(logSiteExtraV3.safeParse({ ...valid, note: "n".repeat(5000), description: "d".repeat(500) }).success).toBe(true);
  const v1 = { ...valid, version: "log-site-extra.v1" };
  expect(logSiteExtraV1.safeParse(v1).success).toBe(true);
  expect(logSiteExtraV1.safeParse({ ...v1, photoEvidenceId: both.photoEvidenceId }).success).toBe(false);
  expect(logSiteExtraV1.safeParse({ ...v1, residentConfirmation: both.residentConfirmation }).success).toBe(false);
  expect(logSiteExtraV1.safeParse({ ...valid, version: "log-site-extra.v3" }).success).toBe(false);
 });
 it("[E3] the v3 answer has exactly its shape", () => {
  const answer = { version: "site-extra-logged.v3", environment: "synthetic_demo", realExternalActions: 0, jobId: job, extraId: confirmation, state: "logged", evidence: { photoEvidenceId: null, residentConfirmationEvidenceId: confirmation, contentFormat: "site-extra-content.v1", contentSha256: fixed[0].expected } };
  expect(siteExtraLoggedV3.parse(answer)).toEqual(answer);
  expect(siteExtraLoggedV3.parse({ ...answer, evidence: { ...answer.evidence, photoEvidenceId: tenant, residentConfirmationEvidenceId: null } }).evidence.photoEvidenceId).toBe(tenant);
  for (const change of [{ environment: "production_billing" }, { realExternalActions: 1 }, { state: "approved" }, { price: 1 }, { version: "site-extra-logged.v1" }, { evidence: { ...answer.evidence, contentFormat: "site-extra-content.v2" } }, { evidence: { ...answer.evidence, extra: 1 } }, { evidence: { ...answer.evidence, contentSha256: "A".repeat(64) } }, { evidence: undefined }]) expect(siteExtraLoggedV3.safeParse({ ...answer, ...change }).success).toBe(false);
 });
});

describe("site-extra error codes", () => {
 it("[E4] the two new codes map to 422 and every ENT-3a code keeps its status", () => {
  expect(siteExtraHttpStatus("PHOTO_NOT_ACCEPTED")).toBe(422); expect(siteExtraHttpStatus("CONFIRMATION_MISMATCH")).toBe(422);
  const expected = { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, TRACK_FORBIDDEN: 403, EXTRA_FORBIDDEN: 403, INVALID_COMMAND: 400, NOT_FOUND: 404, COMMAND_CONFLICT: 409, STALE_REVISION: 409, SITE_EXTRA_UNAVAILABLE: 503 } as const;
  for (const [code, status] of Object.entries(expected)) expect(siteExtraHttpStatus(code as keyof typeof expected)).toBe(status);
  expect(siteExtraErrorCodes).toEqual([...Object.keys(expected), "PHOTO_NOT_ACCEPTED", "CONFIRMATION_MISMATCH"]);
  expect(new SiteExtraError("PHOTO_NOT_ACCEPTED").message).toBe("PHOTO_NOT_ACCEPTED");
 });
});
