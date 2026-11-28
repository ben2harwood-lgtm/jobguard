import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: undefined as string | undefined, context: vi.fn(), workList: vi.fn(), entitlement: vi.fn(), asked: vi.fn(), claim: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.session ? { value: state.session } : undefined }) }));
vi.mock("../../../lib/synthetic-server", () => ({ syntheticPool: () => "pool" }));
vi.mock("@jobguard/db", async importOriginal => {
 const actual = await importOriginal<typeof import("@jobguard/db")>();
 return { ...actual, contractorSessionContext: state.context,
  ExtraCommercialReadRepository: class { constructor(readonly pool: string) {} workList = state.workList; entitlementContext = state.entitlement; askedAgainstApproved = state.asked; claimRecord = state.claim; } };
});
import { ContractorError, ExtraCommercialReadError } from "@jobguard/core";
import { GET as LIST } from "./route";
import { GET as ENTITLEMENT } from "../jobs/[id]/site-extras/[extraId]/entitlement-context/route";
import { GET as ASKED } from "../jobs/[id]/site-extras/[extraId]/asked-against-approved/route";
import { GET as CLAIM } from "../jobs/[id]/site-extras/[extraId]/claim-record/route";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const route = { params: Promise.resolve({ id: id(1), extraId: id(2) }) };
const get = (query = "") => new Request(`http://localhost:3000/api/contractor/x${query}`);
beforeEach(() => {
 vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.session = id(9); state.context.mockResolvedValue("stamped-context");
 for (const m of [state.workList, state.entitlement, state.asked, state.claim]) m.mockResolvedValue({ version: "ok" });
});
afterEach(() => vi.unstubAllEnvs());

it("binds the persisted session cookie, takes job and extra from the path and answers no-store", async () => {
 for (const [handler, mock] of [[ENTITLEMENT, state.entitlement], [ASKED, state.asked], [CLAIM, state.claim]] as const) {
  const response = await handler(get(), route);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual({ version: "ok" });
  expect(mock).toHaveBeenCalledWith("stamped-context", id(9), id(1), id(2), {});
  await handler(get(`?clientContractId=${id(3)}`), route);
  expect(mock).toHaveBeenLastCalledWith("stamped-context", id(9), id(1), id(2), { clientContractId: id(3) });
 }
 expect(state.context).toHaveBeenCalledWith("pool", id(9));
});

it("passes work-list filters through, repeats state, and refuses unknown or repeated selectors before any read", async () => {
 const response = await LIST(get(`?state=rejected&state=part_paid&orderReference=WO-1&rateCode=R1&clientContractId=${id(3)}&teamId=${id(4)}&raisedFrom=2026-01-01T00:00:00.000Z&raisedTo=2026-02-01T00:00:00.000Z`));
 expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(state.workList).toHaveBeenCalledWith("stamped-context", id(9), { version: "extra-work-list-query.v1", states: ["rejected", "part_paid"], orderReference: "WO-1", rateCode: "R1",
  clientContractId: id(3), teamId: id(4), raisedFrom: "2026-01-01T00:00:00.000Z", raisedTo: "2026-02-01T00:00:00.000Z" });
 state.workList.mockClear();
 for (const query of ["?tenantId=" + id(5), "?membershipId=" + id(5), "?role=finance", "?teamId=" + id(4) + "&teamId=" + id(5), "?version=extra-work-list-query.v0"]) {
  const refused = await LIST(get(query)); expect(refused.status, query).toBe(400); expect(await refused.json()).toEqual({ version: "extra-commercial-read-error.v1", code: "INVALID_QUERY" });
 }
 for (const query of ["?jobId=" + id(5), "?tenantId=" + id(5), `?clientContractId=${id(3)}&clientContractId=${id(4)}`]) expect((await CLAIM(get(query), route)).status, query).toBe(400);
 expect(state.workList).not.toHaveBeenCalled(); expect(state.claim).not.toHaveBeenCalled();
});

it("refuses a missing or malformed session and non-demo mode without reading", async () => {
 state.session = undefined; expect((await LIST(get())).status).toBe(401);
 state.session = "not-a-uuid"; expect((await CLAIM(get(), route)).status).toBe(401);
 state.session = id(9); vi.stubEnv("JOBGUARD_ENV", "production"); expect((await ENTITLEMENT(get(), route)).status).toBe(403);
 expect(state.context).not.toHaveBeenCalled(); expect(state.workList).not.toHaveBeenCalled(); expect(state.entitlement).not.toHaveBeenCalled();
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.context.mockRejectedValueOnce(new ContractorError("UNAUTHENTICATED"));
 expect((await ASKED(get(), route)).status).toBe(401);
});

it("maps typed refusals to closed codes and never leaks raw errors", async () => {
 for (const [error, code, status] of [
  [new ExtraCommercialReadError("NOT_FOUND"), "NOT_FOUND", 404], [new ExtraCommercialReadError("PERMISSION_DENIED"), "PERMISSION_DENIED", 403],
  [new ExtraCommercialReadError("INVALID_QUERY"), "INVALID_QUERY", 400], [new ExtraCommercialReadError("INCONSISTENT_WORK_INPUT"), "INCONSISTENT_WORK_INPUT", 409],
  [new ExtraCommercialReadError("DATABASE_UNAVAILABLE"), "DATABASE_UNAVAILABLE", 503], [new Error("SELECT secret tenant rows"), "DATABASE_UNAVAILABLE", 503],
  [{ code: "PERMISSION_DENIED" }, "DATABASE_UNAVAILABLE", 503],
 ] as const) {
  state.claim.mockRejectedValueOnce(error);
  const response = await CLAIM(get(), route);
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ version: "extra-commercial-read-error.v1", code });
 }
});
