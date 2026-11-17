import { describe, expect, it } from "vitest";
import { logSiteExtraV1, logSiteExtraV2, siteExtraLoggedV1 } from "./site-extra.js";
const base = { commandId: "00000000-0000-4000-8000-000000000001", note: "Fictional additional work", description: "Fictional extra" };
const v1 = { version: "log-site-extra.v1", ...base };
const v2 = { version: "log-site-extra.v2", ...base, siteVisitId: "00000000-0000-4000-8000-000000000002" };
// The same names ENT-3a's version 1 test refuses, except siteVisitId (the one field version 2 adds).
const fields = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance", "jobId", "sorItem", "excessOfScopeItemId", "evidenceId", "residentConfirmationEvidenceId", "clientCaptureId", "deviceId", "deviceCapturedAt"];
describe("site-extra.v2 is an additive extension of v1", () => {
 it("[B17] accepts exactly its minimal input and preserves reviewed text", () => { expect(logSiteExtraV2.parse(v2)).toEqual(v2); expect(logSiteExtraV2.parse({ ...v2, note: " x " }).note).toBe(" x "); });
 it.each(fields)("[B17] version 2 refuses authority or held field %s", field => { expect(logSiteExtraV2.safeParse({ ...v2, [field]: "tampered" }).success).toBe(false); });
 it("[B17] version 2 refuses a missing, null or non-uuid siteVisitId and a version 1 label", () => {
  const { siteVisitId: _removed, ...missing } = v2;
  for (const body of [missing, { ...v2, siteVisitId: null }, { ...v2, siteVisitId: "invalid" }, { ...v2, version: "log-site-extra.v1" }]) expect(logSiteExtraV2.safeParse(body).success).toBe(false);
 });
 it("[B17] version 2 keeps every v1 rule on the fields they share", () => {
  for (const change of [{ commandId: "invalid" }, { note: "" }, { note: " \t\n" }, { note: "n".repeat(5001) }, { description: " " }, { description: "d".repeat(501) }]) expect(logSiteExtraV2.safeParse({ ...v2, ...change }).success).toBe(false);
  expect(logSiteExtraV2.safeParse({ ...v2, note: "n".repeat(5000), description: "d".repeat(500) }).success).toBe(true);
 });
 // Named so a later separate extension (version 3, photo and resident confirmation) can add its own side-by-side case to this group.
 it("[B17-SIDE] version 1 and version 2 bodies are both accepted side by side and the version 1 body and result are unchanged", () => {
  expect(logSiteExtraV1.parse(v1)).toEqual(v1); expect(logSiteExtraV2.parse(v2)).toEqual(v2);
  expect(logSiteExtraV1.safeParse(v2).success).toBe(false); expect(logSiteExtraV1.safeParse({ ...v1, siteVisitId: v2.siteVisitId }).success).toBe(false);
  expect(logSiteExtraV2.safeParse(v1).success).toBe(false);
  const result = { version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: base.commandId, extraId: base.commandId, state: "logged" };
  expect(siteExtraLoggedV1.parse(result)).toEqual(result);
 });
});
