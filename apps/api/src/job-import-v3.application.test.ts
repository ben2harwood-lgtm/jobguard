import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { JobImportV3Repository, JobImportV3Error } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { JobImportV3Application, CompanyJobImportV3Application } from "./job-import-v3.application.js";
import { JobImportV3Controller } from "./job-import-v3.controller.js";

afterEach(() => vi.restoreAllMocks());
describe("CH-5 API authority", () => {
  it("checks current job ownership before every preview, import, read or malformed request", async () => {
    const job = vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new Error("denied"));
    const preview = vi.spyOn(JobImportV3Repository.prototype, "preview"), adopt = vi.spyOn(JobImportV3Repository.prototype, "adopt"), read = vi.spyOn(JobImportV3Repository.prototype, "read");
    const app = new JobImportV3Application({} as Pool, "session");
    await expect(app.preview("foreign", {})).rejects.toThrow("denied");
    await expect(app.adopt("foreign", {})).rejects.toThrow("denied");
    await expect(app.read("foreign")).rejects.toThrow("denied");
    expect(job).toHaveBeenCalledTimes(3); expect(preview).not.toHaveBeenCalled(); expect(adopt).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it("returns a plain reason when the catch adapter is unavailable", async () => {
    vi.spyOn(JobImportV3Application.prototype, "assessCatch").mockRejectedValue(new JobImportV3Error("ATTRIBUTION_UNAVAILABLE"));
    await expect(new JobImportV3Controller({} as Pool).assessCatch({ headers: {} }, "job", {})).rejects.toMatchObject({
      status: 409, response: { code: "ATTRIBUTION_UNAVAILABLE", reason: expect.stringContaining("SV-6") },
    });
  });
  it("maps live admission refusal to a typed conflict", async () => {
    vi.spyOn(JobImportV3Application.prototype, "adopt").mockRejectedValue(new JobImportV3Error("METER_PLACE_SOURCE_HANDOFF_HELD"));
    await expect(new JobImportV3Controller({} as Pool).adopt({ headers: {} }, "job", {})).rejects.toMatchObject({ status: 409, response: { code: "METER_PLACE_SOURCE_HANDOFF_HELD" } });
  });
});

describe("company imports retain the meter identity and CSRF boundary", () => {
  const tenant = "00000000-0000-4000-8000-000000000001", actor = "00000000-0000-4000-8000-000000000002";
  const credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant, origin: "https://company.invalid" };
  function fixture() {
    const repository = { source: vi.fn(), read: vi.fn(), preview: vi.fn(), adopt: vi.fn(async () => ({ saved: true })), assessCatch: vi.fn() };
    const adopt = repository.adopt;
    const authenticate = vi.fn(async (token: string) => token === credentials.sessionToken ? { identityUserId: tenant, sessionId: tenant, csrfToken: credentials.csrfToken } : undefined);
    const findMembership = vi.fn(async (_: unknown, id: string): Promise<{ id: string; identityUserId: string; tenantId: string; role: string } | undefined> => id === tenant ? { id: actor, identityUserId: tenant, tenantId: tenant, role: "owner" } : undefined);
    const app = new CompanyJobImportV3Application({ allowedOrigin: credentials.origin, provider: { authenticate, findMembership, digest: () => "a".repeat(64) } } as never, repository as never);
    return { adopt, app, repository, authenticate, findMembership };
  }
  afterEach(() => vi.unstubAllEnvs());
  it.each(["source", "read", "preview", "adopt", "catch"] as const)("binds %s to the current verified company", async action => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const f = fixture();
    await f.app.run(credentials, actor, action, { intent: true });
    const method = action === "catch" ? "assessCatch" : action;
    expect(f.repository[method]).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), actor,
      ...(["source", "read"].includes(action) ? [] : [{ intent: true }]));
  });
  it.each(["source", "read", "preview", "adopt", "catch"] as const)("refuses %s outside the synthetic environment before identity or repository access", async action => {
    vi.stubEnv("JOBGUARD_ENV", "production"); const f = fixture();
    await expect(f.app.run(credentials, actor, action, {})).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
    expect(f.authenticate).not.toHaveBeenCalled();
    for (const method of Object.values(f.repository)) expect(method).not.toHaveBeenCalled();
  });
  it.each(["source", "read", "preview", "adopt", "catch"] as const)("revoked membership blocks %s before repository access", async action => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const f = fixture();
    f.findMembership.mockResolvedValueOnce(undefined);
    await expect(f.app.run(credentials, actor, action, {})).rejects.toThrow();
    for (const method of Object.values(f.repository)) expect(method).not.toHaveBeenCalled();
  });
  it("passes the verified company and server digest to the import writer", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const f = fixture();
    expect(await f.app.run(credentials, actor, "adopt", { intent: true })).toEqual({ saved: true });
    expect(f.adopt).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), actor, { intent: true });
  });
  it.each([{ sessionToken: undefined }, { sessionToken: "x".repeat(32) }, { csrfToken: undefined }, { csrfToken: "x".repeat(24) }, { origin: "https://foreign.invalid" }, { tenantHeader: actor }])("refuses invalid identity, tenant and CSRF before import: %j", async change => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const f = fixture();
    await expect(f.app.run({ ...credentials, ...change }, actor, "adopt", {})).rejects.toThrow();
    expect(f.adopt).not.toHaveBeenCalled();
  });
});
