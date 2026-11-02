import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { ContractorRepository, SiteExtraRepository, type AuthenticatedMembership } from "@jobguard/db";
import { SiteExtraError } from "@jobguard/core";
import { SiteExtraApplication, siteExtraHttpFailure } from "./site-extra.application.js";
const raw = () => ({ version: "offline-intent.v1", jobId: randomUUID(), clientMetadata: { capturedAt: "1970-01-01T00:00:00Z", hlc: { wallTimeMs: 0, logical: 0, nodeId: "fictional-device" } }, body: { version: "log-site-extra.v1", commandId: "01960000-0000-7000-8000-000000000001", description: "Fictional extra", note: "Fictional note" } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("ENT12 has no live path, including absent configuration", async () => {
 const pool = new Pool(), app = new SiteExtraApplication(pool), connect = vi.spyOn(pool, "connect");
 try {
  for (const mode of [undefined, "", "production_billing", "pilot_no_charge"]) {
   vi.stubEnv("JOBGUARD_ENV", mode);
   await expect(app.logOffline(undefined, raw())).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
  }
  expect(connect).not.toHaveBeenCalled();
 } finally { await pool.end(); }
});
it("ENT12 resolves current identity twice and preserves only strict labelled metadata", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const pool = new Pool(), app = new SiteExtraApplication(pool), sessionId = randomUUID(), principal = { version: "contractor-principal.v1", sessionId };
 const member = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
 const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member);
 const write = vi.spyOn(SiteExtraRepository.prototype, "logOfflineSiteExtra").mockResolvedValue({ variationId: randomUUID() });
 try {
  const intent = raw();
  expect(await app.logOffline(principal, intent)).toMatchObject({ version: "site-extra-logged.v1", jobId: intent.jobId, state: "logged" });
  expect(write.mock.calls[0]![1]).toBe(member); expect(write.mock.calls[0]![2]).toEqual(intent);
  expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]);
  for (const field of ["raisingUser", "tenantId", "origin", "amount", "allocation", "lockedBillId", "shadowSignalId", "serverRecordedAt", "agreementVersionId"]) {
   await expect(app.logOffline(principal, { ...intent, [field]: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
   await expect(app.logOffline(principal, { ...intent, clientMetadata: { ...intent.clientMetadata, [field]: randomUUID() } })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  }
  lookup.mockResolvedValueOnce(member).mockRejectedValueOnce({ code: "UNAUTHENTICATED" });
  await expect(app.logOffline(principal, intent)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(write).toHaveBeenCalledOnce();
  for (const code of ["EXTRA_FORBIDDEN", "NOT_FOUND"] as const) {
   write.mockRejectedValueOnce(new SiteExtraError(code));
   expect(siteExtraHttpFailure(await app.logOffline(principal, intent).catch(error => error))).toEqual({ status: code === "NOT_FOUND" ? 404 : 403, body: { version: "site-extra-error.v1", code } });
  }
 } finally { await pool.end(); }
});
