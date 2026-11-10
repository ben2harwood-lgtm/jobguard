import { readingPause, viewerPacing, viewerPlayback } from "../../ui/walkthrough/walkthrough";

/** Operate existing screen controls. Never synthesize saved business state. */
export const screen = () => document.getElementById("walk-screen")!;
export const text = (id: string) => screen()?.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
export async function until(check: () => boolean, signal: AbortSignal) {
  while (!check()) {
    signal.throwIfAborted();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  signal.throwIfAborted();
}
async function point(element: HTMLElement, signal?: AbortSignal) {
  document.querySelectorAll("[data-walk-action]").forEach(element => element.removeAttribute("data-walk-action"));
  element.setAttribute("data-walk-action", "true");
  element.scrollIntoView({ block: "center", behavior: "instant" });
  if (signal && viewerPlayback.has(signal) && viewerPacing()) {
    await readingPause(1200, false, signal, () => {});
  }
  signal?.throwIfAborted();
}
export async function click(name: string, signal: AbortSignal) {
  let button: HTMLButtonElement | undefined;
  await until(() => {
    button = [...screen().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === name && b.getClientRects().length > 0 && !b.disabled && !b.closest("fieldset[disabled]"));
    return !!button;
  }, signal);
  await point(button!, signal);
  button!.click();
  await new Promise(resolve => setTimeout(resolve, 0));
}
export async function fill(selector: string, value: string) {
  const element = screen().querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  if (!element) throw new Error("This field is not ready. Check the screen before continuing.");
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
}
export async function reviewAndPrice(signal: AbortSignal) {
  await until(() => !!screen().querySelector(".review-line"), signal);
  for (const input of screen().querySelectorAll<HTMLInputElement>('.review-line input[aria-label^="Description "]')) {
    await click(`Accept ${input.value}`, signal);
  }
  for (const input of screen().querySelectorAll<HTMLInputElement>('input[aria-label^="Answer "]')) await fill(`[aria-label=${JSON.stringify(input.getAttribute("aria-label"))}]`, "Builder removes fictional waste");
  await click("Confirm scope", signal);
  await click("Price the work", signal);
  await until(() => screen().querySelector(".quote-editor")?.getAttribute("data-quote-ready") === "true", signal);
  await click("Save draft revision", signal);
  await until(() => Number(text("quote-revision")) > 0, signal);
}
