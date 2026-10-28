import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnterpriseFeeError } from "@jobguard/core";
const mocks = vi.hoisted(() => ({ context: vi.fn(), pool: vi.fn(), read: vi.fn(), derive: vi.fn(), prepare: vi.fn(), approve: vi.fn(), post: vi.fn(), dispute: vi.fn(), postings: vi.fn(), derivation: vi.fn(), token: "00000000-0000-4000-8000-000000000001" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.token ? { value: mocks.token } : undefined }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: mocks.pool }));
vi.mock("@jobguard/db", async importOriginal => ({ enterpriseFeeApproveStatementV1: (await importOriginal<typeof import("@jobguard/db")>()).enterpriseFeeApproveStatementV1, contractorSessionContext: mocks.context, EnterpriseFeeRepository: class {
  readStatement = mocks.read; readPostings = mocks.postings; read = mocks.derivation; derive = mocks.derive; prepareStatement = mocks.prepare;
  approveStatement = mocks.approve; postStatement = mocks.post; disputeStatement = mocks.dispute;
} }));
import { POST } from "./route";
const id = "00000000-0000-4000-8000-000000000002";
const input = { version: "enterprise-fee-screen-read.v1", statementId: id };
const request = (body: unknown = input, origin: string | null = "http://localhost:3000") => new Request("http://localhost:3000/api/contractor/statements/read?tenantId=foreign", { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json", "x-tenant-id": "foreign" }, body: JSON.stringify(body) });
const call = (action = "read", req = request()) => POST(req, { params: Promise.resolve({ action }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); mocks.token = id;
  mocks.context.mockResolvedValue({ tenantId: "from-cookie" }); mocks.read.mockResolvedValue({ id, sections: [{ derivationId: id }] });
  mocks.derivation.mockResolvedValue({ contributions: [] }); mocks.postings.mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("binds all reads to the current cookie context and returns drill-downs without caching", async () => {
  for (let i = 0; i < 2; i++) { const result = await call(); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store"); }
  expect(mocks.read).toHaveBeenLastCalledWith({ tenantId: "from-cookie" }, id, id);
  expect(mocks.derivation).toHaveBeenLastCalledWith({ tenantId: "from-cookie" }, id, id);
  expect(mocks.postings).toHaveBeenLastCalledWith({ tenantId: "from-cookie" }, id, id);
});
it("rejects production/pilot, foreign origins and absent sessions before database access", async () => {
  for (const mode of ["production_billing", "pilot_no_charge"]) { vi.stubEnv("JOBGUARD_ENV", mode); expect((await call()).status).toBe(409); }
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  for (const origin of [null, "https://foreign.invalid"]) expect((await call("read", request(input, origin))).status).toBe(403);
  mocks.token = undefined; expect((await call()).status).toBe(403); expect(mocks.pool).not.toHaveBeenCalled();
});
it("rejects forged read authority and malformed or unknown commands", async () => {
  for (const body of [{ ...input, tenantId: id }, { ...input, amount: 999 }, { ...input, statementId: "bad" }]) expect((await call("read", request(body))).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled(); expect((await call("unknown")).status).toBe(400);
  expect((await call("read", new Request(request().url, { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{" }))).status).toBe(400);
});
it("delegates exact commands unchanged to the repository", async () => {
  for (const [action, fn] of [["derive", mocks.derive], ["prepare", mocks.prepare], ["post", mocks.post], ["dispute", mocks.dispute]] as const) {
    const command = { version: `enterprise-fee-${action}.v1`, commandId: id };
    fn.mockResolvedValue({ replayed: true }); expect((await call(action, request(command))).status).toBe(200);
    expect(fn).toHaveBeenLastCalledWith({ tenantId: "from-cookie" }, id, command);
  }
});
it("refuses browser approval expiries outside the server's fifteen-minute window", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  const command = { version: "enterprise-fee-approve-statement.v1", commandId: id, statementId: id, contentHash: "a".repeat(64), totalDeltaPence: 806 };
  for (const expiresAt of ["2099-01-01T00:00:00Z", "2026-10-28T12:15:00.001Z", "2026-10-28T12:00:00Z", "2026-10-28T11:59:59Z", "tomorrow"]) {
    expect((await call("approve", request({ ...command, expiresAt }))).status).toBe(400);
  }
  expect(mocks.approve).not.toHaveBeenCalled();
  mocks.approve.mockResolvedValue({ authorizationId: id, replayed: false });
  for (const expiresAt of ["2026-10-28T12:01:00Z", "2026-10-28T12:15:00Z"]) {
    const approved = { ...command, expiresAt };
    expect((await call("approve", request(approved))).status).toBe(200);
    expect(mocks.approve).toHaveBeenLastCalledWith({ tenantId: "from-cookie" }, id, approved);
  }
});
it("fails closed on cross-company reads, stale approval and private database errors", async () => {
  mocks.read.mockRejectedValueOnce(new EnterpriseFeeError("FEE_NOT_FOUND")); expect((await call()).status).toBe(404);
  mocks.post.mockRejectedValueOnce(new EnterpriseFeeError("STALE_FACTS")); expect((await call("post")).status).toBe(409);
  mocks.context.mockRejectedValueOnce(new Error("hidden tenant secret")); const result = await call();
  expect(await result.json()).toEqual({ version: "enterprise-fee-error.v1", code: "OUTCOME_UNKNOWN" });
});
