import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell";
import { PracticeJourney } from "./practice-journey";

const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
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
it("reuses an in-flight same-job hash read and retains the mounted journey", async () => {
 const { requests, fetch, render, hashchange } = setup();
 render();
 hashchange(); render(); hashchange(); render();
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(requests[0]!.signal.aborted).toBe(false);
 requests[0]!.resolve(snapshot()); await settle();
 const before = journey(render()); expect(before).toBeDefined();
 hashchange();
 const during = journey(render());
 expect(during?.type).toBe(before?.type); expect(during?.key).toBe(before?.key);
 expect(during?.props).toMatchObject({ jobId, status: "live" });
 hashchange(); render();
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(requests[1]!.signal.aborted).toBe(false);
 requests[1]!.resolve(snapshot()); await settle();
 expect(journey(render())).toBeDefined();
});
it("aborts a pending read when the job changes and ignores its late response", async () => {
 const { requests, fetch, render, hashchange } = setup();
 render(); hashchange(); render();
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
