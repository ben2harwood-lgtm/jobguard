import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), plan: vi.fn(), generate: vi.fn(), exportInternal: vi.fn(), workspace: vi.fn(), failure: vi.fn() }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: mocks.workspace }));
vi.mock("../../../../../lib/synthetic-server", () => ({ practiceFailure: mocks.failure }));
import { CrewBriefError, WorkPlanError } from "@jobguard/db";
import { GET, POST } from "./route";

const jobId = "10000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: jobId }) };
const origin = "https://phone.fictional.invalid";
const get = (query = "") => GET(new Request(`http://127.0.0.1:3400/crew-briefs${query}`), params);
const command = () => ({ version: "v2-crew-brief-command.v1", commandId: crypto.randomUUID(), trade: "tiler",
  expectedVersion: 0, accessWindow: "Weekday mornings", photoIds: [] });
const post = (body: unknown, headers: Record<string, string> = { origin }) => POST(new Request("http://127.0.0.1:3400/crew-briefs", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers },
}), params);
const brief = (trade = "tiler") => ({ trade, version: 1, content: { trade, accessWindow: "Mornings", tasks: [], photos: [], proofNeeded: [] } });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin); vi.stubEnv("NODE_ENV", "production");
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "CF_PAGES_URL", "AUTH_ALLOWED_ORIGIN"]) vi.stubEnv(key, "");
  mocks.workspace.mockResolvedValue({ crewBriefs: mocks, workPlan: { read: mocks.plan } });
  mocks.plan.mockResolvedValue({ tasks: [{ trade: "tiler" }, { trade: "decorator" }, { trade: "tiler" }] });
  mocks.read.mockResolvedValue([]); mocks.generate.mockResolvedValue(brief()); mocks.failure.mockReturnValue(null);
  mocks.exportInternal.mockResolvedValue(JSON.stringify({ version: "v2-crew-brief-export.v1", brief: brief().content }));
});
afterEach(() => vi.unstubAllEnvs());

describe("V2-D5B-B crew briefs boundary", () => {
  it.each([["0", "synthetic_demo"], ["1", "production"], ["", "synthetic_demo"]])("leaves non-V2 requests unavailable (%s / %s)", async (flag, mode) => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", flag); vi.stubEnv("JOBGUARD_ENV", mode);
    for (const response of [await get(), await get("?trade=tiler&export=internal"), await post(command())]) {
      expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("does not offer a trade whose only tasks are approved extras, which the brief generator cannot make", async () => {
    mocks.plan.mockResolvedValue({ tasks: [{ trade: "tiler", scopeItemId: "q1" }, { trade: "electrician", scopeItemId: "x1" },
      { trade: "decorator", scopeItemId: "x1" }, { trade: "decorator", scopeItemId: "q2" }],
    scopeItems: [{ scopeItemId: "q1" }, { scopeItemId: "q2" }, { scopeItemId: "x1", variationRevisionId: "r1" }] });
    expect(await (await get()).json()).toEqual({ trades: ["tiler", "decorator"], briefs: [] });
  });
  it("discovers two trades in plan order before any briefs exist, without returning the plan's other fields", async () => {
    mocks.plan.mockResolvedValue({ tasks: [{ trade: "tiler", amount: 123 }, { trade: "decorator" }, { trade: "tiler" }], hidden: "excluded" });
    const response = await get();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ trades: ["tiler", "decorator"], briefs: [] });
    expect(mocks.plan).toHaveBeenCalledWith(jobId, { version: "work-plan-query.v1" });
    expect(mocks.read).toHaveBeenCalledWith(jobId, { version: "v2-crew-brief-query.v1" });
  });
  it("maps no quote to the screen's empty state", async () => {
    mocks.plan.mockRejectedValue(new WorkPlanError("QUOTE_REVISION_NOT_FOUND"));
    const response = await get(); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ trades: [], briefs: [], code: "QUOTE_REVISION_NOT_FOUND" });
  });
  it("keeps a generated brief and a brief for a trade dropped from the plan", async () => {
    mocks.read.mockResolvedValue([brief(), brief("plumber")]);
    expect(await (await get()).json()).toEqual({ trades: ["tiler", "decorator"], briefs: [brief(), brief("plumber")] });
  });
  it("passes a trade filter to D4 while preserving plan order", async () => {
    mocks.read.mockResolvedValue([brief("decorator")]);
    expect(await (await get("?trade=decorator")).json()).toEqual({ trades: ["decorator"], briefs: [brief("decorator")] });
    expect(mocks.read).toHaveBeenCalledWith(jobId, { version: "v2-crew-brief-query.v1", trade: "decorator" });
  });
  it("downloads D4's exact internal JSON as an uncached attachment without reading the plan or generating", async () => {
    const response = await get("?trade=tiler&export=internal");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.text()).toBe(await mocks.exportInternal.mock.results[0]!.value);
    expect(mocks.exportInternal).toHaveBeenCalledWith(jobId, "tiler");
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each(["?export=internal", "?trade=&export=internal", "?trade=tiler&export=public", `?trade=${"x".repeat(101)}`])("refuses invalid query %s", async query => {
    expect((await get(query)).status).toBe(400); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("accepts the configured phone origin through an internal HTTP request URL and preserves the command", async () => {
    const input = command(); const response = await post(input);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.generate).toHaveBeenCalledWith(jobId, input);
    expect(await response.json()).toEqual(brief());
  });
  it.each([{}, { origin: "https://foreign.invalid" }, { origin: "http://127.0.0.1:3400" },
    { origin: "https://foreign.invalid", "x-forwarded-host": "phone.fictional.invalid", "x-forwarded-proto": "https" },
    { "x-forwarded-host": "phone.fictional.invalid", "x-forwarded-proto": "https" }])("refuses missing, foreign and forged origins %j", async headers => {
    expect((await post(command(), headers)).status).toBe(403); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("fails closed with no configured origin even when Origin matches the internal request URL", async () => {
    vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "");
    expect((await post(command(), { origin: "http://127.0.0.1:3400" })).status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each([{}, { ...command(), expectedVersion: -1 }, { ...command(), tenantId: jobId },
    { ...command(), actorMembershipId: jobId }, { ...command(), photoIds: ["invalid"] }])("refuses malformed commands and authority overrides", async input => {
    expect((await post(input)).status).toBe(400); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("refuses malformed JSON before calling the application", async () => {
    const response = await POST(new Request("http://127.0.0.1:3400", { method: "POST", headers: { origin }, body: "{" }), params);
    expect(response.status).toBe(400); expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each([["CREW_BRIEF_VERSION_CONFLICT", 409], ["CREW_BRIEF_COMMAND_CONFLICT", 409],
    ["CREW_BRIEF_EDITOR_REQUIRED", 403], ["CREW_BRIEF_ACCEPTED_PLAN_REQUIRED", 400]] as const)("passes %s as a code", async (code, status) => {
    mocks.generate.mockRejectedValue(new CrewBriefError(code));
    const response = await post(command()); expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
  });
  it("preserves access failures from D4 on read, generate and export", async () => {
    const denied = new Error("private session details"); mocks.workspace.mockRejectedValue(denied);
    mocks.failure.mockImplementation(() => new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
      status: 401, headers: { "cache-control": "no-store" },
    }));
    for (const response of [await get(), await post(command()), await get("?trade=tiler&export=internal")]) {
      expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
    }
    expect(mocks.failure).toHaveBeenCalledWith(denied);
  });
  it("does not mistake other plan failures for an empty job or leak unexpected exception details", async () => {
    mocks.plan.mockRejectedValue(new WorkPlanError("WORK_PLAN_TEMPLATE_UNAVAILABLE"));
    expect(await (await get()).json()).toEqual({ code: "WORK_PLAN_TEMPLATE_UNAVAILABLE" });
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.workspace.mockRejectedValue(new Error("secret stack trace"));
    for (const response of [await get(), await post(command()), await get("?trade=tiler&export=internal")]) {
      expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ code: "CREW_BRIEFS_UNAVAILABLE" });
    }
  });
});
