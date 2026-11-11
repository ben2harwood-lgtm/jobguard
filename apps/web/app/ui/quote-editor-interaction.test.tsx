import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuoteEditor } from "./quote-editor";

const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: any[] = [], effects: (() => void)[] = [];
  return {
    seed(parties: boolean | null) { slots[1] = parties; slots[8] = true; },
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn: () => unknown) { return fn(); },
    useEffect(fn: () => void, deps: unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old || !deps.every((value, i) => Object.is(value, old[i]))) { slots[index] = deps; effects.push(fn); }
    },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), useContext: () => 0, ...hooks }));
type Node = React.ReactElement<Record<string, any>>;
function all(tree: React.ReactNode, match: (node: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => all(child, match));
  if (!React.isValidElement<Record<string, any>>(tree)) return [];
  return [...(match(tree) ? [tree] : []), ...all(tree.props.children, match)];
}
function text(tree: React.ReactNode): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Record<string, any>>(tree)) return text(tree.props.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}

const jobId = "11111111-1111-4111-8111-111111111112";
const props = {jobId, source: [], questions: [], back: () => undefined, practiceTools: null};
beforeEach(() => { hooks.reset(); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());
function render(parties: boolean | null, layoutReady = true) {
 // Seed only completed reads; retain the actual state setters and ref guard.
 hooks.seed(parties);
 hooks.render();
 return QuoteEditor({...props, layoutReady});
}
const saveButton = (tree: React.ReactNode) => all(tree, node => node.type === "button" && text(node) === "Save draft revision")[0]!;

it("keeps saving disabled until parties and the panels above pricing have settled", () => {
 for (const [parties, layoutReady, ready] of [[null, true, false], [true, false, false], [false, true, true], [true, true, true]] as const) {
  hooks.reset();
  const tree = render(parties, layoutReady);
  expect(tree.props["data-quote-ready"]).toBe(ready ? "true" : "false");
  expect(saveButton(tree).props.disabled).toBe(!ready);
 }
});

it("accepts a second tap when the first missed, guards an in-flight save and keeps its status below the target", async () => {
 let finish!: (response: Response) => void;
 const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(resolve => { finish = resolve; }));
 vi.stubGlobal("fetch", fetch);
 const tree = render(true);
 // There was no first click handler: the second pointer activation must save.
 saveButton(tree).props.onClick({detail: 2});
 expect(fetch).toHaveBeenCalledTimes(1);
 saveButton(tree).props.onClick({detail: 3});
 expect(fetch).toHaveBeenCalledTimes(1);
 const savingTree = render(true);
 const nodes = all(savingTree, () => true);
 const target = saveButton(savingTree);
 const status = nodes.find(node => node.props.role === "status" && text(node) === "Saving draft revision…")!;
 expect(status).toBeTruthy();
 expect(nodes.indexOf(status)).toBeGreaterThan(nodes.indexOf(target));
 const originalBody = fetch.mock.calls[0]![1]?.body;
 finish(new Response("", {status: 503}));
 await new Promise<void>(resolve => setImmediate(resolve));
 saveButton(render(true)).props.onClick({detail: 2});
 expect(fetch).toHaveBeenCalledTimes(2);
 // The existing draft/revision idempotency identity survives a retry.
 expect(fetch.mock.calls[1]![1]?.body).toBe(originalBody);
 finish(new Response("", {status: 503}));
 await new Promise<void>(resolve => setImmediate(resolve));
});
