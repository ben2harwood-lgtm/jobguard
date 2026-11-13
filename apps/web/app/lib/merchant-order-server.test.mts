import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { isRouteValidationError, routeErrorCode } from "./route-error-code.js";
import { isTrustedBrowserOrigin } from "../api/contractor/origin.js";
async function fixture(env: Record<string, string | undefined> = { JOBGUARD_ALLOWED_ORIGINS: "https://practice.invalid" }) {
  const execute = vi.fn().mockResolvedValue({ realExternalActions: 0 });
  const app = vi.fn(function () { return { execute }; });
  const adapters: Record<string, unknown> = {
    "../api/contractor/origin": { isTrustedBrowserOrigin: (request: Request) => isTrustedBrowserOrigin(request, env) },
    "server-only": {}, "next/headers": { cookies: async () => ({ get: () => ({ value: "verified-practice-cookie" }) }) },
    "next/server": { NextResponse: { json: Response.json } }, "@jobguard/api/merchant-order": { MerchantOrderApplication: app },
    "./synthetic-server": { syntheticPool: () => "pool", practiceFailure: () => null },
    "./route-error-code": { isRouteValidationError, routeErrorCode },
  };
  const source = await readFile(new URL("./merchant-order-server.ts", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const log = vi.fn();
  const exports: Record<string, any> = {};
  runInNewContext(js, { exports, require: (name: string) => { if (!(name in adapters)) throw new Error(name); return adapters[name]; }, URL, console: { error: log }, Error });
  return { reply: exports.merchantOrderReply, execute, app, log };
}
it("refuses a foreign or absent origin before any application work", async () => {
  const f = await fixture();
  for (const origin of [undefined, "https://foreign.invalid"]) {
    const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", ...(origin ? { headers: { origin } } : {}), body: "{}" }), "job");
    expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(f.app).not.toHaveBeenCalled();
});
it("passes only the server cookie and route job and keeps replies uncached", async () => {
  const f = await fixture();
  const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: '{"kind":"preview"}' }), "route-job");
  expect(f.app).toHaveBeenCalledWith("pool", "verified-practice-cookie");
  expect(f.execute).toHaveBeenCalledWith("route-job", { kind: "preview" });
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
});
it("wrong-job order links are unavailable without returning order details", async () => {
  const f = await fixture(); f.execute.mockRejectedValue(new Error("ORDER_AUTHORITY_STALE"));
  const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
  expect(response.status).toBe(404); expect(await response.json()).toEqual({ code: "NOT_FOUND" });
});
it("accepts the browser loopback origin when next start uses localhost internally", async () => {
  const f = await fixture({});
  const response = await f.reply(new Request("http://localhost:3000/api", {
    method: "POST", headers: { origin: "http://127.0.0.1:3000" }, body: '{"kind":"preview"}',
  }), "route-job");
  expect(response.status).toBe(200);
  expect(f.execute).toHaveBeenCalledWith("route-job", { kind: "preview" });
});
it("rejects unconfigured origins and forwarded-host spoofing before application work", async () => {
  const f = await fixture({});
  for (const origin of ["https://practice.invalid", "http://127.0.0.1:3001", "https://foreign.invalid"]) {
    const response = await f.reply(new Request("https://practice.invalid:3000/api", {
      method: "POST", headers: { origin, "x-forwarded-host": new URL(origin).host, "x-forwarded-proto": new URL(origin).protocol.slice(0, -1) }, body: "{}",
    }), "job");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "ORIGIN_FORBIDDEN" });
  }
  expect(f.app).not.toHaveBeenCalled();
});

it.each(["ORDER_ACTION_INVALID", "ORDER_ALREADY_COMMITTED", "ORDER_AUTHORITY_STALE", "NOT_FOUND", "INVALID_ORDER_INPUT"])("retains the known refusal %s", async code => {
  const f = await fixture(); f.execute.mockRejectedValue(new Error(code));
  const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
  expect(response.status).toBe(code === "ORDER_ALREADY_COMMITTED" ? 409 : ["NOT_FOUND", "ORDER_AUTHORITY_STALE"].includes(code) ? 404 : 400);
  expect(await response.json()).toEqual({ code: code === "ORDER_AUTHORITY_STALE" ? "NOT_FOUND" : code });
  expect(f.log).not.toHaveBeenCalled();
});
it.each(["database password detail", "ORDER_UNKNOWN_DRIVER_DETAIL"])("hides unexpected error text: %s", async detail => {
  const f = await fixture(), error = new Error(detail); f.execute.mockRejectedValue(error);
  const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "UNAVAILABLE" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(f.log).toHaveBeenCalledWith("Merchant order unavailable", error);
});
it.each([undefined, "production", "pilot_no_charge", "synthetic_demo"])("gates the job's merchant panel in %s", async mode => {
  const source = await readFile(new URL("../jobs/[id]/page.tsx", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, any> = {};
  const merchant = () => null;
  runInNewContext(js, { exports, process: { env: { JOBGUARD_ENV: mode } }, require: (name: string) => {
    if (name === "react/jsx-runtime") return { Fragment: "fragment", jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
    if (name === "../../ui/merchant-order") return { MerchantOrder: merchant };
    return {};
  } });
  const result = await exports.default({ params: Promise.resolve({ id: "practice" }), searchParams: Promise.resolve({}) });
  expect(result.props.children.some((child: any) => child?.type === merchant)).toBe(mode === "synthetic_demo");
});

it("keeps schema validation errors generic and rejects unclassified thrown values", async () => {
  const f = await fixture();
  for (const [error, status, code] of [[z.object({ revision: z.number() }).safeParse({}).error, 400, "INVALID_ORDER_INPUT"], [{ detail: "private driver detail" }, 503, "UNAVAILABLE"]] as const) {
    f.execute.mockRejectedValue(error);
    const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
  }
});

// These refusals originate in MerchantOrderApplication, requireLiveJob, command identity and dispatcher checks.
it.each([
  ["SYNTHETIC_MODE_REQUIRED", 403], ["JOB_NOT_LIVE", 409], ["JOB_NOT_FOUND", 404],
  ["IDEMPOTENCY_CONFLICT", 409], ["FORBIDDEN", 403], ["COMMAND_CONFLICT", 409], ["AUTHORIZATION_INVALID", 400],
] as const)("returns the definite merchant refusal %s as %s", async (code, status) => {
  const f = await fixture();
  // The application mode guard deliberately has a human message rather than its code.
  for (const error of [new Error(code), Object.assign(new Error("Practice only"), { code })]) {
    f.execute.mockRejectedValue(error);
    const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(f.log).not.toHaveBeenCalled();
  }
});
it("hides an unexpected typed driver code and logs its private detail", async () => {
  const f = await fixture(), error = Object.assign(new Error("private connection detail"), { code: "08006" });
  f.execute.mockRejectedValue(error);
  const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "UNAVAILABLE" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(f.log).toHaveBeenCalledWith("Merchant order unavailable", error);
});

it("uses the known trigger message when PostgreSQL supplies an unclassified SQLSTATE", async () => {
  const f = await fixture(), error = Object.assign(new Error("ORDER_ALREADY_COMMITTED"), { code: "P0001" });
  f.execute.mockRejectedValue(error);
  const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: "ORDER_ALREADY_COMMITTED" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(f.log).not.toHaveBeenCalled();
});

it("keeps a known typed code ahead of a different known message", async () => {
  const f = await fixture();
  f.execute.mockRejectedValue(Object.assign(new Error("ORDER_ALREADY_COMMITTED"), { code: "FORBIDDEN" }));
  const response = await f.reply(new Request("https://practice.invalid/api", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{}" }), "job");
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: "FORBIDDEN" });
  expect(f.log).not.toHaveBeenCalled();
});
