import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WalkIt } from "./jobguard-app";
import { ReviewProposal, type ReviewCaptureResult } from "./review-proposal";
import { LocalDictation, type LocalSpeechAdapter } from "./local-dictation";
import { mobileQuote } from "./rt10-mobile.fixtures";

// Same hook/event-harness convention as review-proposal.test.tsx. No layout or
// server-persistence claims: geometry is exercised separately in the opt-in spec.
const hooks = vi.hoisted(() => {
  let cursor = 0, slots: any[] = [];
  const frames = new Map<string, any[]>(), effects: (() => void)[] = [];
  return {
    reset() { frames.clear(); effects.length = 0; },
    render(name: string) { cursor = 0; if (!frames.has(name)) frames.set(name, []); slots = frames.get(name)!; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: any) {
      const index = cursor++, frame = slots;
      if (!(index in frame)) frame[index] = typeof initial === "function" ? initial() : initial;
      return [frame[index], (value: any) => { frame[index] = typeof value === "function" ? value(frame[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn: () => unknown) { return fn(); },
    useEffect(fn: () => void, dependencies: unknown[]) {
      const index = cursor++, previous = slots[index];
      if (!previous || !dependencies.every((value, i) => Object.is(value, previous[i]))) { slots[index] = dependencies; effects.push(fn); }
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
const button = (tree: React.ReactNode, name: string) => all(tree, n => n.type === "button" && (n.props["aria-label"] ?? text(n)) === name)[0]!;
const field = (tree: React.ReactNode, label: string) => all(tree, n => n.props["aria-label"] === label)[0]!;
const change = (node: Node, value: string) => node.props.onChange({ target: { value } });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function reviewPanel(result: ReviewCaptureResult, name = "review") {
  return () => { hooks.render(name); const tree = ReviewProposal({ result, back: vi.fn() }); hooks.effects(); return tree; };
}
beforeEach(() => { hooks.reset(); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());

it.each([1, 10, 30, 100])("RT-10-component-%i: preserves every spoken panel and amount in the review", count => {
  const result = mobileQuote(count), tree = reviewPanel(result)();
  expect(all(tree, n => n.type === "article")).toHaveLength(count);
  for (let index = 1; index <= count; index++) {
    expect(field(tree, `Description Paint panel ${index}`).props.value).toBe(`Paint panel ${index}`);
    expect(field(tree, `Price Paint panel ${index}`).props.value).toBe("125.00");
  }
  expect(text(all(tree, n => n.type === "pre")[0])).toBe(result.source.text);
  expect(text(all(tree, n => n.props["data-testid"] === "running-total"))).toBe(`Total so far £${(count * 125).toLocaleString("en-GB", { minimumFractionDigits: 2 })} · complete`);
});

it("RT-10-questions: all twenty questions have distinct, full screen-reader answer labels", () => {
  const tree = reviewPanel(mobileQuote(20, { questions: 20 }))();
  for (let index = 1; index <= 20; index++) {
    const question = `Which finish should I use on panel ${index}?`;
    expect(field(tree, `Answer ${question}`).props.value).toBe("");
    expect(text(all(tree, n => n.type === "p"))).toContain(question);
  }
});

it("RT-10-max: the exact £999,999.99 said is retained in the editable field and totals", () => {
  const tree = reviewPanel(mobileQuote(1, { maximum: true }))();
  expect(field(tree, "Price Paint panel 1").props.value).toBe("999999.99");
  expect(text(all(tree, n => n.props["data-testid"] === "line-total"))).toBe("Line total: £999,999.99");
  expect(text(all(tree, n => n.props["data-testid"] === "running-total"))).toBe("Total so far £999,999.99 · complete");
});

it("RT-10-long: 500-character descriptions and 100-character rooms keep their complete source and accessible names", () => {
  const result = mobileQuote(1, { long: true }), line = result.review!.lines[0]!, tree = reviewPanel(result)();
  expect(line.description).toHaveLength(500);
  expect(field(tree, `Description ${line.description}`).props.value).toBe(line.description);
  expect(field(tree, `Price ${line.description}`)).toBeDefined();
  expect(all(tree, n => n.props["data-testid"] === "room-group")[0]!.props["aria-label"]).toBe(line.room);
  expect(text(all(tree, n => n.type === "blockquote"))).toContain(line.sourceExcerpt!);
});

it("RT-10-edit-reopen: a typed £999,999.99 edit survives Save and a fresh review mount (mocked response)", async () => {
  const result = mobileQuote(), render = reviewPanel(result);
  let saved = result;
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(init.body as string);
    saved = { ...result, review: { ...command.review, revision: command.expectedRevision + 1 } };
    return Response.json(saved);
  });
  vi.stubGlobal("fetch", fetch);
  change(field(render(), "Price Paint panel 1"), "999999.99");
  await button(render(), "Save review").props.onClick(); await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(saved.review!.lines[0]!.unitPricePence).toBe(99999999);
  expect(field(reviewPanel(saved, "reopened")(), "Price Paint panel 1").props.value).toBe("999999.99");
  expect(saved.source.text).toBe("In the Kitchen. Paint panel 1 for £125.00.");
});

it("RT-10-split-merge: editable children combine once, retain parent lineage and save without invented money", async () => {
  const result = mobileQuote(), render = reviewPanel(result);
  let saved = result;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(init.body as string);
    saved = { ...result, review: { ...command.review, revision: command.expectedRevision + 1 } };
    return Response.json(saved);
  }));
  button(render(), "Split Paint panel 1").props.onClick();
  change(field(render(), "Description Paint panel 1 — part A"), "Paint panel front");
  change(field(render(), "Description Paint panel 1 — part B"), "Paint panel edges");
  for (const description of ["Paint panel front", "Paint panel edges"]) field(render(), `Select ${description} for merge`).props.onChange({ target: { checked: true } });
  button(render(), "Merge selected (2)").props.onClick();
  await button(render(), "Save review").props.onClick(); await settle();
  const rows = saved.review!.lines, active = rows.filter(row => row.disposition === "accepted" || row.disposition === "proposed");
  expect(active).toHaveLength(1);
  expect(active[0]!.description).toContain("Paint panel front");
  expect(active[0]!.description).toContain("Paint panel edges");
  expect(active[0]!.unitPricePence).toBeNull();
  expect(active[0]!.parentScopeItemIds).toHaveLength(2);
  expect(rows.filter(row => row.disposition === "split")).toHaveLength(1);
  expect(rows.filter(row => row.disposition === "merged")).toHaveLength(2);
  expect(all(reviewPanel(saved, "reopened")(), n => n.type === "article")).toHaveLength(4);
});

it.each(["not-allowed", "service-not-allowed", "audio-capture", "no-speech", "network"])("RT-10-mic-%s: preserves completed words and keeps the typing fallback usable", async code => {
  let callbacks!: Parameters<LocalSpeechAdapter["start"]>[0];
  const adapter: LocalSpeechAdapter = {
    configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
    available: async () => "installed", install: async () => true,
    start: value => { callbacks = value; return { stop: vi.fn(), cancel: vi.fn() }; },
  };
  vi.stubGlobal("window", { __JOBGUARD_SPEECH_ADAPTER__: adapter });
  const onUse = vi.fn();
  const render = () => { hooks.render("dictation"); const tree = LocalDictation({ onUse }); hooks.effects(); return tree; };
  render(); await settle();
  button(render(), "Talk through a quote").props.onClick();
  callbacks.final("Paint panel 1 for £125.00.", "one");
  callbacks.interim("and paint the door");
  callbacks.error(code);
  const tree = render();
  expect(text(all(tree, n => n.props.role === "status"))).toMatch(/type/i);
  const transcript = all(tree, n => n.type === "textarea")[0]!;
  expect(transcript.props.value).toBe("Paint panel 1 for £125.00.");
  expect(transcript.props.disabled).toBe(false);
  change(transcript, "Paint panel 1 for £150.00.");
  button(render(), "Use these words").props.onClick();
  expect(onUse).toHaveBeenCalledWith("Paint panel 1 for £150.00.", "Paint panel 1 for £125.00.");
  hooks.render("walk");
  const walk = WalkIt({ tenantId: "rt10-fictional-firm", close: vi.fn(), initialText: "", mode: "own" });
  expect(all(walk, n => n.type === "textarea")[0]!.props.disabled).toBe(false);
  expect(button(walk, "Make my draft").props.disabled).toBe(false);
});

it.each(["iOS Safari capability refusal", "Firefox capability refusal"])("RT-10-unsupported: %s states the typing alternative (injected adapter)", async () => {
  vi.stubGlobal("window", { __JOBGUARD_SPEECH_ADAPTER__: {
    configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
    available: async () => "unavailable", install: vi.fn(), start: vi.fn(),
  } });
  const render = () => { hooks.render("dictation"); const tree = LocalDictation({ onUse: vi.fn() }); hooks.effects(); return tree; };
  render(); await settle();
  expect(text(render())).toContain("Voice doesn't work in this browser. Type the job below. It works the same way.");
  expect(button(render(), "Talk through a quote").props.disabled).toBe(true);
});
