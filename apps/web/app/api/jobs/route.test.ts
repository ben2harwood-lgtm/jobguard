import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), list: vi.fn(), batch: vi.fn(), failure: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "practice-token" }) }) }));
vi.mock("../../lib/synthetic-server", () => ({ practiceFailure: (error: unknown) => mocks.failure(error), hasSyntheticSession: () => true, syntheticWorkspace: mocks.workspace }));
vi.mock("../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ parties: { list: mocks.list }, customerInvoice: { listForJobs: mocks.batch } }) }));
import { GET } from "./route";
const a = "10000000-0000-4000-8000-000000000001", b = "20000000-0000-4000-8000-000000000001";
const own = { id: "30000000-0000-4000-8000-000000000001", tenantId: a, title: "Firm A job", status: "accepted", customerLabel: "A customer", siteLabel: "A site", revision: 4 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.failure.mockReset();
  mocks.batch.mockReset();
  mocks.workspace.mockResolvedValue({ tenants: [{ id: a }, { id: b }], jobs: [{ ...own, document: { kind: "unknown", reference: null, delivery: "unknown" } }, { id: "40000000-0000-4000-8000-000000000001", tenantId: b, title: "Firm B private £99,999.00", updatedLabel: "Updated 9 Nov" }] });
  mocks.list.mockResolvedValue({ jobs: [own] });
});
it("omits revision labels when the existing list has no timestamp or stored accepted total", async () => {
  const response = await GET(new NextRequest(`http://localhost/api/jobs?tenantId=${a}`));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.jobs).toHaveLength(1);
  expect(body.jobs[0].updatedLabel).toBe("");
  expect(JSON.stringify(body)).not.toContain("Server revision");
});
it("keeps firm B's card and total out of firm A's response and refuses its job id", async () => {
  const response = await GET(new NextRequest(`http://localhost/api/jobs?tenantId=${a}`));
  expect(JSON.stringify(await response.json())).not.toMatch(/Firm B|99,999/u);
  const denied = await GET(new NextRequest(`http://localhost/api/jobs?tenantId=${a}&jobId=40000000-0000-4000-8000-000000000001`));
  expect(denied.status).toBe(404);
  expect(await denied.json()).toEqual({ code: "NOT_FOUND" });
});
it("refuses an unlisted firm before reading projected jobs", async () => {
  const response = await GET(new NextRequest("http://localhost/api/jobs?tenantId=50000000-0000-4000-8000-000000000001"));
  expect(response.status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
});

const invoice = (extra = {}) => ({ id: "60000000-0000-4000-8000-000000000001", number: "P-1", issuedOn: "2026-11-13", recipient: "fictional@example.invalid", pdfSha256: "a".repeat(64), sourceHash: "b".repeat(64), finalAccountRevisionId: "70000000-0000-4000-8000-000000000001", netPence: 10000, taxPence: 2000, totalPence: 12000, balancePence: 12000, customerCreditPence: 0, paidPence: 0, creditedPence: 0, delivery: "simulated_delivery", ...extra });
const group = (invoices: unknown[], jobId = own.id) => ({ version: 1, environment: "synthetic_demo", jobId, invoices });
const request = () => GET(new NextRequest(`http://localhost/api/jobs?tenantId=${a}`));
it.each([
  ["no invoice", [], "not_due"],
  ["issued unpaid", [invoice()], "due"],
  ["partial", [invoice({ paidPence: 3000, balancePence: 9000 })], "part_paid"],
  ["full", [invoice({ paidPence: 12000, balancePence: 0 })], "settled"],
  ["reversal", [invoice()], "due"],
  ["partial after reversal", [invoice({ paidPence: 2000, balancePence: 10000 })], "part_paid"],
  ["supplementary balance", [invoice({ paidPence: 12000, balancePence: 0 }), invoice({ id: "60000000-0000-4000-8000-000000000002" })], "part_paid"],
  ["overpayment on another invoice", [invoice({ paidPence: 24000, balancePence: 0, customerCreditPence: 12000 }), invoice({ id: "60000000-0000-4000-8000-000000000002" })], "part_paid"],
  ["credits", [invoice({ creditedPence: 12000, balancePence: 0 })], "unknown"],
  ["zero-value", [invoice({ netPence: 0, taxPence: 0, totalPence: 0, balancePence: 0 })], "unknown"],
  ["incomplete settled", [invoice({ balancePence: 0, paidPence: undefined, creditedPence: undefined })], "unknown"],
  ["incomplete outstanding", [invoice({ paidPence: undefined })], "unknown"],
  ["malformed facts", [invoice({ balancePence: -1 })], "unknown"],
  ["inconsistent facts", [invoice({ balancePence: 0 })], "unknown"],
] as const)("own-job summaries follow saved invoice payments: %s", async (_name, facts, expected) => {
  mocks.workspace.mockImplementation(async () => ({ tenants: [{ id: a }], jobs: [] }));
  mocks.batch.mockResolvedValue([group([...facts])]);
  const response = await request();
  expect((await response.json()).jobs[0].customerPayment).toBe(expected);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.batch).toHaveBeenCalledExactlyOnceWith([own.id]);
});
it("keeps cards unknown on payment read failure or missing groups, without reusing a prior paid result", async () => {
  mocks.workspace.mockImplementation(async () => ({ tenants: [{ id: a }], jobs: [] }));
  for (const result of [[], [group([], "80000000-0000-4000-8000-000000000001")]]) {
    mocks.batch.mockResolvedValue(result);
    expect((await (await request()).json()).jobs[0].customerPayment).toBe("unknown");
  }
  mocks.batch.mockResolvedValue([group([invoice({ paidPence: 12000, balancePence: 0 })])]);
  expect((await (await request()).json()).jobs[0].customerPayment).toBe("settled");
  mocks.batch.mockRejectedValue(new Error("database unavailable"));
  expect((await (await request()).json()).jobs[0].customerPayment).toBe("unknown");
});
it("preserves seeded example facts and batches all ordinary owned jobs once", async () => {
  const example = { ...own, customerPayment: "not_due", pilotNoCharge: true, document: { kind: "quote", reference: "Q-1007", delivery: "delivered" } };
  const ordinary = { ...own, id: "80000000-0000-4000-8000-000000000001" };
  const other = { ...own, id: "80000000-0000-4000-8000-000000000002" };
  mocks.workspace.mockResolvedValue({ tenants: [{ id: a }], jobs: [example] });
  mocks.list.mockResolvedValue({ jobs: [own, ordinary, other] });
  mocks.batch.mockResolvedValue([group([], ordinary.id), group([], other.id)]);
  const body = await (await request()).json();
  expect(body.jobs[0]).toMatchObject({ customerPayment: example.customerPayment, pilotNoCharge: example.pilotNoCharge, document: example.document });
  expect(mocks.batch).toHaveBeenCalledExactlyOnceWith([ordinary.id, other.id]);
});
it("does not batch an empty own list or examples alone and retains ownership failures", async () => {
  mocks.list.mockResolvedValue({ jobs: [] });
  expect((await (await request()).json()).jobs).toEqual([]);
  expect(mocks.batch).not.toHaveBeenCalled();
  mocks.list.mockResolvedValue({ jobs: [own] });
  mocks.workspace.mockResolvedValue({ tenants: [{ id: a }], jobs: [own] });
  await request(); expect(mocks.batch).not.toHaveBeenCalled();
  mocks.list.mockRejectedValue(new Error("database unavailable"));
  const response = await request(); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE", recoverable: true });
});
it("retains authentication and ownership refusals from the payment read", async () => {
  mocks.workspace.mockImplementation(async () => ({ tenants: [{ id: a }], jobs: [] }));
  mocks.batch.mockRejectedValue(new Error("refused"));
  mocks.failure.mockImplementation(() => new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 }));
  expect((await request()).status).toBe(401);
  mocks.failure.mockImplementation(() => new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 }));
  expect((await request()).status).toBe(404);
});
