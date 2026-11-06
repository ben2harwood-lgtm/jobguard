import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), credentials: vi.fn(), origin: vi.fn() }));
vi.mock("@jobguard/api/workspace", async () => import("../../../../../../api/src/retention-record.application.js"));
vi.mock("../../../../lib/retention-record-server", () => ({ retentionRecordApplication: () => ({ read: state.read, command: state.command }) }));
vi.mock("../../../../lib/identity-server", () => ({ identityCredentials: state.credentials, identityApplication: () => ({ allowedOrigin: "https://company.invalid", requireOrigin: state.origin }) }));
import { AuthError } from "../../../../../../api/src/auth/auth-provider.js";
import { RetentionRecordRepositoryError } from "@jobguard/db";
import { GET, POST } from "./route";
const job = "00000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id: job }) };
const url = `https://company.invalid/api/jobs/${job}/retention-records`;
beforeEach(() => {
  state.credentials.mockImplementation(async (request: Request) => ({ sessionToken: "session", origin: request.headers.get("origin"), csrfToken: "csrf" }));
  state.origin.mockImplementation((origin: string) => { if (origin !== "https://company.invalid") throw new AuthError("ORIGIN_FORBIDDEN"); });
  state.read.mockResolvedValue({ book: { records: [] } }); state.command.mockResolvedValue({ book: { records: [] } });
});
afterEach(() => vi.resetAllMocks());
it("passes raw commands and session credentials, derives only the safe GET origin and never caches", async () => {
  const get = await GET(new Request(url), params);
  expect(get.status).toBe(200); expect(get.headers.get("cache-control")).toBe("no-store");
  expect(state.read).toHaveBeenCalledWith(expect.objectContaining({ origin: "https://company.invalid", sessionToken: "session" }), job);
  const raw = { version: "retention-record-command.v1", jobId: job, commandId: job, record: {} };
  const result = await POST(new Request(url, { method: "POST", headers: { origin: "https://company.invalid" }, body: JSON.stringify(raw) }), params);
  expect(result.status).toBe(201); expect(result.headers.get("cache-control")).toBe("no-store");
  expect(state.command).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: "session" }), job, raw);
});
it.each([undefined, "https://foreign.invalid"])("requires a trusted browser origin for POST: %s", async origin => {
  const response = await POST(new Request(url, { method: "POST", headers: origin ? { origin } : {}, body: "{}" }), params);
  expect(response.status).toBe(403); expect(state.command).not.toHaveBeenCalled();
});
it.each(["RETENTION_DARK", "RETENTION_NOT_FOUND"] as const)("preserves %s as an uncached not-found response", async code => {
  state.read.mockRejectedValue(new RetentionRecordRepositoryError(code));
  const response = await GET(new Request(url), params);
  expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store");
});

it.each([["RETENTION_FORBIDDEN",403], ["RETENTION_UNAUTHENTICATED",401], ["RETENTION_UNAVAILABLE",503]] as const)("returns uncached %s for reads and writes", async (code, status) => {
 state.read.mockRejectedValue(new RetentionRecordRepositoryError(code));
 state.command.mockRejectedValue(new RetentionRecordRepositoryError(code));
 for (const response of [await GET(new Request(url),params), await POST(new Request(url,{method:"POST",headers:{origin:"https://company.invalid"},body:"{}"}),params)]) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json(); expect(body.code).toBe(code);
  if (status === 403) expect(body.message).toBe("You don't have permission.");
  expect(body.message).not.toMatch(/uncertain|retry/iu);
 }
});
