// Capture reads so a navigation refresh can be exercised during the first load.
vi.mock("./job-facts-refresh",()=>({useJobFactsRefresh:(fn: () => void)=>{ fixture.refresh = fn; }}));
import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SupplierDocuments } from "./supplier-documents";
const fixture = vi.hoisted(() => ({ state: null as any, refresh: () => {}, mount: () => {} }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(),
  useState: (initial: unknown) => [initial === null ? fixture.state : initial, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }), useEffect: (fn: () => void) => { fixture.mount = fn; }, useCallback: (fn: unknown) => fn,
}));
vi.mock("./materials-command", () => ({ materialsCommandFor: () => ({ read: async (_key: string, read: () => Promise<unknown>, apply: (value: unknown) => void) => apply(await read()) }),
  useMaterialsCommand: () => ({ busy: false, run: async (fn: () => Promise<void>) => fn() }),
}));
vi.stubGlobal("React", React);
afterEach(() => vi.unstubAllGlobals());
function panel(accepted = "8", missing = "2", rejected = "0") {
  vi.stubGlobal("React", React);
  fixture.state = { facts: [], documents: [], lastIntake: null, intakeRevision: 1,
    receipt: { revision: 4, ordered: "10", delivered: accepted, accepted, rejected, missing, laterDelivered: "1" } };
  return SupplierDocuments({ jobId: "fictional-job" });
}
function button(node: any): any {
  if (!node || typeof node !== "object") return;
  if (node.type === "button" && node.props.children === "Record later delivery") return node;
  return React.Children.toArray(node.props?.children).map(button).find(Boolean);
}
it.each([["8", "2", "0", "9"], ["8.000001", "1.999999", "0.125", "9.000001"],
  ["9.75", "0.25", "0", "10"]])("sends the whole exact position from %s", async (accepted, missing, rejected, expected) => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetcher);
  const control = button(panel(accepted, missing, rejected));
  expect(control.props.disabled).toBe(false);
  await control.props.onClick();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ version: "goods-receipt.v1",
    accepted: expected, rejected, expectedRevision: 4 });
});
it("disables later delivery and explains when nothing is missing", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const tree = panel("10", "0");
  expect(button(tree).props.disabled).toBe(true);
  await button(tree).props.onClick();
  expect(fetcher).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(tree)).toContain("Nothing is missing");
});
it("labels each delivery quantity separately", () => {
  const html = renderToStaticMarkup(panel());
  for (const label of ["Ordered", "Delivered", "Rejected", "Missing", "Later delivered"])
    expect(html).toContain(`<dt>${label}</dt>`);
  expect(html).toContain('data-testid="delivery-later-delivered">1 each');
});

it("coalesces silent supplier refreshes with the first read and the next refresh", async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const fetcher = vi.fn().mockImplementation(async () => { await held; return { ok: true, json: async () => ({ state: fixture.state }) }; });
  vi.stubGlobal("fetch", fetcher);
  panel(); fixture.mount(); fixture.refresh(); fixture.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  release(); await new Promise<void>(resolve => setImmediate(resolve));
  fixture.refresh(); fixture.refresh();
  expect(fetcher).toHaveBeenCalledTimes(2);
  await new Promise<void>(resolve => setImmediate(resolve));
});
