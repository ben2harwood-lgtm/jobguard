import { afterEach, expect, it, vi } from "vitest";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteChange, routeRefusals } from "./route-change";
import { routeApprovalV1, routeReadV1 } from "@jobguard/api/accounting-export-contracts";

// Exercise the real screen handlers without a DOM, keeping state and refs across renders.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
 useState: (initial: unknown) => {
  const index = hooks.cursor++;
  if (!(index in hooks.cells)) hooks.cells[index] = initial;
  return [hooks.cells[index], (value: unknown) => { hooks.cells[index] = value; }];
 },
 useRef: (current: unknown) => {
  const index = hooks.cursor++;
  return hooks.cells[index] ??= { current };
 },
 useEffect: () => undefined,
}));
afterEach(() => { vi.unstubAllGlobals(); hooks.cells = []; hooks.cursor = 0; });
it("labels the read-only practice screen and preserved history before any approval", () => {
 const html = renderToStaticMarkup(createElement(RouteChange, { sourceId: "demo-next", tenantId: "tenant", csrfToken: "csrf" }));
 expect(html).toContain("Practice export route change");
 expect(html).toContain("History is kept. Already-sent items are not sent again.");
 expect(html).not.toContain("Confirm this exact route change");
});
it("has plain refusals for stale connection/consent, uncertain exports and reused or expired approvals", () => {
 for (const code of ["EXPORT_CONSENT_EXPIRED", "EXPORT_STALE_REVISION", "EXPORT_RECONCILE_REQUIRED", "EXPORT_APPROVAL_REQUIRED", "EXPORT_REPLAY_CONFLICT"])
  expect(routeRefusals[code]).toMatch(/[a-z] /);
 expect(routeReadV1.safeParse({ version: 1, proposal: null, confirmed: null, history: [], tenantId: "injected" }).success).toBe(false);
 expect(routeApprovalV1.safeParse({ version: 1, actorId: "injected" }).success).toBe(false);
});
it("shows a lost confirmation reply as uncertain and retries the identical approval", async () => {
 const previewHash = "a".repeat(64);
 hooks.cells = [{ proposal: { previewHash, artifact: {
  from: "codat", to: "xero", scope: { companyId: "demo-company" }, entries: [],
 } }, confirmed: null, history: [] }, "", false];
 const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
  .mockImplementation(async () => new Response(JSON.stringify({ version: 1, proposal: null, confirmed: null, history: [] })));
 vi.stubGlobal("fetch", fetch);
 const render = () => {
  hooks.cursor = 0;
  return RouteChange({ sourceId: "demo-next", tenantId: "tenant", csrfToken: "csrf" });
 };
 const confirm = (tree: ReturnType<typeof render>) => {
  const button = Children.toArray(tree.props.children).find(child =>
   isValidElement<{ children?: ReactNode }>(child) && child.props.children === "Confirm this exact route change");
  if (!isValidElement<{ onClick: () => void }>(button)) throw new Error("Missing confirmation button");
  button.props.onClick();
 };
 confirm(render());
 await vi.waitFor(() => expect(hooks.cells[2]).toBe(false));
 const uncertain = render();
 const html = renderToStaticMarkup(uncertain);
 expect(html).toContain("result is uncertain");
 expect(html).not.toContain("server refused");
 expect(html).toContain("Confirm this exact route change");
 const body = fetch.mock.calls[0]![1].body;
 expect(routeApprovalV1.parse(JSON.parse(body))).toMatchObject({ previewHash, humanConfirmed: true });
 confirm(uncertain);
 await vi.waitFor(() => expect(hooks.cells[2]).toBe(false));
 expect(fetch.mock.calls.map(call => call[1].method)).toEqual(["POST", "POST", "GET"]);
 expect(fetch.mock.calls[1]![1].body).toBe(body);
 expect(renderToStaticMarkup(render())).not.toContain('role="alert"');
});
