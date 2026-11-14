import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomerInvoices } from "./customer-invoices";
import { notifyInvoiceChanged } from "./customer-payment-status";

vi.mock("@jobguard/api/customer-invoice-contracts", () => import("../../../api/src/customer-invoice.contracts.js"));
vi.mock("./customer-credit-notes", () => ({ CustomerCreditNotes: () => null }));
vi.mock("./customer-receipts", () => ({ CustomerReceipts: () => null }));
vi.mock("./customer-payment-status", () => ({ notifyInvoiceChanged: vi.fn(), INVOICE_CHANGED_EVENT: "invoice-changed" }));
vi.mock("./pay-now-synthetic", () => ({ CustomerInvoicePayNow: () => null }));
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
beforeEach(() => { vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("document", Object.assign(new EventTarget(),{visibilityState:"visible"})); });
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
 expect(fetch.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
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

const invoice={id:"18000000-0000-4000-8000-000000000004",number:"DEMO-001",issuedOn:"2026-11-13",recipient:"practice@example.invalid",pdfSha256:"b".repeat(64),finalAccountRevisionId:finalAccount.id,sourceHash:finalAccount.sourceHash,netPence:90000,taxPence:18000,totalPence:108000,balancePence:108000,customerCreditPence:0,delivery:"simulated_delivery"};
const history=(invoices:unknown[]=[])=>({version:1,environment:"synthetic_demo",jobId,invoices});
const guard={code:null,kind:"final" as const,lockedRevision:finalAccount};
function lockRender(current=finalAccount,code:Parameters<typeof CustomerInvoices>[0]["lockGuard"]=guard,id=jobId){
 hooks.render();const element=CustomerInvoices({jobId:id,finalAccount:current,lockGuard:code!});
 const tree=(element.type as (props:unknown)=>React.ReactNode)(element.props);hooks.effects();return tree;
}
const issueButtons=(tree:React.ReactNode)=>children(tree).filter(n=>n.type==="button"&&String(n.props.children).startsWith("Issue "));
it.each([
 ["no base",[],finalAccount,false,true],
 ["existing final",[invoice],finalAccount,true,true],
 ["later revision",[invoice],{...finalAccount,id:"18000000-0000-4000-8000-000000000005",sourceHash:"c".repeat(64)},true,false],
 ["unchanged source",[invoice],{...finalAccount,id:"18000000-0000-4000-8000-000000000005"},true,true],
 ["blocked proof",[],{...finalAccount,issueBlocked:true},true,true],
] as const)("%s applies separate final and supplementary prerequisites",async(_name,invoices,current,finalDisabled,supplementaryDisabled)=>{
 vi.stubGlobal("React",React);const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>history([...invoices])});vi.stubGlobal("fetch",fetch);
 lockRender(current);await tick();const buttons=issueButtons(lockRender(current));expect(buttons.map(n=>n.props.disabled)).toEqual([finalDisabled,supplementaryDisabled]);
});
it("already-billed later revision cannot issue supplementary again",async()=>{
 vi.stubGlobal("React",React);const later={...finalAccount,id:"18000000-0000-4000-8000-000000000005",sourceHash:"c".repeat(64)};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history([invoice,{...invoice,id:"18000000-0000-4000-8000-000000000006",finalAccountRevisionId:later.id,sourceHash:later.sourceHash}])}));
 lockRender(later);await tick();expect(issueButtons(lockRender(later)).every(n=>n.props.disabled)).toBe(true);
});
it("lock-bound definite refusal keeps exact binding and readable guard",async()=>{
 vi.stubGlobal("React",React);const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>history()});vi.stubGlobal("fetch",fetch);
 lockRender();await tick();fetch.mockImplementation(async(_input:string,init?:RequestInit)=>init?.method==="POST"?{ok:false,status:409,json:async()=>({code:"FINAL_CHECK_FAILED"})}:{ok:true,json:async()=>history()});
 const button=issueButtons(lockRender())[0]!;(button.props.onClick as ()=>void)();await tick();const tree=lockRender();
 expect(renderToStaticMarkup(tree)).toContain("final check could not finish");
 const post=fetch.mock.calls.find(call=>call[1]?.method==="POST")!;expect(JSON.parse(post[1].body)).toMatchObject({invoiceKind:"final",finalAccountRevisionId:finalAccount.id,expectedSourceHash:finalAccount.sourceHash});
});
it("lost issue reply blocks duplicate commands and reconciles saved number, gross and balance",async()=>{
 vi.stubGlobal("React",React);const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>history()});vi.stubGlobal("fetch",fetch);
 lockRender();await tick();fetch.mockImplementation(async(_input:string,init?:RequestInit)=>{if(init?.method==="POST")throw new Error("lost");return {ok:true,json:async()=>history([invoice])};});
 const button=issueButtons(lockRender())[0]!;(button.props.onClick as ()=>void)();(button.props.onClick as ()=>void)();await tick();const tree=lockRender();
 expect(fetch.mock.calls.filter(call=>call[1]?.method==="POST")).toHaveLength(1);expect(issueButtons(tree).every(n=>n.props.disabled)).toBe(true);
 const markup=renderToStaticMarkup(tree);expect(markup).toContain("DEMO-001");expect(markup).toContain("lock-bound-invoice-gross");expect(markup).toContain("lock-bound-invoice-balance");expect(markup).toContain("unknown");
});
it("saved history reads never publish invoice-changed notifications",async()=>{
 vi.stubGlobal("React",React);vi.mocked(notifyInvoiceChanged).mockClear();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history([invoice])}));render();await tick();
 window.dispatchEvent(new CustomEvent("invoice-changed",{detail:{jobId}}));await tick();expect(notifyInvoiceChanged).not.toHaveBeenCalled();
});

it("an uncertain issue on either panel blocks the other panel too",async()=>{
 vi.stubGlobal("React",React);const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>history()});vi.stubGlobal("fetch",fetch);
 render();await tick();
 window.dispatchEvent(new CustomEvent("jobguard:invoice-issue-uncertain",{detail:{jobId}}));await tick();
 const button=children(render()).find(n=>n.type==="button"&&n.props.children==="Issue and simulate this invoice")!;
 expect(button.props.disabled).toBe(true);(button.props.onClick as ()=>void)();
 expect(fetch.mock.calls.every(call=>call[1]?.method!=="POST")).toBe(true);
});

it("a null guard without a saved locked revision never enables issue",async()=>{
 vi.stubGlobal("React",React);vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history()}));
 lockRender(finalAccount,{code:null,kind:"final"});await tick();expect(issueButtons(lockRender(finalAccount,{code:null,kind:"final"})).every(n=>n.props.disabled)).toBe(true);
});
it("successful issue immediately displays the saved invoice and publishes one refresh",async()=>{
 vi.stubGlobal("React",React);vi.mocked(notifyInvoiceChanged).mockClear();
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>history()});vi.stubGlobal("fetch",fetch);lockRender();await tick();
 fetch.mockResolvedValue({ok:true,json:async()=>history([invoice])});(issueButtons(lockRender())[0]!.props.onClick as ()=>void)();await tick();
 const markup=renderToStaticMarkup(lockRender());expect(markup).toContain("DEMO-001");expect(markup).toContain("GBP 1,080.00");expect(notifyInvoiceChanged).toHaveBeenCalledExactlyOnceWith(jobId);
});
it("navigation cancels invoice history and rejects a stale response",async()=>{
 vi.stubGlobal("React",React);let finish!:(value:unknown)=>void;
 const nextJob="18000000-0000-4000-8000-000000000099";
 const fetch=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({ok:true,json:async()=>({...history(),jobId:nextJob})});vi.stubGlobal("fetch",fetch);
 lockRender();lockRender(finalAccount,guard,nextJob);await tick();finish({ok:true,json:async()=>history([invoice])});await tick();
 const tree=lockRender(finalAccount,guard,nextJob);expect(renderToStaticMarkup(tree)).not.toContain("DEMO-001");expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
});
it("unavailable saved history clears old invoice details and disables issue",async()=>{
 vi.stubGlobal("React",React);const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>history([invoice])});vi.stubGlobal("fetch",fetch);lockRender();await tick();
 fetch.mockResolvedValue({ok:false,status:403,json:async()=>({})});window.dispatchEvent(new Event("focus"));await tick();const tree=lockRender();
 expect(renderToStaticMarkup(tree)).not.toContain("DEMO-001");expect(issueButtons(tree).every(n=>n.props.disabled)).toBe(true);
});

it("the ordinary practice issuer remains eligible with an unblocked saved account and no invoices",async()=>{
 vi.stubGlobal("React",React);vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history()}));
 render();await tick();const tree=render();
 expect(children(tree).find(n=>n.type==="button"&&n.props.children==="Issue and simulate this invoice")!.props.disabled).toBe(false);
});
it("an unpaid main invoice permits a distinct, unbilled descendant without inventing payment",async()=>{
 vi.stubGlobal("React",React);const later={...finalAccount,id:"18000000-0000-4000-8000-000000000005",sourceHash:"c".repeat(64)};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history([invoice])}));lockRender(later);await tick();
 expect(issueButtons(lockRender(later)).map(n=>n.props.disabled)).toEqual([true,false]);
 expect(renderToStaticMarkup(lockRender(later))).toContain("GBP 1,080.00");
});
it("unchanged locked revision explains rebuilding separately from a missing main invoice",async()=>{
 vi.stubGlobal("React",React);vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history([invoice])}));
 lockRender();await tick();expect(renderToStaticMarkup(lockRender())).toContain("still the locked account");
});
it("lost issue remains blocked through issuer remount and history refresh",async()=>{
 vi.stubGlobal("React",React);vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history()}));
 lockRender();await tick();window.dispatchEvent(new CustomEvent("jobguard:invoice-issue-uncertain",{detail:{jobId}}));await tick();
 hooks.reset();lockRender();await tick();expect(issueButtons(lockRender()).every(n=>n.props.disabled)).toBe(true);
});
it("all saved invoice articles retain their identity and receipt controls after a supplement",async()=>{
 vi.stubGlobal("React",React);const later={...invoice,id:"18000000-0000-4000-8000-000000000008",number:"DEMO-002"};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>history([invoice,later])}));render();await tick();
 const articles=children(render()).filter(n=>n.type==="article");expect(articles.map(n=>n.props.id)).toEqual([`invoice-${invoice.id}`,`invoice-${later.id}`]);
});

it("STALE_REVISION explains reloading and rebuilding the saved account after an ordinary issue refusal",async()=>{
 vi.stubGlobal("React",React);
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>history()})
  .mockResolvedValueOnce({ok:false,status:409,json:async()=>({code:"STALE_REVISION"})});
 vi.stubGlobal("fetch",fetch);render();await tick();
 const button=children(render()).find(n=>n.type==="button"&&n.props.children==="Issue and simulate this invoice")!;
 (button.props.onClick as ()=>void)();await tick();
 expect(children(render()).find(n=>n.props.role==="alert")!.props).toMatchObject({"data-error-code":"STALE_REVISION",children:"The final account changed. Please reload and rebuild the saved account before issuing this invoice."});
 expect(fetch.mock.calls.filter(call=>call[1]?.method==="POST")).toHaveLength(1);
});
