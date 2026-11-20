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
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
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
 const render = (id = jobId) => { hooks.render(); const tree = FinalAccountLock({ jobId: id, account, onChanged: changed }); hooks.effects(); return tree; };
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

async function pendingLockRead() {
 const { render, fetch } = await setup(true, true);
 const saved = await fetch.mock.results[0]!.value;
 let release!: (response: unknown) => void;
 let signal!: AbortSignal;
 fetch.mockImplementationOnce((_path: string, init: { signal: AbortSignal }) => {
  signal = init.signal;
  return new Promise(resolve => { release = resolve; });
 });
 window.dispatchEvent(new Event("focus"));
 return { render, fetch, saved, release, signal };
}
it("ignores a superseded same-job lock failure without aborting the read", async () => {
 const { render, saved, release, signal } = await pendingLockRead();
 window.dispatchEvent(new Event("focus")); await tick();
 expect(signal.aborted).toBe(false);
 release({ ok: false, json: async () => ({ code: "STALE_FAILURE" }) }); await tick();
 expect(renderToStaticMarkup(render())).not.toContain("STALE_FAILURE");
 expect(saved.ok).toBe(true);
});
it("ignores an unmounted same-job lock read without aborting it", async () => {
 const { render, release, signal } = await pendingLockRead();
 hooks.unmount();
 expect(signal.aborted).toBe(false);
 release({ ok: false, json: async () => ({ code: "UNMOUNTED_FAILURE" }) }); await tick();
 expect(renderToStaticMarkup(render())).not.toContain("UNMOUNTED_FAILURE");
});
it("still aborts the current lock read when the job changes", async () => {
 const { render, release, signal } = await pendingLockRead();
 render("22222222-2222-4222-8222-222222222222");
 expect(signal.aborted).toBe(true);
 release({ ok: false, json: async () => ({ code: "OLD_JOB_FAILURE" }) }); await tick();
 expect(renderToStaticMarkup(render())).not.toContain("OLD_JOB_FAILURE");
});
it("ignores a superseded successful lock snapshot that arrives after the latest read", async () => {
 const { render, saved, release, signal } = await pendingLockRead();
 window.dispatchEvent(new Event("focus")); await tick();
 const stale = { ...await saved.json(), termsAccepted: false };
 release({ ok: true, json: async () => stale }); await tick();
 expect(signal.aborted).toBe(false);
 expect(renderToStaticMarkup(render())).toContain("Final check terms accepted.");
});

type Capture = {
 id: string;
 description: string;
 state: "draft" | "priced" | "approved" | "rejected" | "withdrawn";
 origin: "final_review";
 netPence: number | null;
};
const draft: Capture = { id: jobId, description: "Ceiling repair", state: "draft", origin: "final_review", netPence: null };
const priced: Capture = { id: scopeItemId, description: "Moved radiator", state: "priced", origin: "final_review", netPence: 22000 };

async function setupReady(captures: Capture[] = [], onRebuild = vi.fn(async () => {})) {
 vi.stubGlobal("React", React);
 const readyAccount = { ...account, issueBlocked: false };
 const snapshot = { version: "final-account-lock.view.v1", jobId, account: readyAccount, lock: null, captures,
  dispositions: [{ scopeItemId, disposition: "done" }], termsAccepted: true, checkStatus: null, invoiceGuard: "FINAL_ACCOUNT_LOCK_REQUIRED" };
 const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
 vi.stubGlobal("fetch", fetch);
 const props = { jobId, account: readyAccount, onChanged: vi.fn(async () => {}), onRebuild };
 const render = () => { hooks.render(); const tree = FinalAccountLock(props); hooks.effects(); return tree; };
 render(); await tick();
 return { render, fetch, onRebuild, snapshot };
}

function leaveOffCheckbox(node: React.ReactNode, description: string): React.ReactElement<Record<string, unknown>> | undefined {
 if (Array.isArray(node)) return node.map(child => leaveOffCheckbox(child, description)).find(Boolean);
 if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
 const children = node.props.children;
 if (node.type === "label" && Array.isArray(children) && children.includes(`Leave "${description}" off this bill on purpose`)) {
  return children.find(child => React.isValidElement(child) && child.type === "input");
 }
 return leaveOffCheckbox(children as React.ReactNode, description);
}

it.each([[draft, "Needs a price"], [priced, "£220.00 — not approved yet"]] as const)("blocks completion for a $state extra and names its next step", async (capture, status) => {
 const { render } = await setupReady([capture]);
 const tree = render();
 expect(find(tree, "Complete final account")!.props.disabled).toBe(true);
 expect(renderToStaticMarkup(tree)).toContain(status);
 expect(leaveOffCheckbox(tree, capture.description)).toBeDefined();
});

it("requires every waiting extra to be ticked and drops ticks for extras that stop waiting", async () => {
 const { render, fetch, snapshot } = await setupReady([draft, priced]);
 const tickOff = (description: string) => {
  (leaveOffCheckbox(render(), description)!.props.onChange as (event: unknown) => void)({ target: { checked: true } });
 };
 tickOff(draft.description);
 expect(find(render(), "Complete final account")!.props.disabled).toBe(true);
 tickOff(priced.description);
 expect(find(render(), "Complete final account")!.props.disabled).toBe(false);

 fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...snapshot, captures: [draft] }) });
 window.dispatchEvent(new Event("focus")); await tick(); render();
 window.dispatchEvent(new Event("focus")); await tick();
 expect(leaveOffCheckbox(render(), priced.description)!.props.checked).toBe(false);
 expect(leaveOffCheckbox(render(), draft.description)!.props.checked).toBe(true);
 expect(find(render(), "Complete final account")!.props.disabled).toBe(true);
});

it("does not block completion for approved, rejected or withdrawn captures", async () => {
 const captures: Capture[] = [
  { ...priced, state: "approved" },
  { ...draft, state: "rejected" },
  { ...priced, id: account.id, state: "withdrawn" },
 ];
 const { render } = await setupReady(captures);
 const tree = render();
 expect(renderToStaticMarkup(tree)).not.toContain("Extras not on this bill yet");
 expect(find(tree, "Complete final account")!.props.disabled).toBe(false);
});

it.each([[409, "STALE_REVISION"], [400, "INVALID_FINAL_ACCOUNT_LOCK_INPUT"]])("handles %s %s from the lock", async (status, code) => {
 const { render, fetch, onRebuild } = await setupReady();
 fetch.mockResolvedValueOnce({ ok: false, status, json: async () => ({ code }) });
 (find(render(), "Complete final account")!.props.onClick as () => void)();
 await tick();
 const tree = render();
 const markup = renderToStaticMarkup(tree);
 expect(markup).toContain(`data-error-code="${code}"`);
 const rebuild = find(tree, "Update the bill with approved extras");
 if (code === "STALE_REVISION") {
  expect(markup).toContain("You approved a change after this bill was built. Update the bill, check the new total, then press Complete final account again.");
  expect(markup).not.toContain(">STALE_REVISION<");
  expect(onRebuild).not.toHaveBeenCalled();
  (rebuild!.props.onClick as () => void)();
  await tick();
  expect(onRebuild).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
 } else {
  expect(markup).toContain(`>${code}<`);
  expect(rebuild).toBeUndefined();
 }
});
