import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReviewProposal, type ReviewCaptureResult } from "./review-proposal";

// Exercise event handlers with the existing job-sources hook-harness pattern.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: any[] = [], effects: (() => void)[] = [];
  return {
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
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
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
const line = { id: "line", scopeItemId: "scope", origin: "proposal", description: "Protect room", room: "Room", category: "Work", quantity: "1", unit: "item", unitPricePence: 100, disposition: "proposed", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: "Protect the room and doorway." };
const fixture = {
  jobId: "job", reviewId: "review", proposalId: "proposal", status: "draft",
  proposal: { lines: [{ unitPricePence: { value: 100 } }], questions: [] },
  source: { kind: "typed_notes", version: 1, text: line.sourceExcerpt },
  review: { version: "proposal_review_v1", reviewId: "review", proposalId: "proposal", jobId: "job", revision: 3, lines: [line], questions: [] },
} as unknown as ReviewCaptureResult;
beforeEach(() => { hooks.reset(); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());
function panel(result = fixture) {
  const focus = vi.fn(), scroll = vi.fn();
  const render = () => {
    hooks.render();
    const tree = ReviewProposal({ result, back: vi.fn() });
    for (const article of all(tree, node => node.type === "article")) article.props.ref({ querySelector: (selector: string) => selector === "strong" ? { scrollIntoView: scroll } : { focus: () => focus(article.key) } });
    hooks.effects();
    return tree;
  };
  const button = (tree: React.ReactNode, name: string) => all(tree, node => node.type === "button" && (node.props["aria-label"] ?? text(node.props.children)) === name)[0]!;
  return { render, button, focus, scroll };
}
it("keeps full accessible names and walkthrough Accept text with one-word visible actions for a 215-character line", () => {
  const description = "Fictional bathroom refit: ".padEnd(215, "work ");
  const p = panel({ ...fixture, review: { ...fixture.review!, lines: [{ ...fixture.review!.lines[0]!, description }] } });
  const tree = p.render();
  const actions = all(tree, n => n.props.className === "line-actions")[0]!;
  expect(actions.props.style).toMatchObject({ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" });
  for (const name of ["Accept", "Split", "Dismiss"]) {
    const button = p.button(tree, `${name} ${description}`);
    expect(button).toBeDefined();
    const visible = React.Children.toArray(button.props.children).filter(child => !React.isValidElement<Record<string, any>>(child) || child.props.className !== "sr-only");
    expect(text(visible)).toBe(name);
  }
  expect(text(p.button(tree, `Accept ${description}`).props.children)).toBe(`Accept ${description}`);
  expect(all(tree, n => n.props["aria-label"] === `Description ${description}`)[0]!.props.value).toBe(description);
  expect(text(all(tree, n => n.type === "blockquote")[0])).toContain(line.sourceExcerpt);
});
it("announces Split, focuses the first adjacent editable child, and saves the unchanged lineage payload", async () => {
  const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ code: "TEST_RESPONSE" }) }));
  vi.stubGlobal("fetch", fetch);
  const p = panel();
  p.button(p.render(), "Split Protect room").props.onClick();
  expect(fetch).not.toHaveBeenCalled();
  let tree = p.render();
  const articles = all(tree, n => n.type === "article");
  expect(articles).toHaveLength(3);
  expect(text(all(articles[0], n => n.type === "strong")[0])).toBe("split");
  expect(text(all(articles[1], n => n.props.role === "status")[0])).toBe("Split into two lines — edit each description");
  expect(p.focus).toHaveBeenCalledExactlyOnceWith(articles[1]!.key);
  const descriptions = all(tree, n => n.type === "input" && n.props["aria-label"]?.startsWith("Description "));
  expect(descriptions.map(n => n.props.value)).toEqual(["Protect room", "Protect room — part A", "Protect room — part B"]);
  for (const [index, description] of [[1, "Protect doorway"], [2, "Protect floor"]] as const) {
    descriptions[index]!.props.onChange({ target: { value: description } });
  }
  tree = p.render();
  await p.button(tree, "Save review").props.onClick();
  await new Promise<void>(resolve => setImmediate(resolve));
  const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/jobs/job/review");
  expect(options.method).toBe("POST");
  const command = JSON.parse(options.body as string);
  const children = command.review.lines.slice(1);
  expect(command).toEqual({ contractVersion: "proposal_review_command_v1", expectedRevision: 3, review: { ...fixture.review, lines: [{ ...line, disposition: "split" }, ...children] } });
  expect(children).toHaveLength(2);
  for (const [index, child] of children.entries()) expect(child).toEqual({
    ...line, id: expect.any(String), scopeItemId: expect.any(String), origin: "human", description: index === 0 ? "Protect doorway" : "Protect floor", unitPricePence: null, disposition: "accepted", parentScopeItemIds: ["scope"], sourceExcerpt: null,
  });
  expect(new Set(children.flatMap((child: any) => [child.id, child.scopeItemId])).size).toBe(4);
});
it.each([["Accept", "accepted", "Accepted"], ["Dismiss", "dismissed", "Dismissed"]])("announces %s and brings its status badge into view", (action, disposition, announcement) => {
  const p = panel();
  p.button(p.render(), `${action} Protect room`).props.onClick();
  const tree = p.render();
  expect(text(all(tree, n => n.props.role === "status")[0])).toBe(`${announcement}: Protect room`);
  expect(text(all(tree, n => n.type === "strong").find(n => text(n) === disposition))).toBe(disposition);
  expect(p.scroll).toHaveBeenCalledWith({ block: "nearest" });
  expect(p.focus).not.toHaveBeenCalled();
});

it.each(["", "#scope", "#quote"])("preserves locally opened pricing through snapshots at %s and handles explicit navigation", initialFragment => {
 let result = {...fixture, status:"quoting" as ReviewCaptureResult["status"]};
 let fragment = initialFragment;
 const render = () => {
  hooks.render();
  const tree = ReviewProposal({result, fragment, initialPricing:fragment==="#quote", back:vi.fn()});
  hooks.effects();
  return tree;
 };
 let tree = render();
 if (initialFragment !== "#quote") {
  all(tree, node => node.type === "button" && text(node.props.children) === "Price the work")[0]!.props.onClick();
 }
 const editor = () => all(render(), node => typeof node.type === "function" && node.type.name === "QuoteEditor")[0];
 const source = editor()!.props.source;
 result = {...result, status:"live"};
 expect(editor()!.props.source).toEqual(source);
 // Fragment navigation selects the view without destroying review state.
 fragment = "#quote";
 render();
 expect(editor()).toBeDefined();
 fragment = "#scope";
 render();
 expect(editor()).toBeUndefined();
 expect(text(render())).toContain("Price the work");
 fragment = "#quote";
 render();
 expect(editor()!.props.source).toEqual(source);
});
