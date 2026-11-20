import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PracticeJourney } from "./practice-journey";
import { WorkspaceShell } from "./workspace-shell";
import { ProofStage } from "./proof-stage";
import { JobVariations } from "./job-variations";
import { JobFinalAccount } from "./job-final-account";
import { CustomerInvoices } from "./customer-invoices";

const hooks = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async original => ({
 ...await original<typeof React>(), useContext: () => 0,
 useState: (initial: unknown) => [hooks.values.length ? hooks.values.shift() : typeof initial === "function" ? initial() : initial, vi.fn()],
 useRef: (current: unknown) => ({ current }),
 useCallback: (fn: unknown) => fn,
 useEffect: () => undefined,
}));
afterEach(() => { hooks.values = []; vi.unstubAllGlobals(); });
const jobId = "11111111-1111-4111-8111-111111111112";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const invoice = (changes = {}) => ({ id: invoiceId, totalPence: 108000, balancePence: 0, paidPence: 108000, creditedPence: 0, customerCreditPence: 0, ...changes });
const facts = (status: string, changes = {}) => ({
 job: { id: jobId, status, scopeIdentityIds: [jobId] }, quote: { jobId, draft: null }, delivery: null,
 proof: { jobId, completion: { id: jobId, reviewRequired: false } }, variations: { jobId, variations: [] },
 account: { jobId, account: { id: jobId, issueBlocked: false } }, lock: { jobId, lock: { id: jobId } }, check: { state: "completed", lockId: jobId },
 invoices: { jobId, invoices: [invoice()] }, ...changes,
});
function card(status: string, changes = {}) {
 vi.stubGlobal("React", React);
 hooks.values = [{ jobId, status, phase: "ready", snapshot: { facts: facts(status, changes), realExternalActions: 0 } }];
 return renderToStaticMarkup(PracticeJourney({ jobId, status }));
}
function target(html: string) {
 const match = html.match(/data-testid="uiwire15-continue" href="#([^"]+)"/u);
 expect(match).not.toBeNull();
 return match![1]!;
}
it.each(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"])("renders a real Continue destination for %s", status => {
 const cardHtml = card(status, ["live", "invoiced", "paid"].includes(status) ? { check: { state: "pending", lockId: jobId } } : {});
 const id = target(cardHtml);
 hooks.values = [null, { jobId, status, proposal: { title: "Fictional job", lines: [], questions: [] }, review: null, source: { kind: "text", text: "Fictional job", version: 1 } }, null, false, ""];
 const html = renderToStaticMarkup(WorkspaceShell({ jobId }));
 expect(html).toContain(` id="${id}"`);
});
it("uses the existing proof section for incomplete live work", () => {
 const id = target(card("live", { proof: { jobId, completion: null } }));
 expect(renderToStaticMarkup(<ProofStage jobId={jobId}/>)).toContain(` id="${id}"`);
});
it("uses the existing variations heading for extras", () => {
 const id = target(card("live", { invoices: {jobId, invoices: []}, variations: { jobId, variations: [{ id: invoiceId, state: "draft", currentRevisionId: null, revisions: [] }] } }));
 hooks.values = [{ jobId, variations: [], approvedAdditionsPence: 0, approvedOmissionsPence: 0, pendingExtrasPence: 0, baselinePence: 0 }];
 expect(id).toBe(`variation-${invoiceId}`);
 hooks.values = [{ jobId, variations: [{ id: invoiceId, description: "Fictional extra", scopeItemId: jobId, currentRevisionId: null, revisions: [] }], approvedAdditionsPence: 0, approvedOmissionsPence: 0, pendingExtrasPence: 0, baselinePence: 0 }];
 expect(renderToStaticMarkup(<JobVariations jobId={jobId}/>)).toContain(` id="${id}"`);
 expect(card("live")).toContain("You finished this practice job");
});
it("uses the final-account heading without inventing a job total", () => {
 const html = card("live", { account: { jobId, account: null }, invoices: { jobId, invoices: [] } });
 expect(html).toContain("Build and complete the final account");
 expect(html).not.toContain("£1,320");
 const id = target(html);
 hooks.values = [{ account: null }, false];
 expect(renderToStaticMarkup(<JobFinalAccount jobId={jobId}/>)).toContain(` id="${id}"`);
});
it("uses this job's actual invoice identity for the payment step", () => {
 const id = target(card("live", { invoices: { jobId, invoices: [invoice({ balancePence: 500, paidPence: 107500 })] } }));
 const renderedInvoice = { id: invoiceId, number: "SYN-1", issuedOn: "2026-11-09", pdfSha256: "a".repeat(64), totalPence: 500, balancePence: 500, delivery: "simulated_delivery" };
 hooks.values = [{ jobId, invoices: [renderedInvoice] }, false];
 expect(renderToStaticMarkup(<CustomerInvoices jobId={jobId} finalAccount={{ id: jobId, sourceHash: "a".repeat(64), issueBlocked: false }}/>)).toContain(` id="${id}"`);
});

it.each(["live", "invoiced", "paid"])("renders completion without a Continue destination for completed %s", status => {
 const html = card(status); expect(html).toContain("You finished this practice job"); expect(html).not.toContain("uiwire15-continue");
});
it.each([
 [0,108000,0,"Customer paid"], [0,54000,54000,"payments and credits"], [0,0,108000,"Settled by credit"],
 [54000,54000,0,"Record the next customer payment"], [108000,0,0,"Record the next customer payment"],
])("uses all saved payment sources: %s/%s/%s", (balancePence,paidPence,creditedPence,label) => {
 const html=card("live",{invoices:{jobId,invoices:[invoice({balancePence,paidPence,creditedPence})]}});expect(html).toContain(label);
});
it("keeps an earlier unpaid invoice outstanding even when the latest is paid",()=>{
 const earlier="33333333-3333-4333-8333-333333333333";
 const html=card("live",{invoices:{jobId,invoices:[invoice({id:earlier,balancePence:108000,paidPence:0}),invoice()]}});
 expect(target(html)).toBe(`invoice-${earlier}`);expect(html).not.toContain("You finished this practice job");
});
it("distinguishes zero-value completion from payment",()=>{
 const html=card("live",{invoices:{jobId,invoices:[invoice({totalPence:0,paidPence:0})]}});
 expect(html).toContain("Zero-value job complete");expect(html).not.toContain("Customer paid");
});

function continueAction(status: string, changes: object, onNavigate?: (target: string) => void) {
 hooks.values=[{jobId,status,phase:"ready",snapshot:{facts:facts(status,changes),realExternalActions:0}}];
 const tree=PracticeJourney({jobId,status,...(onNavigate ? {onNavigate} : {})});
 function find(node:React.ReactNode):React.ReactElement<{onClick:(event:{preventDefault:()=>void})=>void}>|undefined{
  if(Array.isArray(node))return node.map(find).find(Boolean);
  if(!React.isValidElement<{children?:React.ReactNode;"data-testid"?:string}>(node))return;
  if(node.props["data-testid"]==="uiwire15-continue")return node as ReturnType<typeof find>;
  return find(node.props.children);
 }
 return find(tree)!.props.onClick;
}
function navigationDom(targetId:string, actionName:string) {
 vi.stubGlobal("React",React);
 class Details {open=false;parentElement=null;}
 const details=new Details();
 const action={textContent:actionName,disabled:false,parentElement:details,style:{},matches:(selector:string)=>selector!==":disabled",focus:vi.fn(),scrollIntoView:vi.fn()};
 const placeholder={...action,disabled:true,focus:vi.fn()};
 const base={querySelectorAll:()=>[placeholder,action],querySelector:()=>action};
 const accepted={querySelectorAll:()=>[placeholder,action]};
 const root={contains:()=>true,querySelector:(selector:string)=>selector==='[aria-label="Accepted terms"]'?accepted:null};
 vi.stubGlobal("HTMLDetailsElement",Details);
 vi.stubGlobal("document",{getElementById:(id:string)=>id==="captured-job-workspace"?root:id===targetId?base:null});
 vi.stubGlobal("history",{replaceState:vi.fn()});vi.stubGlobal("location",{pathname:`/jobs/${jobId}`,search:""});
 vi.stubGlobal("window",{dispatchEvent:vi.fn(),clearTimeout:vi.fn()});vi.stubGlobal("HashChangeEvent",class {});
 return {action,placeholder,details,root};
}
it.each(["Approve exact revision","Change price"])("opens ancestors and repeatedly focuses the exact pending extra's %s",name=>{
 const dom=navigationDom(`variation-${invoiceId}`,name);
 const onClick=continueAction("live",{invoices:{jobId,invoices:[]},variations:{jobId,variations:[{id:invoiceId,state:"draft",currentRevisionId:name==="Change price"?null:jobId,revisions:name==="Change price"?[]:[{id:jobId,approved:false,rejected:false}]}]}});
 for(let i=0;i<2;i++){dom.details.open=false;onClick({preventDefault:vi.fn()});expect(dom.details.open).toBe(true);}
 expect(dom.action.focus).toHaveBeenCalledTimes(2);expect(dom.placeholder.focus).not.toHaveBeenCalled();
 expect(dom.action.scrollIntoView).toHaveBeenCalledWith({block:"center"});
});
it("focuses Start inside Accepted terms, excluding the disabled placeholder",()=>{
 const dom=navigationDom("quote","Start this practice job");
 continueAction("accepted",{})({preventDefault:vi.fn()});
 expect(dom.action.focus).toHaveBeenCalled();expect(dom.placeholder.focus).not.toHaveBeenCalled();expect(dom.details.open).toBe(true);
});

it("opens the account without navigating to an absent earlier invoice or another receipt",()=>{
 const dom=navigationDom("final-account-title","Record practice receipt");
 vi.stubGlobal("window",{dispatchEvent:vi.fn(),clearTimeout:vi.fn(),setTimeout:vi.fn(()=>1)});
 vi.stubGlobal("MutationObserver",class {observe=vi.fn();disconnect=vi.fn();});
 continueAction("live",{invoices:{jobId,invoices:[invoice({balancePence:108000,paidPence:0})]}})({preventDefault:vi.fn()});
 expect(history.replaceState).toHaveBeenCalledWith(null,"",`/jobs/${jobId}#final-account-title`);
 expect(history.replaceState).not.toHaveBeenCalledWith(null,"",`/jobs/${jobId}#invoice-${invoiceId}`);
 expect(dom.action.focus).not.toHaveBeenCalled();
});

it("uses the shell navigation callback while retaining exact Continue focus", () => {
 const dom=navigationDom("quote","Start this practice job"), onNavigate=vi.fn();
 continueAction("accepted",{},onNavigate)({preventDefault:vi.fn()});
 expect(onNavigate).toHaveBeenCalledExactlyOnceWith("#quote");
 expect(window.dispatchEvent).not.toHaveBeenCalled();
 expect(dom.action.focus).toHaveBeenCalledWith({preventScroll:true});
});
