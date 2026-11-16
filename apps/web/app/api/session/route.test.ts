import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ issue: vi.fn(), jar: new Map<string, string>(), pool: {} }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => f.jar.has(key) ? { value: f.jar.get(key)! } : undefined }) }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(), issuePracticeSession: f.issue }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => f.pool, practiceFailure: () => null }));
import { POST } from "./route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f.jar.clear(); f.issue.mockResolvedValue(randomUUID()); });
afterEach(() => vi.unstubAllEnvs());
it.each([false, true])("explicit anonymous entry replaces the credential and clears any stale linked receipt (paired=%s)", async paired => {
  f.jar.set("jobguard_session", "fictional-owner");
  if (paired) f.jar.set("jg_practice_pair", "stale-receipt");
  const response = await POST(new Request("https://practice.invalid/api/session", { method: "POST" }));
  expect(response.status).toBe(200);
  expect(f.issue).toHaveBeenCalledWith(f.pool);
  expect(response.cookies.get("jg_session")?.value).toBe(await f.issue.mock.results[0]!.value);
  expect(response.cookies.get("jg_practice_pair")).toMatchObject({ value: "", maxAge: 0, httpOnly: true, secure: true, sameSite: "strict", path: "/" });
  expect(response.cookies.get("jobguard_session")).toBeUndefined();
});
it("failed issuance keeps the existing cookies for recovery", async () => {
  f.issue.mockRejectedValue(new Error("unavailable"));
  const response = await POST(new Request("https://practice.invalid/api/session", { method: "POST" }));
  expect(response.status).toBe(503);
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("non-synthetic entry cannot issue or clear credentials", async () => {
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  const response = await POST(new Request("https://practice.invalid/api/session", { method: "POST" }));
  expect(response.status).toBe(401); expect(f.issue).not.toHaveBeenCalled();
  expect(response.headers.get("set-cookie")).toBeNull();
});
