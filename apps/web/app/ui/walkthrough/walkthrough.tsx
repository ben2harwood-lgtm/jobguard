"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./walkthrough.module.css";

/** Completion must read actual screen/saved state; an action resolving is not completion.
 * Actions must use the screen's existing controls and respect cancellation. */
export type WalkthroughStep = {
  id: string;
  timeoutMs?: number;
  target: string;
  spotlightTarget?: () => HTMLElement | null;
  title: string;
  words: string;
  isDone: () => boolean;
  autoAction: (target: HTMLElement, signal: AbortSignal) => void | Promise<void>;
};
type Box = { left: number; top: number; width: number; height: number };
export function visibleTarget(selector: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element || !element.getClientRects().length) return null;
  if (typeof element.checkVisibility === "function") {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  } else {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.visibility === "collapse") return null;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).opacity === "0") return null;
    }
  }
  return element;
}

export function readingTime(title: string, words: string) {
  return Math.min(15_000, 4_000 + `${title} ${words}`.trim().split(/\s+/).filter(Boolean).length * 250);
}

/** Only viewer autoplay opts nested screen actions into presentation pacing. */
export const viewerPlayback = new WeakSet<AbortSignal>();
export function viewerPacing() {
  if (typeof navigator !== "undefined" && navigator.webdriver) return false;
  return !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** Deadlines, target readiness, user input and cancellation all release the hold. */
export function readingPause(ms: number, reduced: boolean, signal: AbortSignal, registerSkip: (skip: () => void) => void, ready?: () => boolean) {
  return new Promise<void>(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined, poll: ReturnType<typeof setInterval> | undefined;
    const events = ["pointerdown", "keydown", "input", "click", "wheel"] as const;
    const input = () => finish();
    const finish = () => {
      clearTimeout(timer); clearInterval(poll); signal.removeEventListener("abort", finish);
      if (typeof document !== "undefined") for (const event of events) document.removeEventListener?.(event, input, true);
      resolve();
    };
    registerSkip(finish);
    if (signal.aborted || ready?.()) finish();
    else {
      signal.addEventListener("abort", finish, { once: true });
      if (typeof document !== "undefined") for (const event of events) document.addEventListener?.(event, input, true);
      if (ready) poll = setInterval(() => { if (ready()) finish(); }, 50);
      if (!reduced) timer = setTimeout(finish, ms);
    }
  });
}

/** Keep even the last control above the dock, after its normal scrollIntoView. */
export function clearPhoneDock(target: HTMLElement, dock: HTMLElement) {
  if (window.innerWidth > 480) return;
  const rect = target.getBoundingClientRect(), bar = dock.getBoundingClientRect();
  const overlap = rect.bottom - (bar.top - 12);
  if (rect.top < 12) window.scrollBy({ top: rect.top - 12, behavior: "instant" });
  else if (overlap > 0 && rect.height < bar.top - 12) window.scrollBy({ top: overlap, behavior: "instant" });
}

export function Walkthrough({ steps, onClose, initialIndex = 0 }: { steps: readonly WalkthroughStep[]; onClose: () => void; initialIndex?: number }) {
  const [index, setIndex] = useState(initialIndex), [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  const [box, setBox] = useState<Box | null>(null), [finished, setFinished] = useState(false), [waiting, setWaiting] = useState(false);
  const card = useRef<HTMLElement>(null), action = useRef<AbortController | null>(null), running = useRef(false);
  const instructionOnly = steps.every(step => step.id.startsWith("core-guide-"));
  const [expanded, setExpanded] = useState(instructionOnly), [holding, setHolding] = useState(false);
  const skip = useRef<(() => void) | null>(null);
  const step = steps[index];
  const stop = () => { action.current?.abort(); setPlaying(false); setHolding(false); };
  const stopKey = (event: React.KeyboardEvent) => { if (event.key === " " || event.key === "Enter") stop(); };
  // Restore focus, page spacing and target styling on exit, including navigation/unmount.
  useEffect(() => {
    const previous = document.activeElement, padding = document.body.style.paddingBottom;
    const reserve = () => { document.body.style.paddingBottom = `${card.current?.getBoundingClientRect().height ?? 360}px`; };
    reserve();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reserve);
    if (card.current) observer?.observe(card.current);
    return () => { observer?.disconnect(); action.current?.abort(); document.body.style.paddingBottom = padding; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!step) return;
    if (finished) { card.current?.focus({ preventScroll: true }); return; }
    document.querySelectorAll("[data-walk-action]").forEach(element => element.removeAttribute("data-walk-action"));
    setDone(false); setError(""); setBox(null);
    card.current?.focus({ preventScroll: true });
    let highlighted: HTMLElement | null = null;
    function update() {
      const root = visibleTarget(step!.target);
      const target = step!.spotlightTarget?.() ?? (root?.matches("button, input, textarea, select, a[href]") ? root : root?.querySelector<HTMLElement>("textarea, input, select, button, a[href]") ?? root);
      if (highlighted !== target) { highlighted?.classList.remove(styles.target!); highlighted = target; highlighted?.classList.add(styles.target!); }
      if (target) {
        if (card.current) clearPhoneDock(target, card.current);
        const rect = target.getBoundingClientRect();
        setBox({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        setDone(step!.isDone());
      } else { setBox(null); setDone(false); }
    }
    const target = visibleTarget(step.target);
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    update();
    const interval = window.setInterval(update, 200);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { clearInterval(interval); highlighted?.classList.remove(styles.target!); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [step, finished]);
  function advance() {
    if (!step || !visibleTarget(step.target) || !step.isDone()) return;
    setWaiting(false);
    if (index === steps.length - 1) { setFinished(true); setPlaying(false); }
    else setIndex(value => value + 1);
  }
  async function show() {
    if (!step || running.current) return;
    running.current = true; setBusy(true); setError("");
    const controller = new AbortController(); action.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), step.timeoutMs ?? 12_000);
    if (playing && viewerPacing()) viewerPlayback.add(controller.signal);
    try {
      const target = visibleTarget(step.target);
      if (!target) throw new Error("This step's control is unavailable. Stop the tour or return when the screen is ready.");
      if (!step.isDone()) {
        const delay = 1200;
        await new Promise<void>(resolve => {
          const timer = window.setTimeout(resolve, delay);
          controller.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
        });
        if (controller.signal.aborted) return;
        await Promise.race([
          step.autoAction(target, controller.signal),
          new Promise<void>(resolve => controller.signal.addEventListener("abort", () => resolve(), { once: true })),
        ]);
      }
      while (!controller.signal.aborted && !step.isDone()) await new Promise(resolve => window.setTimeout(resolve, 100));
      if (!controller.signal.aborted && visibleTarget(step.target)) {
        clearTimeout(timeout);
        if (viewerPlayback.has(controller.signal) && steps[index + 1]) {
          setHolding(true);
          await readingPause(readingTime(step.title, step.words), false, controller.signal, next => { skip.current = next; },
            () => !!steps[index + 1] && !!visibleTarget(steps[index + 1]!.target));
          skip.current = null; setHolding(false);
        }
        if (!controller.signal.aborted) advance();
      }
      else throw new Error("Stopped. This step has not been confirmed; check the screen before continuing.");
    } catch (failure) { setPlaying(false); setError(failure instanceof Error ? failure.message : "The step could not complete."); }
    finally { viewerPlayback.delete(controller.signal); clearTimeout(timeout); running.current = false; setBusy(false); }
  }
  useEffect(() => { if (waiting && done && !busy) advance(); }, [waiting, done, busy]);
  useEffect(() => { if (playing && !busy && !finished) void show(); }, [playing, busy, index, finished]); // one action at a time
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest('dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true]') || document.querySelector("dialog:modal")) return;
      if (event.key === "Escape" && !event.defaultPrevented) { action.current?.abort(); setPlaying(false); onClose(); } }
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  if (!step) return null;
  return <>
    {box && !finished && <><div aria-hidden="true" className={styles.spotlight} style={box} />
      {(busy || playing) && <div aria-hidden="true" className={styles.pointer} style={{ left: box.left + Math.min(box.width / 2, 40), top: box.top + box.height / 2 }}>➤</div>}</>}
    <section ref={card} tabIndex={-1} className={`${styles.card} ${expanded || finished ? styles.expanded : styles.collapsed}`} aria-label="Guided walkthrough">
      <div aria-live="polite" aria-atomic="true">
        <h2>{finished ? instructionOnly ? "Tour complete" : "That's the whole job" : `Step ${index + 1} of ${steps.length} · ${step.title}`}</h2>
        <p className={styles.words}>{finished ? instructionOnly ? "The walkthrough reached its end. Only the real screens and saved records establish job progress." : "You have followed the example from the first words to the saved final report." : step.words}</p>
      </div>
      {holding && <div className={styles.progress} role="timer" aria-label="Reading time; Next continues now"><span style={{ animationDuration: `${readingTime(step.title, step.words)}ms` }} /></div>}
      {error && <p role="alert">{error}</p>}
      {!box && !finished && <p role="status">Waiting for this step's control to become visible.</p>}
      {!finished && <div className={styles.controls}>
        <button className={styles.secondary} disabled={index === 0 || busy || playing} onClick={() => { stop(); setWaiting(false); setIndex(value => value - 1); }}>Back</button>
        <button className={styles.secondary} disabled={busy || playing || !box} onClick={() => { setWaiting(true); visibleTarget(step.target)?.focus(); }}>I'll do it</button>
        <button className={holding ? styles.secondary : undefined} disabled={busy || playing || !box} onClick={() => void show()}>Show me</button>
        <button className={holding ? undefined : styles.secondary} disabled={!holding && (!done || busy || playing)} onClick={() => holding ? skip.current?.() : advance()}>Next</button>
        <button className={playing || busy ? styles.secondary : undefined} disabled={playing || busy || !box} onClick={() => setPlaying(true)}>Play the whole thing</button>
        <button className={styles.more} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Less" : "More"}</button>
        {(playing || busy) && <button onPointerDown={stop} onKeyDown={stopKey} onClick={stop}>Stop playback</button>}
      </div>}
      {finished && <div className={styles.controls}>
        <button onClick={() => { stop(); location.assign("/jobs/new"); }}>Start my own job</button>
        <button onClick={() => { stop(); onClose(); document.getElementById("walk-report")?.click(); }}>Read the report again</button>
      </div>}
      <button className={styles.close} onPointerDown={stop} onKeyDown={stopKey} onClick={() => { stop(); onClose(); }}>Close walkthrough</button>
    </section>
  </>;
}
