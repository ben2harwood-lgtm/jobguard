import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RetentionError } from "@jobguard/core";
import { RetentionRecordRepositoryError } from "@jobguard/db";
import { RetentionRecordApplication, retentionRecordFailure } from "./retention-record.application.js";
import type { IdentityApplication } from "./auth/identity.application.js";
const tenant = "00000000-0000-4000-8000-000000000001", job = "00000000-0000-4000-8000-000000000002";
const credentials = { sessionToken: "s".repeat(32), origin: "https://company.invalid", csrfToken: "c".repeat(24), tenantHeader: job };
const authenticate = vi.fn(), findMembership = vi.fn(), session = vi.fn(), read = vi.fn(), command = vi.fn();
const identity = { session, allowedOrigin: credentials.origin, provider: { authenticate, findMembership, digest: () => "a".repeat(64) } } as unknown as IdentityApplication;
const app = new RetentionRecordApplication(identity, { read, command });
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  session.mockResolvedValue({ memberships: [{ tenantId: tenant }] });
  authenticate.mockResolvedValue(Object.defineProperty({ identityUserId: tenant, sessionId: tenant, csrfToken: credentials.csrfToken }, "sessionCredential", { value: "a".repeat(64), enumerable: false }));
  findMembership.mockResolvedValue({ id: tenant, identityUserId: tenant, tenantId: tenant, role: "owner", email: "fictional@company.invalid" });
  read.mockResolvedValue({}); command.mockResolvedValue({});
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("binds verified context directly, ignores tenant headers and passes the session digest separately from the strict raw command", async () => {
  const raw = { jobId: job, version: "retention-record-command.v1" };
  await app.command(credentials, job, raw); await app.read(credentials, job);
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), { sessionDigest: "a".repeat(64) }, raw);
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), job);
  expect(findMembership).toHaveBeenCalledWith(expect.anything(), tenant);
  await expect(app.command(credentials, tenant, raw)).rejects.toThrow("INVALID_RETENTION_INPUT");
  expect(command).toHaveBeenCalledTimes(1);
});
it("rechecks authentication, membership, origin and CSRF before repository access", async () => {
  for (const changed of [{ origin: "https://foreign.invalid" }, { csrfToken: "x".repeat(24) }]) {
    await expect(app.command({ ...credentials, ...changed }, job, { jobId: job })).rejects.toThrow("ORIGIN_FORBIDDEN");
  }
  authenticate.mockResolvedValue(undefined);
  await expect(app.read(credentials, job)).rejects.toThrow("UNAUTHENTICATED");
  authenticate.mockResolvedValue(Object.defineProperty({ identityUserId: tenant, sessionId: tenant, csrfToken: credentials.csrfToken }, "sessionCredential", { value: "a".repeat(64), enumerable: false })); findMembership.mockResolvedValue(undefined);
  await expect(app.read(credentials, job)).rejects.toThrow("TENANT_FORBIDDEN");
  expect(read).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
});
it.each(["production", "pilot_no_charge", "development"])("is not found in %s without accessing identity or storage", async env => {
  vi.stubEnv("JOBGUARD_ENV", env);
  await expect(app.read(credentials, job)).rejects.toThrow("RETENTION_DARK");
  expect(session).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  expect(retentionRecordFailure(new RetentionRecordRepositoryError("RETENTION_DARK")).status).toBe(404);
});
it("maps repository refusals and conflicts without leaking database details", () => {
  expect(retentionRecordFailure(new RetentionError("STALE_PROFILE", "private"))).toMatchObject({ status: 409, body: { code: "STALE_PROFILE", message: expect.stringContaining("profile changed") } });
  expect(retentionRecordFailure(new RetentionError("REPLAY_CONFLICT", "private")).status).toBe(409);
  expect(retentionRecordFailure(new RetentionRecordRepositoryError("RETENTION_NOT_FOUND")).status).toBe(404);
  expect(JSON.stringify(retentionRecordFailure(new Error("private database detail")))).not.toContain("private");
});
