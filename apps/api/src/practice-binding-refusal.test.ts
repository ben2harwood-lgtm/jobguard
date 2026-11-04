import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { get } from "node:http";
import { PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
import { PracticeErrorsFilter } from "./practice-errors.filter.js";
import { PracticeAccess } from "./practice-access.js";

let operation: () => Promise<unknown> = async () => undefined;
@Controller("binding-refusal")
class Probe {
 @Get() run() { return operation(); }
}
let app: INestApplication, url: string;
beforeAll(async () => {
 const module = await Test.createTestingModule({ controllers: [Probe] }).compile();
 app = module.createNestApplication(); app.useLogger(false);
 app.useGlobalFilters(new PracticeErrorsFilter());
 await app.listen(0, "127.0.0.1"); url = `${await app.getUrl()}/binding-refusal`;
});
afterAll(async () => { await app?.close(); });
afterEach(() => { vi.unstubAllEnvs(); operation = async () => undefined; });
function response(): Promise<{ status: number | undefined; body: unknown }> {
 return new Promise((resolve, reject) => {
  get(url, result => {
   let body = ""; result.setEncoding("utf8");
   result.on("data", chunk => { body += chunk; });
   result.on("end", () => {
    try { resolve({ status: result.statusCode, body: JSON.parse(body) }); }
    catch { reject(new Error(`HTTP ${result.statusCode}: ${body.slice(0, 500)}`)); }
   });
   result.on("error", reject);
  }).on("error", reject);
 });
}
it("returns the existing 401 after a practice credential is refused between authentication and ownership lookup", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const tenant = "11111111-1111-4111-8111-111111111111", member = "18000000-0000-4000-8000-000000000002";
 const token = "18000000-0000-4000-8000-000000000001", calls: string[] = [], release = vi.fn();
 const query = vi.fn(async (sql: string) => {
  calls.push(sql);
  if (sql === "SELECT app.bind_request($1, $2, $3)") throw Object.assign(new Error("private database marker"), { code: "42501", detail: token });
  return { rows: [] };
 });
 const pool = { query: async () => ({ rows: [{ tenant_id: tenant, membership_id: member, identity_user_id: "18000000-0000-4000-8000-000000000003" }] }), connect: async () => ({ query, release }) } as unknown as Pool;
 operation = () => new PracticeAccess(pool, token).job(member);
 const result = await response();
 expect(result).toEqual({ status: 401, body: { code: "UNAUTHENTICATED" } });
 expect(JSON.stringify(result)).not.toContain(token);
 expect(calls).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]);
 expect(release).toHaveBeenCalledOnce();
});
it.each(["real", "contractor_practice"] as const)("preserves a generic %s binding refusal as FORBIDDEN", async kind => {
 operation = async () => { throw new RequestBindingRefusedError(kind); };
 expect(await response()).toEqual({ status: 403, body: { code: "FORBIDDEN" } });
});
it.each(["UNAUTHENTICATED", "NOT_FOUND"] as const)("preserves the existing typed practice error %s", async code => {
 operation = async () => { throw new PracticeAccessError(code); };
 expect(await response()).toEqual({ status: code === "NOT_FOUND" ? 404 : 401, body: { code } });
});
it.each([
 Object.assign(new Error("private business SQL marker"), { code: "42501" }),
 Object.assign(new Error("private forged error marker"), { code: "FORBIDDEN", name: "RequestBindingRefusedError" }),
])("does not treat a business SQL error or a forged error name as a binding refusal", async error => {
 operation = async () => { throw error; };
 expect(await response()).toEqual({ status: 500, body: { statusCode: 500, message: "Internal server error" } });
});
