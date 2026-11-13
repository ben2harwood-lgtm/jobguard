import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverCapture } from "../../demo-s/journey-launch";
import * as screenActions from "./screen-actions";
import { requestedWorkspaceSection } from "../../ui/workspace-lifecycle";
import { visibleTarget } from "../../ui/walkthrough/walkthrough";
import { missedWorkDiary, missedWorkSaved, saveMissedWork, priceFoundExtra, addOnSiteEvidence, evidenceDone, approvedExtraDone, finalCheckDone, restoreProgress, stageWords, ownJobAction, stages, VoiceJourney } from "./voice-journey";
const memo = vi.hoisted(() => ({ steps: [] as import("../../ui/walkthrough/walkthrough").WalkthroughStep[], states: null as unknown[] | null, cursor: 0, setState: vi.fn() }));
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, useState: (initial: unknown) => memo.states && memo.cursor < memo.states.length ? [memo.states[memo.cursor++], memo.setState] : actual.useState(initial), useMemo: (factory: () => unknown) => {
    const result = factory();
    if (Array.isArray(result) && result[0]?.id === "walk-1") memo.steps = result;
    return result;
  } };
});
vi.mock("../../demo-s/journey-launch", () => ({ recoverCapture: vi.fn().mockResolvedValue("00000000-0000-4000-8000-000000000002") }));
vi.mock("../../ui/workspace-shell", () => ({ WorkspaceShell: ({ jobId, initialPricing }: { jobId: string; initialPricing?: boolean }) => <section data-workspace-job={jobId} data-initial-pricing={initialPricing} /> }));
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

afterEach(() => { memo.states = null; vi.unstubAllGlobals(); vi.stubGlobal("React", React); });
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
  expect(memo.steps[5]!.isDone).toBeTypeOf("function");
  expect(memo.steps[6]!.isDone).toBeTypeOf("function");
  expect(memo.steps[6]!.target).toBe("#final-check");
  expect(memo.steps[7]!.target).toBe("#final-check");
});

it.each([["accepted", 3], ["live", 4], ["invoiced", 4], ["paid", 4]])("resumes %s examples only as far as their verified lifecycle allows", async (status, initialStep) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(capture())).mockResolvedValueOnce(response(quote())).mockResolvedValueOnce(response({ ...capture(preparedId), status })));
  expect((await restoreProgress(saved()))?.initialStep).toBe(initialStep);
});


describe("step 5 saved evidence", () => {
  it("waits for deferred proof instead of targeting an unrelated workspace control", () => {
    const unrelated = { getClientRects: () => [{}], checkVisibility: () => true };
    let proof: typeof unrelated | null = null;
    const proofSelector = '#work-proof .proof-actions button:not(:disabled), #work-proof [data-testid="stage-status"]';
    vi.stubGlobal("document", {
      getElementById: () => ({ querySelector: () => null }),
      querySelector: (selector: string) => selector === proofSelector ? proof : unrelated,
    });
    renderToStaticMarkup(<VoiceJourney />);
    const step = memo.steps[4]!;
    expect(step.spotlightTarget!()).toBeNull();
    expect(visibleTarget(step.target)).toBeNull();
    // A proof control can mount before it is visible; keep waiting in that case.
    proof = { getClientRects: () => [{}], checkVisibility: () => false };
    expect(visibleTarget(step.target)).toBeNull();
    proof = { getClientRects: () => [{}], checkVisibility: () => true };
    expect(visibleTarget(step.target)).toBe(proof);
    expect(step.isDone()).toBe(false); // Target readiness cannot establish saved completion.
  });
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
  it.each(["", preparedId])("step 5 completes proof before saving the missed-work diary: example %s", async prepared => {
    let state = 0, hasNote = false;
    const names = ["Attach generated practice image", "Check file integrity", "Complete this stage", "Save note"];
    const clicks: string[] = [];
    const root = {
      querySelector: (selector: string) => {
        if (selector === '.proof-actions button:not(:disabled)') return state < 3 ? {} : null;
        if (selector.includes("job-diary")) return { getAttribute: () => "false" };
        return { textContent: selector.includes("stage-status") ? state === 3 ? "Complete" : "In progress"
          : selector.includes("stage-review") ? ""
          : ["Not attached", "Uploading", "File integrity checked · synthetic example", "File integrity checked · synthetic example"][state] };
      },
      querySelectorAll: () => hasNote ? [{ textContent: missedWorkDiary }] : [],
    };
    vi.stubGlobal("document", { getElementById: () => root });
    const fill = vi.spyOn(screenActions, "fill").mockResolvedValue();
    const click = vi.spyOn(screenActions, "click").mockImplementation(async name => {
      expect(name).toBe(names[clicks.length]);
      clicks.push(name);
      if (name === "Save note") { expect(evidenceDone()).toBe(true); hasNote = true; }
      else state++;
    });
    memo.states = [jobId, capture(), 0, 4, true, false, prepared, false, false, "", false, true]; memo.cursor = 0;
    try {
      renderToStaticMarkup(<VoiceJourney />);
      expect(memo.steps[4]!.isDone()).toBe(false);
      await memo.steps[4]!.autoAction({} as HTMLElement, new AbortController().signal);
      expect(clicks).toEqual(names);
      expect(fill).toHaveBeenCalledWith("#diary-text", missedWorkDiary);
      expect(memo.steps[4]!.isDone()).toBe(true);
    } finally { fill.mockRestore(); click.mockRestore(); }
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
    memo.states = [jobId, capture(), 0, 6, true, false, preparedId, false, false, "", false, false]; memo.cursor = 0;
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
  memo.states = [jobId, capture(), 0, 8, true, false, preparedId, false, false, "", false, false]; memo.cursor = 0;
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
  memo.states = [jobId, capture(), 0, 2, true, false, "", report, false, "", false, true]; memo.cursor = 0;
  try {
    const html = renderToStaticMarkup(<VoiceJourney />);
    expect(html).toContain(`${report ? "data-value-job" : "data-workspace-job"}="${jobId}"`);
    if (!report) expect(html).toContain('data-initial-pricing="true"');
    expect(html).not.toContain("This part uses a prepared example job");
    expect(html).not.toContain("prepared job's figures");
    expect(html).toContain("Use the prepared example job");
    expect(html).toContain("Continue on my own saved job");
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


it.each(["", preparedId])("waits for server-confirmed activation before remounting the workspace: example %s", async prepared => {
  memo.states = [jobId, capture(), 0, 3, true, false, prepared, false, false, "", false, true]; memo.cursor = 0;
  let activated = false;
  const root = {
    querySelector: (selector: string) => selector.includes("activation-policy") && activated ? {} : null,
    querySelectorAll: () => [{ textContent: "Record practice acceptance" }],
  };
  vi.stubGlobal("document", { getElementById: () => root });
  const location = new URL("https://example.test/practice-company/walkthrough?walkJob=" + jobId + (prepared ? "&walkExample=" + preparedId : ""));
  vi.stubGlobal("location", location);
  const replaceState = vi.fn((_: unknown, __: string, url: string) => { location.href = new URL(url, location.href).href; });
  vi.stubGlobal("history", { replaceState });
  const click = vi.spyOn(screenActions, "click").mockResolvedValue(undefined);
  try {
    renderToStaticMarkup(<VoiceJourney />);
    memo.setState.mockClear();
    const action = memo.steps[3]!.autoAction({} as HTMLElement, new AbortController().signal);
    await vi.waitFor(() => expect(click).toHaveBeenCalledWith("Start this practice job", expect.any(AbortSignal)));
    expect(memo.setState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    activated = true;
    await action;
    expect(memo.setState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(memo.setState.mock.invocationCallOrder[0]!);
    expect(location.searchParams.get("walkJob")).toBe(jobId);
    expect(location.searchParams.get("walkExample")).toBe(prepared || null);
    expect(location.hash).toBe("#work-proof");
    expect(requestedWorkspaceSection("live", location.hash)).toBe("work");
  } finally { memo.states = null; click.mockRestore(); }
});


it.each([2, 4, 8])("defaults an unchosen tour to the prepared example before step %s actions", async index => {
  memo.states = [jobId, capture(), 0, index, true, false, "", false, false, "", false, false]; memo.cursor = 0;
  vi.stubGlobal("sessionStorage", { getItem: () => jobId, setItem: vi.fn() });
  vi.stubGlobal("location", { href: "https://example.test/practice-company/walkthrough?walkJob=" + jobId });
  const replaceState = vi.fn(); vi.stubGlobal("history", { replaceState });
  const click = vi.spyOn(screenActions, "click").mockResolvedValue();
  vi.mocked(recoverCapture).mockClear();
  try {
    const html = renderToStaticMarkup(<VoiceJourney />);
    expect(html).toContain("Use the prepared example job");
    expect(html).toContain("Continue on my own saved job");
    expect(memo.steps[index]!.isDone!()).toBe(false);
    // Stop at the workspace handoff: no own-job control may run while the
    // prepared job has not rendered, even if the own workspace looks ready.
    const controller = new AbortController();
    vi.stubGlobal("document", { getElementById: () => ({ querySelector: () => ({ getAttribute: () => jobId }) }) });
    const action = memo.steps[index]!.autoAction({} as HTMLElement, controller.signal);
    await vi.waitFor(() => expect(replaceState).toHaveBeenCalled());
    controller.abort(new Error("Stopped at handoff"));
    await expect(action).rejects.toThrow("Stopped at handoff");
    expect(recoverCapture).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, "", expect.stringContaining("walkExample=" + preparedId));
    expect(click).not.toHaveBeenCalled();
  } finally { click.mockRestore(); }
});

it("prepares and sends the example in one default Show me action", async () => {
  memo.states = [jobId, capture(), 0, 2, true, false, "", false, true, "", false, false]; memo.cursor = 0;
  let delivered = false;
  const root = {
    querySelector: (selector: string) => selector === ".review-line" ? {} : {
      getAttribute: () => selector === ".quote-editor" ? "true" : preparedId,
      textContent: selector.includes("quote-revision") ? "1" : selector.includes("quote-delivery") ? delivered ? "Simulated delivery — nothing sent" : "" : "Fictional customer",
    },
  };
  vi.stubGlobal("document", { getElementById: () => root });
  vi.stubGlobal("sessionStorage", { getItem: () => jobId, setItem: vi.fn() });
  vi.stubGlobal("location", { href: "https://example.test/practice-company/walkthrough?walkJob=" + jobId });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  const price = vi.spyOn(screenActions, "reviewAndPrice").mockResolvedValue();
  const click = vi.spyOn(screenActions, "click").mockImplementation(async name => { if (name === "Continue fake worker") delivered = true; });
  try {
    renderToStaticMarkup(<VoiceJourney />);
    memo.setState.mockClear();
    await memo.steps[2]!.autoAction({} as HTMLElement, new AbortController().signal);
    expect(price).toHaveBeenCalledTimes(1);
    expect(click.mock.calls.map(([name]) => name)).toEqual(["Preview immutable quote", "Simulate sending this quote", "Continue fake worker"]);
    // The default handoff keeps the running walkthrough mounted; an explicit
    // example choice or refused own control still restarts it at sending.
    expect(memo.setState.mock.calls.filter(([value]) => value === preparedId)).toHaveLength(1);
    expect(memo.steps[2]!.isDone()).toBe(true);
  } finally { price.mockRestore(); click.mockRestore(); }
});

it.each([0, 1])("default step 3 waits for the prepared editor and saves only an unpriced example: revision %s", async initialRevision => {
  memo.states = [jobId, capture(), 0, 1, false, false, "", false, true, "", false, false]; memo.cursor = 0;
  let activeJob = jobId, revision = 1, ready = false, readyChecked = false, delivered = false;
  const root = {
    querySelector: (selector: string) => {
      if (selector === ".review-line") return null;
      if (selector === ".review-line, .quote-editor, .confirmed-scope") return {};
      if (selector === ".quote-editor") return { getAttribute: () => { readyChecked = true; return String(ready); } };
      if (selector.includes("workspace-job-id")) return { getAttribute: () => activeJob };
      if (selector.includes("quote-revision")) return { textContent: String(revision) };
      if (selector.includes("quote-delivery")) return { textContent: delivered ? "Simulated delivery — nothing sent" : "Not queued" };
      if (selector.includes("party-customer")) return { textContent: "Fictional customer" };
      return null;
    },
  };
  vi.stubGlobal("document", { getElementById: () => root });
  vi.stubGlobal("sessionStorage", { getItem: () => jobId, setItem: vi.fn() });
  const location = new URL("https://example.test/practice-company/walkthrough?walkJob=" + jobId);
  vi.stubGlobal("location", location);
  const replaceState = vi.fn((_: unknown, __: string, url: string) => { location.href = new URL(url, location.href).href; });
  vi.stubGlobal("history", { replaceState });
  vi.mocked(recoverCapture).mockImplementationOnce(async () => { activeJob = preparedId; revision = initialRevision; return preparedId; });
  const click = vi.spyOn(screenActions, "click").mockImplementation(async name => {
    expect(activeJob).toBe(preparedId);
    if (name === "Save draft revision") { expect(ready).toBe(true); revision++; }
    if (name === "Preview immutable quote") expect(revision).toBeGreaterThan(0);
    if (name === "Continue fake worker") delivered = true;
  });
  const controller = new AbortController();
  let action: Promise<void> | undefined;
  try {
    renderToStaticMarkup(<VoiceJourney />);
    expect(memo.steps[1]!.isDone()).toBe(true);
    expect(location.hash).toBe("");
    action = Promise.resolve(memo.steps[2]!.autoAction({} as HTMLElement, controller.signal));
    // Attach the rejection handler before checking the asynchronous handoff.
    const result = action.then(() => null, reason => reason);
    await vi.waitFor(() => expect(activeJob).toBe(preparedId));
    await vi.waitFor(() => expect(readyChecked || click.mock.calls.length > 0).toBe(true));
    expect(click).not.toHaveBeenCalled();
    ready = true;
    expect(await result).toBeNull();
    expect(location.hash).toBe("");
    expect(click.mock.calls.map(([name]) => name)).toEqual([
      ...(initialRevision === 0 ? ["Save draft revision"] : []),
      "Preview immutable quote", "Simulate sending this quote", "Continue fake worker",
    ]);
    expect(revision).toBe(1);
    expect(memo.steps[2]!.isDone()).toBe(true);
  } finally {
    controller.abort(new Error("Test complete"));
    await action?.catch(() => {});
    click.mockRestore();
  }
});
