import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VatFixtureApplication, vatFixtureFailure } from "./vat-fixture.application.js";
import { VatFixtureRepositoryError } from "@jobguard/db";
import { VatTreatmentError } from "@jobguard/core";
const tenant = "10000000-0000-4000-8000-000000000001", job = "10000000-0000-4000-8000-000000000002", member = "10000000-0000-4000-8000-000000000003";
const credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant, origin: "https://company.invalid" };
const authenticate = vi.fn(), findMembership = vi.fn(), command = vi.fn(), read = vi.fn();
const identity = { allowedOrigin: credentials.origin, provider: { authenticate, findMembership },
  principal: async (token: string) => { const principal = await authenticate(token); if (!principal) throw new Error("unexpected principal"); return principal; } };
const app = new VatFixtureApplication(identity as never, { read, command });
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  authenticate.mockResolvedValue({ identityUserId: tenant, sessionId: member, sessionCredential: "d".repeat(64), csrfToken: credentials.csrfToken });
  findMembership.mockResolvedValue({ id: member, identityUserId: tenant, tenantId: tenant, role: "owner" });
  command.mockResolvedValue({ book: {}, records: [], reconciliation: {} }); read.mockResolvedValue({ book: {}, records: [], reconciliation: {} });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("binds the verified context directly and passes the current session's membership, not eligibility actor", async () => {
  const input = { jobId: job, document: { eligibility: { actorId: job } } };
  const result = await app.command(credentials, job, input);
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), member, input);
  expect(result.issueRefusal).toContain("real issue is disabled"); expect(result.creditMethod).toContain("Candidate");
  await app.read(credentials, job);
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), member, job);
});
it.each(["admin", "estimator", "foreman", "operative", "finance", "read_only"])("refuses %s writes like the repository", async role => {
  findMembership.mockResolvedValue({ id: member, identityUserId: tenant, tenantId: tenant, role });
  const refusal = new VatFixtureRepositoryError("UNAVAILABLE");
  command.mockRejectedValue(refusal);
  await expect(app.command(credentials, job, { jobId: job })).rejects.toBe(refusal);
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), member, { jobId: job });
});
it("rechecks membership and refuses a route/body job mismatch", async () => {
  findMembership.mockResolvedValueOnce({ id: member, identityUserId: tenant, tenantId: tenant, role: "owner" }).mockResolvedValueOnce(undefined);
  await expect(app.command(credentials, job, { jobId: job })).rejects.toMatchObject({ code: "TENANT_FORBIDDEN" });
  findMembership.mockResolvedValue({ id: member, identityUserId: tenant, tenantId: tenant, role: "owner" });
  await expect(app.command(credentials, job, { jobId: tenant })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(command).not.toHaveBeenCalled();
});
it("keeps all other environments not-found before authentication", async () => {
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  for (const run of [() => app.read(credentials, job), () => app.command(credentials, job, {})]) {
    const error = await run().catch(error => error); expect(vatFixtureFailure(error).status).toBe(404);
  }
  expect(authenticate).not.toHaveBeenCalled();
});
it("preserves typed refusal codes, explains conflicts and redacts unexpected errors", () => {
  expect(vatFixtureFailure(new VatFixtureRepositoryError("CONFLICT"))).toMatchObject({ status: 409, body: { code: "CONFLICT", message: expect.stringContaining("fixed fields") } });
  expect(vatFixtureFailure(new VatTreatmentError("ELIGIBILITY_CONFLICT", "Explicit reverse charge eligibility inputs conflict"))).toMatchObject({ status: 400, body: { code: "ELIGIBILITY_CONFLICT" } });
  expect(JSON.stringify(vatFixtureFailure(new Error("private SQL")))).not.toContain("private SQL");
});

it("rechecks the read actor after context resolution and returns no data on refusal", async () => {
  findMembership.mockResolvedValueOnce({ id: member, identityUserId: tenant, tenantId: tenant, role: "owner" }).mockResolvedValueOnce(undefined);
  await expect(app.read(credentials, job)).rejects.toMatchObject({ code: "TENANT_FORBIDDEN" });
  expect(read).not.toHaveBeenCalled();
  expect(vatFixtureFailure(new VatFixtureRepositoryError("FORBIDDEN"))).toEqual({ status: 403,
    body: { version: "vat.fixture-error.v1", code: "FORBIDDEN", message: "You don't have permission." } });
});
