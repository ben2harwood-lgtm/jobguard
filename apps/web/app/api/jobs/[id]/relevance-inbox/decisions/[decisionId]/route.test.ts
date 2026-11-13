import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ dismiss: vi.fn(), authorize: vi.fn(), metadata: vi.fn(), record: vi.fn(), token: "00000000-0000-4000-8000-000000000001", pool: {} }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: m.token }) }) }));
vi.mock("../../../../../../lib/workspace-server", () => ({ workspaceApplication: async () => ({ inboxRelevance: { dismiss: m.dismiss } }) }));
vi.mock("../../../../../../lib/synthetic-server", async original => ({ ...await original<typeof import("../../../../../../lib/synthetic-server")>(), syntheticPool: () => m.pool }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(),
  authorizePracticeJob: m.authorize,
  InboxRelevanceRepository: class { metricDecision = m.metadata; },
  InboxMetricsRepository: class { record = m.record; },
}));
import { POST } from "./route";
const jobId = "00000000-0000-4000-8000-000000000002", decisionId = "00000000-0000-4000-8000-000000000003";
const context = { tenantId: "00000000-0000-4000-8000-000000000004" };
const body = { version: "inbox-dismiss.v1", commandId: "00000000-0000-4000-8000-000000000005" };
const call = (extra: object = {}) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...body, ...extra }) }), { params: Promise.resolve({ id: jobId, decisionId }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  m.dismiss.mockResolvedValue({ mandatory: [{ id: "mandatory" }], metrics: { dismissed: 1 } });
  m.authorize.mockResolvedValue({ context, membershipId: "00000000-0000-4000-8000-000000000007", identityUserId: "00000000-0000-4000-8000-000000000008" });
  m.metadata.mockResolvedValue({ decisionId, ruleId: "supplier-check", ruleVersion: "supplier-check.v1",
    createdAt: "2026-04-08T10:00:00.000Z", dismissedAt: "2026-04-08T10:05:00.000Z",
    findings: [{ findingId: "00000000-0000-4000-8000-000000000006", occurredAt: "2026-04-08T10:00:00.000Z" }] });
  m.record.mockResolvedValue({ status: "accepted" });
});
afterEach(() => vi.unstubAllEnvs());
it("records stored finding, decision and reason after dismissal with stable retry identities", async () => {
  expect((await call({ reason: "duplicate" })).status).toBe(200);
  const first = m.record.mock.calls.map(c => c[2]);
  expect(first.map(c => c.event.kind)).toEqual(["finding", "decision", "resolution"]);
  expect(first[2].event).toMatchObject({ tenantId: context.tenantId, jobId, decisionId, ruleId: "supplier-check", ruleVersion: "supplier-check.v1", resolution: "dismissed", reason: "duplicate" });
  expect(first[1].event.findingIds).toEqual(["00000000-0000-4000-8000-000000000006"]);
  await call({ reason: "duplicate" });
  expect(m.record.mock.calls.slice(3).map(c => c[2])).toEqual(first);
  expect(m.dismiss).toHaveBeenCalledWith(jobId, decisionId, body);
  expect(m.metadata).toHaveBeenCalledWith(context, jobId, decisionId);
});
it("keeps no-reason dismissal and its mandatory result unchanged without recording metrics", async () => {
  expect(await (await call()).json()).toEqual({ mandatory: [{ id: "mandatory" }], metrics: { dismissed: 1 } });
  expect(m.record).not.toHaveBeenCalled(); expect(m.authorize).not.toHaveBeenCalled();
});
it.each(["invented", "", null])("rejects invalid reason %s before dismissing", async reason => {
  expect(await (await call({ reason })).json()).toEqual({ code: "INVALID_INBOX" });
  expect(m.dismiss).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
});
it.each(["tenantId", "actor", "ruleId", "findingIds", "event", "receiptId"])("rejects client authority field %s", async key => {
  expect((await call({ [key]: "forged", reason: "duplicate" })).status).toBe(400);
  expect(m.dismiss).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
});
it("does not record denied jobs or foreign decisions", async () => {
  m.dismiss.mockRejectedValue(new Error("DECISION_NOT_FOUND_FOR_JOB"));
  expect((await call({ reason: "duplicate" })).status).toBe(404);
  expect(m.record).not.toHaveBeenCalled();
});
it("reports only a fixed code when metadata or metric writes fail, keeping the dismissal successful", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    m.record.mockRejectedValueOnce(new Error("PRIVATE message tenant=secret"));
    const r = await call({ reason: "duplicate" });
    expect(r.status).toBe(200); expect(r.headers.get("x-inbox-metrics-code")).toBe("INBOX_METRICS_RECORD_FAILED");
    expect(await r.json()).toEqual({ mandatory: [{ id: "mandatory" }], metrics: { dismissed: 1 } });
    expect(log).toHaveBeenCalledExactlyOnceWith("INBOX_METRICS_RECORD_FAILED");
    m.record.mockResolvedValue({ status: "rejected", rejection: "INVALID_METRICS_REFERENCE" });
    expect((await call({ reason: "useful" })).headers.get("x-inbox-metrics-code")).toBe("INBOX_METRICS_RECORD_FAILED");
  } finally { log.mockRestore(); }
});
it("never records outside synthetic_demo", async () => {
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  await call({ reason: "duplicate" }); expect(m.record).not.toHaveBeenCalled();
});
