import type { z } from "zod";
import { northsideSettings } from "../../../../../packages/db/src/northside-settings";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  actor: vi.fn(), query: vi.fn(), withTenant: vi.fn(), beginUpload: vi.fn(), finalize: vi.fn(), put: vi.fn(),
  evidenceService: vi.fn(), rateCard: vi.fn(), priceExtra: vi.fn(), extras: vi.fn(), run: vi.fn(), queue: vi.fn(), clientView: vi.fn(), clientDecide: vi.fn(), facts: vi.fn(), targets: vi.fn(), ownActions: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", () => ({
  withTenant: h.withTenant,
  northsideRateCard: h.rateCard,
  northsideExtras: h.extras,
  northsideRun: h.run, northsideFacts: h.facts, northsideTargets: { month: "2026-10" }, northsideSwitchTargets: h.targets, northsideOwnActions: h.ownActions,
  ExtraApprovalRepository: class { priceExtra = h.priceExtra; queue = h.queue; clientApprovalView = h.clientView; decideClientApproval = h.clientDecide; },
}));
vi.mock("../../lib/northside-server", () => ({
  DemoError: class extends Error { constructor(readonly code: string, readonly status: number) { super(code); } },
  demoActor: h.actor,
  demoContext: () => Promise.resolve(context),
  bodyOf: (request: Request) => request.json(),
  parseDemoBody: (schema: z.ZodType, raw: unknown) => { const p = schema.safeParse(raw); if (!p.success) throw { code: "INVALID_COMMAND", status: 422 }; return p.data; },
  requireOrigin: () => undefined,
  evidenceService: h.evidenceService,
  practiceStorage: () => ({ put: h.put }),
  practicePng: () => ({ sha256: "a".repeat(64), bytes: new Uint8Array([1]) }),
  json: (body: unknown) => Response.json(body),
  failure: (error: { code?: string; status?: number }) => Response.json({ code: error.code ?? "DEMO_UNAVAILABLE" }, { status: error.status ?? 503 }),
}));
import { POST as photo } from "./photo/route";
import { POST as clientAction } from "./client/route";
import { GET as summary } from "./route";
import { POST as action } from "./extras/[extraId]/[action]/route";

const tenantId = "00000000-0000-4000-8000-000000000001";
const membershipId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const extraId = "00000000-0000-4000-8000-000000000004";
const pool = {}, context = { tenantId }, member = { tenantId, membershipId };
const request = (body: Record<string, unknown>) => new Request("https://practice.invalid/api/northside", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://practice.invalid" }, body: JSON.stringify({ version: "northside-command.v1", ...body }),
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
  h.run.mockResolvedValue({ settings: northsideSettings, settingsHash: "a".repeat(64), testerMembershipId: membershipId });
  h.queue.mockResolvedValue([]); h.targets.mockResolvedValue([]); h.ownActions.mockResolvedValue([]);
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
    expect(h.rateCard).toHaveBeenCalledWith(pool, member, jobId, context);
    expect(h.priceExtra).toHaveBeenCalledWith(context, member, expect.objectContaining({ jobId, extraId, netPence: 600 }));
  });
});

describe("r-d13 closed Northside boundaries (unit doubles)", () => {
  it("DEMO-SETTINGS propagates the stored version, hash and labels without exposing owner totals to another role", async () => {
    const response = await summary();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ settings: { version: "northside-settings.v1", classification: "demo_settings", label: "Demo setting, not a real rule", notice: northsideSettings.notice }, settingsHash: "a".repeat(64), facts: null });
    expect(h.facts).not.toHaveBeenCalled();
  });
  it.each(["actualTesterReference", "fictionalRoleName", "role", "testerMembershipId", "switchId", "tenantId"])("ACTOR-BINDING refuses a spoofed %s before evidence/source reads", async field => {
    const response = await photo(request({ jobId, description: "Fictional extra", note: "Fictional note", [field]: membershipId }));
    expect(response.status).toBe(422);
    expect(h.query).not.toHaveBeenCalled();
    expect(h.evidenceService).not.toHaveBeenCalled();
  });
  it("ACTOR-BINDING binds client decisions to the persisted owner rather than request text", async () => {
    h.actor.mockResolvedValue({ pool, context, member, role: "client_approver" });
    const body = { action: "decide", jobId, requestId: extraId, token: "a".repeat(40), email: "client@fictional.invalid", revisionHash: "b".repeat(64), netPence: 108000, decision: "approve" };
    expect((await clientAction(request({ ...body, actualTesterReference: "someone else" }))).status).toBe(422);
    expect(h.clientDecide).not.toHaveBeenCalled();
    expect((await clientAction(request(body))).status).toBe(200);
    expect(h.clientDecide).toHaveBeenCalledWith(context, member, expect.objectContaining({ actualTesterReference: `membership:${membershipId}`, fictionalRoleName: "Fictional client approver", revisionHash: body.revisionHash, netPence: 108000 }));
  });
  it("AUTHORITY-FIRST denies owner-only request approval before reading the extra or settings", async () => {
    const response = await action(request({ jobId }), { params: Promise.resolve({ extraId, action: "send" }) });
    expect(response.status).toBe(403);
    expect(h.extras).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
  });
  it("AUTHORITY-FIRST denies an ineligible approval using M-chain's queue before presentation/source access", async () => {
    const response = await action(request({ jobId, requestId: extraId, revisionHash: "a".repeat(64), netPence: 108000, stepIndex: 0 }), { params: Promise.resolve({ extraId, action: "approve" }) });
    expect(response.status).toBe(403);
    expect(h.queue).toHaveBeenCalledWith(context, membershipId);
    expect(h.extras).not.toHaveBeenCalled();
  });
  it("AUTHORITY-FIRST resolves the session before malformed command validation", async () => {
    h.actor.mockRejectedValue({ code: "UNAUTHENTICATED", status: 401 });
    expect((await action(request({ role: "owner" }), { params: Promise.resolve({ extraId, action: "send" }) })).status).toBe(401);
    expect(h.extras).not.toHaveBeenCalled();
  });
  it("AUTHORITY-FIRST rejects a stale displayed revision/hash/net rather than approving the latest presentation", async () => {
    h.actor.mockResolvedValue({ pool, context, member, role: "supervisor" });
    h.queue.mockResolvedValue([{ variation_id: extraId, job_id: jobId, request_id: extraId, step_index: 0 }]);
    h.extras.mockResolvedValue([{ extraId, jobId, requestId: extraId, revisionHash: "b".repeat(64), netPence: 108001, nextStepIndex: 0 }]);
    const response = await action(request({ jobId, requestId: extraId, revisionHash: "a".repeat(64), netPence: 108000, stepIndex: 0 }), { params: Promise.resolve({ extraId, action: "approve" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "STALE_REVISION" });
  });
});
