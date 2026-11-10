import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clearPhoneDock, readingPause, readingTime, viewerPacing, Walkthrough } from "./walkthrough";
import { coreGuideSteps } from "../../demo-s/core-1000/instruction-tour";
const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], refs: [] as { current: unknown }[] }));
vi.mock("react", async original => ({
  ...await original<typeof React>(),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useRef: (current: unknown) => { const ref = { current }; hooks.refs.push(ref); return ref; },
}));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); hooks.effects.length = 0; hooks.refs.length = 0; });
describe("REAL-WALK-PACE reading pause", () => {
  it.each([
    ["", "", 4000], ["Check", "the saved result", 5000], ["Long card", "word ".repeat(100), 15000],
  ] as const)("holds for reading time, including the cap", async (title, words, duration) => {
    vi.useFakeTimers(); expect(readingTime(title, words)).toBe(duration);
    const advanced = vi.fn();
    const pause = readingPause(duration, false, new AbortController().signal, () => {}).then(advanced);
    await vi.advanceTimersByTimeAsync(duration - 1); expect(advanced).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await pause;
    expect(advanced).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])("Next skips the pause (reduced motion: %s)", async reduced => {
    vi.useFakeTimers(); let next!: () => void; const advanced = vi.fn();
    const pause = readingPause(15000, reduced, new AbortController().signal, skip => { next = skip; }).then(advanced);
    await vi.advanceTimersByTimeAsync(100); expect(advanced).not.toHaveBeenCalled();
    next(); await pause; expect(advanced).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("never auto-advances with reduced motion", async () => {
    vi.useFakeTimers(); let next!: () => void; const advanced = vi.fn();
    const pause = readingPause(15000, true, new AbortController().signal, skip => { next = skip; }).then(advanced);
    await vi.advanceTimersByTimeAsync(60000); expect(advanced).not.toHaveBeenCalled();
    next(); await pause; expect(advanced).toHaveBeenCalledOnce();
  });
  it("ends a hold as soon as the next target is ready", async () => {
    vi.useFakeTimers(); let ready = false; const advanced = vi.fn();
    const pause = readingPause(15000, false, new AbortController().signal, () => {}, () => ready).then(advanced);
    await vi.advanceTimersByTimeAsync(100); expect(advanced).not.toHaveBeenCalled();
    ready = true; await vi.advanceTimersByTimeAsync(50); await pause;
    expect(advanced).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("uses no timer when the next target is already ready", async () => {
    vi.useFakeTimers();
    await readingPause(15000, false, new AbortController().signal, () => {}, () => true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["pointerdown", "keydown", "input", "click", "wheel"])("releases a hold on %s and cleans up listeners", async event => {
    vi.useFakeTimers(); const listeners = new Map<string, () => void>();
    const removeEventListener = vi.fn((name: string) => listeners.delete(name));
    vi.stubGlobal("document", { addEventListener: (name: string, handler: () => void) => listeners.set(name, handler), removeEventListener });
    const pause = readingPause(15000, false, new AbortController().signal, () => {});
    listeners.get(event)!(); await pause;
    expect(listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([[false, true], [true, false]])("viewer pacing: reduced motion %s", (reduced, paced) => {
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    expect(viewerPacing()).toBe(paced);
  });
  it("Stop interrupts immediately and leaves no timer", async () => {
    vi.useFakeTimers(); const controller = new AbortController(); const advanced = vi.fn();
    const pause = readingPause(15000, false, controller.signal, () => {}).then(() => { if (!controller.signal.aborted) advanced(); });
    controller.abort(); await pause; expect(advanced).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
describe("390px dock geometry", () => {
  it("clears each new highlighted target once and leaves scroll and polling alone", () => {
    vi.stubGlobal("React", React);
    let top = 700;
    const makeTarget = () => ({
      getClientRects: () => [{}], checkVisibility: () => true, matches: () => true,
      getBoundingClientRect: () => ({ left: 0, top, bottom: top + 44, width: 100, height: 44 }),
      classList: { add: vi.fn(), remove: vi.fn() }, scrollIntoView: vi.fn(),
    });
    let target = makeTarget();
    const listeners = new Map<string, () => void>();
    let poll!: () => void;
    const scrollBy = vi.fn(({ top: delta }: { top: number }) => { top -= delta; });
    vi.stubGlobal("document", { querySelectorAll: () => [], querySelector: () => target });
    vi.stubGlobal("window", {
      innerWidth: 390, scrollBy,
      setInterval: (update: () => void) => { poll = update; return 1; },
      addEventListener: (event: string, update: () => void) => listeners.set(event, update),
      removeEventListener: vi.fn(),
    });
    renderToStaticMarkup(React.createElement(Walkthrough, {
      steps: [{ id: "one", target: "#one", title: "Review", words: "Check the result", isDone: () => false, autoAction: () => {} }],
      onClose: () => {},
    }));
    hooks.refs[0]!.current = { focus: vi.fn(), getBoundingClientRect: () => ({ top: 600 }) };
    const cleanup = hooks.effects[1]!();
    expect(scrollBy).toHaveBeenCalledOnce();
    // A viewer scrolls the same target under the bar; tracking must not undo it.
    top = 750;
    listeners.get("scroll")!(); poll(); poll(); listeners.get("resize")!();
    expect(top).toBe(750);
    expect(scrollBy).toHaveBeenCalledOnce();
    target = makeTarget(); poll();
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(top + 44).toBeLessThan(600);
    if (typeof cleanup === "function") cleanup();
  });
  // Synthetic DOM geometry tests the correction; CI must also measure the real screens.
  it.each(coreGuideSteps.map((step, index) => [step.title, index] as const))("clears a first control below the dock: %s", (_, index) => {
    let top = 700 + index * 30;
    const target = { getBoundingClientRect: () => ({ top, bottom: top + 44, height: 44 }) } as HTMLElement;
    const dock = { getBoundingClientRect: () => ({ top: 680, bottom: 800 }) } as HTMLElement;
    const scrollBy = vi.fn(({ top: delta }: { top: number }) => { top -= delta; });
    vi.stubGlobal("window", { innerWidth: 390, scrollBy }); clearPhoneDock(target, dock);
    expect(target.getBoundingClientRect().bottom).toBeLessThan(dock.getBoundingClientRect().top);
    clearPhoneDock(target, dock); expect(scrollBy).toHaveBeenCalledOnce();
  });
  it("leaves desktop scrolling alone", () => {
    const scrollBy = vi.fn(); vi.stubGlobal("window", { innerWidth: 1280, scrollBy });
    clearPhoneDock({} as HTMLElement, {} as HTMLElement); expect(scrollBy).not.toHaveBeenCalled();
  });
});
