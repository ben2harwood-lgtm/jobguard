// This direct-component harness has no workspace provider. Navigation refresh is covered in job-final-account.test.tsx.
vi.mock("./job-facts-refresh",()=>({useJobFactsRefresh:()=>undefined}));
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { CustomerInvoices } from "./customer-invoices";

vi.mock("@jobguard/api/customer-invoice-contracts", () => import("../../../api/src/customer-invoice.contracts.js"));
vi.mock("./customer-credit-notes", () => ({ CustomerCreditNotes: () => null }));
vi.mock("./customer-receipts", () => ({ CustomerReceipts: () => null }));
vi.mock("./customer-payment-status", () => ({ notifyInvoiceChanged: vi.fn() }));
vi.mock("./pay-now-synthetic", () => ({ CustomerInvoicePayNow: () => null }));
const hooks = vi.hoisted(() => {
 let cursor = 0;
 const slots: unknown[] = [], effects: (() => void)[] = [];
 return {
  reset() { cursor = 0; slots.length = 0; effects.length = 0; },
  render() { cursor = 0; },
  effects() { while (effects.length) effects.shift()!(); },
  useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: unknown) => { slots[i] = v; }]; },
  useCallback(fn: unknown) { const i = cursor++; return slots[i] ??= fn; },
  useEffect(fn: () => void) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
 };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });
const jobId = "18000000-0000-4000-8000-000000000001";
const finalAccount = { id: "18000000-0000-4000-8000-000000000002", sourceHash: "a".repeat(64), issueBlocked: false };
const cases = [
 ["FINAL_ACCOUNT_LOCK_REQUIRED", "Complete the final account first"],
 ["FINAL_CHECK_NOT_COMPLETE", "JobGuard's final check is still running"],
 ["FINAL_CHECK_FAILED", "JobGuard's final check could not finish, so this bill stays locked"],
] as const;
type Element = React.ReactElement<Record<string, unknown>>;
function children(node: React.ReactNode): Element[] {
 if (Array.isArray(node)) return node.flatMap(children);
 if (!React.isValidElement<Record<string, unknown>>(node)) return [];
 return [node, ...children(node.props.children as React.ReactNode)];
}
function render(lockGuard?: Parameters<typeof CustomerInvoices>[0]["lockGuard"], blocked = false) {
 hooks.render();
 const element = CustomerInvoices({ jobId, finalAccount: { ...finalAccount, issueBlocked: blocked }, ...(lockGuard ? { lockGuard } : {}) });
 const tree = (element.type as (props: unknown) => React.ReactNode)(element.props);
 hooks.effects(); return tree;
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
it.each(cases)("%s keeps both lock-bound issue buttons disabled and the code in data", (code, message) => {
 vi.stubGlobal("React", React);
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 const tree = render({ code, kind: "final" });
 const buttons = children(tree).filter(node => node.type === "button");
 expect(buttons).toHaveLength(2);
 expect(buttons.every(node => node.props.disabled === true)).toBe(true);
 const alert = children(tree).find(node => node.props.role === "alert")!;
 expect(alert.props).toMatchObject({ "data-error-code": code, children: message });
 for (const button of buttons) (button.props.onClick as () => void)();
 expect(fetch).not.toHaveBeenCalled();
});
it.each([...cases, ["STALE_FINAL_ACCOUNT_AUTHORIZATION", "The final account changed. Rebuild it before issuing this invoice."]] as const)(
 "practice issue reports the actual %s refusal instead of treating every 409 as stale", async (code, message) => {
  vi.stubGlobal("React", React);
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 1, environment: "synthetic_demo", jobId, invoices: [] }) })
   .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ version: "final-check-invoice-error.v1", code }) });
  vi.stubGlobal("fetch", fetch);
  render(); await tick();
  const button = children(render()).find(node => node.type === "button")!;
  (button.props.onClick as () => void)(); await tick();
  const alert = children(render()).find(node => node.props.role === "alert")!;
  expect(alert.props).toMatchObject({ "data-error-code": code, children: message });
  const request = JSON.parse(fetch.mock.calls[1]![1].body);
  expect(request).toMatchObject({ finalAccountRevisionId: finalAccount.id, expectedSourceHash: finalAccount.sourceHash });
  expect(fetch).toHaveBeenCalledTimes(2);
 });
it("blocked proof explains exactly how to rebuild and keeps invoice issue disabled", () => {
 vi.stubGlobal("React", React);
 const markup = renderToStaticMarkup(render({ code: null, kind: "final" }, true));
 expect(markup).toContain("Rebuild from approved sources");
 expect(children(render({ code: null, kind: "final" }, true)).filter(node => node.type === "button").every(node => node.props.disabled)).toBe(true);
});
