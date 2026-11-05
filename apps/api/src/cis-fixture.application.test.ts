import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CisFixtureApplication, cisFixtureFailure } from "./cis-fixture.application.js";
import { CisFixturePersistenceError } from "@jobguard/db";
const id = "00000000-0000-4000-8000-000000000001";
const credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), origin: "https://company.invalid", tenantHeader: id };
const authenticate = vi.fn(), findMembership = vi.fn(), read = vi.fn(), command = vi.fn();
const starter = vi.fn(() => ({ tenantId: id, jobId: id }) as never);
const application = new CisFixtureApplication({ allowedOrigin: credentials.origin,
  provider: { authenticate, findMembership } } as never, { read, command }, starter);
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  authenticate.mockResolvedValue({ identityUserId: id, sessionId: id, csrfToken: credentials.csrfToken });
  findMembership.mockResolvedValue({ id, identityUserId: id, tenantId: id, role: "owner" });
  read.mockRejectedValue(new CisFixturePersistenceError("NOT_FOUND"));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("keeps unknown and empty repository refusals identical and issue disabled", async () => {
  const result = await application.read(credentials, id);
  expect(result.code).toBe("CIS_FIXTURE_NOT_FOUND"); expect(result.stored).toBeNull();
  expect(result.issueReason).toContain("disabled");
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: id }), id);
});
it.each(["production", "pilot_no_charge", "development"])("hides outside synthetic_demo: %s", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  for (const work of [() => application.read(credentials, id), () => application.command(credentials, id, {})]) {
    await expect(work()).rejects.toThrow("NOT_FOUND");
  }
  expect(authenticate).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
});
it.each(["tenantId", "actor", "enabled", "CIS_ENABLED"])("refuses forged %s", async key => {
  await expect(application.command(credentials, id, { [key]: true })).rejects.toThrow("INVALID_INPUT");
  expect(command).not.toHaveBeenCalled();
});
it("refuses expired, revoked, missing sessions and origin or CSRF substitution before repository access", async () => {
  for (const bad of [{ ...credentials, sessionToken: undefined }, { ...credentials, origin: undefined }, { ...credentials, csrfToken: "x".repeat(24) }]) {
    await expect(application.read(bad, id)).rejects.toThrow();
  }
  authenticate.mockResolvedValue(undefined); await expect(application.read(credentials, id)).rejects.toThrow("UNAUTHENTICATED");
  expect(read).not.toHaveBeenCalled();
});
it("refuses revoked memberships before accessing any stored book", async () => {
  findMembership.mockResolvedValue(undefined);
  await expect(application.read(credentials, id)).rejects.toThrow("TENANT_FORBIDDEN");
  await expect(application.command(credentials, id, {})).rejects.toThrow("TENANT_FORBIDDEN");
  expect(read).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
});
it("redacts unexpected errors and keeps conflicts typed", () => {
  expect(cisFixtureFailure(new Error("secret SQL"))).toMatchObject({ status: 503 });
  expect(cisFixtureFailure(new CisFixturePersistenceError("CONFLICT"))).toMatchObject({ status: 409, body: { code: "CIS_FIXTURE_CONFLICT" } });
});
