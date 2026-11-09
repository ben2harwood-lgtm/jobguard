import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPhoneDock, readingPause, readingTime } from "./walkthrough";
import { coreGuideSteps } from "../../demo-s/core-1000/instruction-tour";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
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
  it("Stop interrupts immediately and leaves no timer", async () => {
    vi.useFakeTimers(); const controller = new AbortController(); const advanced = vi.fn();
    const pause = readingPause(15000, false, controller.signal, () => {}).then(() => { if (!controller.signal.aborted) advanced(); });
    controller.abort(); await pause; expect(advanced).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
describe("390px dock geometry", () => {
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
