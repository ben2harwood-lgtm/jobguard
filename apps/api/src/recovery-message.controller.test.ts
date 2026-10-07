import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import { PracticeAccessError } from "@jobguard/db";
import { PracticeErrorsFilter } from "./practice-errors.filter.js";
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
