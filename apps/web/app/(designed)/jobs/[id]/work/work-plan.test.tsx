import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Empty } from "../../../designed-ui";
import { jobPageFetch } from "../../../../ui/job-page-fetch";
import { editCommand, editFields, WorkPlan } from "./work-plan";

// Exercise the Plan card's real read handlers with persistent hook slots.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], slot: 0, effects: [] as Array<() => void | (() => void)>, collecting: true }));
vi.mock("react", async original => ({ ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const slot = hooks.slot++;
    if (!(slot in hooks.values)) hooks.values[slot] = initial;
    return [hooks.values[slot], (value: unknown) => { hooks.values[slot] = typeof value === "function" ? value(hooks.values[slot]) : value; }];
  },
  useRef: (initial: unknown) => {
    const slot = hooks.slot++;
    if (!(slot in hooks.values)) hooks.values[slot] = { current: initial };
    return hooks.values[slot];
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void | (() => void)) => { if (hooks.collecting) hooks.effects.push(effect); },
}));

const jobId = "00000000-0000-4000-8000-000000000001";
const planPath = `/api/v2-backend/jobs/${jobId}/work-plan`;
const scopeItemId = "00000000-0000-4000-8000-000000000010";
const task = (key: string, title: string) => ({ key, title, scopeItemId, trade: "Joinery", position: 1,
  durationMinutes: 60, scheduledDate: null, assignee: null, needsReview: false });
const view = (quoteRevisionId: string, state: "draft" | "accepted" | "live", tasks: ReturnType<typeof task>[]) => ({
  state, tasks, quoteRevisionId, version: 1, acceptanceCancelled: false, unplanned: [],
  changes: { added: [], changed: [], removed: [] },
});
const noQuote = () => Response.json({ code: "QUOTE_REVISION_NOT_FOUND" }, { status: 404 });

let cleanups: Array<() => void> = [];
const request = vi.fn<typeof fetch>();
function render() { hooks.slot = 0; return WorkPlan({ jobId }); }
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node as React.ReactElement<Record<string, unknown>>, ...elements(node.props.children)];
}
const shown = () => elements(render());
const taskKeys = () => shown().filter(node => node.type === "article").map(node => node.key);
const empty = () => shown().some(node => node.type === Empty);
const switchLive = () => shown().some(node => node.type === "button" && node.props.children === "Switch live");
const planReads = () => request.mock.calls.filter(([url]) => url === planPath).length;
async function mount() {
  render(); hooks.collecting = false;
  cleanups = hooks.effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  await vi.waitFor(() => expect(planReads()).toBe(1));
}
async function quoteSaved(path: string, next: Response) {
  request.mockResolvedValueOnce(Response.json({ saved: true })).mockResolvedValueOnce(next);
  await jobPageFetch(`/api/jobs/${jobId}/${path}`, { method: "POST" });
}

beforeEach(() => {
  hooks.values = []; hooks.effects = []; hooks.collecting = true; request.mockReset();
  vi.stubGlobal("React", React); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("fetch", request);
});
afterEach(() => { cleanups.forEach(cleanup => cleanup()); cleanups = []; vi.unstubAllGlobals(); });

describe("Plan card after changes in the job workspace", () => {
  it("shows the first quote's tasks, a revision's tasks and Switch live without a reload", async () => {
    request.mockResolvedValueOnce(noQuote());
    await mount();
    await vi.waitFor(() => expect(empty()).toBe(true));

    await quoteSaved("quotes", Response.json(view("rev-1", "draft", [task("fit", "Fit doors")])));
    await vi.waitFor(() => expect(taskKeys()).toEqual([`${scopeItemId}/fit`]));
    expect(empty()).toBe(false);

    await quoteSaved("quotes", Response.json(view("rev-2", "draft", [task("hang", "Hang doors")])));
    await vi.waitFor(() => expect(taskKeys()).toEqual([`${scopeItemId}/hang`]));

    expect(switchLive()).toBe(false);
    await quoteSaved("quotes/acceptance", Response.json(view("rev-2", "accepted", [task("hang", "Hang doors")])));
    await vi.waitFor(() => expect(switchLive()).toBe(true));
  });

  it("re-reads after a lifecycle change and ignores other jobs and reads", async () => {
    request.mockResolvedValueOnce(Response.json(view("rev-1", "accepted", [task("fit", "Fit doors")])));
    await mount();
    request.mockResolvedValue(Response.json({}));
    await jobPageFetch(`/api/jobs/${jobId}/quotes`);
    window.dispatchEvent(new CustomEvent("job-saved", { detail: { jobId: "another-job" } }));
    window.dispatchEvent(new CustomEvent("job-lifecycle-changed", { detail: "another-job" }));
    expect(planReads()).toBe(1);

    request.mockReset();
    request.mockResolvedValueOnce(Response.json(view("rev-1", "live", [task("fit", "Fit doors")])));
    window.dispatchEvent(new CustomEvent("job-lifecycle-changed", { detail: jobId }));
    await vi.waitFor(() => expect(switchLive()).toBe(false));
    expect(planReads()).toBe(1);
  });

  it("keeps the newest read when an older one answers last", async () => {
    request.mockResolvedValueOnce(noQuote());
    await mount();
    let answerOld!: (response: Response) => void;
    request.mockReturnValueOnce(new Promise(resolve => { answerOld = resolve; }))
      .mockResolvedValueOnce(Response.json(view("rev-2", "draft", [task("hang", "Hang doors")])));
    window.dispatchEvent(new CustomEvent("job-saved", { detail: { jobId } }));
    window.dispatchEvent(new CustomEvent("job-saved", { detail: { jobId } }));
    await vi.waitFor(() => expect(taskKeys()).toEqual([`${scopeItemId}/hang`]));
    answerOld(Response.json(view("rev-1", "draft", [task("fit", "Fit doors")])));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(taskKeys()).toEqual([`${scopeItemId}/hang`]);
  });

  it("stops listening once the card is gone", async () => {
    request.mockResolvedValueOnce(noQuote());
    await mount();
    cleanups.forEach(cleanup => cleanup()); cleanups = [];
    window.dispatchEvent(new CustomEvent("job-saved", { detail: { jobId } }));
    expect(planReads()).toBe(1);
  });
});

// C3B-1 mount, owned by c4 #903: the read-only list of approved extras that are not on the plan.
describe("Plan card lists approved extras that are not on the plan", () => {
  it("shows each one with its plain reason", async () => {
    request.mockResolvedValueOnce(Response.json({ ...view("rev-1", "accepted", [task("fit", "Fit doors")]), extrasNotPlanned: [
      { scopeItemId: "00000000-0000-4000-8000-000000000011", title: "Leave out the shelf", reason: "omission", planningDropped: false },
      { scopeItemId: "00000000-0000-4000-8000-000000000012", title: "Move the socket", reason: "direction_unknown", planningDropped: true },
    ] }));
    await mount();
    await vi.waitFor(() => expect(taskKeys()).toEqual([`${scopeItemId}/fit`]));
    expect(shown().some(node => node.type === "h3" && node.props.children === "Approved extras not on the plan")).toBe(true);
    const items = shown().filter(node => node.type === "li").map(node => [node.props.children].flat().join(""));
    expect(items).toEqual(["Leave out the shelf: removed work, nothing to plan",
      "Move the socket: no price change: say whether it adds or removes work · planning on this extra was set aside"]);
  });
});

describe("Plan task edits", () => {
  const crew = "00000000-0000-4000-8000-000000000020";
  const approved = "00000000-0000-4000-8000-000000000030";
  const form = (assignee: string) => {
    const fields = new FormData();
    for (const [name, value] of Object.entries({ position: "1", trade: "Joinery", duration: "60", day: "", assignee })) fields.set(name, value);
    return fields;
  };

  it("names the approved extra's revision when editing its task", () => {
    const extra = { ...view("rev-1", "accepted", []), tasks: [], variationRevisions: { [scopeItemId]: approved } };
    expect(editCommand(extra, task("fit", "Fit doors"), { trade: "Joinery" }).variationRevisionId).toBe(approved);
    const quoted = { ...view("rev-1", "accepted", []), tasks: [] };
    expect("variationRevisionId" in editCommand(quoted, task("fit", "Fit doors"), { trade: "Joinery" })).toBe(false);
  });

  it("keeps a linked crew member unless the assignee is changed", () => {
    const linked = { ...task("fit", "Fit doors"), assigneeRef: crew };
    const untouched = editFields(form(""), linked);
    expect("assignee" in untouched).toBe(false);
    expect("assigneeRef" in untouched).toBe(false);
    expect(editFields(form("Sam"), linked).assignee).toBe("Sam");
    expect(editFields(form(""), { ...task("fit", "Fit doors"), assignee: "Sam" }).assignee).toBeNull();
  });
});
