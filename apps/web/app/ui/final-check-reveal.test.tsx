import { afterEach, expect, it, vi } from "vitest";
import * as React from "react";
import { FinalCheckReveal } from "./final-check-reveal";
import { JOB_SAVED_EVENT } from "./job-page-fetch";

// Reuse the final-account tests' dependency-aware hook runtime.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    reset() { slots.forEach(slot => slot.cleanup?.()); cursor = 0; slots.length = 0; effects.length = 0; },
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
afterEach(() => { hooks.reset(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const jobId = "18000000-0000-4000-8000-000000000001";
const lockId = "18000000-0000-4000-8000-000000000002";
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
 if (Array.isArray(node)) return node.flatMap(elements);
 if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
 return [node as React.ReactElement<Record<string, unknown>>, ...elements(node.props.children)];
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

it("follows a newly locked check past a stale pending read and a failed poll without reloading", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 vi.stubGlobal("React", React);
 vi.stubGlobal("window", new EventTarget());
 let state = "unlocked", fail = false;
 let delayed: ((response: Response) => void) | undefined;
 const request = vi.fn(async (input: string) => {
  if (input.endsWith("/disputes")) return Response.json([]);
  if (fail) { fail = false; throw new Error("Temporarily offline"); }
  if (state === "delayed") return new Promise<Response>(resolve => { delayed = resolve; });
  return Response.json({ state, items: [], ...(state === "unlocked" ? {} : { lockId }) });
 });
 vi.stubGlobal("fetch", request);
 const render = () => { hooks.render(); const tree = FinalCheckReveal({ jobId }); hooks.effects(); return tree; };
 const status = () => elements(render()).find(node => node.props["data-testid"] === "final-check-status")?.props.children;
 render(); await tick(); render();
 expect(status()).toContain("after you complete the final account");
 state = "pending";
 window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT, { detail: { jobId: "another-job" } }));
 expect(request).toHaveBeenCalledTimes(2);
 window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT, { detail: { jobId } }));
 render(); await tick(); render();
 expect(status()).toBe("Running JobGuard's final check");
 // The saved read says pending, but the worker finishes immediately afterwards.
 state = "completed";
 fail = true;
 await vi.advanceTimersByTimeAsync(3000); await tick(); render();
 expect(status()).toBe("Running JobGuard's final check");
 await vi.advanceTimersByTimeAsync(3000); await tick(); render();
 expect(status()).toBe("JobGuard's final check found nothing missing from your bill.");
 const completedCalls = request.mock.calls.length;
 await vi.advanceTimersByTimeAsync(9000); render();
 expect(request).toHaveBeenCalledTimes(completedCalls);
 // An older manual read must not replace a newer completed result either.
 const reload = () => (elements(render()).find(node => node.type === "button" && node.props.children === "Load the saved final check")!.props.onClick as () => void)();
 state = "delayed"; reload(); render();
 state = "completed"; reload(); render(); await tick(); render();
 delayed!(Response.json({ state: "pending", lockId, items: [] }));
 await tick(); render();
 expect(status()).toBe("JobGuard's final check found nothing missing from your bill.");
 // Leaving the page cancels a pending timer.
 state = "pending"; reload(); render(); await tick(); render();
 expect(vi.getTimerCount()).toBe(1);
 const callsBeforeUnmount = request.mock.calls.length;
 hooks.reset();
 await vi.advanceTimersByTimeAsync(3000);
 expect(request).toHaveBeenCalledTimes(callsBeforeUnmount);
});
