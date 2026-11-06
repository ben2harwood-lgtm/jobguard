"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./walkthrough.module.css";

/** Completion must read actual screen/saved state; an action resolving is not completion.
 * Actions must use the screen's existing controls and respect cancellation. */
export type WalkthroughStep = {
  id: string;
  target: string;
  title: string;
  words: string;
  isDone: () => boolean;
  autoAction: (target: HTMLElement, signal: AbortSignal) => void | Promise<void>;
};
type Box = { left: number; top: number; width: number; height: number };
export function visibleTarget(selector: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || !element.getClientRects().length) return null;
  return element;
}

export function Walkthrough({ steps, onClose }: { steps: readonly WalkthroughStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  const [box, setBox] = useState<Box | null>(null), [finished, setFinished] = useState(false), [waiting, setWaiting] = useState(false);
  const card = useRef<HTMLElement>(null), action = useRef<AbortController | null>(null), running = useRef(false);
  const step = steps[index];
  const stop = () => { action.current?.abort(); setPlaying(false); };
  // Restore focus, page spacing and target styling on exit, including navigation/unmount.
  useEffect(() => {
    const previous = document.activeElement, padding = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "360px";
    return () => { action.current?.abort(); document.body.style.paddingBottom = padding; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!step || finished) return;
    setDone(false); setError(""); setBox(null);
    card.current?.focus({ preventScroll: true });
    let highlighted: HTMLElement | null = null;
    function update() {
      const target = visibleTarget(step!.target);
      if (highlighted !== target) { highlighted?.classList.remove(styles.target!); highlighted = target; highlighted?.classList.add(styles.target!); }
      if (target) {
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
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const target = visibleTarget(step.target);
      if (!target) throw new Error("This step's control is unavailable. Stop the tour or return when the screen is ready.");
      if (!step.isDone()) {
        const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650;
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
      if (!controller.signal.aborted && visibleTarget(step.target)) advance();
      else throw new Error("Stopped. This step has not been confirmed; check the screen before continuing.");
    } catch (failure) { setPlaying(false); setError(failure instanceof Error ? failure.message : "The step could not complete."); }
    finally { clearTimeout(timeout); running.current = false; setBusy(false); }
  }
  useEffect(() => { if (waiting && done && !busy) advance(); }, [waiting, done, busy]);
  useEffect(() => { if (playing && !busy && !finished) void show(); }, [playing, busy, index, finished]); // one action at a time
  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { action.current?.abort(); setPlaying(false); onClose(); } }
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  if (!step) return null;
  return <>
    {box && !finished && <><div aria-hidden="true" className={styles.spotlight} style={box} />
      {(busy || playing) && <div aria-hidden="true" className={styles.pointer} style={{ left: box.left + Math.min(box.width / 2, 40), top: box.top + box.height / 2 }}>➤</div>}</>}
    <section ref={card} tabIndex={-1} className={styles.card} aria-label="Guided walkthrough">
      <div aria-live="polite" aria-atomic="true">
        <h2>{finished ? "Tour complete" : `Step ${index + 1} of ${steps.length} · ${step.title}`}</h2>
        <p>{finished ? "The walkthrough reached its end. Only the real screens and saved records establish job progress." : step.words}</p>
      </div>
      {error && <p role="alert">{error}</p>}
      {!box && !finished && <p role="status">Waiting for this step's control to become visible.</p>}
      {!finished && <div className={styles.controls}>
        <button disabled={index === 0 || busy || playing} onClick={() => { stop(); setWaiting(false); setIndex(value => value - 1); }}>Back</button>
        <button disabled={busy || playing || !box} onClick={() => { setWaiting(true); visibleTarget(step.target)?.focus(); }}>I'll do it</button>
        <button disabled={busy || playing || !box} onClick={() => void show()}>Show me</button>
        <button disabled={!done || busy || playing} onClick={advance}>Next</button>
        <button disabled={playing || busy || !box} onClick={() => setPlaying(true)}>Play the whole thing</button>
        {(playing || busy) && <button onClick={stop}>Stop playback</button>}
      </div>}
      <button onClick={() => { stop(); onClose(); }}>Close walkthrough</button>
    </section>
  </>;
}
