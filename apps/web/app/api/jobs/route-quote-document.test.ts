import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), list: vi.fn(), batch: vi.fn(), delivery: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "practice-token" }) }) }));
vi.mock("../../lib/synthetic-server", () => ({ practiceFailure: () => null, hasSyntheticSession: () => true, syntheticWorkspace: mocks.workspace }));
vi.mock("../../lib/pilot-workspace-server", () => ({ pilotJobList: vi.fn() }));
vi.mock("../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ parties: { list: mocks.list }, customerInvoice: { listForJobs: mocks.batch }, quote: { deliveryView: mocks.delivery } }) }));
import { GET } from "./route";

// TOMMY-DEMO: a sent own-job quote must not read "Quote being prepared" / "Price and send the quote".
const tenant = "10000000-0000-4000-8000-000000000001";
const job = (id: string, status: string) => ({ id, tenantId: tenant, title: `Job ${id.slice(-1)}`, status, customerLabel: "C", siteLabel: "S" });
const ids = ["30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002", "30000000-0000-4000-8000-000000000003", "30000000-0000-4000-8000-000000000004", "30000000-0000-4000-8000-000000000005"];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({ tenants: [{ id: tenant }], jobs: [] });
  mocks.batch.mockResolvedValue([]);
});
const read = async () => (await (await GET(new NextRequest(`http://localhost/api/jobs?tenantId=${tenant}`))).json()).jobs as { id: string; document: unknown }[];

it("projects each quoting or accepted own job's saved delivery, and keeps unknown when the read fails", async () => {
  mocks.list.mockResolvedValue({ jobs: [job(ids[0]!, "quoting"), job(ids[1]!, "quoting"), job(ids[2]!, "accepted"), job(ids[3]!, "quoting"), job(ids[4]!, "live")] });
  mocks.delivery.mockImplementation(async (id: string) => {
    if (id === ids[0]) return { reference: "Q-0001", status: "simulated_delivery" };
    if (id === ids[1]) return null;
    if (id === ids[2]) return { reference: "Q-0002", status: "queued" };
    throw new Error("database unavailable");
  });
  const jobs = await read();
  const doc = (id: string) => jobs.find(j => j.id === id)!.document;
  expect(doc(ids[0]!)).toEqual({ kind: "quote", reference: "Q-0001", delivery: "delivered" });
  expect(doc(ids[1]!)).toEqual({ kind: "none", reference: null, delivery: "not_sent" });
  expect(doc(ids[2]!)).toEqual({ kind: "quote", reference: "Q-0002", delivery: "queued" });
  expect(doc(ids[3]!)).toEqual({ kind: "unknown", reference: null, delivery: "unknown" });
  expect(doc(ids[4]!)).toEqual({ kind: "unknown", reference: null, delivery: "unknown" });
  expect(mocks.delivery).not.toHaveBeenCalledWith(ids[4]);
});
