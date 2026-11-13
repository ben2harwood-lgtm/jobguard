import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SupplierDocuments } from "./supplier-documents";
const fixture = vi.hoisted(() => ({ state: null as any }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(),
  useState: (initial: unknown) => [initial === null ? fixture.state : initial, vi.fn()],
  useEffect: vi.fn(), useCallback: (fn: unknown) => fn,
}));
vi.mock("./materials-command", () => ({ materialsCommandFor: () => ({}),
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
