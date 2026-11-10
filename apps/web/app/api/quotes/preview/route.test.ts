import { beforeEach, expect, it, vi } from "vitest";
import { renderQuotePdf } from "@jobguard/core";
import { authenticatePracticeSession, PracticeAccessError } from "@jobguard/db";
import { syntheticPool } from "../../../lib/synthetic-server";
import { POST } from "./route";

const state = vi.hoisted(() => ({ session: undefined as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", async importOriginal => ({
  ...await importOriginal<typeof import("@jobguard/db")>(),
  authenticatePracticeSession: vi.fn(),
}));
vi.mock("../../../lib/synthetic-server", async importOriginal => ({
  ...await importOriginal<typeof import("../../../lib/synthetic-server")>(),
  syntheticPool: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "jg_session" && state.session ? { value: state.session } : undefined,
}) }));
vi.mock("@jobguard/core", async importOriginal => {
  const core = await importOriginal<typeof import("@jobguard/core")>();
  return { ...core, renderQuotePdf: vi.fn(core.renderQuotePdf) };
});

const session = "00000000-0000-4000-8000-000000000001";
const pool = {} as ReturnType<typeof syntheticPool>;
const fixture = () => ({
  schemaVersion: "quote-document.v1", documentVersion: 1, reference: "Q-PRACTICE",
  quoteRevisionId: session, currency: "GBP",
  issuer: { name: "Synthetic Builder", address: ["1 Fictional Road"], email: "builder@example.invalid" },
  customer: { name: "Synthetic Customer", address: ["2 Fictional Road"], email: "customer@example.invalid" },
  lines: [100, 200].map((netPence, index) => ({
    scopeItemId: `00000000-0000-4000-8000-00000000000${index + 2}`,
    description: "Practice work", quantity: "1", unit: "item", netPence,
  })),
  exclusions: [], qualifications: [], subtotalPence: 350, discountPence: 50,
  netPence: 300, taxPence: 60, totalPence: 360,
});
const request = (document: unknown = fixture()) => new Request("https://practice.invalid/api/quotes/preview", {
  method: "POST", body: JSON.stringify(document), headers: { "content-type": "application/json" },
});

beforeEach(() => {
  state.session = session;
  vi.mocked(renderQuotePdf).mockClear();
  vi.mocked(authenticatePracticeSession).mockReset();
  vi.mocked(syntheticPool).mockReset();
  vi.mocked(syntheticPool).mockReturnValue(pool);
});

it.each([undefined, "invalid-session"])("refuses session %s before reading or rendering the document", async token => {
  state.session = token;
  const input = request();
  const read = vi.spyOn(input, "json");
  const response = await POST(input);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  expect(read).not.toHaveBeenCalled();
  expect(authenticatePracticeSession).not.toHaveBeenCalled();
  expect(renderQuotePdf).not.toHaveBeenCalled();
});

it("refuses a forged UUID cookie before reading or rendering the document", async () => {
  vi.mocked(authenticatePracticeSession).mockRejectedValueOnce(new PracticeAccessError("UNAUTHENTICATED"));
  const input = request();
  const read = vi.spyOn(input, "json");
  const response = await POST(input);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  expect(authenticatePracticeSession).toHaveBeenCalledExactlyOnceWith(pool, session);
  expect(read).not.toHaveBeenCalled();
  expect(renderQuotePdf).not.toHaveBeenCalled();
});

it.each([
  { source: "authentication", error: new Error("Database connection refused"), status: 503, code: "DATABASE_UNAVAILABLE" },
  { source: "pool", error: Object.assign(new Error("Missing database"), { code: "DATABASE_UNAVAILABLE" }), status: 503, code: "DATABASE_UNAVAILABLE" },
  { source: "pool", error: Object.assign(new Error("Unavailable outside synthetic demo"), { code: "UNAUTHENTICATED" }), status: 401, code: "UNAUTHENTICATED" },
])("refuses $source failure $code before reading or rendering", async ({ source, error, status, code }) => {
  if (source === "pool") vi.mocked(syntheticPool).mockImplementationOnce(() => { throw error; });
  else vi.mocked(authenticatePracticeSession).mockRejectedValueOnce(error);
  const input = request();
  const read = vi.spyOn(input, "json");
  const response = await POST(input);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
  expect(read).not.toHaveBeenCalled();
  expect(renderQuotePdf).not.toHaveBeenCalled();
});

it.each([
  { lines: [{ ...fixture().lines[0]!, netPence: 100 }] },
  { subtotalPence: 351 },
  { discountPence: 51 },
  { netPence: 301 },
  { taxPence: 61 },
  { totalPence: 999999 },
])("rejects unreconciled totals %j before rendering", async change => {
  const response = await POST(request({ ...fixture(), ...change }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_QUOTE_DOCUMENT" });
  expect(renderQuotePdf).not.toHaveBeenCalled();
});

it("keeps malformed documents refused", async () => {
  const response = await POST(request({ lines: [] }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_QUOTE_DOCUMENT" });
  expect(renderQuotePdf).not.toHaveBeenCalled();
});

it("renders a reconciled document with the practice-session cookie as a PDF", async () => {
  const input = request();
  const read = vi.spyOn(input, "json");
  let authenticated = false;
  vi.mocked(authenticatePracticeSession).mockImplementationOnce(async () => {
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    authenticated = true;
    return {} as Awaited<ReturnType<typeof authenticatePracticeSession>>;
  });
  read.mockImplementationOnce(async () => {
    expect(authenticated).toBe(true);
    return fixture();
  });
  const response = await POST(input);
  expect(authenticatePracticeSession).toHaveBeenCalledBefore(read);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="Q-PRACTICE-v1.pdf"');
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-jobguard-processing-region")).toBe("supported-runtime");
  const pdf = await response.text();
  expect(pdf).toMatch(/^%PDF-1.4/);
  expect(pdf).toContain("TOTAL GBP 3.60");
  expect(pdf).toContain("SYNTHETIC DATA");
  expect(renderQuotePdf).toHaveBeenCalledOnce();
});
