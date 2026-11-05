import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ context: vi.fn(), pool: vi.fn(), read: vi.fn(), rows: vi.fn(), propose: vi.fn(), approve: vi.fn(), token: "" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => m.token ? { value: m.token } : undefined }) }));
vi.mock("../../../../../../lib/synthetic-server", () => ({ syntheticPool: m.pool }));
vi.mock("@jobguard/db", () => ({ contractorSessionContext: m.context, FinancialReconciliationQueueRepository: class {
 read = m.read; readAdjustments = m.rows; propose = m.propose; approve = m.approve;
} }));
import { GET, POST } from "./route";
const id = "00000000-0000-4000-8000-000000000001", hash = "a".repeat(64);
const params = { params: Promise.resolve({ id, runId: id }) };
const input = { version: "financial-reconciliation-propose.v1", runId: id, adjustment: {
 version: "financial-reconciliation-adjustment.v1", commandId: id, reportHash: hash, invoiceRevision: id,
 fact: { id, invoiceId: id, sourceId: id, kind: "payment", amount: 12000 },
} };
const approval = { version: "financial-reconciliation-approve.v1", commandId: id, jobId: id, adjustmentId: id, contentHash: hash };
const request = (body: unknown = input, origin: string | null = "http://localhost:3000") => new Request(`http://localhost:3000/api/jobs/${id}/reconciliation/${id}/adjustments`, {
 method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json", "x-tenant-id": "forged" }, body: JSON.stringify(body),
});
beforeEach(() => {
 vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); m.token = id;
 m.context.mockResolvedValue({ tenantId: id }); m.read.mockResolvedValue({ snapshot: { provider: [], invoices: [] }, report: { sourceHash: hash, queue: [] } });
 m.rows.mockResolvedValue([{ adjustmentId: id, contentHash: hash, approvalId: null }]);
 m.propose.mockResolvedValue({ adjustmentId: id, contentHash: hash }); m.approve.mockResolvedValue({ approvalId: id });
});
afterEach(() => vi.unstubAllEnvs());
it("reads only session-bound stored facts with no-store", async () => {
 const result = await GET(new Request(request().url), params);
 expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
 expect(m.rows).toHaveBeenCalledWith({ tenantId: id }, id, id, id);
});
it("binds scope from session and sends replay IDs and hashes unchanged", async () => {
 for (let n = 0; n < 2; n++) expect((await POST(request(), params)).status).toBe(200);
 expect(m.propose).toHaveBeenLastCalledWith({ tenantId: id }, id, { ...input, adjustment: { ...input.adjustment, tenantId: id, jobId: id, fact: { ...input.adjustment.fact, tenantId: id, jobId: id } } });
 for (let n = 0; n < 2; n++) expect((await POST(request(approval), params)).status).toBe(200);
 expect(m.approve).toHaveBeenLastCalledWith({ tenantId: id }, id, approval);
});
it("rejects forged authority at every nesting level before mutation", async () => {
 for (const field of ["tenantId", "actor", "status", "approved"]) {
  for (const body of [{ ...input, [field]: true }, { ...input, adjustment: { ...input.adjustment, [field]: true } },
   { ...input, adjustment: { ...input.adjustment, fact: { ...input.adjustment.fact, [field]: true } } }, { ...approval, [field]: true }]) {
   expect((await POST(request(body), params)).status).toBe(422);
  }
 }
 expect(m.propose).not.toHaveBeenCalled(); expect(m.approve).not.toHaveBeenCalled();
});
it("hides other environments and blocks untrusted origins and absent sessions before pool access", async () => {
 for (const mode of ["production", "pilot_no_charge"]) { vi.stubEnv("JOBGUARD_ENV", mode); expect((await POST(request(), params)).status).toBe(404); }
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 for (const origin of [null, "https://foreign.invalid"]) expect((await POST(request(input, origin), params)).status).toBe(403);
 m.token = undefined; expect((await POST(request(), params)).status).toBe(403); expect(m.pool).not.toHaveBeenCalled();
});
it("shows typed stale hash, self-approval and session refusals without exposing errors", async () => {
 for (const [code, status] of [["RECONCILIATION_CONFLICT", 409], ["RECONCILIATION_SELF_APPROVAL", 403], ["EXTRA_FORBIDDEN", 403], ["NOT_FOUND", 404]] as const) {
  m.approve.mockRejectedValueOnce(new Error(code)); const result = await POST(request(approval), params);
  expect(result.status).toBe(status); expect((await result.json()).message).toBeTruthy();
 }
 m.read.mockResolvedValueOnce(null); expect((await POST(request(), params)).status).toBe(404);
 m.read.mockRejectedValueOnce(new Error("private connection secret")); const result = await POST(request(), params);
 expect(result.status).toBe(503); expect(JSON.stringify(await result.json())).not.toContain("private");
});
it("binds both commands to the path run and refuses an adjustment from another run", async () => {
 const foreign = "00000000-0000-4000-8000-000000000002";
 expect((await POST(request({ ...input, runId: foreign }), params)).status).toBe(409);
 m.rows.mockResolvedValueOnce([]); expect((await POST(request(approval), params)).status).toBe(404);
 expect(m.propose).not.toHaveBeenCalled(); expect(m.approve).not.toHaveBeenCalled();
});
