import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { expect, it, vi } from "vitest";
async function fixture() {
  const execute = vi.fn().mockResolvedValue({ realExternalActions: 0 });
  const app = vi.fn(function () { return { execute }; });
  const adapters: Record<string, unknown> = {
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
