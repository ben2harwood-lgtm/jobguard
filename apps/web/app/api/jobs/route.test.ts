import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), list: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "practice-token" }) }) }));
vi.mock("../../lib/synthetic-server", () => ({ practiceFailure: () => null, hasSyntheticSession: () => true, syntheticWorkspace: mocks.workspace }));
vi.mock("../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ parties: { list: mocks.list } }) }));
import { GET } from "./route";
const a = "10000000-0000-4000-8000-000000000001", b = "20000000-0000-4000-8000-000000000001";
const own = { id: "30000000-0000-4000-8000-000000000001", tenantId: a, title: "Firm A job", status: "accepted", customerLabel: "A customer", siteLabel: "A site", revision: 4 };
beforeEach(() => {
  vi.clearAllMocks();
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
