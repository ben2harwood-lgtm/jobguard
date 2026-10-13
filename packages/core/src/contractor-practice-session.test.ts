import { describe, expect, it } from "vitest";
import { contractorPracticeSessionRevokeV1, contractorPracticeSessionRevokedV1, contractorPracticeSessionFailureV1, contractorPracticeSessionHttpStatus, ContractorPracticeSessionError, CONTRACTOR_PRACTICE_SESSION_CEILING_DAYS } from "./contractor-practice-session.js";
const fields = ["tenantId", "tenant_id", "requested_tenant_id", "membershipId", "identityUserId", "sessionId", "session", "sessionRef", "digest", "sessionDigest", "role", "environment", "createdAt", "expiresAt", "revokedAt", "days", "window", "reason", "commandId", "other"];
describe("practice session boundaries", () => {
 it("[PH17] accepts exactly the versioned revoke body", () => {
  expect(contractorPracticeSessionRevokeV1.parse({ version: "contractor-practice-session-revoke.v1" })).toEqual({ version: "contractor-practice-session-revoke.v1" });
  for (const body of [null, {}, { version: "v2" }]) expect(contractorPracticeSessionRevokeV1.safeParse(body).success).toBe(false);
  expect(CONTRACTOR_PRACTICE_SESSION_CEILING_DAYS).toBe(7);
 });
 it.each(fields)("[PH17] refuses authority field %s", field => {
  expect(contractorPracticeSessionRevokeV1.safeParse({ version: "contractor-practice-session-revoke.v1", [field]: "invalid" }).success).toBe(false);
 });
 it("[PH17] validates the public result and closed failures strictly", () => {
  const result = { version: "contractor-practice-session-revoked.v1", environment: "synthetic_demo", realExternalActions: 0, revokedAt: "2026-10-12T12:00:00.123456Z" };
  expect(contractorPracticeSessionRevokedV1.parse(result)).toEqual(result);
  for (const changed of [{ ...result, session: "invalid" }, { ...result, environment: "pilot_no_charge" }, { ...result, revokedAt: "invalid" }, { ...result, realExternalActions: 1 }]) expect(contractorPracticeSessionRevokedV1.safeParse(changed).success).toBe(false);
  for (const [code, status] of Object.entries({ UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, INVALID_COMMAND: 400, PRACTICE_SESSION_UNAVAILABLE: 503 })) {
   const body = contractorPracticeSessionFailureV1.parse({ version: "contractor-practice-session-error.v1", code });
   expect(contractorPracticeSessionHttpStatus(body.code)).toBe(status);
   expect(new ContractorPracticeSessionError(body.code).message).toBe(code);
   expect(contractorPracticeSessionFailureV1.safeParse({ ...body, detail: "invalid" }).success).toBe(false);
  }
  expect(contractorPracticeSessionFailureV1.safeParse({ version: "contractor-practice-session-error.v1", code: "OTHER" }).success).toBe(false);
 });
});
