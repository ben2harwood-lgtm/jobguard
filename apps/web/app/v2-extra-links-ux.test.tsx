import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The existing screen-test pattern: exercise handlers without a DOM dependency.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: unknown[] = [], effects: (() => void)[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    flush() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useEffect(callback: () => void, deps: unknown[]) {
      const index = cursor++, old = slots[index] as unknown[] | undefined;
      if (!old || !deps.every((value, i) => Object.is(value, old[i]))) { slots[index] = deps; effects.push(callback); }
    },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(),
  useState: hooks.useState, useRef: hooks.useRef, useEffect: hooks.useEffect,
  useCallback: (callback: unknown) => callback,
}));
import { CustomerExtraAgreement, nextAgreeState } from "./customer/change/[capability]/view";
import { BuilderExtraLinks, photoIdsAfterCreate } from "./v2/jobs/[id]/extra-links/view";

type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...React.Children.toArray(element.props.children as React.ReactNode).flatMap(elements)];
}
function find(tree: React.ReactNode, type: string, text?: string): Element {
  const result = elements(tree).find(el => el.type === type && (text === undefined || el.props.children === text));
  expect(result, `${type} ${text ?? ""}`).toBeDefined();
  return result!;
}
function render(component: () => React.ReactNode) { hooks.render(); return component(); }
async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
async function click(element: Element) { (element.props.onClick as () => void)(); await settle(); }
const view = { jobId: "job-1", revisionId: "revision-1", variationVersion: 1, amount: "140.00",
  description: "Practice extra", photoIds: [], expectedVersion: 1, agreedAt: null };
const response = (value: unknown, ok = true) => ({ ok, json: async () => value });
const customer = () => CustomerExtraAgreement({ capability: "same-link" });
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  hooks.reset(); vi.stubGlobal("React", React);
  fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
async function loadCustomer() {
  fetcher.mockResolvedValueOnce(response(view)); render(customer); hooks.flush(); await settle();
  const input = find(render(customer), "input");
  (input.props.onChange as (e: unknown) => void)({ target: { value: "Practice customer" } });
}
function postedBodies() {
  return fetcher.mock.calls.filter(([, options]) => options?.method === "POST").map(([, options]) => JSON.parse(options.body));
}

it("refusal then Check again sends a fresh commandId and the reread expectedVersion on the same link", async () => {
  await loadCustomer(); fetcher.mockResolvedValueOnce(response(null, false));
  await click(find(render(customer), "button", "I agree"));
  expect(find(render(customer), "input").props.disabled).toBe(true);
  const check = find(render(customer), "button", "Check again");
  expect(check.props.style).toMatchObject({ minHeight: 44 });
  fetcher.mockResolvedValueOnce(response({ ...view, expectedVersion: 2 })); await click(check);
  expect(fetcher.mock.calls.at(-1)).toEqual(["/api/v2/extra-links/same-link", { cache: "no-store" }]);
  expect(find(render(customer), "input").props.disabled).toBe(false);
  fetcher.mockResolvedValueOnce(response({ ...view, agreedAt: "2026-11-25T15:00:00Z" }));
  await click(find(render(customer), "button", "I agree"));
  const [first, second] = postedBodies();
  expect(second.commandId).not.toBe(first.commandId);
  expect(first.expectedVersion).toBe(1); expect(second.expectedVersion).toBe(2);
  expect(second).toMatchObject({ jobId: view.jobId, revisionId: view.revisionId, amount: view.amount });
  expect(fetcher.mock.calls.every(([url]) => url === "/api/v2/extra-links/same-link")).toBe(true);
});
it("unknown result retries the same command body and keeps the name locked", async () => {
  await loadCustomer(); fetcher.mockRejectedValueOnce(new Error("lost response"));
  await click(find(render(customer), "button", "I agree"));
  let tree = render(customer);
  expect(renderToStaticMarkup(tree)).toContain("Agreement result unknown. Retry to check the same agreement.");
  expect(find(tree, "input").props.disabled).toBe(true);
  expect(elements(tree).some(el => el.props.children === "Check again")).toBe(false);
  fetcher.mockResolvedValueOnce(response({ ...view, agreedAt: "2026-11-25T15:00:00Z" }));
  await click(find(tree, "button", "I agree"));
  expect(postedBodies()[1]).toEqual(postedBodies()[0]);
  tree = render(customer); expect(renderToStaticMarkup(tree)).toContain("Agreement recorded at");
});
it.each(["http", "network"])("failed reread (%s) shows unavailable and removes agreement controls", async failure => {
  await loadCustomer(); fetcher.mockResolvedValueOnce(response(null, false));
  await click(find(render(customer), "button", "I agree"));
  if (failure === "http") fetcher.mockResolvedValueOnce(response(null, false));
  else fetcher.mockRejectedValueOnce(new Error("offline"));
  await click(find(render(customer), "button", "Check again"));
  const html = renderToStaticMarkup(render(customer));
  expect(html).toContain("This link is unavailable. Ask the builder for a fresh link.");
  expect(html).not.toContain("Your name"); expect(html).not.toContain("I agree</button>");
});
it("reread displays an agreement already recorded without offering another agreement", async () => {
  await loadCustomer(); fetcher.mockResolvedValueOnce(response(null, false));
  await click(find(render(customer), "button", "I agree"));
  fetcher.mockResolvedValueOnce(response({ ...view, agreedAt: "2026-11-25T15:00:00Z" }));
  await click(find(render(customer), "button", "Check again"));
  const html = renderToStaticMarkup(render(customer));
  expect(html).toContain("Agreement recorded at"); expect(html).not.toContain("Your name");
});
it("pure agreement transition clears only a successful reread", () => {
  const command = { commandId: "command-1", occurredAt: "2026-11-25T15:00:00Z", name: "Practice customer" };
  for (const result of ["refused", "unknown", "unavailable"] as const) expect(nextAgreeState(result, command).command).toBe(command);
  expect(nextAgreeState("read", command)).toEqual({ command: null, notice: "", canCheckAgain: false });
});
it.each([true, false])("create ok=%s resets photos only on confirmed success", async ok => {
  const state = { photos: [{ id: "photo-1", receivedAt: "2026-11-25T15:00:00Z" }], links: [],
    variations: { variations: [{ id: "variation-1", currentRevisionId: "revision-1", revisions: [{ id: "revision-1", revision: 1, approved: false, rejected: false }] }] } };
  const builder = () => BuilderExtraLinks({ jobId: "job-1" });
  fetcher.mockResolvedValueOnce(response(state)); render(builder); hooks.flush(); await settle();
  (find(render(builder), "input").props.onChange as (e: unknown) => void)({ target: { checked: true } });
  expect(find(render(builder), "input").props.checked).toBe(true);
  fetcher.mockResolvedValueOnce(response(ok ? { linkId: "link-1", capability: "cap-1" } : null, ok));
  if (ok) fetcher.mockResolvedValueOnce(response(state));
  const button = elements(render(builder)).find(el => el.type === "button")!;
  await click(button);
  expect(postedBodies()[0].photoIds).toEqual(["photo-1"]);
  expect(find(render(builder), "input").props.checked).toBe(!ok);
  expect(photoIdsAfterCreate(ok, ["photo-1"])).toEqual(ok ? [] : ["photo-1"]);
});
