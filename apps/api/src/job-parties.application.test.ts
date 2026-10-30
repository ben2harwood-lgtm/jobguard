import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { JobPartiesApplication } from "./job-parties.application.js";
import { JobPartiesController, JobPartiesListController } from "./job-parties.controller.js";
import { JobPartiesRepository, PracticeAccessError, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, AdoptInFlightJobMutation } from "@jobguard/db";
import { jobPartiesImportResultV1, IMPORT_LINEAGE_LABEL } from "@jobguard/core";
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
    expectAccessQueries(query.mock.calls);
  });
  it("rejects unauthenticated, non-member and production callers before business persistence", async () => {
    const { pool, query } = accessPool("owner"), app = new JobPartiesApplication(pool);
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    await expect(app.view(null, job)).rejects.toThrow("UNAUTHENTICATED");
    expect(query).not.toHaveBeenCalled();
    await expect(app.view({ sessionId: token, requestedTenantId: "33333333-3333-4333-8333-333333333333" }, job)).rejects.toThrow("FORBIDDEN");
    await expect(app.command({ sessionId: token }, "wrong", {})).rejects.toThrow("NOT_FOUND");
    expectAccessQueries(query.mock.calls);
    query.mockClear();
    vi.stubEnv("JOBGUARD_ENV", "production_billing");
    await expect(app.command({ sessionId: token }, job, { environment: "synthetic_demo" })).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(query).not.toHaveBeenCalled();
  });
});

function expectAccessQueries(calls: Array<[string, (unknown[] | undefined)?]>) {
  for (const [sql] of calls) {
    expect(sql).toMatch(/authenticate_practice_session|^(BEGIN|COMMIT|ROLLBACK)$|set_config|practice_session_digest/);
  }
}

const token = "18000000-0000-4000-8000-000000000001";
const actions = ["view", "command", "adopt"] as const;
function accessPool(scenario: "missing" | "invalid" | "invented" | "stranger" | "owner") {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => ({ rows:
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
        expectAccessQueries(query.mock.calls);
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

describe("LP-5a parties-import result contract", () => {
  it("returns the full public result on first import and exact replay without another mutation", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const binding = "21000000-0000-4000-8000-000000000001", baselineId = "22000000-0000-4000-8000-000000000001";
    const revision = "23000000-0000-4000-8000-000000000001", commandId = "24000000-0000-4000-8000-000000000001";
    const source = { bindingId: binding, customerRevisionId: revision, siteRevisionId: revision, payingPartyRevisionId: revision };
    vi.spyOn(JobPartiesRepository.prototype, "view").mockResolvedValue({ current: source } as Awaited<ReturnType<JobPartiesRepository["view"]>>);
    let business: Awaited<ReturnType<AdoptInFlightJobMutation["mutate"]>> | undefined, stored: Record<string, unknown> | undefined;
    const mutate = vi.spyOn(AdoptInFlightJobMutation.prototype, "mutate").mockImplementation(async (_db, command) => {
      business = { jobId: command.subjectRef, baselineId, provenance: "imported", lifecyclePoint: "live", acceptedNetValuePence: 100000,
        recoveryCapPence: 1500, lineageStrength: "builder_attested_weaker", lineageLabel: IMPORT_LINEAGE_LABEL, billing: "none", historicFeesCreated: 0 };
      return business;
    });
    vi.spyOn(AdoptInFlightJobMutation.prototype, "auditEvents").mockReturnValue([]);
    // Database boundary double; CI exercises the actual SQL projection and proof.
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.includes("set_config")) return { rows: [] };
      if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: DEMO_TENANT_ID, membership_id: DEMO_MEMBERSHIP_ID, identity_user_id: DEMO_IDENTITY_USER_ID }] };
      if (sql.includes("practice_session_digest=$3")) return { rows: [{ id: job }] };
      if (sql.includes("SELECT status,result FROM app.command_receipt")) return { rows: stored ? [{ status: "succeeded", result: stored }] : [] };
      if (sql.includes("SELECT 1 FROM app.membership")) return { rows: [{ owner: true }] };
      if (sql.includes("app.begin_command(")) return { rows: [{ result: { kind: "claim", decisionId: commandId, resolutionId: commandId, authorizationId: commandId } }] };
      if (sql.includes("app.require_current_job_parties(")) return { rows: [{ snapshot: source }] };
      if (sql.includes("app.complete_command(")) {
        const refs = JSON.parse(values[1] as string);
        if (refs.sourceJobId !== job || refs.sourceBindingId !== binding) throw new Error("verified import source references required");
        stored = jobPartiesImportResultV1.parse({ ...business, version: "job-parties-import-result.v1", environment: "synthetic_demo",
          sourceJobId: refs.sourceJobId, sourceBindingId: refs.sourceBindingId, realExternalActions: 0 });
        return { rows: [{ result: stored }] };
      }
      throw new Error(`Unexpected import query: ${sql}`);
    });
    const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const app = new JobPartiesApplication(pool), request = { version: "job-parties-import.v1", commandId, expectedBindingId: binding };
    const first = await app.adopt({ sessionId: token }, job, request);
    expect(jobPartiesImportResultV1.parse(first)).toEqual(stored);
    expect(first).toMatchObject({ version: "job-parties-import-result.v1", environment: "synthetic_demo", sourceJobId: job, sourceBindingId: binding, realExternalActions: 0 });
    expect(await app.adopt({ sessionId: token }, job, request)).toEqual(first);
    expect(await app.adopt({ sessionId: token }, job, request)).toEqual(first);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes("app.begin_command("))).toHaveLength(1);
  });
});
