import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approvedExtraDone, finalCheckDone, restoreProgress, stages, VoiceJourney } from "./voice-journey";
const memo = vi.hoisted(() => ({ steps: [] as import("../../ui/walkthrough/walkthrough").WalkthroughStep[] }));
vi.mock("react", async original => ({ ...await original<typeof React>(), useMemo: (factory: () => unknown) => {
  const result = factory();
  if (Array.isArray(result) && result[0]?.id === "walk-1") memo.steps = result;
  return result;
} }));
vi.stubGlobal("React", React);
describe("WALK-3 honest journey boundaries", () => {
  it("keeps nine stages and names the prepared-job and acceptance limitations", () => {
    expect(stages).toHaveLength(9);
    for (const index of [2, 3, 6]) expect(stages[index]![1]).toContain("This part uses a prepared example job");
    expect(stages[2]![1]).toContain("prerequisite still to build");
    expect(stages[3]![1]).toContain("not an authenticated customer response");
    expect(stages[5]![1]).toContain("builder's practice attestation");
    expect(stages[6]![1]).toContain("No finding is promised");
    expect(stages[7]![1]).toContain("not bank-confirmed");
  });
  it("renders an empty starting screen without customer, payment or completion claims", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const html = renderToStaticMarkup(<VoiceJourney />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).toContain("Do not enter real customer names");
    expect(html).toContain("instead of recording audio");
    expect(html).not.toContain("value-invoiced-gross");
    expect(html).not.toContain("Tour complete");
    expect(html).not.toContain("prepared example · simulated customer");
    vi.unstubAllGlobals(); vi.stubGlobal("React", React);
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal("React", React); });
const jobId = "00000000-0000-4000-8000-000000000001";
const preparedId = "00000000-0000-4000-8000-000000000002";
const capture = (id = jobId) => ({ version: 1, environment: "synthetic_demo", captureId: id, jobId: id, proposalId: id, reviewId: id, source: { text: "fictional", version: 1, kind: "text", acquisition: null, audioByteLength: 0 }, proposal: { title: "fictional", lines: [], questions: [] }, review: null, status: "quoting" });
const quote = (id = jobId, revisions = true) => ({ version: 1, environment: "synthetic_demo", jobId: id, scope: [], draft: null, revisions: revisions ? [{ id, revision: 1, previousRevisionId: null, netPence: 0, taxPence: 0, totalPence: 0, issuable: true, blockers: [], lines: [] }] : [] });
const saved = () => JSON.stringify({ jobId, prepared: preparedId, priced: true });
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
describe("WALK-TOUR-FIXES completion and reload", () => {
  it.each([["£150.00", true], ["£125.00", true], ["£0.00", false], ["", false], ["Pending", false]])("approved additions %s complete step 6: %s", (amount, done) => {
    vi.stubGlobal("document", { getElementById: () => ({ querySelector: () => ({ textContent: amount }) }) });
    expect(approvedExtraDone()).toBe(done);
  });
  it.each([["JobGuard's final check found 2 possible extras.", true], ["JobGuard's final check found nothing missing from your bill.", true], ["Final check queued", false], ["", false]])("Final Check result %s completes step 7: %s", (status, done) => {
    vi.stubGlobal("document", { getElementById: () => ({ querySelector: () => ({ textContent: status }) }) });
    expect(finalCheckDone()).toBe(done);
  });
  it("points the empty voice box to Show me's sample", () => {
    expect(stages[0][1]).toContain("Type it in, or press Show me to see a sample.");
  });
  it("restores verified capture, quote flag and accessible prepared identity from server reads", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(capture())).mockResolvedValueOnce(response(quote())).mockResolvedValueOnce(response(capture(preparedId)));
    vi.stubGlobal("fetch", fetcher);
    expect(await restoreProgress(saved())).toEqual({ capture: capture(), priced: true, prepared: preparedId, initialStep: 2 });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([`/api/jobs/${jobId}/proposal`, `/api/jobs/${jobId}/quotes`, `/api/jobs/${preparedId}/proposal`]);
    expect(fetcher.mock.calls.every(call => call[1].cache === "no-store")).toBe(true);
  });
  it.each([response(null, false), response(quote(jobId, false)), response(quote(preparedId)), response({ bad: true })])("drops an unverified pricing flag and dependent prepared job", async invalid => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(capture())).mockResolvedValueOnce(invalid));
    expect(await restoreProgress(saved())).toEqual({ capture: capture(), priced: false, prepared: "", initialStep: 1 });
  });
  it("drops an inaccessible prepared job without losing the verified own draft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(capture())).mockResolvedValueOnce(response(quote())).mockResolvedValueOnce(response(null, false)));
    expect(await restoreProgress(saved())).toEqual({ capture: capture(), priced: true, prepared: "", initialStep: 2 });
  });
  it.each([response(null, false), response(capture(preparedId)), response({ bad: true })])("drops all flags when the saved capture cannot be verified", async invalid => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(invalid));
    expect(await restoreProgress(saved())).toBeNull();
  });
  it.each([null, "bad json", '{}', JSON.stringify({ jobId: "../other", prepared: "", priced: true })])("ignores malformed progress %s without fetching", async raw => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await restoreProgress(raw)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("drops all flags on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await restoreProgress(saved())).toBeNull();
  });
});

it("step 3 lights the prepared handover control before screen actions begin", () => {
  const prepare = {};
  vi.stubGlobal("document", { getElementById: (id: string) => id === "walk-prepare" ? prepare : { querySelector: () => null } });
  renderToStaticMarkup(<VoiceJourney />);
  expect(memo.steps[2]!.target).toBe("#walk-prepare, #walk-screen");
  expect(memo.steps[2]!.spotlightTarget!()).toBe(prepare);
  expect(memo.steps[5]!.isDone).toBe(approvedExtraDone);
  expect(memo.steps[6]!.isDone).toBe(finalCheckDone);
});

it.each([["accepted", 3], ["live", 4], ["invoiced", 4], ["paid", 4]])("resumes %s examples only as far as their verified lifecycle allows", async (status, initialStep) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(capture())).mockResolvedValueOnce(response(quote())).mockResolvedValueOnce(response({ ...capture(preparedId), status })));
  expect((await restoreProgress(saved()))?.initialStep).toBe(initialStep);
});
