import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ price: vi.fn(), revise: vi.fn(), basis: vi.fn(), pool: vi.fn(() => ({})) }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "11111111-1111-4111-8111-111111111111" }) }) }));
vi.mock("../../../../../../../lib/synthetic-server", () => ({ syntheticPool: h.pool }));
vi.mock("@jobguard/api/workspace", async original => ({ ...await original<typeof import("@jobguard/api/workspace")>(), ExtraPricingApplication: class { price = h.price; revise = h.revise; basis = h.basis; } }));
import { GET, POST } from "./route";
import { POST as REVISE } from "../revise/route";
const id = "11111111-1111-4111-8111-111111111111", principal = { version: "contractor-principal.v1", sessionId: id };
const basis = { kind: "server_sor", sorCode: "REPAIR-DOOR", claimedQuantity: "2" };
const price = { version: "price-extra.v2", commandId: id, basis };
const revise = { version: "revise-extra.v2", commandId: id, basis, reason: "response_to_rejection", answersRequestId: id };
const context = { params: Promise.resolve({ id, extraId: id }) };
const request = (raw: unknown, origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/contractor/jobs/${id}/site-extras/${id}/price`, { method: "POST", headers: { "content-type": "application/json", origin }, body: typeof raw === "string" ? raw : JSON.stringify(raw) });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("refuses an untrusted origin before parsing or constructing an application", async () => {
 for (const handler of [POST, REVISE]) {
  const response = await handler(request(price, "https://evil.invalid"), context);
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "extra-pricing-error.v1", code: "ORIGIN_FORBIDDEN" });
 }
 expect(h.pool).not.toHaveBeenCalled(); expect(h.price).not.toHaveBeenCalled(); expect(h.revise).not.toHaveBeenCalled();
});
it("refuses non-synthetic mode and malformed JSON before constructing the application", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production_billing");
 expect((await POST(request(price), context)).status).toBe(403); expect((await REVISE(request(revise), context)).status).toBe(403);
 expect((await GET(new Request("http://localhost:3000"), context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 expect((await POST(request("{"), context)).status).toBe(422); expect((await REVISE(request("{"), context)).status).toBe(422);
 expect(h.pool).not.toHaveBeenCalled();
});
it("passes the cookie principal, path ids and body through, uncached, and returns the database's answer", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 h.price.mockResolvedValue({ netPence: 9650 }); h.revise.mockResolvedValue({ netPence: 9650 }); h.basis.mockResolvedValue({ prices: [] });
 const priced = await POST(request(price), context);
 expect(priced.status).toBe(201); expect(priced.headers.get("cache-control")).toBe("no-store"); expect(await priced.json()).toEqual({ netPence: 9650 });
 expect(h.price).toHaveBeenCalledWith(principal, id, id, price);
 const revised = await REVISE(request(revise), context);
 expect(revised.status).toBe(201); expect(revised.headers.get("cache-control")).toBe("no-store");
 expect(h.revise).toHaveBeenCalledWith(principal, id, id, revise);
 const read = await GET(new Request("http://localhost:3000"), context);
 expect(read.status).toBe(200); expect(read.headers.get("cache-control")).toBe("no-store");
 expect(h.basis).toHaveBeenCalledWith(principal, id, id);
});
it("maps refusals to closed codes and never leaks database text", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const { ExtraApprovalError } = await import("@jobguard/db");
 h.price.mockRejectedValueOnce(new ExtraApprovalError("BASIS_REQUIRED"));
 expect(await (await POST(request(price), context)).json()).toEqual({ version: "extra-pricing-error.v1", code: "BASIS_REQUIRED" });
 h.price.mockRejectedValueOnce(new ExtraApprovalError("ALREADY_ON_ORDER"));
 expect((await POST(request(price), context)).status).toBe(409);
 h.revise.mockRejectedValueOnce(Object.assign(new Error("permission denied for table extra_pricing_basis"), { code: "42501" }));
 const leaked = await REVISE(request(revise), context);
 expect(leaked.status).toBe(503); expect(JSON.stringify(await leaked.json())).not.toContain("extra_pricing_basis");
});
