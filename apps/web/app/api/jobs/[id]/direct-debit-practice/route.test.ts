import { expect, it, vi, afterEach } from "vitest";
const work = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/direct-debit-practice-server", () => ({ directDebitPractice: work }));
vi.mock("@jobguard/api/direct-debit-practice", async () => import("../../../../../../api/src/fee-collection/direct-debit-practice.application.js"));
import { GET, POST } from "./route";
const params = { params: Promise.resolve({ id: "10000000-0000-4000-8000-000000000001" }) };
const url = "http://localhost:3000/api/jobs/10000000-0000-4000-8000-000000000001/direct-debit-practice";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("requires a trusted configured origin, never trusts Host or tenant selectors, and does not call the application", async () => {
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.invalid");
  for (const origin of [undefined, "https://evil.invalid"]) {
    expect((await POST(new Request(url, { method: "POST", headers: origin ? { origin } : {}, body: "{}" }), params)).status).toBe(403);
  }
  expect((await GET(new Request(url, { headers: { "x-tenant-id": "foreign" } }), params)).status).toBe(404);
  expect((await GET(new Request(url + "?mandate=foreign"), params)).status).toBe(404);
  expect(work).not.toHaveBeenCalled();
});
it("returns no-store for reads, commands and sanitized failures", async () => {
  work.mockResolvedValue({ history: [] });
  const get = await GET(new Request(url), params);
  expect(get.headers.get("cache-control")).toBe("no-store");
  const body = { version: "debit-practice-action.v1", step: 0 };
  expect((await POST(new Request(url, { method: "POST", headers: { origin: "http://localhost:3000" }, body: JSON.stringify(body) }), params)).status).toBe(200);
  expect(work).toHaveBeenLastCalledWith((await params.params).id, body);
  work.mockRejectedValue(new Error("private signing material"));
  const failure = await GET(new Request(url), params);
  expect(failure.status).toBe(503); expect(await failure.json()).toEqual({ code: "DD_UNAVAILABLE" });
  expect(failure.headers.get("cache-control")).toBe("no-store");
});
