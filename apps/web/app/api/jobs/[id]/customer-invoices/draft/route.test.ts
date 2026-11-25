import { beforeEach, expect, it, vi } from "vitest";
const app = vi.hoisted(() => ({ invoiceDraft: { read: vi.fn(), prepare: vi.fn() } }));
vi.mock("../../../../../lib/pilot-workspace-route.mjs", () => ({ pilotWorkspaceRoute: async (_request: Request, work: (value: unknown) => Promise<unknown>) => {
  try { const result = await work(app); return result instanceof Response ? result : Response.json(result); }
  catch (error) { return Response.json({ code: (error as Error).message }, { status: 409 }); }
} }));
import { GET, POST } from "./route";
import { PILOT_DRAFT_WARNING, pilotDraftStatements, pilotDraftTotals } from "@jobguard/core";
const params = { params: Promise.resolve({ id: "job" }) };
const checklist = { ...Object.fromEntries(Object.keys(pilotDraftStatements).map(key => [key, true])), vatNumber: "GB123456789" };
const body = { version: "pilot-invoice-draft.v1", binding: "a".repeat(64), checklist, format: "preview" };
const request = (value: unknown) => new Request("https://fixture.invalid/api/jobs/job/customer-invoices/draft", { method: "POST", body: JSON.stringify(value) });
beforeEach(() => {
  vi.clearAllMocks();
  app.invoiceDraft.read.mockResolvedValue({ binding: body.binding });
  app.invoiceDraft.prepare.mockResolvedValue({ version: body.version, warning: PILOT_DRAFT_WARNING, jobId: "job", binding: body.binding,
    accountRevision: 1, sourceHash: body.binding, previewedAt: "fixture time", builder: { name: "Builder", address: [] },
    customer: { name: "Homeowner", address: [] }, site: [], vatNumber: checklist.vatNumber, lines: [], ...pilotDraftTotals([]) });
});
it("uses the request-scoped pilot application for reads and each preview/export", async () => {
  expect((await GET(new Request("https://fixture.invalid"), params)).status).toBe(200);
  for (const format of ["preview", "csv", "html"]) {
    const response = await POST(request({ ...body, format }), params);
    expect(response.status).toBe(200); expect(await response.text()).toContain(PILOT_DRAFT_WARNING);
    if (format !== "preview") expect(response.headers.get("content-disposition")).toContain("invoice-draft");
  }
  expect(app.invoiceDraft.prepare).toHaveBeenCalledTimes(3);
});
it("refuses incomplete and unknown checklist inputs without exporting VAT", async () => {
  for (const key of Object.keys(pilotDraftStatements)) {
    const response = await POST(request({ ...body, checklist: { ...checklist, [key]: false } }), params);
    expect(response.status).toBe(409); expect(await response.text()).not.toContain("candidateVat");
  }
  expect(app.invoiceDraft.prepare).not.toHaveBeenCalled();
});
it("propagates stale and revoked-access refusals on downloads", async () => {
  for (const code of ["STALE_REVISION", "TENANT_FORBIDDEN", "NOT_FOUND"]) {
    app.invoiceDraft.prepare.mockRejectedValueOnce(new Error(code));
    expect(await (await POST(request({ ...body, format: "csv" }), params)).json()).toEqual({ code });
  }
});
