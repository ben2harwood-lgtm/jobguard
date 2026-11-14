import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinalAccountLock } from "./final-account-lock";
vi.mock("@jobguard/api/final-account-contracts", () => import("../../../api/src/final-account.contracts.js"));
vi.mock("./customer-invoices", () => ({ CustomerInvoices: () => null, invoiceGuardMessages: {
 FINAL_ACCOUNT_LOCK_REQUIRED: "Complete the final account first",
 FINAL_CHECK_NOT_COMPLETE: "JobGuard's final check is still running",
 FINAL_CHECK_FAILED: "JobGuard's final check could not finish, so this bill stays locked",
} }));
vi.mock("./customer-payment-status", () => ({ INVOICE_CHANGED_EVENT: "invoice-changed" }));
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    reset() { for (const slot of slots) slot?.cleanup?.(); cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn: unknown, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) slots[index] = { value: fn, deps };
      return slots[index]!.value;
    },
    useEffect(fn: () => (() => void) | void, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) {
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index]!.cleanup = fn() || undefined; });
      }
    },
  };
});
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), ...hooks }));
beforeEach(() => { vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("document", Object.assign(new EventTarget(), {visibilityState:"visible"})); });
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });



const jobId = "18000000-0000-4000-8000-000000000001", scopeItemId = "18000000-0000-4000-8000-000000000003";
const account = { id: "18000000-0000-4000-8000-000000000002", revision: 1, sourceHash: "a".repeat(64), taxPolicyVersion: "candidate_m1_standard_v1",
 totals: { net: { pence: 90000, currency: "GBP" as const }, tax: { pence: 18000, currency: "GBP" as const }, total: { pence: 108000, currency: "GBP" as const } },
 issueBlocked: true, findings: [], proof: [], pending: [], lines: [{ kind: "baseline" as const, sourceId: scopeItemId, scopeItemId, commercialRevisionId: scopeItemId, approvalId: null, description: "Paint walls", netPence: 90000 }] };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function setup(termsAccepted: boolean, disposed: boolean) {
 vi.stubGlobal("React", React);
 const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "final-account-lock.view.v1", jobId, account,
  lock: null, captures: [], dispositions: disposed ? [{ scopeItemId, disposition: "done" }] : [], termsAccepted, checkStatus: null, invoiceGuard: "FINAL_ACCOUNT_LOCK_REQUIRED" }) });
 vi.stubGlobal("fetch", fetch);
 const changed = vi.fn(async () => {});
 const render = () => { hooks.render(); const tree = FinalAccountLock({ jobId, account, onChanged: changed }); hooks.effects(); return tree; };
 render(); await tick();
 return { render, fetch };
}
function find(node: React.ReactNode, label: string): React.ReactElement<Record<string, unknown>> | undefined {
 if (Array.isArray(node)) return node.map(child => find(child, label)).find(Boolean);
 if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
 if (node.type === "button" && node.props.children === label) return node;
 return find(node.props.children as React.ReactNode, label);
}
it("after Done and terms, stale proof still refuses completion and names the rebuild action", async () => {
 const { render, fetch } = await setup(true, true);
 const tree = render(), markup = renderToStaticMarkup(tree);
 expect(find(tree, "Complete final account")!.props.disabled).toBe(true);
 expect(find(tree, "Accept final check terms")!.props.disabled).toBe(true);
 expect(markup).toContain("Final check terms accepted.");
 expect(markup).toContain("Rebuild from approved sources” to include the saved proof");
 expect(fetch).toHaveBeenCalledTimes(1); // Explaining a guard never changes the bill.
});
it("unreviewed scope and missing terms each explain why completion is disabled", async () => {
 const { render } = await setup(false, false);
 const tree = render(), markup = renderToStaticMarkup(tree);
 expect(find(tree, "Complete final account")!.props.disabled).toBe(true);
 expect(find(tree, "Accept final check terms")!.props.disabled).toBe(false);
 expect(markup).toContain("Choose Done, Removed or Deferred for every accepted line");
 expect(markup).toContain("Press “Accept final check terms” before completing");
});

it.each(["pending","failed","completed"])("saved %s status replaces unconditional running text",async state=>{
 const {render,fetch}=await setup(true,true);
 fetch.mockResolvedValue({ok:true,json:async()=>({version:"final-account-lock.view.v1",jobId,account,lock:{id:scopeItemId,finalAccountRevisionId:account.id,sourceHash:account.sourceHash,lockedAt:"2026-11-13T00:00:00Z"},captures:[],dispositions:[],termsAccepted:true,checkStatus:state,invoiceGuard:state==="completed"?null:state==="failed"?"FINAL_CHECK_FAILED":"FINAL_CHECK_NOT_COMPLETE"})});
 window.dispatchEvent(new CustomEvent("jobguard:final-check-changed",{detail:{jobId}}));await tick();
 const markup=renderToStaticMarkup(render());expect(markup).toContain('data-testid="final-check-state"');
 if(state==="pending")expect(markup).toContain("Running JobGuard");else expect(markup).not.toContain("still running");
 if(state==="completed")expect(markup).toContain("final check is complete");
});

// Legacy lock-check rows are not the Final Check run status: no row can mean
// processing is still underway, and failed rows must keep the invoice guard.
it.each([null, "pending", "failed"])("keeps the lock progress text for a %s reconciliation row without allowing invoices", async checkStatus => {
 const {render,fetch}=await setup(true,true);
 const invoiceGuard=checkStatus==="failed"?"FINAL_CHECK_FAILED":"FINAL_CHECK_NOT_COMPLETE";
 fetch.mockResolvedValue({ok:true,json:async()=>({version:"final-account-lock.view.v1",jobId,account,
  lock:{id:scopeItemId,finalAccountRevisionId:account.id,sourceHash:account.sourceHash,lockedAt:"2026-11-13T00:00:00Z"},
  captures:[],dispositions:[],termsAccepted:true,checkStatus,invoiceGuard})});
 window.dispatchEvent(new CustomEvent("jobguard:final-check-changed",{detail:{jobId}}));await tick();
 const tree=render(),markup=renderToStaticMarkup(tree);
 expect(markup).toContain("Running JobGuard&#x27;s final check");
 expect(markup).not.toContain("status is unavailable");
 const invoices=(node:React.ReactNode):React.ReactElement<Record<string,unknown>>|undefined=>{
  if(Array.isArray(node))return node.map(invoices).find(Boolean);
  if(!React.isValidElement<Record<string,unknown>>(node))return undefined;
  if(node.props.lockGuard)return node;
  return invoices(node.props.children as React.ReactNode);
 };
 expect(invoices(tree)?.props.lockGuard).toMatchObject({code:invoiceGuard});
});
