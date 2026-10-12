import { expect, it } from "vitest";
import { extraDuplicateUnlinkV1, extraDuplicateLinksV1, extraPersistenceErrorCodes, extraUnlinkCommandType, extraUnlinkReasonCodes } from "./extra-persistence.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { version: "extra-duplicate-unlink.v1", commandId: id(1), jobId: id(2), actorMembershipId: id(3), linkId: id(4), expectedRevision: 1, reasonCode: "linked_in_error" };

it("[P1] un-link input and links-read schemas are strict and versioned", () => {
 expect(extraDuplicateUnlinkV1.parse(input)).toEqual(input);
 expect(extraUnlinkCommandType).toBe("UnlinkDuplicate");
 expect(extraUnlinkReasonCodes).toEqual(["not_same_work", "wrong_pair", "linked_in_error"]);
 for (const reasonCode of ["not_same_work", "wrong_pair", "linked_in_error"]) expect(extraDuplicateUnlinkV1.safeParse({ ...input, reasonCode }).success).toBe(true);
 for (const field of ["tenantId", "duplicateId", "canonicalId", "role", "permission", "grantId", "kind", "state", "serverRecordedAt", "reversesLinkId", "reason"]) {
  expect(extraDuplicateUnlinkV1.safeParse({ ...input, [field]: "tampered" }).success, field).toBe(false);
 }
 for (const field of ["commandId", "jobId", "actorMembershipId", "linkId"]) expect(extraDuplicateUnlinkV1.safeParse({ ...input, [field]: "made-up" }).success, field).toBe(false);
 for (const expectedRevision of [0, -1, 1.5, 1_000_001]) expect(extraDuplicateUnlinkV1.safeParse({ ...input, expectedRevision }).success).toBe(false);
 expect(extraDuplicateUnlinkV1.safeParse({ ...input, expectedRevision: 1_000_000 }).success).toBe(true);
 expect(extraDuplicateUnlinkV1.safeParse({ ...input, reasonCode: "other" }).success).toBe(false);
 expect(extraDuplicateUnlinkV1.safeParse({ ...input, version: "extra-duplicate-unlink.v2" }).success).toBe(false);
 const read = { version: "extra-duplicate-links.v1", jobId: id(2), revision: 1, activeLinks: [{ linkId: id(4), duplicateId: id(5), canonicalId: id(6) }] };
 expect(extraDuplicateLinksV1.parse(read)).toEqual(read);
 expect(extraDuplicateLinksV1.safeParse({ ...read, revision: 0, activeLinks: [] }).success).toBe(true);
 for (const value of [{ ...read, extra: true }, { ...read, activeLinks: [{ ...read.activeLinks[0], extra: true }] }, { ...read, version: "extra-duplicate-links.v2" }, { ...read, revision: -1 }, { ...read, revision: 1.5 }]) expect(extraDuplicateLinksV1.safeParse(value).success).toBe(false);
});

it("[P2] three new codes are appended and the ten merged codes keep their order", () => {
 expect(extraPersistenceErrorCodes).toEqual(["NOT_FOUND", "INVALID_COMMAND", "COMMAND_CONFLICT", "INVALID_ORIGIN", "STALE_REVISION", "PROMPT_ORIGIN_HELD", "DUPLICATE_LINK_REFUSED", "EXTRA_EXPORTED", "ORDER_LINE_LINK_REFUSED", "DATABASE_UNAVAILABLE", "UNLINK_FORBIDDEN", "NOT_LINKED", "ALREADY_UNLINKED"]);
});
