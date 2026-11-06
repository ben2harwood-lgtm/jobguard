import { expect, it } from "vitest";
import { recordExtraProceedV1 } from "./extra-proceed.js";
const id = "11111111-1111-4111-8111-111111111111";
const input = { version: "record-extra-proceed.v1", commandId: id, requestId: id, reason: "Fictional work proceeding" };
it("accepts only a reason and exact request binding, never supplied authority, timing or money", () => {
 expect(recordExtraProceedV1.parse(input)).toEqual(input);
 for (const key of ["actorMembershipId", "tenantId", "recordedAt", "netPence", "requirement", "stepIndex", "approved", "state"])
  expect(recordExtraProceedV1.safeParse({ ...input, [key]: id }).success, key).toBe(false);
 for (const reason of ["", "  ", "x".repeat(1001)]) expect(recordExtraProceedV1.safeParse({ ...input, reason }).success).toBe(false);
});
