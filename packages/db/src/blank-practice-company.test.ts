import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { blankPracticeCompanyCommandV1, startBlankPracticeCompany } from "./blank-practice-company.js";
const token = randomUUID();
const principal = { tenant_id: "11111111-1111-4111-8111-111111111111", membership_id: "d1500000-0000-4000-8000-000000000003", identity_user_id: "d1500000-0000-4000-8000-000000000001" };
function database(live = true, blank = true) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("authenticate_practice_session") ? (live ? [principal] : []) : sql.includes("is_blank_practice_company") ? [{ blank }] : [] }));
  return { pool: { query } as unknown as Pool, query };
}
afterEach(() => vi.unstubAllEnvs());
it("starts a fresh namespace, reuses a live blank company and passes raw tokens to the SQL boundary", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const { pool, query } = database();
  const start = { version: "blank-practice-company.v1", action: "start" };
  const fresh = await startBlankPracticeCompany(pool, start);
  expect(fresh).not.toBe(token);
  expect(query).toHaveBeenLastCalledWith("SELECT app.start_blank_practice_company_v2($1,$2)", [fresh, null]);
  query.mockClear();
  expect(await startBlankPracticeCompany(pool, start, token)).toBe(token);
  expect(query).toHaveBeenCalledTimes(2);
  const next = await startBlankPracticeCompany(pool, { ...start, action: "reset" }, token);
  expect(next).not.toBe(token);
  expect(query).toHaveBeenLastCalledWith("SELECT app.start_blank_practice_company_v2($1,$2)", [next, token]);
});
it("fails closed for missing or revoked reset sessions, production mode and unknown input", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const { pool, query } = database(false);
  const reset = { version: "blank-practice-company.v1", action: "reset" };
  await expect(startBlankPracticeCompany(pool, reset)).rejects.toThrow("UNAUTHENTICATED");
  await expect(startBlankPracticeCompany(pool, reset, token)).rejects.toThrow("UNAUTHENTICATED");
  expect(query).toHaveBeenCalledTimes(1);
  expect(blankPracticeCompanyCommandV1.safeParse({ ...reset, tenantId: randomUUID() }).success).toBe(false);
  vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(startBlankPracticeCompany(pool, reset, token)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
  expect(query).toHaveBeenCalledTimes(1);
});
it("does not swallow database failures or treat them as permission to create a replacement", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const query = vi.fn().mockRejectedValue(new Error("offline"));
  await expect(startBlankPracticeCompany({ query } as unknown as Pool, { version: "blank-practice-company.v1", action: "start" }, token)).rejects.toThrow("offline");
  expect(query).toHaveBeenCalledTimes(1);
});

it("maps a reset revoked between authentication and SQL execution to UNAUTHENTICATED", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const { pool, query } = database();
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("start_blank_practice_company_v2")) throw new Error("UNAUTHENTICATED");
    return { rows: [principal] };
  });
  await expect(startBlankPracticeCompany(pool, { version: "blank-practice-company.v1", action: "reset" }, token))
    .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(query).toHaveBeenCalledTimes(2);
});
