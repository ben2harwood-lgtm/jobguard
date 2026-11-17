import { describe, expect, it } from "vitest";
import { logSiteExtraV1, siteExtraLoggedV1, siteExtraFailureV1, SiteExtraError, siteExtraHttpStatus } from "./site-extra.js";
const valid = { version: "log-site-extra.v1", commandId: "00000000-0000-4000-8000-000000000001", note: "Fictional additional work", description: "Fictional extra" };
const fields = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance", "jobId", "sorItem", "excessOfScopeItemId", "siteVisitId", "evidenceId", "residentConfirmationEvidenceId", "clientCaptureId", "deviceId", "deviceCapturedAt"];
describe("site-extra.v1 boundaries", () => {
 it("[A8] accepts exactly the minimal input and preserves reviewed text", () => { expect(logSiteExtraV1.parse(valid)).toEqual(valid); expect(logSiteExtraV1.parse({ ...valid, note: " x " }).note).toBe(" x "); });
 it.each(fields)("[A8] refuses authority or held field %s", field => { expect(logSiteExtraV1.safeParse({ ...valid, [field]: "tampered" }).success).toBe(false); });
 it.each(["", " \t\n"])("[A8] refuses an empty or whitespace-only note %j", note => { expect(logSiteExtraV1.safeParse({ ...valid, note }).success).toBe(false); });
 it("[A8] enforces versions, UUIDs, text limits and non-whitespace descriptions", () => {
  for (const change of [{ version: "old" }, { commandId: "invalid" }, { note: "n".repeat(5001) }, { description: " " }, { description: "d".repeat(501) }]) expect(logSiteExtraV1.safeParse({ ...valid, ...change }).success).toBe(false);
  expect(logSiteExtraV1.safeParse({ ...valid, note: "n".repeat(5000), description: "d".repeat(500) }).success).toBe(true);
 });
 it("[A15] maps the closed failures and validates synthetic logged results", () => {
  const expected = { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, TRACK_FORBIDDEN: 403, EXTRA_FORBIDDEN: 403, INVALID_COMMAND: 400, NOT_FOUND: 404, COMMAND_CONFLICT: 409, STALE_REVISION: 409, SITE_EXTRA_UNAVAILABLE: 503 } as const;
  for (const [code, status] of Object.entries(expected)) { const body = siteExtraFailureV1.parse({ version: "site-extra-error.v1", code }); expect(siteExtraHttpStatus(body.code)).toBe(status); expect(new SiteExtraError(body.code).message).toBe(code); }
  expect(siteExtraFailureV1.safeParse({ version: "site-extra-error.v1", code: "unknown" }).success).toBe(false);
  const result = { version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: valid.commandId, extraId: valid.commandId, state: "logged" };
  expect(siteExtraLoggedV1.parse(result)).toEqual(result);
  for (const change of [{ environment: "production_billing" }, { realExternalActions: 1 }, { state: "approved" }, { price: 1 }]) expect(siteExtraLoggedV1.safeParse({ ...result, ...change }).success).toBe(false);
 });
});
