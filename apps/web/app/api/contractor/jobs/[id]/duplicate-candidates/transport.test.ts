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
import { ContractorError, ExtraPersistenceError } from "@jobguard/core";
import { duplicateActor, duplicateFailure, duplicateJson } from "./transport";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.session = "10000000-0000-4000-8000-000000000001"; state.resolve.mockResolvedValue({ membershipId: "stored-member" }); state.context.mockResolvedValue("stamped-context"); });
afterEach(() => vi.unstubAllEnvs());
it("uses only the persisted session bridge and refuses missing sessions and non-demo mode", async () => {
 expect(await duplicateActor()).toEqual({ pool: "pool", actor: { membershipId: "stored-member" }, context: "stamped-context" });
 expect(state.resolve).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001"); expect(state.context).toHaveBeenCalledWith("pool", "10000000-0000-4000-8000-000000000001");
 state.session = undefined; await expect(duplicateActor()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 vi.stubEnv("JOBGUARD_ENV", "production"); await expect(duplicateActor()).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
});
it("returns closed refusals with correct status and no raw details; no-store on every response", async () => {
 for (const [error, code, status] of [
  [new ContractorError("UNAUTHENTICATED"), "UNAUTHENTICATED", 401],
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

it("returns 401 through candidate GET, candidate POST and unlink POST for a bad stored session",async()=>{
 state.resolve.mockRejectedValue(new ContractorError("UNAUTHENTICATED"));
 const {GET,POST}=await import("./route.js");
 const {POST:unlink}=await import("../duplicate-unlinks/route.js");
 const context={params:Promise.resolve({id:"10000000-0000-4000-8000-000000000001"})};
 for(const handler of [GET,POST,unlink]){
  const response=await handler(new Request("http://localhost:3000/api",{method:handler===GET?"GET":"POST",headers:{origin:"http://localhost:3000"}}),context);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({version:"extra-duplicate-error.v1",code:"UNAUTHENTICATED"});
 }
});

it.each(["bad-session", "", "a".repeat(36)])("refuses malformed session %j before database access",async session=>{
 state.session=session;
 await expect(duplicateActor()).rejects.toMatchObject({code:"UNAUTHENTICATED"});
 expect(state.resolve).not.toHaveBeenCalled();expect(state.context).not.toHaveBeenCalled();
});
