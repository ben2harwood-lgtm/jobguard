import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PracticeWorkerSwitchError, practiceWorkerSwitchHttpStatus } from "@jobguard/core";
const stub = vi.hoisted(() => ({ application: { start: vi.fn(), end: vi.fn(), read: vi.fn() }, pool: vi.fn(() => ({})), session: globalThis.crypto.randomUUID() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: stub.session }) }) }));
vi.mock("@jobguard/api/workspace", () => ({
 createPracticeWorkerSwitchApplication: () => stub.application,
 assertPracticeWorkerSwitchMode: () => { if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeWorkerSwitchError("MODE_FORBIDDEN"); },
 practiceWorkerSwitchHttpFailure: (error: unknown) => { const code = error instanceof PracticeWorkerSwitchError ? error.code : "SWITCH_UNAVAILABLE"; return { status: practiceWorkerSwitchHttpStatus(code), body: { version: "practice-worker-switch-error.v1", code } }; },
}));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: stub.pool }));
import { GET } from "./route";
const workerId = randomUUID();
const call = (request: Request) => GET(request);
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.example.com"); vi.clearAllMocks(); for (const fn of Object.values(stub.application)) fn.mockResolvedValue({ state: "owner" }); });
afterEach(() => vi.unstubAllEnvs());
it.each(["pilot_no_charge", "production_billing", "", undefined, "SYNTHETIC_DEMO", " synthetic_demo"])("[PW19] mode %s refuses before pool creation", async mode => {
 if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
 const result = await call(new Request("https://app.example.com/api/contractor/practice/acting-as", { method: "GET", headers: { origin: "https://app.example.com" },  }));
 expect(result.status).toBe(403); expect(await result.json()).toEqual({ version: "practice-worker-switch-error.v1", code: "MODE_FORBIDDEN" }); expect(stub.pool).not.toHaveBeenCalled(); expect(result.headers.get("cache-control")).toBe("no-store");
});
it("[PW3] [PW21] [PW23] thin handler passes only principal, body and path, with no cookie write", async () => {
 const body = { version: "practice-worker-switch-off.v1", commandId: randomUUID() };
 const result = await call(new Request("https://app.example.com/api/contractor/practice/acting-as?tenantId=ignored", { method: "GET", headers: { origin: "https://app.example.com", "x-tenant-id": randomUUID() },  }));
 expect(result.status).toBe(200); expect(result.headers.get("set-cookie")).toBeNull(); expect(result.headers.get("cache-control")).toBe("no-store");
 expect(stub.application.read).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: stub.session });
});
it("[PW9] [PW24] typed ended-session and private failures preserve closed output", async () => {
 stub.application.read.mockRejectedValueOnce(new PracticeWorkerSwitchError("UNAUTHENTICATED"));
 const request = () => new Request("https://app.example.com/api/contractor/practice/acting-as", { method: "GET", headers: { origin: "https://app.example.com" },  });
 const ended = await call(request()); expect(ended.status).toBe(401); expect(await ended.json()).toEqual({ version: "practice-worker-switch-error.v1", code: "UNAUTHENTICATED" });
 stub.application.read.mockRejectedValueOnce(new Error("private PostgreSQL details")); const failed = await call(request()); expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ version: "practice-worker-switch-error.v1", code: "SWITCH_UNAVAILABLE" });
});
