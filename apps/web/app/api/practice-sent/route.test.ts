import { beforeEach, expect, it, vi } from "vitest";
const stub = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), pair: vi.fn(), pool: {}, cookie: "fictional-session" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => stub.cookie ? { value: stub.cookie } : undefined }) }));
vi.mock("@jobguard/db", () => ({ authenticatePracticeSession: stub.auth, PracticeSentRepository: class { list = stub.list; } }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => stub.pool, practiceFailure: () => null }));
vi.mock("../../lib/linked-practice-entry", () => ({ enforcePracticePair: stub.pair }));
import { GET } from "./route";

const context = { tenantId: "fictional-firm" };
beforeEach(() => { vi.clearAllMocks(); stub.cookie = "fictional-session"; stub.auth.mockResolvedValue({ context, digest: "f".repeat(64) }); stub.list.mockResolvedValue([]); stub.pair.mockResolvedValue(false); });

it("lists only the server-resolved firm's sends and prevents caching", async () => {
  stub.list.mockResolvedValue([{ kind: "quote", sendId: "s1", practice: true }]);
  const response = await GET();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ items: [{ kind: "quote", sendId: "s1", practice: true }] });
  expect(stub.auth).toHaveBeenCalledWith(stub.pool, "fictional-session"); expect(stub.list).toHaveBeenCalledWith(context, "f".repeat(64));
});

it("refuses without a practice session and reads nothing", async () => {
  stub.cookie = undefined; stub.auth.mockRejectedValue(new Error("UNAUTHENTICATED"));
  expect((await GET()).status).toBe(401); expect(stub.list).not.toHaveBeenCalled();
});

it("checks a linked session's browser pairing before reading", async () => {
  await GET();
  expect(stub.pair).toHaveBeenCalledWith(stub.pool, "fictional-session");
  expect(stub.pair.mock.invocationCallOrder[0]).toBeLessThan(stub.list.mock.invocationCallOrder[0]!);
});

it("refuses a linked session whose browser pairing is missing or belongs to another browser, and reads nothing", async () => {
  // enforcePracticePair throws PracticeAccessError("UNAUTHENTICATED") for both.
  for (const reason of ["missing pairing", "another browser's pairing"]) {
    stub.pair.mockRejectedValueOnce(Object.assign(new Error(reason), { code: "UNAUTHENTICATED" }));
    expect((await GET()).status).toBe(401);
  }
  expect(stub.list).not.toHaveBeenCalled();
});

it("has no write export", async () => {
  const route = await import("./route.js");
  expect(Object.keys(route).sort()).toEqual(["GET"]);
});
