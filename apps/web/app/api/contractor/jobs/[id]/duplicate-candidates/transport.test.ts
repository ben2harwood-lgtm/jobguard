import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: undefined as string | undefined, resolve: vi.fn(), context: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.session ? { value: state.session } : undefined }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ syntheticPool: () => "pool" }));
vi.mock("@jobguard/db", async importOriginal => {
 const actual = await importOriginal<typeof import("@jobguard/db")>();
 return { ...actual, ContractorRepository: class { resolveSession = state.resolve; }, contractorSessionContext: state.context };
});
import { ExtraApprovalError } from "@jobguard/db";
import { ExtraPersistenceError } from "@jobguard/core";
import { duplicateActor, duplicateFailure, duplicateJson } from "./transport";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.session = "fictional-session"; state.resolve.mockResolvedValue({ membershipId: "stored-member" }); state.context.mockResolvedValue("stamped-context"); });
afterEach(() => vi.unstubAllEnvs());
it("uses only the persisted session bridge and refuses missing sessions and non-demo mode", async () => {
 expect(await duplicateActor()).toEqual({ pool: "pool", actor: { membershipId: "stored-member" }, context: "stamped-context" });
 expect(state.resolve).toHaveBeenCalledWith("fictional-session"); expect(state.context).toHaveBeenCalledWith("pool", "fictional-session");
 state.session = undefined; await expect(duplicateActor()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 vi.stubEnv("JOBGUARD_ENV", "production"); await expect(duplicateActor()).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
});
it("returns closed refusals with correct status and no raw details; no-store on every response", async () => {
 for (const [error, code, status] of [
  [new ExtraApprovalError("NOT_FOUND"), "NOT_FOUND", 404], [new ExtraApprovalError("PERMISSION_DENIED"), "PERMISSION_DENIED", 403],
  [new ExtraPersistenceError("UNLINK_FORBIDDEN"), "UNLINK_FORBIDDEN", 403], [new ExtraPersistenceError("EXTRA_EXPORTED"), "EXTRA_EXPORTED", 409],
  [new ExtraPersistenceError("COMMAND_CONFLICT"), "COMMAND_CONFLICT", 409], [{ code: "UNAUTHENTICATED" }, "UNAUTHENTICATED", 401],
  [new Error("SELECT confidential tenant data"), "DATABASE_UNAVAILABLE", 503], [{ code: "SECRET_DATABASE_DETAIL" }, "DATABASE_UNAVAILABLE", 503],
 ] as const) {
  const response = duplicateFailure(error); expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ version: "extra-duplicate-error.v1", code });
 }
 expect(duplicateJson({}).headers.get("cache-control")).toBe("no-store");
});
