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

it("uses the identity provider HMAC and independent opaque credentials without persisting raw tokens", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const { createHmac, createHash } = await import("node:crypto");
  const { enterLinkedPracticeCompany } = await import("./blank-practice-company.js");
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const pool = { query } as unknown as Pool;
  const secret = "fictional-identity-key-longer-than-32-characters";
  const parent = randomUUID(), command = { version: "linked-practice-company.v1", action: "enter" };
  const first = await enterLinkedPracticeCompany(pool, parent, secret, command);
  const retry = await enterLinkedPracticeCompany(pool, parent, secret, command);
  expect(first).not.toBe(retry);
  expect(query.mock.calls[0]).toEqual(["SELECT identity.enter_linked_practice($1,$2,$3,$4)", [
    createHmac("sha256", secret).update(`session:${parent}`).digest("hex"),
    createHash("sha256").update(first).digest("hex"), command, null,
  ]]);
  expect(JSON.stringify(query.mock.calls)).not.toContain(first);
  expect(JSON.stringify(query.mock.calls)).not.toContain(parent);
  await expect(enterLinkedPracticeCompany(pool, parent, secret, { ...command, action: "reset" }))
    .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(enterLinkedPracticeCompany(pool, parent, secret, { ...command, tenantId: randomUUID() }))
    .rejects.toThrow();
  expect(query).toHaveBeenCalledTimes(2);
});

it("keeps anonymous upgrade fallback narrow and refuses legacy start for a linked credential", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const { authenticatePracticeSession } = await import("./practice-session.js");
  const query = vi.fn().mockRejectedValueOnce(Object.assign(new Error("function app.practice_owner_digest(unknown) does not exist"), { code: "42883" }))
    .mockResolvedValue({ rows: [principal] });
  await expect(authenticatePracticeSession({ query } as unknown as Pool, token)).resolves.toBeDefined();
  expect(query).toHaveBeenCalledTimes(2);
  query.mockReset().mockRejectedValue(Object.assign(new Error("function app.internal_typo() does not exist"), { code: "42883" }));
  await expect(authenticatePracticeSession({ query } as unknown as Pool, token)).rejects.toThrow("internal_typo");
  expect(query).toHaveBeenCalledTimes(1);
  query.mockReset().mockResolvedValue({ rows: [{ ...principal, owner_digest: "c".repeat(64) }] });
  await expect(startBlankPracticeCompany({ query } as unknown as Pool, { version: "blank-practice-company.v1", action: "start" }, token))
    .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(query).toHaveBeenCalledTimes(1);
});
