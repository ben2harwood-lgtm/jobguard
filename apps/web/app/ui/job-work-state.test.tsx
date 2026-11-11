import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobWorkState } from "./job-work-state";
import { JOB_SAVED_EVENT, jobPageFetch } from "./job-page-fetch";

// Exercise the panel's actual read and command handlers with persistent hook slots.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], slot: 0, effects: [] as Array<() => void | (() => void)>, collecting: true }));
vi.mock("react", async original => ({ ...(await original<typeof import("react")>()), useContext: () => 0,
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
const endpoint = `/api/jobs/${jobId}/work-state`;
const snapshot = (sequence: number, kind = "site_activity") => ({
  version: "job-work-state-read.v1", jobId, links: [], lock: null, environment: "synthetic_demo", realExternalActions: 0,
  events: sequence === 0 ? [] : [{ version: "job-work-state-event.v1", id: "00000000-0000-4000-8000-000000000002", jobId,
    sequence, kind, factAt: "2026-11-10T00:00:00.000000Z", recordedAt: "2026-11-10T00:00:00.000000Z",
    sourceReceiptId: kind === "site_activity" ? "00000000-0000-4000-8000-000000000003" : null, commandId: kind === "site_activity" ? null : "00000000-0000-4000-8000-000000000004", predecessorId: null, closeReason: null, closeNote: null }],
});
let cleanups: Array<() => void> = [];
const request = vi.fn<typeof fetch>();
function render() { hooks.slot = 0; return JobWorkState({ jobId }); }
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node as React.ReactElement<Record<string, unknown>>, ...elements(node.props.children)];
}
function button(name: string) {
  const found = elements(render()).find(node => node.type === "button" && node.props.children === name);
  if (!found) throw new Error(`Missing button ${name}`);
  return found.props as { disabled?: boolean; onClick: () => void };
}
async function settle() { await vi.waitFor(() => expect(render().props["aria-busy"]).toBe(false)); }
async function mount() {
  render(); hooks.collecting = false;
  cleanups = hooks.effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  await settle();
}
function saved(id = jobId) { window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT, { detail: { jobId: id } })); }

beforeEach(() => {
  hooks.values = []; hooks.effects = []; hooks.collecting = true; request.mockReset();
  vi.stubGlobal("React", React); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("fetch", request);
});
afterEach(() => { cleanups.forEach(cleanup => cleanup()); cleanups = []; vi.unstubAllGlobals(); });

describe("site work after saves in this page", () => {
  it("re-reads after message, diary and proof saves and sends the latest revision", async () => {
    request.mockResolvedValueOnce(Response.json(snapshot(0)));
    await mount();
    for (const [index, path] of ["customer-messages", "diary", "proof"].entries()) {
      request.mockResolvedValueOnce(Response.json({ saved: true })).mockResolvedValueOnce(Response.json(snapshot(index + 1)));
      await jobPageFetch(`/api/jobs/${jobId}/${path}`, { method: "POST" });
      await settle();
    }
    request.mockResolvedValueOnce(Response.json(snapshot(4, "finished_on_site")));
    button("Finished on site").onClick();
    await settle();
    const [url, options] = request.mock.calls.at(-1)!;
    expect(url).toBe(endpoint);
    expect(JSON.parse(options!.body as string)).toMatchObject({ action: "finish", expectedRevision: 3 });
    expect(elements(render()).find(node => node.props["data-testid"] === "work-state")?.props.children).toBe("Finished on site");
  });

  it("ignores other jobs and keeps the stale refusal for changes outside this page", async () => {
    request.mockResolvedValueOnce(Response.json(snapshot(0)));
    await mount(); saved("another-job");
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(Response.json({ code: "IDEMPOTENCY_CONFLICT" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json(snapshot(2)));
    button("Finished on site").onClick(); await settle();
    expect(JSON.parse(request.mock.calls[1]![1]!.body as string).expectedRevision).toBe(0);
    expect(elements(render()).find(node => node.props.role === "alert")?.props.children).toContain("This job changed");
    expect(elements(render()).find(node => node.props["data-testid"] === "work-state")?.props.children).toBe("Work under way");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("disables actions during refresh and removes stale controls if refresh fails", async () => {
    request.mockResolvedValueOnce(Response.json(snapshot(0))); await mount();
    let resolve!: (response: Response) => void;
    request.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    saved(); expect(button("Finished on site").disabled).toBe(true);
    // Even an old click handler cannot send while the read is in flight.
    button("Finished on site").onClick(); expect(request).toHaveBeenCalledTimes(2);
    resolve(Response.json({}, { status: 503 })); await settle();
    expect(elements(render()).some(node => node.type === "button" && node.props.children === "Finished on site")).toBe(false);
  });

  it("ignores an older refresh that resolves after a newer save", async () => {
    request.mockResolvedValueOnce(Response.json(snapshot(0))); await mount();
    let resolve!: (response: Response) => void;
    request.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; })); saved();
    request.mockResolvedValueOnce(Response.json(snapshot(3))); saved(); await settle();
    resolve(Response.json(snapshot(1)));
    await new Promise(done => setTimeout(done, 0));
    request.mockResolvedValueOnce(Response.json(snapshot(4, "finished_on_site")));
    button("Finished on site").onClick(); await settle();
    expect(JSON.parse(request.mock.calls.at(-1)![1]!.body as string).expectedRevision).toBe(3);
  });

  it("refreshes a save that arrives while a work-state command is in flight", async () => {
    request.mockResolvedValueOnce(Response.json(snapshot(0))); await mount();
    let resolve!: (response: Response) => void;
    request.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    button("Finished on site").onClick(); saved();
    expect(request).toHaveBeenCalledTimes(2);
    request.mockResolvedValueOnce(Response.json(snapshot(3)));
    resolve(Response.json(snapshot(1, "finished_on_site"))); await settle();
    expect(request.mock.calls[2]![0]).toBe(endpoint);
    expect(button("Finished on site").disabled).toBe(false);
    expect(elements(render()).find(node => node.props["data-testid"] === "work-state-revision")?.props.children).toBe(3);
  });

  it("preserves the exact command after an unknown outcome despite a local save", async () => {
    request.mockResolvedValueOnce(Response.json(snapshot(0))); await mount();
    request.mockRejectedValueOnce(new Error("Connection lost"));
    button("Finished on site").onClick(); await settle();
    const command = request.mock.calls[1]![1]!.body;
    saved(); expect(request).toHaveBeenCalledTimes(2);
    request.mockResolvedValueOnce(Response.json(snapshot(1, "finished_on_site")))
      .mockResolvedValueOnce(Response.json(snapshot(3, "finished_on_site")));
    button("Retry the same action").onClick(); await settle();
    expect(request.mock.calls[2]![1]!.body).toBe(command);
    expect(request.mock.calls[3]![0]).toBe(endpoint);
    expect(request.mock.calls[3]![1]?.method).toBeUndefined();
  });
});
