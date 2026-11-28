import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), translate: vi.fn(), workspace: vi.fn(), failure: vi.fn() }));
vi.mock("../../../../../../lib/workspace-server", () => ({ workspaceApplication: mocks.workspace }));
vi.mock("../../../../../../lib/synthetic-server", () => ({ practiceFailure: mocks.failure }));
import { CrewBriefTranslationError } from "@jobguard/db";
import { GET, POST } from "./route";
const jobId = "10000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: jobId }) };
const origin = "https://phone.fictional.invalid";
const query = "?trade=tiler&version=1&lang=pl";
const command = () => ({ version: "v2-crew-brief-translation-command.v1", commandId: crypto.randomUUID(),
  trade: "tiler", expectedVersion: 1, lang: "pl" });
const get = (search = query) => GET(new Request(`http://127.0.0.1/translation${search}`), params);
const post = (body: unknown = command(), headers: Record<string, string> = { origin }) => POST(new Request(
  "http://127.0.0.1/translation", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), params);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin); vi.stubEnv("NODE_ENV", "production");
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "CF_PAGES_URL", "AUTH_ALLOWED_ORIGIN"]) vi.stubEnv(key, "");
  mocks.workspace.mockResolvedValue({ crewBriefTranslations: mocks }); mocks.failure.mockReturnValue(null);
  mocks.read.mockResolvedValue({ content: { trade: "[pl] tiler" } }); mocks.translate.mockResolvedValue({ provider: "fake" });
});
afterEach(() => vi.unstubAllEnvs());
describe("V2-D4B translation boundary", () => {
  it.each([["0", "synthetic_demo"], ["1", "production"], ["", "synthetic_demo"]])("leaves non-V2 unchanged (%s / %s)", async (flag, mode) => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", flag); vi.stubEnv("JOBGUARD_ENV", mode);
    expect((await get()).status).toBe(404); expect((await post()).status).toBe(404); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("reads the saved revision and language without caching", async () => {
    const response = await get(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ content: { trade: "[pl] tiler" } });
    expect(mocks.read).toHaveBeenCalledWith(jobId, { version: "v2-crew-brief-translation-query.v1", trade: "tiler", expectedVersion: 1, lang: "pl" });
  });
  it("accepts the configured HTTPS origin through an internal HTTP URL", async () => {
    const input = command(); expect((await post(input)).status).toBe(200); expect(mocks.translate).toHaveBeenCalledWith(jobId, input);
  });
  it.each([{}, { origin: "https://foreign.invalid" }, { origin: "http://127.0.0.1" },
    { origin: "https://foreign.invalid", "x-forwarded-host": "phone.fictional.invalid", "x-forwarded-proto": "https" },
    { "x-forwarded-host": "phone.fictional.invalid", "x-forwarded-proto": "https" }])("refuses missing, foreign and forged origins %j", async headers => {
    expect((await post(command(), headers)).status).toBe(403); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("fails closed with no configured origin even when Origin matches the request URL", async () => {
    vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); expect((await post(command(), { origin: "http://127.0.0.1" })).status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each(["", "?trade=tiler&version=0&lang=pl", "?trade=tiler&version=1&lang=xx", "?trade=&version=1&lang=pl"])("refuses invalid queries %s", async search => {
    expect((await get(search)).status).toBe(400); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each([{ lang: "xx" }, { expectedVersion: 0 }, { actorMembershipId: jobId }, { provider: "live" }, { content: {} }])("refuses malformed commands or authority overrides %j", async patch => {
    expect((await post({ ...command(), ...patch })).status).toBe(400); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("refuses malformed JSON", async () => {
    expect((await POST(new Request("http://127.0.0.1", { method: "POST", headers: { origin }, body: "{" }), params)).status).toBe(400);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each(["CREW_BRIEF_TRANSLATION_VERSION_CONFLICT", "CREW_BRIEF_TRANSLATION_COMMAND_CONFLICT", "CREW_BRIEF_TRANSLATION_EXISTS_CONFLICT"] as const)("maps %s to conflict", async code => {
    mocks.translate.mockRejectedValue(new CrewBriefTranslationError(code)); const response = await post();
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ code });
  });
  it("refuses non-builder access on read and write", async () => {
    mocks.read.mockRejectedValue(new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_EDITOR_REQUIRED"));
    mocks.translate.mockRejectedValue(new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_EDITOR_REQUIRED"));
    expect((await get()).status).toBe(403); expect((await post()).status).toBe(403);
  });
  it.each([[401, "UNAUTHENTICATED"], [404, "NOT_FOUND"]])("preserves typed session and firm refusals %s %s", async (status, code) => {
    mocks.workspace.mockRejectedValue(new Error("private")); mocks.failure.mockImplementation(() => new Response(JSON.stringify({ code }), { status: Number(status) }));
    for (const response of [await get(), await post()]) { expect(response.status).toBe(status); expect(await response.json()).toEqual({ code }); }
  });
  it("returns 404 for an unsaved translation and never leaks exception text", async () => {
    mocks.read.mockRejectedValue(new Error("private")); mocks.failure.mockReturnValueOnce(new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 }));
    expect((await get()).status).toBe(404);
    const response = await get(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: "CREW_BRIEF_TRANSLATION_UNAVAILABLE" });
  });
});
