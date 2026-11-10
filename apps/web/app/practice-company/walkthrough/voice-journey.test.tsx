import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as screenActions from "./screen-actions";
import { missedWorkDiary, missedWorkSaved, saveMissedWork, priceFoundExtra, addOnSiteEvidence, evidenceDone, approvedExtraDone, finalCheckDone, restoreProgress, stageWords, ownJobAction, stages, VoiceJourney } from "./voice-journey";
const memo = vi.hoisted(() => ({ steps: [] as import("../../ui/walkthrough/walkthrough").WalkthroughStep[], states: null as unknown[] | null, cursor: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, useState: (initial: unknown) => memo.states && memo.cursor < memo.states.length ? [memo.states[memo.cursor++], vi.fn()] : actual.useState(initial), useMemo: (factory: () => unknown) => {
    const result = factory();
    if (Array.isArray(result) && result[0]?.id === "walk-1") memo.steps = result;
    return result;
  } };
});
vi.mock("../../ui/workspace-shell", () => ({ WorkspaceShell: ({ jobId }: { jobId: string }) => <section data-workspace-job={jobId} /> }));
vi.mock("../../ui/job-value", () => ({ ValuePage: ({ jobId }: { jobId: string }) => <section data-value-job={jobId} /> }));
vi.stubGlobal("React", React);
describe("WALK-3 honest journey boundaries", () => {
  it("keeps nine stages and names the prepared-job and acceptance limitations", () => {
    expect(stages).toHaveLength(9);
    for (const index of [2, 3, 6, 8]) {
      expect(stageWords(index, "")).not.toContain("prepared");
      expect(stageWords(index, preparedId)).toContain("This part uses a prepared example job");
    }
    expect(stages[2]![1]).toContain("invitation is still to build");
    expect(stages[3]![1]).toContain("not an authenticated customer response");
    expect(stages[5]![1]).toContain("builder's practice attestation");
    expect(stages[4]![1]).toContain("forget to add it to the bill");
    expect(stages[6]![1]).toContain("JobGuard checks your records against the bill");
    expect(stages[7]![1]).toContain("awaiting customer approval");
    expect(stages[7]![1]).toContain("no supplementary invoice");
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
  expect(memo.steps[6]!.target).toBe("#final-check");
  expect(memo.steps[7]!.target).toBe("#final-check");
});

it.each([["accepted", 3], ["live", 4], ["invoiced", 4], ["paid", 4]])("resumes %s examples only as far as their verified lifecycle allows", async (status, initialStep) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(capture())).mockResolvedValueOnce(response(quote())).mockResolvedValueOnce(response({ ...capture(preparedId), status })));
  expect((await restoreProgress(saved()))?.initialStep).toBe(initialStep);
});


describe("step 5 saved evidence", () => {
  function proofScreen(initial: number) {
    let state = initial;
    const names = ["Attach generated practice image", "Check file integrity", "Complete this stage"];
    const clicks: string[] = [];
    const buttons = names.map((textContent, index) => ({
      textContent, get disabled() { return state !== index; }, closest: () => null,
      getClientRects: () => [{}], setAttribute: vi.fn(), scrollIntoView: vi.fn(),
      click: () => { clicks.push(textContent); state = index + 1; },
    }));
    const root = {
      querySelectorAll: () => buttons,
      querySelector: (selector: string) => selector === '.proof-actions button:not(:disabled)'
        ? buttons.find(button => !button.disabled) ?? null
        : { textContent: selector.includes('stage-status') ? state === 3 ? "Complete" : "In progress"
          : selector.includes('stage-review') ? ""
          : ["Not attached", "Uploading", "File integrity checked · synthetic example", "File integrity checked · synthetic example"][state] ?? "" },
    };
    vi.stubGlobal("document", { getElementById: () => root, querySelectorAll: () => [] });
    return { clicks, load: (next: number) => { state = next; } };
  }
  it.each([0, 1, 2, 3])("uses only remaining proof controls from saved state %s", async state => {
    const proof = proofScreen(state);
    await addOnSiteEvidence({} as HTMLElement, new AbortController().signal);
    expect(proof.clicks).toEqual(["Attach generated practice image", "Check file integrity", "Complete this stage"].slice(state));
    expect(evidenceDone()).toBe(true);
  });
  it.each([1, 2, 3])("observes saved state %s arriving after Show me starts", async state => {
    const proof = proofScreen(-1);
    const action = addOnSiteEvidence({} as HTMLElement, new AbortController().signal);
    proof.load(state);
    await action;
    expect(proof.clicks).toEqual(["Attach generated practice image", "Check file integrity", "Complete this stage"].slice(state));
    expect(evidenceDone()).toBe(true);
  });
  it.each(["In progress", "Complete"]) ("does not accept %s without checked proof", status => {
    vi.stubGlobal("document", { getElementById: () => ({ querySelector: (selector: string) => ({ textContent: selector.includes('stage-status') ? status : "Uploading" }) }) });
    expect(evidenceDone()).toBe(false);
  });
  it("does not accept completed history whose proof needs review", () => {
    vi.stubGlobal("document", { getElementById: () => ({ querySelector: (selector: string) => ({ textContent: selector.includes('stage-status') ? "Complete" : selector.includes('stage-review') ? "Proof needs review" : "File integrity checked · synthetic example" }) }) });
    expect(evidenceDone()).toBe(false);
  });
});

describe("step 7 saved final check", () => {
  it.each([true, false])("waits for the saved read before requesting a run, already completed: %s", async completed => {
    let busy = false, status = "Running JobGuard's final check";
    const clicks: string[] = [];
    const names = ["Build final account", "Load the saved final check", "Run the final check (practice)"];
    const buttons = names.map(textContent => ({
      textContent, get disabled() { return busy; }, closest: () => null,
      getClientRects: () => [{}], setAttribute: vi.fn(), scrollIntoView: vi.fn(),
      click: () => {
        clicks.push(textContent);
        busy = true;
        setTimeout(() => {
          if (completed || textContent === "Run the final check (practice)") status = "JobGuard's final check found 1 possible extra.";
          busy = false;
        }, 20);
      },
    }));
    const root = {
      querySelectorAll: (selector: string) => selector === "[data-walk-action]" ? [] : status.startsWith("JobGuard's final check found") ? buttons.slice(0, 2) : buttons,
      querySelector: (selector: string) => ({
        getAttribute: () => String(busy),
        textContent: selector.includes("lock-state") ? "Final account completed"
          : selector.includes("final-gross") ? "£1,230.00"
          : selector.includes("final-check-status") ? status : selector.includes("final-check-item") ? "fitted loft hatch" : "",
        setAttribute: vi.fn(), scrollIntoView: vi.fn(),
      }),
    };
    vi.stubGlobal("document", { getElementById: () => root, querySelectorAll: () => [] });
    renderToStaticMarkup(<VoiceJourney />);
    await memo.steps[6]!.autoAction({} as HTMLElement, new AbortController().signal);
    expect(clicks).toEqual(completed
      ? ["Load the saved final check"]
      : ["Load the saved final check", "Run the final check (practice)", "Load the saved final check"]);
    expect(finalCheckDone()).toBe(true);
  }, 10_000); // Three deliberate 1.2s pointer pauses plus the 3s worker polling interval.
});

describe("REAL-WALK-PAYOFF screen actions", () => {
 afterEach(() => vi.restoreAllMocks());
 it.each([false, true])("saves missed work through Job diary only when absent: saved %s", async saved => {
  let hasNote = saved;
  vi.stubGlobal("document", { getElementById: () => ({
   querySelector: () => ({ getAttribute: () => "false" }),
   querySelectorAll: () => hasNote ? [{ textContent: missedWorkDiary }] : [],
  }) });
  const fill = vi.spyOn(screenActions, "fill").mockResolvedValue();
  const click = vi.spyOn(screenActions, "click").mockImplementation(async name => { expect(name).toBe("Save note"); hasNote = true; });
  await saveMissedWork(new AbortController().signal);
  expect(missedWorkSaved()).toBe(true);
  expect(fill.mock.calls).toEqual(saved ? [] : [["#diary-text", missedWorkDiary]]);
  expect(click).toHaveBeenCalledTimes(saved ? 0 : 1);
 });
 it.each([false, true])("confirms and prices its own row without approving or duplicating it: already priced %s", async priced => {
  let answered = priced, editing = false;
  const presses: string[] = [];
  const row = { textContent: "fitted loft hatch", scrollIntoView: vi.fn(), querySelectorAll: (selector: string) => selector === ".variation-revision" ? priced ? [{ querySelector: () => ({ textContent: "Price revision 2 · £300.00" }) }] : [] : ["Change price", "Save new proposed revision"].map(name => ({ textContent: name, disabled: false, click: () => { presses.push(name); editing = name === "Change price"; } })) };
  const finding = { textContent: "fitted loft hatch", querySelector: () => answered ? {} : null };
  const refresh = vi.fn();
  vi.stubGlobal("document", { getElementById: (id: string) => id === "walk-refresh" ? { click: refresh } : {
   querySelector: (selector: string) => selector.includes("final-check-item") ? finding : selector.includes("final-check-disposition") ? answered ? {} : null : editing ? {} : null,
   querySelectorAll: () => [row],
  } });
  const fill = vi.spyOn(screenActions, "fill").mockResolvedValue();
  const click = vi.spyOn(screenActions, "click").mockImplementation(async name => { expect(name).toBe("Yes — this was extra work"); answered = true; });
  await priceFoundExtra({} as HTMLElement, new AbortController().signal);
  expect(click).toHaveBeenCalledTimes(priced ? 0 : 1);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(presses).toEqual(priced ? [] : ["Change price", "Save new proposed revision"]);
  expect(fill.mock.calls).toEqual(priced ? [] : [['[aria-label="New price fitted loft hatch"]', "300.00"]]);
 });
 it("opens the report and scrolls its heading to the top", async () => {
  const open = vi.fn(), scrollIntoView = vi.fn();
  vi.stubGlobal("document", { getElementById: (id: string) => id === "walk-report" ? { click: open } : { querySelector: () => ({ scrollIntoView }) } });
  renderToStaticMarkup(<VoiceJourney />);
  await memo.steps[8]!.autoAction({} as HTMLElement, new AbortController().signal);
  expect(open).toHaveBeenCalledTimes(1);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
 });
});


describe("REAL-WALK-OWN-JOB control boundary", () => {
  it("continues an available own-job control without preparing another job", async () => {
    const action = vi.fn().mockResolvedValue(undefined), fallback = vi.fn();
    await ownJobAction(action, new AbortController().signal, fallback, 100);
    expect(action).toHaveBeenCalledTimes(1); expect(fallback).not.toHaveBeenCalled();
  });
  it("switches once after refusal without replaying the refused control", async () => {
    const action = vi.fn().mockRejectedValue(new Error("refused")), fallback = vi.fn().mockResolvedValue(undefined);
    await expect(ownJobAction(action, new AbortController().signal, fallback, 100)).rejects.toThrow("refused");
    expect(action).toHaveBeenCalledTimes(1); expect(fallback).toHaveBeenCalledTimes(1);
  });
  it("switches after a disabled control exceeds the bounded wait", async () => {
    const fallback = vi.fn().mockResolvedValue(undefined);
    await expect(ownJobAction(signal => screenActions.until(() => false, signal), new AbortController().signal, fallback, 1)).rejects.toThrow("stayed unavailable");
    expect(fallback).toHaveBeenCalledTimes(1);
  });
  it("stopping playback never creates a fallback", async () => {
    const controller = new AbortController(), fallback = vi.fn(); controller.abort();
    await expect(ownJobAction(async signal => signal.throwIfAborted(), controller.signal, fallback, 100)).rejects.toBeDefined();
    expect(fallback).not.toHaveBeenCalled();
  });
  it.each([false, true])("an own draft needs a server-priced revision: %s", async priced => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(capture())).mockResolvedValueOnce(response(quote(jobId, priced))));
    expect(await restoreProgress(JSON.stringify({ jobId, prepared: "", priced: true }))).toMatchObject({ prepared: "", priced, initialStep: priced ? 2 : 1 });
  });
});

it("restores own-job progress past pricing from live server state with no prepared selector", async () => {
  const live = { ...capture(), status: "live" };
  const records: Record<string, unknown> = {
    [`/api/jobs/${jobId}/proposal`]: live, [`/api/jobs/${jobId}/quotes`]: quote(),
    [`/api/jobs/${jobId}/quotes/delivery`]: { status: "simulated_delivery" },
    [`/api/jobs/${jobId}/proof`]: { version: "practice-proof-view.v1", jobId, completion: null },
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { expect(url in records).toBe(true); return response(records[url]); }));
  expect(await restoreProgress(JSON.stringify({ jobId, prepared: "", priced: true }))).toEqual({ capture: live, priced: true, prepared: "", initialStep: 4 });
});


it.each([false, true])("renders the real workspace and report with the own job selector: report %s", report => {
  memo.states = [jobId, capture(), 0, 2, true, false, "", report, false, "", false]; memo.cursor = 0;
  try {
    const html = renderToStaticMarkup(<VoiceJourney />);
    expect(html).toContain(`${report ? "data-value-job" : "data-workspace-job"}="${jobId}"`);
    expect(html).not.toContain("This part uses a prepared example job");
    expect(html).not.toContain("prepared job's figures");
    expect(html).toContain("acceptance and extra approval use explicit builder practice attestations");
    for (const index of [2, 3, 6, 8]) expect(memo.steps[index]!.words).not.toContain("prepared");
  } finally { memo.states = null; }
});

it("renders the honest fallback and keeps old prepared tours on their verified selector", () => {
  memo.states = [jobId, capture(), 0, 2, true, true, preparedId, true, false, "", false]; memo.cursor = 0;
  try {
    const html = renderToStaticMarkup(<VoiceJourney />);
    expect(html).toContain(`data-value-job="${preparedId}"`);
    expect(html).toContain("This part uses a prepared example job");
    expect(memo.steps[8]!.words).toContain("These are the prepared job's figures");
  } finally { memo.states = null; }
});
