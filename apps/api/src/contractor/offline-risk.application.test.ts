// Session/repository doubles only: these tests do not prove persisted authentication.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { parseOfflineIntentV1, toLogSiteExtraV1, siteAssignedJobsV1, siteExtraLoggedV1, SiteExtraError } from "@jobguard/core";
import { ContractorEntitlementAuthorityRepository, ContractorRepository, SiteExtraRepository, SiteVisitRepository, type AuthenticatedMembership } from "@jobguard/db";
import { SiteExtraApplication, siteExtraHttpFailure } from "./site-extra.application.js";

const queued = () => parseOfflineIntentV1({ version: "offline-intent.v1", jobId: randomUUID(), clientMetadata: { capturedAt: "2099-01-01T00:00:00Z", hlc: { wallTimeMs: Number.MAX_SAFE_INTEGER, logical: 0, nodeId: "fictional-node" } }, body: { version: "log-site-extra.v1", commandId: "01960000-0000-7000-8000-000000000001", note: " Fictional note ", description: "Fictional extra" } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("M31-S07 service boundary delegation", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 vi.spyOn(ContractorEntitlementAuthorityRepository.prototype,"requireFeature").mockResolvedValue();
 const pool = new Pool(), app = new SiteExtraApplication(pool), sessionId = randomUUID(), principal = { version: "contractor-principal.v1", sessionId };
 const member = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
 const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member);
 const write = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: randomUUID() });
 const read = vi.spyOn(SiteVisitRepository.prototype, "assignedJobs").mockResolvedValue({ jobs: [], truncated: false });
 try {
  const intent = queued(), converted = toLogSiteExtraV1(intent);
  const result = await app.log(principal, converted.jobId, converted.body);
  expect(siteExtraLoggedV1.parse(result)).toEqual(result);
  expect(write.mock.calls[0]![1]).toBe(member);
  expect(write.mock.calls[0]![0].tenantId).toBe(member.tenantId);
  expect(write.mock.calls[0]![2]).toEqual({ jobId: converted.jobId, commandId: converted.body.commandId, note: converted.body.note, description: converted.body.description });
  const projection = await app.assignedJobs(principal);
  expect(siteAssignedJobsV1.parse(projection)).toEqual(projection); expect(read.mock.calls[0]![1]).toBe(member);
  expect(lookup.mock.calls).toEqual(Array.from({ length: 4 }, () => [sessionId]));
  for (const malformed of [undefined, {}, { version: "contractor-principal.v1", sessionId: "invalid" }, { ...principal, tenantId: member.tenantId }]) {
   await expect(app.log(malformed, converted.jobId, converted.body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
   await expect(app.assignedJobs(malformed)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  }
  for (const field of ["tenantId", "actorMembershipId", "role", "grantId", "environment", "serverTime", "clientMetadata"]) await expect(app.log(principal, converted.jobId, { ...converted.body, [field]: "tampered" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  for (const reason of ["expired", "revoked"]) {
   lookup.mockRejectedValue(Object.assign(new Error(reason), { code: "UNAUTHENTICATED" }));
   await expect(app.log(principal, converted.jobId, converted.body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
   await expect(app.assignedJobs(principal)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
   lookup.mockResolvedValueOnce(member).mockRejectedValueOnce({ code: "UNAUTHENTICATED" });
   await expect(app.log(principal, converted.jobId, converted.body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
   lookup.mockResolvedValueOnce(member).mockRejectedValueOnce({ code: "UNAUTHENTICATED" });
   await expect(app.assignedJobs(principal)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  }
  expect(write).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledOnce();
 } finally { await pool.end(); }
});
it("M31-S08 mode remains closed", async () => {
 const pool = new Pool(), app = new SiteExtraApplication(pool), lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession"), connect = vi.spyOn(pool, "connect");
 try {
  for (const mode of ["pilot_no_charge", "production_billing", ""]) {
   vi.stubEnv("JOBGUARD_ENV", mode);
   const raw = toLogSiteExtraV1(queued());
   await expect(app.log({ version: "contractor-principal.v1", sessionId: randomUUID() }, raw.jobId, raw.body)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
   await expect(app.assignedJobs(undefined)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
  }
  expect(lookup).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
 } finally { await pool.end(); }
});
it("M31-S16 a lost response remains a failure at the service boundary", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool();
 vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue({ tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership);
 vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockRejectedValue(new Error("response unavailable"));
 try {
  const raw = toLogSiteExtraV1(queued());
  const failure = await new SiteExtraApplication(pool).log({ version: "contractor-principal.v1", sessionId: randomUUID() }, raw.jobId, raw.body).then(() => { throw new Error("unexpected success"); }, siteExtraHttpFailure);
  expect(failure).toEqual(siteExtraHttpFailure(new SiteExtraError("SITE_EXTRA_UNAVAILABLE")));
  expect(failure).toEqual({ status: 503, body: { version: "site-extra-error.v1", code: "SITE_EXTRA_UNAVAILABLE" } });
 } finally { await pool.end(); }
});
