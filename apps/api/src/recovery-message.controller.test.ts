import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import { PracticeAccessError, WatchdogError } from "@jobguard/db";
import { PracticeErrorsFilter } from "./practice-errors.filter.js";
import { WatchdogExceptionFilter } from "./watchdog.filter.js";
import { recoveryMessageFailure } from "./recovery-message.errors.js";
import { Test } from "@nestjs/testing";
import { RouterExceptionFilters } from "@nestjs/core/router/router-exception-filters.js";
import type { ApplicationConfig } from "@nestjs/core/application-config.js";
import type { NestContainer } from "@nestjs/core/injector/container.js";
import { AppModule } from "./app.module.js";
import { Pool as PoolProvider } from "pg";
import type { ArgumentsHost } from "@nestjs/common";
import type { Pool } from "pg";

const application = vi.hoisted(() => ({ read: vi.fn(), preview: vi.fn(), command: vi.fn() }));
vi.mock("./recovery-message.application.js", async original => ({
  ...(await original<typeof import("./recovery-message.application.js")>()),
  RecoveryMessageApplication: class { read = application.read; preview = application.preview; command = application.command; },
}));
const { RecoveryMessageController } = await import("./recovery-message.controller.js");

const request = { headers: { cookie: "theme=dark; jg_session=19000000-0000-4000-8000-000000000001" } };
const caseId = "19000000-0000-4000-8000-000000000002", messageId = "19000000-0000-4000-8000-000000000003";
async function failureOf(run: () => Promise<unknown>) {
  try { await run(); } catch (error) { expect(error).toBeInstanceOf(HttpException); return { status: (error as HttpException).getStatus(), body: (error as HttpException).getResponse() }; }
  throw new Error("expected the call to fail");
}

describe("recovery message controller", () => {
  beforeEach(() => vi.clearAllMocks());
  it("passes the practice session cookie, case and message identity to the shared application", async () => {
    const controller = new RecoveryMessageController({} as Pool);
    application.read.mockResolvedValue({ ok: 1 }); application.preview.mockResolvedValue({ ok: 2 }); application.command.mockResolvedValue({ ok: 3 });
    expect(await controller.get(request, caseId)).toEqual({ ok: 1 });
    expect(await controller.preview(request, caseId, { a: 1 })).toEqual({ ok: 2 });
    expect(await controller.command(request, caseId, messageId, { b: 2 })).toEqual({ ok: 3 });
    expect(application.read).toHaveBeenCalledWith("19000000-0000-4000-8000-000000000001", caseId);
    expect(application.preview).toHaveBeenCalledWith("19000000-0000-4000-8000-000000000001", caseId, { a: 1 });
    expect(application.command).toHaveBeenCalledWith("19000000-0000-4000-8000-000000000001", caseId, messageId, { b: 2 });
  });
  it("answers a typed conflict with its code and status, and never echoes unexpected error text", async () => {
    const controller = new RecoveryMessageController({} as Pool);
    application.command.mockRejectedValue(Object.assign(new Error("RECOVERY_MESSAGE_CHANGED"), { code: "RECOVERY_MESSAGE_CHANGED" }));
    expect(await failureOf(() => controller.command(request, caseId, messageId, {}))).toEqual({ status: 409, body: { code: "RECOVERY_MESSAGE_CHANGED" } });
    const leak = 'relation "app.recovery_message" does not exist at character 15';
    application.read.mockRejectedValue(new Error(leak));
    const failure = await failureOf(() => controller.get(request, caseId));
    expect(failure).toEqual({ status: 500, body: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(failure)).not.toContain("relation");
  });
});

describe("recovery-message transport practice failures", () => {
  it.each(["read/list", "draft", "approve", "advance", "reconcile", "revoke"])("%s preserves the shared 401/404 filter", async action => {
    const controller = new RecoveryMessageController({} as Pool);
    const call = () => action === "read/list" ? controller.get(request, caseId) : action === "draft" ? controller.preview(request, caseId, {}) : controller.command(request, caseId, messageId, { action });
    for (const [code, status] of [["NOT_FOUND", 404], ["UNAUTHENTICATED", 401]] as const) {
      const error = new PracticeAccessError(code);
      for (const method of Object.values(application)) method.mockRejectedValue(error);
      await expect(call()).rejects.toBe(error);
      const json = vi.fn(); const sendStatus = vi.fn(() => ({ json }));
      new PracticeErrorsFilter().catch(error, { switchToHttp: () => ({ getResponse: () => ({ status: sendStatus }) }) } as unknown as ArgumentsHost);
      expect(sendStatus).toHaveBeenCalledWith(status); expect(json).toHaveBeenCalledWith({ code });
    }
  });
});

it.each(["read/list", "draft", "approve", "advance", "reconcile", "revoke"])("Next %s maps practice failures through the real no-store adapter", async action => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const { transpileModule, ModuleKind } = await import("typescript");
  let token: string | undefined;
  const business = { read: vi.fn(), preview: vi.fn(), command: vi.fn(), failure: vi.fn() };
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
  const relative = action === "read/list" || action === "draft" ? "../../../../lib/" : "../../../../../../lib/";
  adapters[`${relative}synthetic-server`] = load("../../web/app/lib/synthetic-server.ts");
  adapters[`${relative}workspace-server`] = { workspaceApplication: async () => ({ recoveryMessages: business }) };
  const route = load(`../../web/app/api/recovery-cases/[id]/messages/${action === "read/list" || action === "draft" ? "" : "[messageId]/commands/"}route.ts`);
  for (const scenario of ["missing", "invented", "stranger"] as const) {
    token = scenario === "missing" ? undefined : "19000000-0000-4000-8000-000000000001";
    const code = scenario === "stranger" ? "NOT_FOUND" : "UNAUTHENTICATED";
    for (const method of [business.read, business.preview, business.command]) method.mockReset().mockRejectedValue(new PracticeAccessError(code));
    const response = await route[action === "read/list" ? "GET" : "POST"]!(new Request("http://synthetic.invalid", { method: action === "read/list" ? "GET" : "POST", ...(action === "read/list" ? {} : { body: JSON.stringify({ action }) }) }), { params: Promise.resolve({ id: caseId, messageId }) });
    expect(response.status).toBe(scenario === "stranger" ? 404 : 401);
    expect(await response.json()).toEqual({ code });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(business.failure).not.toHaveBeenCalled();
  }
});

describe("recovery-message routes beside the global practice and watchdog filters", () => {
  const actions = ["read/list", "draft", "approve", "advance", "reconcile", "revoke"] as const;
  const call = (controller: InstanceType<typeof RecoveryMessageController>, action: (typeof actions)[number]) =>
    action === "read/list" ? controller.get(request, caseId) : action === "draft" ? controller.preview(request, caseId, {}) : controller.command(request, caseId, messageId, { action });
  // The real AppModule, then Nest's own route-level exception dispatch for the recovery-message controller.
  async function withModuleDispatch(run: (dispatch: (error: unknown) => { status: number; body: unknown }, controller: InstanceType<typeof RecoveryMessageController>) => Promise<void>) {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PoolProvider).useValue({}).compile();
    const app = module.createNestApplication();
    try {
      await app.init();
      const internals = app as unknown as { config: ApplicationConfig; container: NestContainer };
      expect(internals.config.getGlobalFilters().map(filter => filter.constructor)).toEqual(expect.arrayContaining([PracticeErrorsFilter, WatchdogExceptionFilter]));
      const controller = app.get(RecoveryMessageController);
      expect(controller).toBeInstanceOf(RecoveryMessageController);
      const handler = new RouterExceptionFilters(internals.container, internals.config, app.getHttpAdapter()).create(controller, controller.command as never, undefined);
      await run(error => {
        if (!(error instanceof Error)) throw new Error("Expected a typed application error");
        const response = { status: 0, body: undefined as unknown };
        const reply = { headersSent: false, getHeader: () => undefined, status(code: number) { response.status = code; return reply; }, json(body: unknown) { response.body = body; return reply; } };
        handler.next(error, { getArgByIndex: () => reply, switchToHttp: () => ({ getResponse: () => reply }) } as never);
        return response;
      }, controller);
    } finally { await app.close(); }
  }
  it.each(actions)("%s hands a watchdog refusal to WatchdogExceptionFilter unchanged, and nothing else does", async action => {
    await withModuleDispatch(async (dispatch, controller) => {
      for (const [code, status] of [["JOB_NOT_LIVE", 409], ["IDEMPOTENCY_CONFLICT", 409], ["JOB_NOT_FOUND", 404]] as const) {
        const error = new WatchdogError(code);
        for (const method of Object.values(application)) method.mockReset().mockRejectedValue(error);
        await expect(call(controller, action)).rejects.toBe(error);
        expect(dispatch(error)).toEqual({ status, body: { code } });
        // The Next adapters have no filter; the shared mapping gives them the same status and code.
        expect(recoveryMessageFailure(error)).toEqual({ status, code });
      }
    });
  });
  it.each(actions)("%s keeps practice denials with PracticeErrorsFilter and its own typed conflicts with the controller", async action => {
    await withModuleDispatch(async (dispatch, controller) => {
      for (const [code, status] of [["NOT_FOUND", 404], ["UNAUTHENTICATED", 401]] as const) {
        const error = new PracticeAccessError(code);
        for (const method of Object.values(application)) method.mockReset().mockRejectedValue(error);
        await expect(call(controller, action)).rejects.toBe(error);
        expect(dispatch(error)).toEqual({ status, body: { code } });
      }
      for (const method of Object.values(application)) method.mockReset().mockRejectedValue(new Error("RECOVERY_MESSAGE_CHANGED"));
      const conflict = await failureOf(() => call(controller, action));
      expect(conflict).toEqual({ status: 409, body: { code: "RECOVERY_MESSAGE_CHANGED" } });
      // Neither global filter claims a recovery-message conflict: it is answered once, by the controller's own HttpException.
      const thrown = await call(controller, action).catch(error => error);
      expect(thrown).toBeInstanceOf(HttpException);
      expect(dispatch(thrown)).toEqual({ status: 409, body: { code: "RECOVERY_MESSAGE_CHANGED" } });
      // A look-alike message on an ordinary error is not a watchdog refusal and stays a fixed 500.
      for (const method of Object.values(application)) method.mockReset().mockRejectedValue(new Error("JOB_NOT_LIVE"));
      expect(await failureOf(() => call(controller, action))).toEqual({ status: 500, body: { code: "INTERNAL_ERROR" } });
    });
  });
});
