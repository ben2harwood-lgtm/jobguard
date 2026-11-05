import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { expect, it, vi } from "vitest";
import { isTrustedBrowserOrigin } from "../api/contractor/origin.js";
async function fixture(env: Record<string, string | undefined> = { JOBGUARD_ALLOWED_ORIGINS: "https://practice.invalid" }) {
  const execute = vi.fn().mockResolvedValue({ realExternalActions: 0 });
  const app = vi.fn(function () { return { execute }; });
  const adapters: Record<string, unknown> = {
    "../api/contractor/origin": { isTrustedBrowserOrigin: (request: Request) => isTrustedBrowserOrigin(request, env) },
    "server-only": {}, "next/headers": { cookies: async () => ({ get: () => ({ value: "verified-practice-cookie" }) }) },
    "next/server": { NextResponse: { json: Response.json } }, "@jobguard/api/merchant-order": { MerchantOrderApplication: app },
    "./synthetic-server": { syntheticPool: () => "pool", practiceFailure: () => null },
    "./route-error-code": { routeErrorCode: (error: { code?: string }, fallback: string) => error.code ?? fallback },
  };
  const source = await readFile(new URL("./merchant-order-server.ts", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(js, { exports, require: (name: string) => { if (!(name in adapters)) throw new Error(name); return adapters[name]; }, URL });
  return { reply: exports.merchantOrderReply, execute, app };
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
  const f = await fixture(); f.execute.mockRejectedValue({ code: "ORDER_AUTHORITY_STALE" });
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
