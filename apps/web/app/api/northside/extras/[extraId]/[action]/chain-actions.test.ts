import { beforeEach, expect, it, vi } from "vitest";
import type { z } from "zod";
import { isTrustedBrowserOrigin } from "../../../../contractor/origin";
const h = vi.hoisted(() => ({ actor: vi.fn(), query: vi.fn(), queue: vi.fn(), extras: vi.fn(), rates: vi.fn(), reject: vi.fn(), withdraw: vi.fn(), revise: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", () => ({
  ExtraApprovalRepository: class { queue = h.queue; rejectExtra = h.reject; withdrawExtra = h.withdraw; reviseExtra = h.revise; },
  withTenant: async (_pool: unknown, _context: unknown, fn: (db: unknown) => unknown) => fn({ $client: { query: h.query } }),
  northsideExtras: h.extras, northsideRateCard: h.rates,
}));
vi.mock("../../../../../lib/northside-server", () => ({
  DemoError: class extends Error { constructor(readonly code: string, readonly status: number) { super(code); } },
  demoActor: h.actor, demoContext: async () => tenant,
  bodyOf: (r: Request) => r.json(),
  parseDemoBody: (schema: z.ZodType, raw: unknown) => { const p = schema.safeParse(raw); if (!p.success) throw { code: "INVALID_COMMAND", status: 422 }; return p.data; },
  requireOrigin: (r: Request) => { if (!isTrustedBrowserOrigin(r, {})) throw { code: "ORIGIN_FORBIDDEN", status: 403 }; },
  json: (body: unknown) => Response.json(body),
  failure: (e: { code: string; status?: number }) => Response.json({ code: e.code }, { status: e.status ?? 409 }),
}));
import { GET, POST } from "./route";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenant = { tenantId: id(1) }, member = { tenantId: id(1), membershipId: id(2) };
const extra = { extraId: id(3), jobId: id(4), requestId: id(5), revisionHash: "a".repeat(64), netPence: 1000, nextStepIndex: 0 };
const binding = { requestId: extra.requestId, revisionHash: extra.revisionHash, netPence: extra.netPence, stepIndex: 0 };
const common = { version: "northside-command.v1", commandId: id(6), jobId: extra.jobId };
const params = (action: string) => ({ params: Promise.resolve({ extraId: extra.extraId, action }) });
const call = (action: string, body: object, origin = "http://localhost:3000") => POST(new Request(`http://localhost:3000/api/northside/extras/${extra.extraId}/${action}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ ...common, ...body }) }), params(action));
beforeEach(() => {
  vi.resetAllMocks();
  h.actor.mockResolvedValue({ pool: {}, member, role: "supervisor", sessionId: id(7) });
  h.queue.mockResolvedValue([{ variation_id: extra.extraId, job_id: extra.jobId, request_id: extra.requestId, step_index: 0 }]);
  h.extras.mockResolvedValue([extra]); h.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("command_receipt") ? [] : [{ allowed: true }] }));
  h.rates.mockResolvedValue([{ code: "CLEAR-VOID", ratePence: 1000 }]);
  h.reject.mockResolvedValue({ state: "rejected" }); h.withdraw.mockResolvedValue({ state: "withdrawn" }); h.revise.mockResolvedValue({ requestId: id(8) });
});
it("binds a rejection to the session, displayed revision and eligible step", async () => {
  expect((await call("reject", { ...binding, reasonCode: "not_agreed" })).status).toBe(200);
  expect(h.reject).toHaveBeenCalledWith(tenant, member, { ...common, ...binding, version: "reject-extra.v1", reasonCode: "not_agreed" });
});
it("refuses missing eligibility, stale figures and extras outside the visible job", async () => {
  expect((await call("reject", { ...binding, netPence: 1001, reasonCode: "not_agreed" })).status).toBe(409);
  h.extras.mockResolvedValue([]);
  expect((await call("reject", { ...binding, reasonCode: "not_agreed" })).status).toBe(404);
  h.queue.mockResolvedValue([]);
  expect((await call("reject", { ...binding, reasonCode: "not_agreed" })).status).toBe(403);
  expect(h.reject).not.toHaveBeenCalled();
});
it("delegates completed rejection replays and payload conflicts to the durable command", async () => {
  h.queue.mockResolvedValue([]); h.query.mockResolvedValue({ rows: [{ extra_id: extra.extraId, job_id: extra.jobId }] });
  const first = await call("reject", { ...binding, reasonCode: "not_agreed" });
  expect(await (await call("reject", { ...binding, reasonCode: "not_agreed" })).json()).toEqual(await first.json());
  h.reject.mockRejectedValueOnce({ code: "COMMAND_CONFLICT" });
  expect(await (await call("reject", { ...binding, reasonCode: "changed" })).json()).toEqual({ code: "COMMAND_CONFLICT" });
});
it.each(["owner", "surveyor", "operative", "client_approver"])("refuses withdrawal by %s", async role => {
  h.actor.mockResolvedValue({ pool: {}, member, role });
  expect((await call("withdraw", { reasonCode: "not_done" })).status).toBe(403); expect(h.withdraw).not.toHaveBeenCalled();
});
it("passes a supervisor withdrawal and only the existing reason list", async () => {
  expect((await call("withdraw", { reasonCode: "not_done" })).status).toBe(200);
  expect(h.withdraw).toHaveBeenCalledWith(tenant, member, { ...common, version: "withdraw-extra.v1", extraId: extra.extraId, reasonCode: "not_done" });
  expect((await call("withdraw", { reasonCode: "anything" })).status).toBe(422);
});
it.each(["tenantId", "actor", "role", "time", "netPence"])("refuses client supplied %s on revise", async field => {
  expect((await call("revise", { sorCode: "CLEAR-VOID", quantity: 2, [field]: 2000 })).status).toBe(422); expect(h.revise).not.toHaveBeenCalled();
});
it("calculates a revised amount from the covered job's server rate", async () => {
  h.actor.mockResolvedValue({ pool: {}, member, role: "surveyor" });
  expect((await call("revise", { sorCode: "CLEAR-VOID", quantity: 2 })).status).toBe(200);
  expect(h.revise).toHaveBeenCalledWith(tenant, member, { ...common, version: "revise-extra.v1", extraId: extra.extraId, netPence: 2000 });
  h.query.mockResolvedValue({ rows: [{ allowed: false }] }); h.rates.mockClear();
  expect((await call("revise", { sorCode: "CLEAR-VOID", quantity: 2 })).status).toBe(403); expect(h.rates).not.toHaveBeenCalled();
});
it("rejects untrusted origins before resolving the actor", async () => {
  expect((await call("withdraw", { reasonCode: "not_done" }, "https://attacker.invalid")).status).toBe(403); expect(h.actor).not.toHaveBeenCalled();
});
it("reads revision rates only for a visible covered extra and surveyor", async () => {
  h.actor.mockResolvedValue({ pool: {}, member, role: "surveyor" });
  expect((await GET(new Request("http://localhost:3000"), params("revise"))).status).toBe(200);
  h.extras.mockResolvedValue([]); expect((await GET(new Request("http://localhost:3000"), params("revise"))).status).toBe(404);
});
it.each(["tenantId", "actorMembershipId", "role", "serverTime"])("reject and withdraw refuse forged %s", async key => {
  expect((await call("reject", { ...binding, reasonCode: "not_agreed", [key]: id(99) })).status).toBe(422);
  expect((await call("withdraw", { reasonCode: "not_done", [key]: id(99) })).status).toBe(422);
  expect(h.reject).not.toHaveBeenCalled(); expect(h.withdraw).not.toHaveBeenCalled();
});
it("requires a rejection reason and exact step, and preserves typed command refusals", async () => {
  expect((await call("reject", binding)).status).toBe(422);
  expect((await call("reject", { ...binding, stepIndex: undefined, reasonCode: "not_agreed" })).status).toBe(422);
  h.withdraw.mockRejectedValueOnce({ code: "PERMISSION_DENIED", status: 403 });
  expect((await call("withdraw", { reasonCode: "not_done" })).status).toBe(403);
  h.actor.mockResolvedValue({ pool: {}, member, role: "surveyor" });
  h.revise.mockRejectedValueOnce({ code: "NOT_FOUND", status: 404 });
  expect((await call("revise", { sorCode: "CLEAR-VOID", quantity: 2 })).status).toBe(404);
});

it("binds replay to the original URL extra and job rather than trusting a receipt alone", async () => {
  h.query.mockResolvedValue({ rows: [{ extra_id: id(90), job_id: extra.jobId }] });
  expect(await (await call("reject", { ...binding, reasonCode: "not_agreed" })).json()).toEqual({ code: "COMMAND_CONFLICT" });
  expect(h.reject).not.toHaveBeenCalled();
});
