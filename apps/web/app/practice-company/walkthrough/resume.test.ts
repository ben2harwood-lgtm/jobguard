import { afterEach, describe, expect, it, vi } from "vitest";
import { resumeWalkthrough } from "./resume";
const own = "11111111-1111-4111-8111-111111111111", example = "22222222-2222-4222-8222-222222222222";
const capture = (jobId = own, status = "draft") => ({ version: 1, environment: "synthetic_demo", jobId,
  captureId: own, proposalId: own, reviewId: own, source: { text: "Fictional job", version: 1, kind: "text", acquisition: null, audioByteLength: 0 },
  proposal: { title: "Fictional job", lines: [], questions: [] }, review: null, status });
const params = () => new URLSearchParams({ walkJob: own, walkExample: example, step: "9" });
function server(records: Record<string, unknown>) {
  return vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (!(path in records)) throw new Error(`Unexpected read: ${path}`);
    return Response.json(records[path]);
  }));
}
afterEach(() => vi.unstubAllGlobals());
describe("WALK server-backed resume", () => {
  it("starts at step 1 only when there are no saved job selectors", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await resumeWalkthrough(new URLSearchParams("step=8"))).index).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("restores the same capture at step 2 and ignores browser step hints", async () => {
    server({ [`/api/jobs/${own}/proposal`]: capture() });
    const saved = await resumeWalkthrough(new URLSearchParams({ walkJob: own, step: "8" }));
    expect(saved.index).toBe(1); expect(saved.capture?.jobId).toBe(own);
  });
  it("resumes a live job at step 5 until proof completion is saved", async () => {
    server({ [`/api/jobs/${own}/proposal`]: capture(), [`/api/jobs/${example}/proposal`]: capture(example, "live"),
      [`/api/jobs/${example}/quotes/delivery`]: { status: "simulated_delivery" },
      [`/api/jobs/${example}/proof`]: { version: "practice-proof-view.v1", jobId: example, completion: null } });
    expect(await resumeWalkthrough(params())).toMatchObject({ prepared: example, index: 4 });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("final-check"))).toBe(false);
  });
  it.each(["pending", "failed", "completed"])("uses the saved %s check state before resuming invoicing", async state => {
    server({ [`/api/jobs/${own}/proposal`]: capture(), [`/api/jobs/${example}/proposal`]: capture(example, "live"),
      [`/api/jobs/${example}/quotes/delivery`]: { status: "simulated_delivery" },
      [`/api/jobs/${example}/proof`]: { version: "practice-proof-view.v1", jobId: example, completion: { id: own, reviewRequired: false } },
      [`/api/jobs/${example}/variations`]: { version: 1, environment: "synthetic_demo", jobId: example, baselinePence: 100000, capPence: 0, parentScopeItemId: own, approvedAdditionsPence: 12500, approvedOmissionsPence: 0, pendingExtrasPence: 0, variations: [] },
      [`/api/jobs/${example}/final-check`]: { state, items: [] },
      [`/api/jobs/${example}/customer-invoices`]: { version: 1, environment: "synthetic_demo", jobId: example, invoices: [] } });
    expect((await resumeWalkthrough(params())).index).toBe(state === "completed" ? 7 : 6);
  });
  it.each([403, 404, 503])("does not restart or create a replacement after a %s read", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status })));
    await expect(resumeWalkthrough(new URLSearchParams({ walkJob: own }))).rejects.toThrow("saved walkthrough could not load");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/jobs/${own}/proposal`, { cache: "no-store" });
  });
  it("rejects mismatched server records and malformed job selectors", async () => {
    server({ [`/api/jobs/${own}/proposal`]: capture(example) });
    await expect(resumeWalkthrough(new URLSearchParams({ walkJob: own }))).rejects.toThrow("did not match");
    await expect(resumeWalkthrough(new URLSearchParams({ walkJob: "invalid" }))).rejects.toThrow();
  });
});
