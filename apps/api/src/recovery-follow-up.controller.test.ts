import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import { PracticeAccessError, RecoveryFollowUpError, WatchdogError } from "@jobguard/db";
import { PracticeErrorsFilter } from "./practice-errors.filter.js";
import { WatchdogExceptionFilter } from "./watchdog.filter.js";
import { recoveryFollowUpFailure } from "./recovery-follow-up.application.js";
import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module.js";
import { Pool as PoolProvider } from "pg";
import type { ArgumentsHost } from "@nestjs/common";
import type { Pool } from "pg";

const application = vi.hoisted(() => ({ read: vi.fn(), schedule: vi.fn(), command: vi.fn() }));
vi.mock("./recovery-follow-up.application.js", async original => ({
  ...(await original<typeof import("./recovery-follow-up.application.js")>()),
  RecoveryFollowUpApplication: class { read = application.read; schedule = application.schedule; command = application.command; },
}));
const { RecoveryFollowUpController } = await import("./recovery-follow-up.controller.js");

const request = { headers: { cookie: "theme=dark; jg_session=29000000-0000-4000-8000-000000000001" } };
const session = "29000000-0000-4000-8000-000000000001", caseId = "29000000-0000-4000-8000-000000000002", followUpId = "29000000-0000-4000-8000-000000000003";
async function failureOf(run: () => Promise<unknown>) {
  try { await run(); } catch (error) { expect(error).toBeInstanceOf(HttpException); return { status: (error as HttpException).getStatus(), body: (error as HttpException).getResponse() }; }
  throw new Error("expected the call to fail");
}

describe("recovery follow-up controller", () => {
  beforeEach(() => vi.clearAllMocks());
  it("passes the practice session cookie, case and follow-up identity to the shared application", async () => {
    const controller = new RecoveryFollowUpController({} as Pool);
    application.read.mockResolvedValue({ ok: 1 }); application.schedule.mockResolvedValue({ ok: 2 }); application.command.mockResolvedValue({ ok: 3 });
    expect(await controller.get(request, caseId)).toEqual({ ok: 1 });
    expect(await controller.schedule(request, caseId, { a: 1 })).toEqual({ ok: 2 });
    expect(await controller.command(request, caseId, followUpId, { b: 2 })).toEqual({ ok: 3 });
    expect(application.read).toHaveBeenCalledWith(session, caseId);
    expect(application.schedule).toHaveBeenCalledWith(session, caseId, { a: 1 });
    expect(application.command).toHaveBeenCalledWith(session, caseId, followUpId, { b: 2 });
  });
  it("answers a typed conflict with its code and status, and never echoes unexpected error text", async () => {
    const controller = new RecoveryFollowUpController({} as Pool);
    application.command.mockRejectedValue(new RecoveryFollowUpError("RECOVERY_FOLLOW_UP_STOPPED"));
    expect(await failureOf(() => controller.command(request, caseId, followUpId, {}))).toEqual({ status: 409, body: { code: "RECOVERY_FOLLOW_UP_STOPPED" } });
    application.read.mockRejectedValue(new Error('relation "app.recovery_follow_up" does not exist at character 15'));
    const failure = await failureOf(() => controller.get(request, caseId));
    expect(failure).toEqual({ status: 500, body: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(failure)).not.toContain("relation");
  });
  it("keeps practice denials and watchdog refusals with their global filters, unchanged", async () => {
    const controller = new RecoveryFollowUpController({} as Pool);
    for (const [code, status] of [["NOT_FOUND", 404], ["UNAUTHENTICATED", 401]] as const) {
      const error = new PracticeAccessError(code);
      for (const method of Object.values(application)) method.mockRejectedValue(error);
      await expect(controller.get(request, caseId)).rejects.toBe(error);
      await expect(controller.schedule(request, caseId, {})).rejects.toBe(error);
      await expect(controller.command(request, caseId, followUpId, {})).rejects.toBe(error);
      const json = vi.fn(); const sendStatus = vi.fn(() => ({ json }));
      new PracticeErrorsFilter().catch(error, { switchToHttp: () => ({ getResponse: () => ({ status: sendStatus }) }) } as unknown as ArgumentsHost);
      expect(sendStatus).toHaveBeenCalledWith(status); expect(json).toHaveBeenCalledWith({ code });
    }
    const watchdog = new WatchdogError("JOB_NOT_LIVE");
    application.command.mockRejectedValue(watchdog);
    await expect(controller.command(request, caseId, followUpId, {})).rejects.toBe(watchdog);
    const json = vi.fn(); const sendStatus = vi.fn(() => ({ json }));
    new WatchdogExceptionFilter().catch(watchdog, { switchToHttp: () => ({ getResponse: () => ({ status: sendStatus }) }) } as unknown as ArgumentsHost);
    expect(sendStatus).toHaveBeenCalledWith(409); expect(json).toHaveBeenCalledWith({ code: "JOB_NOT_LIVE" });
  });
  it("is registered in the real application module beside the message controller", async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PoolProvider).useValue({}).compile();
    const app = module.createNestApplication();
    try { await app.init(); expect(app.get(RecoveryFollowUpController)).toBeInstanceOf(RecoveryFollowUpController); } finally { await app.close(); }
  });
});

it.each(["read", "schedule", "command"] as const)("Next %s maps practice failures and typed refusals through the real no-store adapter", async action => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const { transpileModule, ModuleKind } = await import("typescript");
  let token: string | undefined;
  const business = { read: vi.fn(), schedule: vi.fn(), command: vi.fn(), failure: recoveryFollowUpFailure };
  const adapters: Record<string, unknown> = {
    "server-only": {}, "next/headers": { cookies: async () => ({ get: () => token ? { value: token } : undefined }) },
    "next/server": { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } },
    "@jobguard/db": { PracticeAccessError }, "@jobguard/api/workspace": {}, "pg": {},
  };
  function load(path: string): Record<string, (...args: any[]) => Promise<Response>> {
    const exports = {};
    const js = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
    runInNewContext(js, { exports, require: (id: string) => {
      if (!(id in adapters)) throw new Error(`Unexpected import: ${id}`);
      return adapters[id];
    }, Response });
    return exports;
  }
  const relative = action === "command" ? "../../../../../../lib/" : "../../../../lib/";
  adapters[`${relative}synthetic-server`] = load("../../web/app/lib/synthetic-server.ts");
  adapters[`${relative}workspace-server`] = { workspaceApplication: async () => ({ recoveryFollowUps: business }) };
  const route = load(`../../web/app/api/recovery-cases/[id]/follow-ups/${action === "command" ? "[followUpId]/commands/" : ""}route.ts`);
  const verb = action === "read" ? "GET" : "POST";
  const call = () => route[verb]!(new Request("http://synthetic.invalid", { method: verb, ...(verb === "GET" ? {} : { body: JSON.stringify({ action }) }) }), { params: Promise.resolve({ id: caseId, followUpId }) });
  for (const scenario of ["missing", "invented", "stranger"] as const) {
    token = scenario === "missing" ? undefined : session;
    const code = scenario === "stranger" ? "NOT_FOUND" : "UNAUTHENTICATED";
    for (const method of [business.read, business.schedule, business.command]) method.mockReset().mockRejectedValue(new PracticeAccessError(code));
    const response = await call();
    expect(response.status).toBe(scenario === "stranger" ? 404 : 401);
    expect(await response.json()).toEqual({ code });
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  token = session;
  for (const method of [business.read, business.schedule, business.command]) method.mockReset().mockRejectedValue(new RecoveryFollowUpError("RECOVERY_FOLLOW_UP_NOT_DUE"));
  const refused = await call();
  expect(refused.status).toBe(409); expect(await refused.json()).toEqual({ code: "RECOVERY_FOLLOW_UP_NOT_DUE" });
  for (const method of [business.read, business.schedule, business.command]) method.mockReset().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
  const broken = await call();
  expect(broken.status).toBe(500); expect(await broken.json()).toEqual({ code: "INTERNAL_ERROR" });
});
