import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  actor: vi.fn(), query: vi.fn(), withTenant: vi.fn(), beginUpload: vi.fn(), finalize: vi.fn(), put: vi.fn(),
  evidenceService: vi.fn(), rateCard: vi.fn(), priceExtra: vi.fn(), extras: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", () => ({
  withTenant: h.withTenant,
  northsideRateCard: h.rateCard,
  northsideExtras: h.extras,
  ExtraApprovalRepository: class { priceExtra = h.priceExtra; },
}));
vi.mock("../../lib/northside-server", () => ({
  DemoError: class extends Error { constructor(readonly code: string, readonly status: number) { super(code); } },
  demoActor: h.actor,
  bodyOf: (request: Request) => request.json(),
  requireOrigin: () => undefined,
  evidenceService: h.evidenceService,
  practiceStorage: () => ({ put: h.put }),
  practicePng: () => ({ sha256: "a".repeat(64), bytes: new Uint8Array([1]) }),
  json: (body: unknown) => Response.json(body),
  failure: (error: { code?: string; status?: number }) => Response.json({ code: error.code ?? "DEMO_UNAVAILABLE" }, { status: error.status ?? 503 }),
}));
import { POST as photo } from "./photo/route";
import { POST as action } from "./extras/[extraId]/[action]/route";

const tenantId = "00000000-0000-4000-8000-000000000001";
const membershipId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const extraId = "00000000-0000-4000-8000-000000000004";
const pool = {}, context = { tenantId }, member = { tenantId, membershipId };
const request = (body: Record<string, unknown>) => new Request("https://practice.invalid/api/northside", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://practice.invalid" }, body: JSON.stringify(body),
});
const attach = () => photo(request({ jobId, description: "Fictional extra", note: "Fictional note" }));
const price = () => action(request({ jobId, quantity: 6, sorCode: "CLEAR-VOID" }), { params: Promise.resolve({ extraId, action: "price" }) });

beforeEach(() => {
  vi.resetAllMocks();
  h.actor.mockResolvedValue({ pool, context, member, role: "operative" });
  h.withTenant.mockImplementation(async (_pool, _context, work) => work({ $client: { query: h.query } }));
  h.query.mockResolvedValue({ rows: [{ allowed: false }] });
  h.evidenceService.mockReturnValue({ beginUpload: h.beginUpload, finalize: h.finalize });
  h.beginUpload.mockResolvedValue({ id: extraId, objectKey: "practice-photo" });
  h.finalize.mockResolvedValue({});
  h.rateCard.mockResolvedValue([{ code: "CLEAR-VOID", ratePence: 100 }]);
  h.priceExtra.mockResolvedValue({});
});

describe("Northside photo authorization (unit tests with database and storage doubles)", () => {
  it("refuses an operative without a current job assignment before any evidence or bytes are written", async () => {
    const response = await attach();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "PERMISSION_DENIED" });
    expect(h.withTenant).toHaveBeenCalledWith(pool, context, expect.any(Function));
    expect(h.query).toHaveBeenCalledWith(expect.stringContaining("app.contractor_job_assigned"), [membershipId, jobId]);
    expect(h.evidenceService).not.toHaveBeenCalled();
    expect(h.beginUpload).not.toHaveBeenCalled();
    expect(h.put).not.toHaveBeenCalled();
    expect(h.finalize).not.toHaveBeenCalled();
  });

  it("fails closed when the assignment lookup fails", async () => {
    h.query.mockRejectedValue(new Error("database unavailable"));
    expect((await attach()).status).toBe(503);
    expect(h.evidenceService).not.toHaveBeenCalled();
    expect(h.put).not.toHaveBeenCalled();
  });

  it("lets a currently assigned operative attach the practice photo", async () => {
    h.query.mockResolvedValue({ rows: [{ allowed: true }] });
    const response = await attach();
    expect(response.status).toBe(200);
    expect(h.beginUpload).toHaveBeenCalledWith(context, expect.objectContaining({ jobId }));
    expect(h.put).toHaveBeenCalledOnce();
    expect(h.finalize).toHaveBeenCalledWith(context, { uploadId: extraId, objectVersionId: "v1", evidenceType: "site_photo" });
  });
});

describe("Northside price authority", () => {
  beforeEach(() => h.actor.mockResolvedValue({ pool, context, member, role: "surveyor" }));

  it("refuses a surveyor without a current job grant before reading rates or pricing", async () => {
    const response = await price();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "PERMISSION_DENIED" });
    expect(h.withTenant).toHaveBeenCalledWith(pool, context, expect.any(Function));
    expect(h.query).toHaveBeenCalledWith(expect.stringContaining("app.xa_covers"), [membershipId, jobId]);
    expect(h.rateCard).not.toHaveBeenCalled();
    expect(h.priceExtra).not.toHaveBeenCalled();
  });

  it("reads the rate card and prices after the job grant check succeeds", async () => {
    h.query.mockResolvedValue({ rows: [{ allowed: true }] });
    expect((await price()).status).toBe(200);
    expect(h.rateCard).toHaveBeenCalledWith(pool, member, jobId);
    expect(h.priceExtra).toHaveBeenCalledWith(context, member, expect.objectContaining({ jobId, extraId, netPence: 600 }));
  });
});
