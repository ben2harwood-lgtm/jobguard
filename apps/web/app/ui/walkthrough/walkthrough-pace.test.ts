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
  function playback({ reduced = false, done = true, visible = true, reject = false, webdriver = false, nextTarget = false, presentation = false, captureDelay = 0, savedPresentation = false } = {}) {
    vi.useFakeTimers(); vi.stubGlobal("React", React);
    vi.stubGlobal("navigator", { webdriver });
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    const target = { getClientRects: () => [{}], checkVisibility: () => true };
    vi.stubGlobal("document", { querySelector: () => visible ? target : null });
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    // index, playing, busy, done, error, box, finished, waiting, expanded, holding
    hooks.states = [0, true];
    const autoAction = vi.fn(async (_: HTMLElement, signal: AbortSignal, present?: (title: string, words: string) => Promise<void>) => {
      if (reject) throw new Error("Rejected action");
      if (presentation) {
        await present!("Read", "sample words");
        signal.throwIfAborted();
        if (captureDelay) await new Promise(resolve => setTimeout(resolve, captureDelay));
        signal.throwIfAborted(); done = true;
        if (savedPresentation) await present!("Saved", "review the draft");
      }
    });
    renderToStaticMarkup(React.createElement(Walkthrough, {
      steps: [{ id: "last", timeoutMs: 1000, target: "#last", title: "Check", words: "the saved result", isDone: () => done, autoAction }, ...(nextTarget ? [{ id: "next", target: "#next", title: "Next", words: "Ready", isDone: () => true, autoAction }] : [])], onClose: () => {},
    }));
    hooks.effects[3]!();
    return { autoAction, controller: hooks.refs[1]!.current as AbortController, reveal: () => { visible = true; } };
  }
  it("autoplay Next waits for capture then advances without another hold", async () => {
    playback({ done: false, presentation: true, captureDelay: 200, savedPresentation: true });
    await vi.advanceTimersByTimeAsync(650);
    (hooks.refs[3]!.current as () => void)();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(199);
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hooks.setters[6]).toHaveBeenCalledWith(true);
    expect(hooks.setters[9]!.mock.calls.filter(([value]) => value === true)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("Stop after Next still prevents advancement while capture is pending", async () => {
    const { controller } = playback({ done: false, presentation: true, captureDelay: 200, savedPresentation: true });
    await vi.advanceTimersByTimeAsync(650);
    (hooks.refs[3]!.current as () => void)();
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.advanceTimersByTimeAsync(400);
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("sample presentation holds outside the business deadline and Next cannot complete capture", async () => {
    const { controller } = playback({ done: false, presentation: true });
    await vi.advanceTimersByTimeAsync(650);
    expect(hooks.setters[9]).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(false);
    expect(hooks.setters[0]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(readingTime("Read", "sample words") - 2000);
    expect(controller.signal.aborted).toBe(false);
    // Saved completion is followed by the existing completed-result hold.
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    controller.abort(); await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])("sample presentation cancellation leaves capture incomplete (reduced: %s)", async reduced => {
    const { controller } = playback({ done: false, presentation: true, reduced });
    await vi.advanceTimersByTimeAsync(650);
    if (reduced) await vi.advanceTimersByTimeAsync(60000);
    expect(controller.signal.aborted).toBe(false);
    controller.abort(); await vi.advanceTimersByTimeAsync(0);
    expect(hooks.setters[0]).not.toHaveBeenCalled();
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("webdriver bypasses sample presentation as well as result reading", async () => {
    playback({ done: false, presentation: true, webdriver: true });
    await vi.advanceTimersByTimeAsync(650);
    expect(hooks.setters[9]).not.toHaveBeenCalledWith(true);
    expect(hooks.setters[6]).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("waits for a deferred visible control before executing autoplay and confirming completion", async () => {
    const { autoAction, reveal } = playback({ visible: false, done: false, reduced: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(autoAction).not.toHaveBeenCalled();
    expect(hooks.setters[0]).not.toHaveBeenCalled();
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    reveal(); await vi.advanceTimersByTimeAsync(101);
    expect(autoAction).toHaveBeenCalledOnce();
    // Readiness and a resolved action do not establish saved completion.
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("advances once saved completion is already true when a deferred target appears", async () => {
    const { autoAction, reveal } = playback({ visible: false, reduced: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    reveal(); await vi.advanceTimersByTimeAsync(100);
    expect(autoAction).not.toHaveBeenCalled();
    expect(hooks.setters[6]).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stopping while the next control is mounting prevents any later action or advance", async () => {
    const { autoAction, controller, reveal } = playback({ visible: false, done: false, reduced: true });
    await vi.advanceTimersByTimeAsync(300);
    controller.abort(); reveal(); await vi.advanceTimersByTimeAsync(1000);
    expect(autoAction).not.toHaveBeenCalled();
    expect(hooks.setters[0]).not.toHaveBeenCalled();
    expect(hooks.setters[6]).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
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

// Handler/component evidence with explicit trusted-event records, not browser trust proof.
describe("recent human input and spotlight replacements", () => {
  function fixture(initialIndex = 0, recentAtEntry = false) {
    vi.useFakeTimers(); vi.stubGlobal("React", React);
    let now = 0, target: ReturnType<typeof makeTarget> | null;
    const makeTarget = (top = 700, left = 25) => ({
      getClientRects: () => [{}], checkVisibility: () => true, matches: () => true,
      getBoundingClientRect: () => ({ left, top, bottom: top + 44, width: 100, height: 44 }),
      classList: { add: vi.fn(), remove: vi.fn() }, scrollIntoView: vi.fn(), focus: vi.fn(),
    });
    target = makeTarget();
    const documentHandlers = new Map<string, (event: unknown) => void>();
    const windowHandlers = new Map<string, () => void>();
    const add = vi.fn((name: string, handler: (event: unknown) => void, _capture: boolean) => documentHandlers.set(name, handler));
    const remove = vi.fn(); const removeWindow = vi.fn(); const scrollBy = vi.fn();
    let poll!: () => void;
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("navigator", { webdriver: false });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("document", {
      activeElement: null, body: { style: { paddingBottom: "" } },
      querySelectorAll: () => [], querySelector: () => target,
      addEventListener: add, removeEventListener: remove,
    });
    vi.stubGlobal("HTMLElement", class {});
    vi.stubGlobal("window", {
      innerWidth: 390, scrollBy, setTimeout, clearTimeout,
      setInterval: (update: () => void) => { poll = update; return 1; },
      addEventListener: (name: string, handler: () => void) => windowHandlers.set(name, handler),
      removeEventListener: removeWindow,
    });
    const refs: { current: unknown }[] = [];
    let refIndex = 0;
    const refSpy = vi.spyOn(React, "useRef").mockImplementation((current: unknown) => {
      const index = refIndex++;
      return (refs[index] ??= { current });
    });
    let complete = false;
    const autoAction = vi.fn(() => { complete = true; });
    const steps = [0, 1, 2].map(index => ({ id: `step-${index}`, target: "#root", title: "Read", words: "the saved result", isDone: () => complete, autoAction }));
    let tree: React.ReactNode;
    const onClose = vi.fn();
    const states: unknown[] = [initialIndex, false, false, false, "", { left: 0, top: 0, width: 1, height: 1 }, false, false, false, false];
    function render() {
      refIndex = 0; hooks.effects.length = 0; hooks.setters.length = 0; hooks.states = states;
      tree = Walkthrough({ steps, onClose, initialIndex });
    }
    function button(label: string): { onClick: () => void; disabled?: boolean } {
      function find(node: React.ReactNode): { onClick: () => void; disabled?: boolean } | undefined {
        for (const child of React.Children.toArray(node)) {
          if (!React.isValidElement<{ children?: React.ReactNode; onClick: () => void }>(child)) continue;
          if (child.type === "button" && child.props.children === label) return child.props;
          const found = find(child.props.children); if (found) return found;
        }
      }
      const found = find(tree); if (!found) throw new Error(`Missing ${label}`); return found;
    }
    render();
    refs[0]!.current = { focus: vi.fn(), getBoundingClientRect: () => ({ top: 600, height: 150 }) };
    const unmount = hooks.effects[0]!();
    if (recentAtEntry) documentHandlers.get("keydown")?.({ type: "keydown", isTrusted: true });
    let cleanSpotlight = hooks.effects[1]!();
    function replace() { target = makeTarget(720, 35); poll(); return target; }
    function input(name: string, trusted = true, detail: Record<string, unknown> = {}) {
      documentHandlers.get(name)?.({ type: name, isTrusted: trusted, pointerId: 1, changedTouches: [{ identifier: 1 }], ...detail });
    }
    return {
      states, refs, add, remove, removeWindow, windowHandlers, scrollBy, button, render, input, replace, onClose,
      poll: () => poll(), time: (value: number) => { now = value; },
      target: () => target!, clear: () => { target = null; poll(); },
      enter(index: number) {
        if (typeof cleanSpotlight === "function") cleanSpotlight();
        states[0] = index; render(); cleanSpotlight = hooks.effects[1]!();
      },
      cleanup() {
        if (typeof cleanSpotlight === "function") cleanSpotlight();
        if (typeof unmount === "function") unmount();
        refSpy.mockRestore();
      },
    };
  }
  it("re-anchors a shrinking job page only after two stable polls", () => {
    const f = fixture(2);
    try {
      Object.assign(window, { scrollY: 893 });
      let top = -365;
      f.target().getBoundingClientRect = () => ({ left: 25, top, bottom: top + 44, width: 100, height: 44 });
      f.scrollBy.mockImplementation(({ top: delta }: { top: number }) => { top -= delta; });
      f.poll(); // The saved job has shrunk beneath the initial highlight.
      f.poll(); // One equal measurement does not establish a stable layout.
      f.windowHandlers.get("resize")!(); f.windowHandlers.get("scroll")!();
      expect(f.scrollBy).toHaveBeenCalledOnce();
      f.poll();
      expect(f.scrollBy).toHaveBeenCalledTimes(2);
      expect(hooks.setters[5]).toHaveBeenLastCalledWith({ left: 25, top: 12, width: 100, height: 44 });
      // Settling is finished: later viewer scrolling is never corrected.
      top = -100; f.poll(); f.poll(); f.poll();
      expect(f.scrollBy).toHaveBeenCalledTimes(2);
    } finally { f.cleanup(); }
  });
  it("cancels layout settling permanently when the builder takes over", () => {
    const f = fixture(2);
    try {
      f.target().getBoundingClientRect = () => ({ left: 25, top: -365, bottom: -321, width: 100, height: 44 });
      f.poll(); f.input("keydown"); f.poll();
      f.time(2000); f.poll(); f.poll(); f.poll();
      expect(f.scrollBy).toHaveBeenCalledOnce();
    } finally { f.cleanup(); }
  });
  it("ignores viewport movement from scrolling while the initial layout settles", () => {
    const f = fixture();
    try {
      Object.assign(window, { scrollY: 100 });
      f.target().getBoundingClientRect = () => ({ left: 25, top: 600, bottom: 644, width: 100, height: 44 });
      f.poll(); f.poll(); f.poll();
      expect(f.scrollBy).toHaveBeenCalledOnce();
    } finally { f.cleanup(); }
  });
  it("manual re-target after trusted input keeps the phone still; Show me and step start still clear", async () => {
    const f = fixture();
    try {
      expect(f.scrollBy).toHaveBeenCalledOnce();
      f.input("keydown");
      const old = f.target(); const replacement = f.replace();
      // This is the behavioural old-code failure, even if no input listener is registered.
      expect(replacement.scrollIntoView).not.toHaveBeenCalled();
      expect(f.scrollBy).toHaveBeenCalledOnce();
      expect(old.classList.remove).toHaveBeenCalled(); expect(replacement.classList.add).toHaveBeenCalled();
      expect(hooks.setters[5]).toHaveBeenLastCalledWith({ left: 35, top: 720, width: 100, height: 44 });
      expect(hooks.setters[3]).toHaveBeenLastCalledWith(false);
      f.button("I'll do it").onClick(); expect(hooks.setters[7]).toHaveBeenCalledWith(true);
      expect(replacement.focus).toHaveBeenCalledOnce();
      f.states[7] = true; f.render(); f.replace(); expect(f.scrollBy).toHaveBeenCalledOnce();
      f.clear(); f.replace(); expect(f.scrollBy).toHaveBeenCalledOnce();
      f.button("Show me").onClick();
      expect(f.refs[2]!.current).toBe(true); expect(hooks.setters[2]).toHaveBeenCalledWith(true);
      f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(2);
      (f.refs[1]!.current as AbortController).abort(); await vi.advanceTimersByTimeAsync(0);
      f.input("keydown"); f.enter(1);
      expect(f.scrollBy).toHaveBeenCalledTimes(3);
      f.poll(); f.windowHandlers.get("scroll")!(); f.windowHandlers.get("resize")!();
      expect(f.scrollBy).toHaveBeenCalledTimes(3);
      f.button("Back").onClick();
      expect(hooks.setters[7]).toHaveBeenCalledWith(false);
      expect(hooks.setters[1]).toHaveBeenCalledWith(false);
      f.enter(0); expect(f.scrollBy).toHaveBeenCalledTimes(4);
      f.enter(2); expect(f.scrollBy).toHaveBeenCalledTimes(5);
    } finally { f.cleanup(); }
  });
  it("Show me input cannot suppress next-step clearance after execution finishes", async () => {
    const f = fixture();
    try {
      // A trusted click starts Show me; its action can finish within the input window.
      f.input("pointerdown"); f.input("pointerup");
      f.button("Show me").onClick();
      await vi.advanceTimersByTimeAsync(650);
      expect(f.refs[2]!.current).toBe(false);
      expect(hooks.setters[0]).toHaveBeenCalled();
      f.enter(1);
      const replacement = f.replace();
      expect(replacement.scrollIntoView).toHaveBeenCalledOnce();
      expect(f.scrollBy).toHaveBeenCalledTimes(3);
      // Fresh manual input on the new screen still suppresses subsequent replacements.
      f.input("keydown");
      expect(f.replace().scrollIntoView).not.toHaveBeenCalled();
    } finally { f.cleanup(); }
  });
  it.each(["pointerdown", "touchstart", "keydown"])("accepts only trusted %s; exact expiry never defers a skipped target", type => {
    const f = fixture();
    try {
      f.input(type, false); f.time(2000); f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(2);
      f.input(type); f.input("pointerup"); f.input("touchend");
      f.time(2999); const skipped = f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(2);
      f.time(3000); f.poll(); expect(skipped.scrollIntoView).not.toHaveBeenCalled();
      f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(3);
    } finally { f.cleanup(); }
  });
  it.each([
    ["pointerdown", "pointerup", "pointercancel"], ["touchstart", "touchend", "touchcancel"],
  ])("retains multiple %s contacts past expiry until trusted release/cancel or blur", (start, end, cancel) => {
    const f = fixture();
    const contact = (id: number) => ({ pointerId: id, changedTouches: [{ identifier: id }] });
    try {
      f.input(start, true, contact(1)); f.input(start, true, contact(2)); f.time(2000);
      f.input(end, false, contact(1)); f.input(cancel, false, contact(2));
      f.replace(); expect(f.scrollBy).toHaveBeenCalledOnce();
      f.input(end, true, contact(1)); f.replace(); expect(f.scrollBy).toHaveBeenCalledOnce();
      f.input(cancel, true, contact(2)); f.poll(); expect(f.scrollBy).toHaveBeenCalledOnce();
      f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(2);
      f.input(start, true); f.time(4000); f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(2);
      f.windowHandlers.get("blur")!(); f.poll(); expect(f.scrollBy).toHaveBeenCalledTimes(2);
      f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(3);
      // Both native event streams must finish without a stale contact.
      f.input("pointerdown"); f.input("touchstart"); f.time(6000);
      f.input("pointercancel"); f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(3);
      f.input("touchcancel"); f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(4);
    } finally { f.cleanup(); }
  });
  it("reads current Play state in the existing poll and clears throughout the reading hold", async () => {
    const f = fixture();
    try {
      f.input("keydown"); f.button("Play the whole thing").onClick();
      expect(hooks.setters[1]).toHaveBeenCalledWith(true);
      f.states[1] = true; f.render();
      // Poll predates Play's render and action; it must see current playing.
      f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(2);
      hooks.effects[3]!();
      expect(f.refs[2]!.current).toBe(true);
      f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(650);
      expect(hooks.setters[9]).toHaveBeenCalledWith(true);
      expect(f.refs[2]!.current).toBe(true);
      expect(hooks.setters[2]).not.toHaveBeenCalledWith(false);
      f.replace(); expect(f.scrollBy).toHaveBeenCalledTimes(4);
      const actionSetters = [...hooks.setters];
      f.states[9] = true; f.render(); f.button("Next").onClick();
      await vi.advanceTimersByTimeAsync(0);
      expect(actionSetters[7]).toHaveBeenCalledWith(false);
      expect(actionSetters[0]).toHaveBeenCalled();
      expect(f.refs[2]!.current).toBe(false);
      f.states[1] = false; f.render(); f.input("keydown"); f.replace();
      expect(f.scrollBy).toHaveBeenCalledTimes(4);
    } finally { (f.refs[1]!.current as AbortController | null)?.abort(); f.cleanup(); }
  });
  it("Stop then Close settles reading and reopens idle at the current step with Play enabled", async () => {
    const f = fixture(1);
    let resumeIndex = 0;
    try {
      f.states[1] = true; f.render(); hooks.effects[3]!();
      await vi.advanceTimersByTimeAsync(650);
      expect(hooks.setters[9]).toHaveBeenCalledWith(true);
      const controller = f.refs[1]!.current as AbortController;
      f.states[2] = true; f.states[9] = true; f.render();
      f.button("Stop playback").onClick();
      expect(controller.signal.aborted).toBe(true);
      expect(f.refs[2]!.current).toBe(false);
      expect(f.refs[3]!.current).toBeNull();
      expect(hooks.setters[2]).toHaveBeenCalledWith(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      f.button("Close walkthrough").onClick();
      expect(f.onClose).toHaveBeenCalledExactlyOnceWith(1);
      resumeIndex = f.onClose.mock.calls[0]![0] as number;
    } finally { f.cleanup(); }
    const reopened = fixture(resumeIndex);
    try {
      expect(reopened.states[0]).toBe(1);
      expect(reopened.refs[1]!.current).toBeNull();
      expect(reopened.refs[2]!.current).toBe(false);
      expect(reopened.button("Play the whole thing").disabled).toBe(false);
      reopened.states[1] = true; reopened.render(); hooks.effects[3]!();
      await vi.advanceTimersByTimeAsync(650);
      const controller = reopened.refs[1]!.current as AbortController;
      // Navigation/unmount also cancels a fresh reading hold.
      reopened.cleanup();
      expect(controller.signal.aborted).toBe(true);
      expect(reopened.refs[2]!.current).toBe(false);
      expect(reopened.refs[3]!.current).toBeNull();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { reopened.cleanup(); }
  });
  it("registers and removes every native capture listener and the blur listener", () => {
    const f = fixture(); f.cleanup();
    const names = ["pointerdown", "pointerup", "pointercancel", "touchstart", "touchend", "touchcancel", "keydown"];
    expect(f.add.mock.calls.map(call => call[0]).sort()).toEqual(names.sort());
    for (const call of f.add.mock.calls) {
      expect(call[2]).toBe(true);
      expect(f.remove).toHaveBeenCalledWith(...call);
    }
    expect(f.removeWindow).toHaveBeenCalledWith("blur", f.windowHandlers.get("blur"));
  });

  it("clears a resumed step's first highlight despite trusted input before highlighting", () => {
    const f = fixture(1, true);
    try {
      // Separate root scroll and first dock-clearance attempt both remain.
      expect(f.target().scrollIntoView).toHaveBeenCalledTimes(2);
      expect(f.scrollBy).toHaveBeenCalledOnce();
      const replacement = f.replace();
      expect(replacement.scrollIntoView).not.toHaveBeenCalled();
      f.poll(); f.windowHandlers.get("resize")!();
      expect(f.scrollBy).toHaveBeenCalledOnce();
    } finally { f.cleanup(); }
  });

});
