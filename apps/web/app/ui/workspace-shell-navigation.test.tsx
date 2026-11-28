import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell";
import { PracticeJourney } from "./practice-journey";

const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn: unknown, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) slots[index] = { value: fn, deps };
      return slots[index]!.value;
    },
    useEffect(fn: () => (() => void) | void, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) {
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index]!.cleanup = fn() || undefined; });
      }
    },
  };
});
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

const jobId = "11111111-1111-4111-8111-111111111111";
const otherJobId = "22222222-2222-4222-8222-222222222222";
const snapshot = (id = jobId) => ({ version: 1, environment: "synthetic_demo", jobId: id,
 captureId: id, proposalId: id, reviewId: id, status: "live",
 source: { text: "Fictional", kind: "text", version: 1, acquisition: null, audioByteLength: 0 },
 proposal: { title: "Fictional", lines: [], questions: [] }, review: null });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function setup() {
 vi.stubGlobal("React", React);
 const window = Object.assign(new EventTarget(), { location: { hash: "" } });
 vi.stubGlobal("window", window);
 vi.stubGlobal("document", { getElementById: () => null });
 const requests: { signal: AbortSignal; resolve: (body: unknown) => void }[] = [];
 const fetch = vi.fn((_path: string, options: { signal: AbortSignal }) => new Promise(resolve => {
  requests.push({ signal: options.signal, resolve: body => resolve({ ok: true, json: async () => body }) });
 }));
 vi.stubGlobal("fetch", fetch);
 const render = (id = jobId) => { hooks.render(); const tree = WorkspaceShell({ jobId: id }); hooks.effects(); return tree; };
 const hashchange = () => { window.location.hash = "#final-account-title"; window.dispatchEvent(new Event("hashchange")); };
 return { requests, fetch, render, hashchange };
}
function journey(node: React.ReactNode): React.ReactElement | undefined {
 if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return;
 if (node.type === PracticeJourney) return node;
 return React.Children.toArray(node.props.children).map(journey).find(Boolean);
}
it("does not abort superseded same-job hash reads and ignores their late results", async () => {
 const { requests, fetch, render, hashchange } = setup();
 render();
 hashchange(); render();
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(requests[0]!.signal.aborted).toBe(false);
 requests[1]!.resolve(snapshot()); await settle();
 expect(journey(render())).toBeDefined();
 requests[0]!.resolve({ ...snapshot(), status: "draft" }); await settle();
 expect(journey(render())?.props).toMatchObject({ jobId, status: "live" });
 hashchange();
 expect(journey(render())).toBeUndefined(); // Real hash navigation still reloads the whole workspace.
 requests[2]!.resolve(snapshot()); await settle();
 expect(journey(render())).toBeDefined();
});
it("aborts the current read when the job changes and ignores its late response", async () => {
 const { requests, fetch, render } = setup();
 render();
 const loading = render(otherJobId);
 expect(journey(loading)).toBeUndefined();
 expect(requests[0]!.signal.aborted).toBe(true);
 expect(fetch).toHaveBeenCalledTimes(2);
 requests[0]!.resolve(snapshot()); await settle();
 expect(journey(render(otherJobId))).toBeUndefined();
 expect(requests[1]!.signal.aborted).toBe(false);
 requests[1]!.resolve(snapshot(otherJobId)); await settle();
 expect(journey(render(otherJobId))?.props).toMatchObject({ jobId: otherJobId });
});
it("ignores an unmounted same-job shell read without aborting it", async () => {
 const { requests, render } = setup();
 render(); hooks.unmount();
 expect(requests[0]!.signal.aborted).toBe(false);
 requests[0]!.resolve(snapshot()); await settle();
 expect(journey(render())).toBeUndefined();
});
it("re-reads after another card switches the job live and keeps the mounted workspace", async () => {
 const { requests, fetch, render } = setup();
 render();
 requests[0]!.resolve({ ...snapshot(), status: "accepted" }); await settle();
 expect(journey(render())).toBeDefined();
 window.dispatchEvent(new CustomEvent("job-lifecycle-changed", { detail: otherJobId }));
 expect(fetch).toHaveBeenCalledTimes(1);
 window.dispatchEvent(new CustomEvent("job-lifecycle-changed", { detail: jobId }));
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(journey(render())).toBeDefined(); // The workspace stays mounted while it re-reads.
 requests[1]!.resolve(snapshot()); await settle();
 expect(journey(render())?.props).toMatchObject({ jobId, status: "live" });
});
