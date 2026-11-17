import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteApplicationError } from "@jobguard/api/workspace";

const { cookie, session, workspace, save, failure } = vi.hoisted(() => ({
  cookie: vi.fn(), session: vi.fn(), workspace: vi.fn(), save: vi.fn(), failure: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("@jobguard/api/workspace", () => ({
  QuoteApplicationError: class extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));
vi.mock("../../../../lib/synthetic-server", () => ({ hasSyntheticSession: session, practiceFailure: failure }));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";

const jobId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: jobId }) };
const input = {
  contractVersion: "quote_draft_command_v1", draftId: jobId, expectedRevision: 0,
  currency: "GBP", taxPolicyVersion: "fixture-policy", blockingQuestions: [],
  lines: [{
    id: jobId, scopeItemId: jobId, scopeRevisionId: jobId, description: "Fictional wall",
    origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item",
    unitRatePence: 100, discountPercent: "0", taxTreatment: "standard_rate_20",
    rateProvenance: "entered", category: null, region: null,
  }],
};
const request = (body = JSON.stringify(input)) => new Request("https://fictional.invalid/api/jobs/job/quotes", { method: "POST", body });

beforeEach(() => {
  vi.resetAllMocks();
  cookie.mockReturnValue({ value: jobId });
  session.mockReturnValue(true);
  workspace.mockResolvedValue({ quote: { save } });
  failure.mockReturnValue(null);
});

describe("quote-save session refusal ordering", () => {
  it.each([
    ["valid", JSON.stringify(input)], ["malformed", "{"], ["empty", ""], ["rejecting", undefined],
  ])("refuses an absent or rejected session before reading a %s body", async (_label, body) => {
    for (const value of [undefined, "unaccepted-session"]) {
      cookie.mockReturnValue(value ? { value } : undefined);
      session.mockReturnValue(false);
      const req = request(body);
      const json = vi.spyOn(req, "json");
      if (body === undefined) json.mockRejectedValue(new Error("body must remain unread"));
      const response = await POST(req, params);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
      expect(session).toHaveBeenLastCalledWith(value);
      expect(json).not.toHaveBeenCalled();
      expect(workspace).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    }
  });

  it.each(["{", ""])("passes malformed/empty JSON as null to existing validation (%j)", async body => {
    save.mockRejectedValue(new QuoteApplicationError("INVALID_QUOTE"));
    const response = await POST(request(body), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_QUOTE" });
    expect(save).toHaveBeenCalledExactlyOnceWith(jobId, null);
  });

  it("passes structurally invalid JSON unchanged to service validation", async () => {
    save.mockRejectedValue(new QuoteApplicationError("INVALID_QUOTE"));
    const response = await POST(request('{"expectedRevision":"invalid"}'), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_QUOTE" });
    expect(save).toHaveBeenCalledExactlyOnceWith(jobId, { expectedRevision: "invalid" });
  });

  it("keeps the valid save input and result", async () => {
    const receipt = { version: 1, environment: "synthetic_demo", jobId, draft: { revision: 1 } };
    save.mockResolvedValue(receipt);
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(save).toHaveBeenCalledExactlyOnceWith(jobId, input);
  });

  it.each([
    ["QUOTE_REVISION_CONFLICT", 409], ["NOT_FOUND", 503],
  ] as const)("preserves %s mapping", async (code, status) => {
    save.mockRejectedValue(new QuoteApplicationError(code));
    const response = await POST(request(), params);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
    expect(save).toHaveBeenCalledExactlyOnceWith(jobId, input);
  });

  it.each([401, 403, 404])("preserves practice access refusal %s", async status => {
    const error = new Error("access refused");
    const denied = Response.json({ code: "ACCESS_REFUSED" }, { status });
    save.mockRejectedValue(error);
    failure.mockReturnValue(denied);
    expect(await POST(request(), params)).toBe(denied);
    expect(failure).toHaveBeenCalledExactlyOnceWith(error);
  });

  it.each(["workspace", "save"])("maps unknown %s failure to 503", async source => {
    const error = new Error("unavailable");
    if (source === "workspace") workspace.mockRejectedValue(error);
    else save.mockRejectedValue(error);
    const response = await POST(request(), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "DATABASE_UNAVAILABLE" });
  });
});
