import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), mode: vi.fn() }));
vi.mock("@jobguard/api/workspace", () => ({ assertPayNowPreviewMode: m.mode,
  payNowAttemptFailure: (error: Error) => ({ status: error.message === "NOT_FOUND" ? 404 : 401, body: { code: error.message } }) }));
vi.mock("../../../../../../lib/pay-now-attempt-server", () => ({ payNowAttemptApplication: () => m }));
vi.mock("../../../../../../lib/identity-server", () => ({ identityApplication: () => ({ allowedOrigin: "https://practice.invalid" }),
  identityCredentials: async (r: Request) => ({ sessionToken: r.headers.get("cookie"), origin: r.headers.get("origin") ?? undefined }) }));
import { GET, POST } from "./route";
const params = Promise.resolve({ id: "job", invoiceId: "invoice" });
beforeEach(() => { vi.resetAllMocks(); m.read.mockResolvedValue({ options: [], attempts: [] }); m.command.mockResolvedValue({ synthetic: true }); });
it("passes only session credentials and path identity; responses are no-store", async () => {
  const response = await GET(new Request("https://practice.invalid/", { headers: { cookie: "session" } }), { params });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(m.read).toHaveBeenCalledWith({ sessionToken: "session", origin: "https://practice.invalid" }, "job", "invoice");
});
it.each([undefined, "https://foreign.invalid"])("refuses missing or hostile POST origin %s", async origin => {
  const response = await POST(new Request("https://practice.invalid/", { method: "POST", headers: origin ? { origin } : {} }), { params });
  expect(response.status).toBe(403); expect(m.command).not.toHaveBeenCalled();
});
it("passes a malformed body as null to the strict application boundary", async () => {
  await POST(new Request("https://practice.invalid/", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{" }), { params });
  expect(m.command).toHaveBeenCalledWith(expect.anything(), "job", "invoice", null);
});
it("is not found outside synthetic mode before accessing the application", async () => {
  m.mode.mockImplementation(() => { throw new Error("NOT_FOUND"); });
  for (const call of [GET, POST]) {
    const response = await call(new Request("https://practice.invalid/"), { params });
    expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(m.read).not.toHaveBeenCalled(); expect(m.command).not.toHaveBeenCalled();
});
