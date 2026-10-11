import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { JobPartiesApplication } from "./job-parties.application.js";
import { JobPartiesController, JobPartiesListController } from "./job-parties.controller.js";
import { JobPartiesRepository, PracticeAccessError, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID } from "@jobguard/db";
import { createHash } from "node:crypto";
import { PracticeErrorsFilter } from "./practice-errors.filter.js";
import type { ArgumentsHost } from "@nestjs/common";
const job = "11111111-1111-4111-8111-111111111111";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("CH-3a application boundary", () => {
  it.each(["Second\nThird", "Second\rThird", "Second\r\nThird"])("rejects an address line containing CR/LF with INVALID_PARTIES before persistence: %j", async line => {
    const { pool, query } = accessPool("owner");
    const app = new JobPartiesApplication(pool);
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const run = async () => app.command({ sessionId: token }, job, {
      version: "job-parties-command.v1", commandId: "22222222-2222-4222-8222-222222222222", action: "create_site",
      site: { version: "site.v1", addressLines: ["First line", line], town: "London", postcode: "SW1A 1AA" },
    });
    await expect(run()).rejects.toMatchObject({ code: "INVALID_PARTIES" });
    for (const [sql] of query.mock.calls) expect(sql).toMatch(/authenticate_practice_session|^(BEGIN|COMMIT|ROLLBACK)$|set_config|practice_session_digest/);
  });
  it("rejects unauthenticated, non-member and production callers before business persistence", async () => {
    const { pool, query } = accessPool("owner"), app = new JobPartiesApplication(pool);
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    await expect(app.view(null, job)).rejects.toThrow("UNAUTHENTICATED");
    expect(query).not.toHaveBeenCalled();
    await expect(app.view({ sessionId: token, requestedTenantId: "33333333-3333-4333-8333-333333333333" }, job)).rejects.toThrow("FORBIDDEN");
    await expect(app.command({ sessionId: token }, "wrong", {})).rejects.toThrow("NOT_FOUND");
    for (const [sql] of query.mock.calls) expect(sql).toMatch(/authenticate_practice_session|^(BEGIN|COMMIT|ROLLBACK)$|set_config|practice_session_digest/);
    query.mockClear();
    vi.stubEnv("JOBGUARD_ENV", "production_billing");
    await expect(app.command({ sessionId: token }, job, { environment: "synthetic_demo" })).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(query).not.toHaveBeenCalled();
  });
});

const token = "18000000-0000-4000-8000-000000000001";
const actions = ["view", "command", "adopt"] as const;
function accessPool(scenario: "missing" | "invalid" | "invented" | "stranger" | "owner") {
  const query = vi.fn(async (sql: string) => ({ rows:
    sql.includes("authenticate_practice_session") && (scenario === "stranger" || scenario === "owner")
      ? [{ tenant_id: DEMO_TENANT_ID, membership_id: DEMO_MEMBERSHIP_ID, identity_user_id: DEMO_IDENTITY_USER_ID }]
      : sql.includes("practice_session_digest=$3") && scenario === "owner" ? [{ id: job }] : [],
  }));
  const connect = vi.fn(async () => ({ query, release: vi.fn() }));
  return { pool: { query, connect } as unknown as Pool, query, connect };
}
describe("CH-3a per-session ownership", () => {
  it("list delegates only the authenticated session digest, so another valid session has its own empty projection", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const { pool } = accessPool("stranger");
    const list = vi.spyOn(JobPartiesRepository.prototype, "list").mockResolvedValue({ version: "job-parties-list.v1", environment: "synthetic_demo", jobs: [] });
    const app = new JobPartiesApplication(pool);
    expect(await app.list({ sessionId: token })).toEqual({ version: "job-parties-list.v1", environment: "synthetic_demo", jobs: [] });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: DEMO_TENANT_ID }), DEMO_MEMBERSHIP_ID, createHash("sha256").update(token).digest("hex"));
  });
  for (const transport of ["application", "Nest"] as const) {
    for (const action of actions) {
      it.each(["missing", "invalid", "invented", "stranger"] as const)(`${transport} ${action}: %s session refuses before party reads, validation, replay or writes`, async scenario => {
        vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
        const { pool, query, connect } = accessPool(scenario);
        const sessionId = scenario === "missing" ? undefined : scenario === "invalid" ? "invalid" : token;
        const run = () => {
          if (transport === "application") {
            const app = new JobPartiesApplication(pool);
            const principal = sessionId ? { sessionId } : null;
            return action === "view" ? app.view(principal, job) : app[action](principal, job, {});
          }
          const controller = new JobPartiesController(pool);
          const request = { headers: sessionId ? { cookie: `other=value; jg_session=${sessionId}` } : {} };
          return action === "view" ? controller.view(request, job) : controller[action](request, job, {});
        };
        const code = scenario === "stranger" ? "NOT_FOUND" : "UNAUTHENTICATED";
        const error = await Promise.resolve().then(run).catch((failure: unknown) => failure);
        expect(error).toBeInstanceOf(PracticeAccessError);
        expect(error).toMatchObject({ code });
        if (scenario !== "stranger") expect(connect).not.toHaveBeenCalled();
        for (const [sql] of query.mock.calls) expect(sql).toMatch(/authenticate_practice_session|^(BEGIN|COMMIT|ROLLBACK)$|set_config|practice_session_digest/);
        // Exercise the same global filter installed by AppModule, without binding a socket.
        const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        new PracticeErrorsFilter().catch(error as PracticeAccessError, { switchToHttp: () => ({ getResponse: () => response }) } as ArgumentsHost);
        expect(response.status).toHaveBeenCalledWith(scenario === "stranger" ? 404 : 401);
        expect(response.json).toHaveBeenCalledWith({ code });
      });
    }
    it.each(["missing", "invalid", "invented"] as const)(`${transport} list: %s session gets 401 before labels are read`, async scenario => {
      vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
      const { pool, connect } = accessPool(scenario);
      const sessionId = scenario === "missing" ? undefined : scenario === "invalid" ? "invalid" : token;
      const run = () => transport === "application"
        ? new JobPartiesApplication(pool).list(sessionId ? { sessionId } : null)
        : new JobPartiesListController(pool).list({ headers: sessionId ? { cookie: `jg_session=${sessionId}` } : {} });
      await expect(Promise.resolve().then(run)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(connect).not.toHaveBeenCalled();
    });
  }
});
