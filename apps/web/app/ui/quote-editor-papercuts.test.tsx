import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuoteEditor } from "./quote-editor";

// Exercise the component's handlers and refresh effects using the same hook approach as job-parties.test.tsx.
const hooks = vi.hoisted(() => {
  let cursor = 0, generation = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[] }[] = [];
  const effects: (() => void)[] = [];
  return {
    setGeneration(value: number) { generation=value; },
    useContext() { return generation; },
    delivery: "simulated_delivery",
    reset() { generation=0;cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial === "not_issued" ? hooks.delivery : initial };
      return [slots[index]!.value, (value: unknown) => {
        slots[index]!.value = typeof value === "function" ? value(slots[index]!.value) : value;
      }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn: () => unknown) { return fn(); },
    useEffect(fn: () => void, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((value, i) => Object.is(value, old.deps![i]))) {
        slots[index] = { deps };
        effects.push(fn);
      }
    },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));

type Element = React.ReactElement<Record<string, any>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, any>>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Record<string, any>>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
function render() {
  hooks.render();
  const tree = QuoteEditor({ jobId: "11111111-1111-4111-8111-111111111112", source: [{ id: "line", scopeItemId: "11111111-1111-4111-8111-111111111113", description: "Fictional decorating", quantity: "1", unit: "item", rate: 10000, origin: "human", status: "accepted", reason: "", category: "" }], questions: [], back() {} });
  hooks.effects();
  return tree;
}
function input(tree: React.ReactNode, label: string) {
  return elements(tree).find(element => element.props["aria-label"] === label)!;
}
let current: { customer: { name: string } } | null;
let events: EventTarget;
let resolveParties: (() => void) | undefined;
beforeEach(() => {
  hooks.reset(); hooks.delivery = "simulated_delivery";
  current = { customer: { name: "Fictional saved customer" } };
  resolveParties = undefined;
  events = new EventTarget();
  vi.useFakeTimers({ toFake: ["Date"] });
  // Construct a local date so the expected day is independent of the test runner's timezone.
  vi.setSystemTime(new Date(2026, 10, 9, 0, 15));
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", events);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/parties")) {
      if (resolveParties) await new Promise<void>(resolve => { resolveParties = resolve; });
      return { ok: true, json: async () => ({ current }) };
    }
    if (url.endsWith("/preview")) return { ok: true, json: async () => ({ view: { documentVersion: 1, documentId: "fictional-document", contentHash: "fictional-hash", status: "previewed" } }) };
    if (url.endsWith("/delivery")) return { ok: true, json: async () => ({ status: "queued" }) };
    return { ok: false };
  }));
});
afterEach(() => { hooks.reset(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

it("defaults to the saved customer and today's local date", async () => {
  render(); await settle();
  const tree = render();
  expect(input(tree, "Stated customer").props.value).toBe("Fictional saved customer");
  expect(input(tree, "Customer approval date").props.value).toBe("2026-11-09");
});
it("keeps the Synthetic Customer fallback without saved parties", async () => {
  current = null;
  render(); await settle();
  expect(input(render(), "Stated customer").props.value).toBe("Synthetic Customer");
});
it("preserves both edited fields through a parties refresh event", async () => {
  render(); await settle();
  const tree = render();
  input(tree, "Stated customer").props.onChange({ target: { value: "Builder's entered customer" } });
  input(tree, "Customer approval date").props.onChange({ target: { value: "2026-11-08" } });
  current = { customer: { name: "Fictional replacement customer" } };
  events.dispatchEvent(new Event("job-parties-saved"));
  await settle();
  const refreshed = render();
  expect(input(refreshed, "Stated customer").props.value).toBe("Builder's entered customer");
  expect(input(refreshed, "Customer approval date").props.value).toBe("2026-11-08");
});
it("preserves an edit while the initial parties request is pending", async () => {
  resolveParties = () => undefined;
  const tree = render();
  input(tree, "Stated customer").props.onChange({ target: { value: "" } });
  resolveParties!(); await settle();
  expect(input(render(), "Stated customer").props.value).toBe("");
});
it("groups all four queued controls after the real send controls", async () => {
  hooks.delivery = "not_issued";
  render(); await settle();
  const preview = elements(render()).find(element => element.type === "button" && text(element) === "Preview immutable quote")!;
  expect(preview.props.disabled).toBe(false);
  await preview.props.onClick();
  const send = elements(render()).find(element => element.type === "button" && text(element) === "Simulate sending this quote")!;
  send.props.onClick(); await settle();
  const all = elements(render());
  const group = all.find(element => element.type === "fieldset" && React.Children.toArray(element.props.children).some(child => React.isValidElement(child) && child.type === "legend" && text(child) === "Practice only: pretend sending problems"))!;
  expect(group).toBeDefined();
  expect(elements(group).filter(element => element.type === "button").map(text)).toEqual([
    "Show retryable failure", "Show unknown outcome", "Continue fake worker", "Simulate timeout after acceptance",
  ]);
  expect(all.indexOf(group)).toBeGreaterThan(all.findIndex(element => element.type === "button" && text(element) === "Simulate sending this quote"));
  expect(elements(group).some(element => element.type === "details")).toBe(false);
});
it("places the open practice group after the acceptance controls", () => {
  const all = elements(render());
  const heading = all.findIndex(element => element.type === "legend" && text(element) === "Practice only: pretend sending problems");
  expect(heading).toBeGreaterThan(all.findIndex(element => element.type === "button" && text(element) === "Record practice acceptance"));
  expect(all.filter(element => element.type === "button").map(text)).not.toContain("Continue fake worker");
});
it("keeps the existing delivery-state handlers and visibility rules", () => {
  hooks.delivery = "queued";
  const unknown = elements(render()).find(element => element.type === "button" && text(element) === "Show unknown outcome")!;
  unknown.props.onClick();
  const buttons = elements(render()).filter(element => element.type === "button").map(text);
  expect(buttons).toContain("Reconcile fake receipt");
  expect(buttons).toContain("Show retryable failure");
  expect(buttons).not.toContain("Continue fake worker");
  expect(buttons).not.toContain("Simulate timeout after acceptance");
});

it.each([
  ["before noon", new Date(2026, 10, 9, 1, 15), "2026-11-09", new Date(2026, 10, 9, 1, 15)],
  ["after noon", new Date(2026, 10, 9, 18, 15), "2026-11-09", new Date(2026, 10, 9, 12)],
  ["a past date", new Date(2026, 10, 9, 1, 15), "2026-11-08", new Date(2026, 10, 8, 12)],
  ["a future date", new Date(2026, 10, 9, 1, 15), "2026-11-10", new Date(2026, 10, 9, 1, 15)],
] as const)("caps the acceptance timestamp at now for %s", async (_label, now, date, expected) => {
  vi.setSystemTime(now);
  render(); await settle();
  input(render(), "Customer approval date").props.onChange({ target: { value: date } });
  const preview = elements(render()).find(element => element.type === "button" && text(element) === "Preview immutable quote")!;
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ view: { documentVersion: 1, documentId: "fictional-document", contentHash: "fictional-hash", status: "simulated_delivery" } }) } as Response);
  await preview.props.onClick();
  const accept = elements(render()).find(element => element.type === "button" && text(element) === "Record practice acceptance")!;
  await accept.props.onClick();
  const request = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith("/acceptance") && options?.method === "POST");
  expect(request).toBeDefined();
  expect(JSON.parse(request![1]!.body as string).acceptedAt).toBe(expected.toISOString());
});

it("re-reads quote and customer facts on navigation while keeping edited prices", async () => {
 render();await settle();
 const tree=render();
 const rate=elements(tree).find(element=>element.type==="input"&&String(element.props["aria-label"]).includes("Unit rate"))!;
 expect(rate).toBeDefined();
 rate.props.onChange({target:{value:"245.00"}});
 const before=elements(render()).find(element=>element.props["aria-label"]===rate.props["aria-label"])!.props.value;
 const fetch=vi.mocked(globalThis.fetch);fetch.mockClear();
 hooks.setGeneration(1);render();render();await settle();
 expect(fetch.mock.calls.some(([url])=>String(url).endsWith("/quotes"))).toBe(true);
 expect(fetch.mock.calls.some(([url])=>String(url).endsWith("/parties"))).toBe(true);
 expect(elements(render()).find(element=>element.props["aria-label"]===rate.props["aria-label"])!.props.value).toBe(before);
});

it("ignores a pre-save parties answer after the saved binding has refreshed", async () => {
 let release!: (value: Response) => void;
 const fetcher=vi.mocked(globalThis.fetch);
 const original=fetcher.getMockImplementation()!;
 let parties=0;
 fetcher.mockImplementation((...args:any[])=>{
  if(String(args[0]).endsWith("/parties")&&++parties===1)return new Promise(resolve=>{release=resolve;});
  return original(...args as Parameters<typeof fetch>);
 });
 render();
 events.dispatchEvent(new Event("job-parties-saved"));await settle();
 expect(input(render(),"Stated customer").props.value).toBe("Fictional saved customer");
 release(new Response(JSON.stringify({current:null}),{status:200}));await settle();
 const tree=render();
 expect(input(tree,"Stated customer").props.value).toBe("Fictional saved customer");
 expect(elements(tree).some(element=>element.type==="p"&&element.props.children==="Customer and site are required before this job can switch live.")).toBe(false);
});
