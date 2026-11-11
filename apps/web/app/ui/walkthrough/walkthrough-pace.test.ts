import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clearPhoneDock, readingPause, readingTime, viewerPacing, viewerPlayback, Walkthrough } from "./walkthrough";
import { coreGuideSteps } from "../../demo-s/core-1000/instruction-tour";
const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], refs: [] as { current: unknown }[], states: null as unknown[] | null, setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.states) return actual.useState(initial);
      const index = hooks.setters.length, setter = vi.fn(); hooks.setters.push(setter);
      return [hooks.states[index] ?? initial, setter];
    },
    useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
    useRef: (current: unknown) => { const ref = { current }; hooks.refs.push(ref); return ref; },
  };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); hooks.effects.length = 0; hooks.refs.length = 0; hooks.states = null; hooks.setters.length = 0; });
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
  it("next-target readiness cannot end the completed-result hold", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { querySelector: () => ({ getClientRects: () => [{}], checkVisibility: () => true }) });
    const advanced = vi.fn();
    const pause = readingPause(15000, false, new AbortController().signal, () => {}).then(advanced);
    await vi.advanceTimersByTimeAsync(14999); expect(advanced).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await pause;
    expect(advanced).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["pointerdown", "keydown", "input", "click", "wheel", "scroll"])("%s cannot consume completed-result reading", async event => {
    vi.useFakeTimers(); const listeners = new Map<string, () => void>();
    vi.stubGlobal("document", { addEventListener: (name: string, handler: () => void) => listeners.set(name, handler), removeEventListener: (name: string) => listeners.delete(name) });
    let next!: () => void; const advanced = vi.fn();
    const pause = readingPause(15000, false, new AbortController().signal, skip => { next = skip; }).then(advanced);
    listeners.get(event)?.();
    await vi.advanceTimersByTimeAsync(100); expect(advanced).not.toHaveBeenCalled();
    next(); await pause;
    expect(advanced).toHaveBeenCalledOnce(); expect(listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
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

// Execute the component's real autoplay effect without a browser or a DOM renderer.
describe("completed autoplay results", () => {
  function playback({ reduced = false, done = true, visible = true, reject = false, webdriver = false, nextTarget = false } = {}) {
    vi.useFakeTimers(); vi.stubGlobal("React", React);
    vi.stubGlobal("navigator", { webdriver });
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    const target = { getClientRects: () => [{}], checkVisibility: () => true };
    vi.stubGlobal("document", { querySelector: () => visible ? target : null });
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    // index, playing, busy, done, error, box, finished, waiting, expanded, holding
    hooks.states = [0, true];
    const autoAction = vi.fn(() => { if (reject) throw new Error("Rejected action"); });
    renderToStaticMarkup(React.createElement(Walkthrough, {
      steps: [{ id: "last", timeoutMs: 1000, target: "#last", title: "Check", words: "the saved result", isDone: () => done, autoAction }, ...(nextTarget ? [{ id: "next", target: "#next", title: "Next", words: "Ready", isDone: () => true, autoAction }] : [])], onClose: () => {},
    }));
    hooks.effects[3]!();
    return { autoAction, controller: hooks.refs[1]!.current as AbortController };
  }
  it("reads the viewer's final step outside its action deadline", async () => {
    const { controller } = playback();
    await vi.advanceTimersByTimeAsync(0);
    expect(viewerPacing()).toBe(true); expect(viewerPlayback.has(controller.signal)).toBe(true);
    expect(hooks.setters[9]).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(readingTime("Check", "the saved result") - 1);
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hooks.setters[6]).toHaveBeenCalledWith(true); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])("webdriver has no completed-result reading pause (reduced motion %s)", async reduced => {
    const { controller } = playback({ webdriver: true, reduced });
    await vi.advanceTimersByTimeAsync(0);
    expect(viewerPacing()).toBe(false); expect(viewerPlayback.has(controller.signal)).toBe(false);
    expect(hooks.setters[9]).not.toHaveBeenCalledWith(true);
    expect(hooks.setters[6]).toHaveBeenCalledWith(true); expect(vi.getTimerCount()).toBe(0);
  });
  it("reduced motion opts out of viewer autoplay reading holds", async () => {
    const { controller } = playback({ reduced: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(viewerPacing()).toBe(false); expect(viewerPlayback.has(controller.signal)).toBe(false);
    expect(hooks.setters[9]).not.toHaveBeenCalledWith(true);
    expect(hooks.setters[6]).toHaveBeenCalledWith(true); expect(vi.getTimerCount()).toBe(0);
    // Existing explicit reduced-motion manual holds are tested above: time never releases them.
  });
  it("aborting playback cancels reading without advancing or another action", async () => {
    const { controller, autoAction } = playback();
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(); await vi.advanceTimersByTimeAsync(60000);
    expect(hooks.setters[6]).not.toHaveBeenCalled(); expect(autoAction).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("explicit Next releases the component hold and cleans its timer", async () => {
    playback(); await vi.advanceTimersByTimeAsync(100);
    (hooks.refs[3]!.current as () => void)();
    await vi.advanceTimersByTimeAsync(0);
    expect(hooks.setters[6]).toHaveBeenCalledWith(true); expect(vi.getTimerCount()).toBe(0);
    expect(hooks.refs[3]!.current).toBeNull();
  });
  it("a visible next target cannot shortcut reading when pointer pacing is enabled", async () => {
    const { controller } = playback({ webdriver: false, nextTarget: true });
    expect(viewerPlayback.has(controller.signal)).toBe(true);
    await vi.advanceTimersByTimeAsync(4999);
    expect(hooks.setters[0]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hooks.setters[0]).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([{ visible: false }, { done: false, reject: true }, { done: false }])("never advances an unavailable, rejected or unconfirmed result: %j", async options => {
    playback(options); await vi.advanceTimersByTimeAsync(30000);
    expect(hooks.setters[9]).not.toHaveBeenCalledWith(true);
    expect(hooks.setters[6]).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
