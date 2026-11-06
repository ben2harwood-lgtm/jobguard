import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), mode: vi.fn() }));
vi.mock("@jobguard/api/workspace", async original => ({
  ...await original<typeof import("@jobguard/api/workspace")>(), assertPayNowPreviewMode: m.mode,
}));
vi.mock("../../../../../../lib/pay-now-attempt-server", () => ({ payNowAttemptApplication: () => m }));
vi.mock("../../../../../../lib/identity-server", () => ({ identityApplication: () => ({ allowedOrigin: "https://practice.invalid" }),
  identityCredentials: async (r: Request) => ({ sessionToken: r.headers.get("cookie"), origin: r.headers.get("origin") ?? undefined }) }));
import { PayNowAttemptError } from "@jobguard/db";
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
  m.mode.mockImplementation(() => { throw new PayNowAttemptError("NOT_FOUND"); });
  for (const call of [GET, POST]) {
    const response = await call(new Request("https://practice.invalid/"), { params });
    expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(m.read).not.toHaveBeenCalled(); expect(m.command).not.toHaveBeenCalled();
});

it.each([["FORBIDDEN",403],["UNAUTHENTICATED",401],["UNAVAILABLE",503],["NOT_FOUND",404]] as const)(
  "returns %s as %i through GET and POST", async (code,status) => {
    m.read.mockRejectedValue(new PayNowAttemptError(code));
    m.command.mockRejectedValue(new PayNowAttemptError(code));
    for(const call of [GET,POST]){
      const response=await call(new Request("https://practice.invalid/", {
        method: call===GET?"GET":"POST", headers:{origin:"https://practice.invalid"},
      }),{params});
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({version:"pay-now-preview-error.v1",code});
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
