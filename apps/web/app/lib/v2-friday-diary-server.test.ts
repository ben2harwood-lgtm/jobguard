import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn(), diary: vi.fn(), share: vi.fn(),
  credentials: {} as Record<string, string> }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "practice-credential" }) }) }));
vi.mock("./identity-server", () => ({ identityCredentials: async () => state.credentials,
  identityApplication: () => ({ allowedOrigin: "https://phone.invalid", session: state.session,
    provider: { authenticate: state.authenticate, findMembership: state.findMembership } }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/api/workspace", async importOriginal => ({ ...await importOriginal<typeof import("@jobguard/api/workspace")>(),
  FridayUpdateApplication: class { diary = state.diary; share = state.share; } }));
import { DiaryShareError } from "@jobguard/db";
import { fridayUpdateRequest } from "./v2-friday-update-server";
const tenant = "00000000-0000-4000-8000-000000000001";
const job = "00000000-0000-4000-8000-000000000002";
const csrf = "c".repeat(24);
const body = { version: "v2-diary-share-command.v1", commandId: job, diaryEntryId: tenant, shared: true };
const url = `http://127.0.0.1:3400/api/jobs/${job}/friday-update/diary`;
const post = (payload: unknown = body) => new Request(url, { method: "POST", headers: { origin: "https://phone.invalid" }, body: JSON.stringify(payload) });
beforeEach(() => {
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", "https://phone.invalid");
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: csrf };
  state.session.mockResolvedValue({ csrfToken: csrf, memberships: [{ id: tenant, tenantId: tenant, role: "owner" }] });
  state.authenticate.mockResolvedValue(Object.defineProperty({ identityUserId: tenant, sessionId: job, csrfToken: csrf }, "sessionCredential",
    { value: createHmac("sha256", "fictional-test-secret").update("session").digest("hex") }));
  state.findMembership.mockResolvedValue({ id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner" });
  state.diary.mockResolvedValue([]); state.share.mockResolvedValue({ diaryEntryId: tenant, shared: true, sequence: 1 });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("V2-DV1 diary marks route", () => {
  it("reads the week's notes and records a mark behind the K3 gates", async () => {
    const read = await fridayUpdateRequest(new Request(`${url}?week=2026-11-23`), job, "diary");
    expect(read.status).toBe(200); expect(state.diary).toHaveBeenCalledWith(job, { week: "2026-11-23" });
    const marked = await fridayUpdateRequest(post(), job, "diary");
    expect(marked.status).toBe(200); expect(state.share).toHaveBeenCalledWith(job, body);
    expect(marked.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses a body with diary text, a query on POST and a non-Monday week", async () => {
    expect((await fridayUpdateRequest(post({ ...body, text: "x" }), job, "diary")).status).toBe(400);
    expect((await fridayUpdateRequest(new Request(url + "?x=1", { method: "POST", headers: { origin: "https://phone.invalid" }, body: JSON.stringify(body) }), job, "diary")).status).toBe(400);
    expect((await fridayUpdateRequest(new Request(`${url}?week=2026-11-24`), job, "diary")).status).toBe(400);
    expect(state.share).not.toHaveBeenCalled();
  });
  it("maps conflict to 409, a foreign note or job to 404, and hides other errors", async () => {
    state.share.mockRejectedValueOnce(new DiaryShareError("DIARY_SHARE_COMMAND_CONFLICT"));
    expect(await (await fridayUpdateRequest(post(), job, "diary")).json()).toEqual({ code: "DIARY_SHARE_COMMAND_CONFLICT" });
    state.share.mockRejectedValueOnce(new DiaryShareError("NOT_FOUND"));
    expect((await fridayUpdateRequest(post(), job, "diary")).status).toBe(404);
    state.diary.mockRejectedValueOnce(Object.assign(new Error("JOB_SOURCE_FORBIDDEN"), { code: "JOB_SOURCE_FORBIDDEN" }));
    expect((await fridayUpdateRequest(new Request(`${url}?week=2026-11-23`), job, "diary")).status).toBe(404);
    state.diary.mockRejectedValueOnce(new Error("Tiles delivered secret"));
    const hidden = await fridayUpdateRequest(new Request(`${url}?week=2026-11-23`), job, "diary");
    expect(hidden.status).toBe(503); expect(JSON.stringify(await hidden.json())).not.toMatch(/Tiles/u);
  });
  it("refuses outside V2, without an owner and with bad CSRF", async () => {
    state.credentials.csrfToken = "wrong";
    expect((await fridayUpdateRequest(post(), job, "diary")).status).toBe(404);
    state.session.mockResolvedValueOnce({ memberships: [] });
    expect((await fridayUpdateRequest(new Request(`${url}?week=2026-11-23`), job, "diary")).status).toBe(404);
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    expect((await fridayUpdateRequest(new Request(`${url}?week=2026-11-23`), job, "diary")).status).toBe(404);
    expect(state.share).not.toHaveBeenCalled(); expect(state.diary).not.toHaveBeenCalled();
  });
});
