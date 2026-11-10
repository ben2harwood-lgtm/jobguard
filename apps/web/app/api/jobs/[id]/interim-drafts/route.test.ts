import { afterEach, expect, it, vi } from "vitest";
import { InterimDraftRepositoryError } from "@jobguard/db";
import { interimDraftFailure } from "../../../../../../api/src/interim-draft.application";
const mocks = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), create: vi.fn(), credentials: vi.fn() }));
vi.mock("@jobguard/api/workspace", () => ({ interimDraftFailure }));
vi.mock("../../../../lib/identity-server", () => ({ identityCredentials: mocks.credentials }));
vi.mock("../../../../lib/interim-draft-server", () => ({ interimDraftApplication: mocks.create }));
import { GET, POST } from "./route";
afterEach(() => vi.resetAllMocks());
it("passes the session credentials and untouched command with no-store", async () => {
  const credentials = { sessionToken: "secret", origin: "https://practice.invalid", csrfToken: "csrf" };
  mocks.credentials.mockResolvedValue(credentials); mocks.create.mockReturnValue(mocks);
  mocks.command.mockResolvedValue({ book: { records: [] } }); mocks.read.mockResolvedValue({ book: { records: [] } });
  const raw = { version: "interim.persist-command.v1", jobId: "job", commandId: "command", record: {} };
  const params = { params: Promise.resolve({ id: "job" }) };
  const post = await POST(new Request("https://practice.invalid", { method: "POST", body: JSON.stringify(raw) }), params);
  expect(post.status).toBe(201); expect(post.headers.get("cache-control")).toBe("no-store");
  expect(mocks.command).toHaveBeenCalledWith(credentials, "job", raw);
  const get = await GET(new Request("https://practice.invalid"), params);
  expect(get.status).toBe(200); expect(get.headers.get("cache-control")).toBe("no-store");
});
it("keeps typed conflicts, missing/foreign jobs and dark composition no-store", async () => {
  for (const [code, status] of [["CONFLICT",409],["NOT_FOUND",404],["DARK",404],["FORBIDDEN",403]] as const) {
    mocks.create.mockImplementation(() => { throw new InterimDraftRepositoryError(code); });
    for (const handler of [GET, POST]) {
      const result = await handler(new Request("https://practice.invalid"), { params: Promise.resolve({ id: "job" }) });
      expect(result.status).toBe(status); expect(result.headers.get("cache-control")).toBe("no-store");
      expect(await result.json()).toMatchObject({ code: `INTERIM_DRAFT_${code}` });
    }
  }
  expect(mocks.credentials).not.toHaveBeenCalled();
});
it.each([["FORBIDDEN",403],["UNAUTHENTICATED",401],["JOB_NOT_LIVE",409],["UNAVAILABLE",503]] as const)("returns %s through GET and POST without turning refusal into retry", async (code, status) => {
  mocks.create.mockReturnValue(mocks);
  mocks.read.mockRejectedValue(new InterimDraftRepositoryError(code));
  mocks.command.mockRejectedValue(new InterimDraftRepositoryError(code));
  for (const handler of [GET, POST]) {
    const response = await handler(new Request("https://practice.invalid", { method: handler === POST ? "POST" : "GET", ...(handler === POST ? { body: "{}" } : {}) }), { params: Promise.resolve({ id: "job" }) });
    expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
    const answer = await response.json();
    if (status !== 503) expect(answer.message).not.toMatch(/retry/iu);
    if (status === 403) expect(answer.message).toBe("You don't have permission.");
  }
});
