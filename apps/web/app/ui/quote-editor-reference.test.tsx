import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuoteEditor } from "./quote-editor";

const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: any[] = [], effects: (() => void)[] = [];
  return {
    
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn: () => unknown) { return fn(); },
    useEffect(fn: () => void, deps: unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old || !deps.every((value, i) => Object.is(value, old[i]))) { slots[index] = deps; effects.push(fn); }
    },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), useContext: () => 0, ...hooks }));
type Node = React.ReactElement<Record<string, any>>;
function all(tree: React.ReactNode, match: (node: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => all(child, match));
  if (!React.isValidElement<Record<string, any>>(tree)) return [];
  return [...(match(tree) ? [tree] : []), ...all(tree.props.children, match)];
}
function text(tree: React.ReactNode): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Record<string, any>>(tree)) return text(tree.props.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}


const jobId = "11111111-1111-4111-8111-111111111112";
const props = {jobId, source: [], questions: [], back() {}, beforeProof: <p>Before proof</p>, proofStage: <button>Saved proof controls</button>, finalAccount: <button>Invoice controls</button>, practiceTools: null};
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
let delivery: any, accepted: any, preview: any, activation: any;
const response = (value: unknown) => ({ok:true, json:async()=>value});
function render(id=jobId) { hooks.render(); const tree=QuoteEditor({...props,jobId:id}); hooks.effects(); return tree; }
function button(tree: React.ReactNode, name: string) { return all(tree,n=>n.type==="button"&&text(n)===name)[0]!; }
beforeEach(()=>{
 hooks.reset(); vi.stubGlobal("React",React); vi.stubGlobal("window",new EventTarget()); vi.stubGlobal("document",new EventTarget());
 delivery={documentId:"new-document",reference:"Q-0042",documentVersion:3,status:"previewed",acceptedDocumentReferences:{}};
 accepted=null;activation=null;
 preview={view:{...delivery,contentHash:"hash"},document:{reference:"Q-0042",documentVersion:3}};
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith("/parties"))return response({current:{customer:{name:"Fictional"}},currentIds:{bindingId:null}});
  if(url.endsWith("/quotes"))return response({version:1,environment:"synthetic_demo",jobId,scope:[],draft:{id:jobId,revision:1,currentRevisionId:jobId},revisions:[{id:jobId,revision:1,previousRevisionId:null,netPence:0,taxPence:0,totalPence:0,issuable:true,blockers:[],lines:[]}]});
  if(url.endsWith("/activation"))return response({version:1,environment:"synthetic_demo",jobId,jobStatus:activation?"live":"quoting",jobRevision:1,activation,effects:{activations:0,capSnapshots:0,simulatedObligations:0,settlements:0,platformJournals:0,realExternalActions:0}});
  if(url.endsWith("/preview"))return response(preview);
  if(url.endsWith("/delivery"))return response(init?.method==="POST"?{...delivery,status:"simulated_delivery"}:delivery);
  if(url.endsWith("/acceptance"))return response({activeAcceptance:accepted,events:[],effects:{platformObligations:0,settlements:0,recoveryFees:0}});
  return {ok:false};
 }));
});
afterEach(()=>vi.unstubAllGlobals());
it("quote heading uses the stored reference rather than document version",async()=>{
 render(); await settle(); await button(render(),"Preview immutable quote").props.onClick();
 const tree=render(); expect(all(tree,n=>n.type==="h2").map(text)).toContain("Quote Q-0042");
 expect(text(tree)).toContain("Document version 3"); expect(text(tree)).not.toContain("Q-0003");
});
it("uses the saved simulated-delivery notice",async()=>{
 render();await settle();await button(render(),"Preview immutable quote").props.onClick();
 await button(render(),"Simulate sending this quote").props.onClick();await settle();
 expect(all(render(),n=>n.props.role==="status").map(text).join(" ")).toContain("Simulated delivery — nothing real was sent");
});

const acceptance = () => ({documentId:"old-document",documentVersion:1,netPence:10000,totalPence:12000,acceptedAt:"2026-11-09",actor:"Builder",method:"email",sourceEvidence:"Fictional"});
it("exposes the actual Start target outside completed quote history",async()=>{
 accepted=acceptance();render();await settle();const tree=render();
 const start=button(tree,"Start this practice job");expect(start.props.id).toBe("practice-start-job");
 const history=all(tree,n=>n.type==="details"&&text(n).startsWith("Quote history"))[0]!;
 expect(history).toBeDefined();expect(all(history,n=>n.props.id==="practice-start-job")).toHaveLength(0);
 expect(all(history,n=>n.props["aria-label"]==="Accepted terms")).toHaveLength(1);
});
it("keeps live controls outside the mounted quote history",async()=>{
 accepted=acceptance(); activation={id:jobId,acceptedDocumentId:jobId,acceptedDocumentVersion:1,acceptedDocumentHash:"a".repeat(64),acceptedNetPence:10000,recoveryCapPence:null,policyVersion:"reference_fee_policy_v3",scenario:"no_charge",baseStatus:"none",baseCreditPence:0,activatedAt:"2026-11-09T00:00:00Z"};
 render();await settle();const tree=render();
 const history=all(tree,n=>n.type==="details"&&text(n).startsWith("Quote history"))[0]!;
 expect(history).toBeDefined();expect(text(history)).not.toContain("Saved proof controls");expect(text(history)).not.toContain("Invoice controls");
 expect(text(tree)).toContain("Saved proof controls");expect(text(tree)).toContain("Invoice controls");
 expect(all(history,n=>n.props["aria-label"]==="Accepted terms")).toHaveLength(1);
});

it("restores the stored reference and separately labelled version on reload",async()=>{
 render();await settle();const tree=render();
 expect(all(tree,n=>n.type==="h2").map(text)).toContain("Quote Q-0042");expect(text(tree)).toContain("Document version 3");
});
it("indexes accepted references by the accepted document ID, preserving older and duplicate references",async()=>{
 accepted=acceptance();delivery.acceptedDocumentReferences={"old-document":{reference:"Q-0007",documentVersion:1},"new-document":{reference:"Q-0042",documentVersion:3}};
 render();await settle();await button(render(),"Preview immutable quote").props.onClick();
 expect(text(all(render(),n=>n.props["data-testid"]==="accepted-revision")[0])).toContain("Quote Q-0007");
 delivery.acceptedDocumentReferences["old-document"].reference="Q-0042";
 (window as EventTarget).dispatchEvent(new Event("focus"));await settle();
 expect(text(all(render(),n=>n.props["data-testid"]==="accepted-revision")[0])).toContain("Quote Q-0042");
});
it.each(["missing", "wrong-version", "wrong-id"])("does not borrow the newest reference for %s accepted identity",async kind=>{
 accepted=acceptance();delivery.acceptedDocumentReferences=kind==="missing"?{}:kind==="wrong-version"?{"old-document":{reference:"Q-0042",documentVersion:3}}:{"other-document":{reference:"Q-0042",documentVersion:1}};
 render();await settle();expect(text(all(render(),n=>n.props["data-testid"]==="accepted-revision")[0])).toContain("Quote reference unavailable");
});
it.each(["preview", "reload"])("never fabricates a reference for an older supplied %s view",async kind=>{
 delete delivery.reference;delete preview.document.reference;
 render();await settle();if(kind==="preview")await button(render(),"Preview immutable quote").props.onClick();
 expect(text(render())).toContain("Quote reference unavailable");expect(text(render())).not.toContain("Q-0001");
});
it("shows a failed read without inventing a saved reference",async()=>{
 vi.mocked(fetch).mockImplementation(async()=>({ok:false}) as Response);
 render();await settle();const tree=render();expect(text(tree)).toContain("Quote data could not be loaded");expect(text(tree)).not.toContain("Q-0001");
});
it("clears the previous job and ignores a late preview response",async()=>{
 render();await settle();let finish!:(value:any)=>void;
 vi.mocked(fetch).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=button(render(),"Preview immutable quote").props.onClick();
 const nextId="11111111-1111-4111-8111-111111111113";
 delivery=null;accepted=null;
 render(nextId);await settle();render(nextId);
 finish(response(preview));await pending;await settle();const tree=render(nextId);
 expect(text(tree)).not.toContain("Q-0042");expect(all(tree,n=>n.props["aria-label"]==="Quote preview")).toHaveLength(0);
 expect(all(tree,n=>n.props.id==="practice-start-job")).toHaveLength(0);
});
it("ignores a late previous-job saved delivery read",async()=>{
 let finish!:(value:any)=>void;const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url,init)=>String(url).endsWith("/delivery")?new Promise(resolve=>{finish=resolve;}):original(url,init));
 render();await settle();
 vi.mocked(fetch).mockImplementation(async(url,init)=>String(url).endsWith("/delivery")?response(null) as Response:original(url,init));
 const nextId="11111111-1111-4111-8111-111111111113";render(nextId);await settle();render(nextId);
 finish(response(delivery));await settle();expect(text(render(nextId))).not.toContain("Q-0042");
});
it.each(["outcome_unknown", "failed"])("keeps %s saved execution unresolved",async status=>{
 render();await settle();await button(render(),"Preview immutable quote").props.onClick();
 vi.mocked(fetch).mockResolvedValueOnce(response({...delivery,status}) as Response);
 await button(render(),"Simulate sending this quote").props.onClick();await settle();
 expect(text(render())).not.toContain("Simulated delivery — nothing real was sent");expect(text(render())).toContain("check");
 expect(all(render(),n=>n.type==="button"&&text(n)==="Record practice acceptance")).toHaveLength(0);
});

it.each(["saved", "manual", "focus", "unsaved"])("folds completed history only when safe (%s), keeping its mounted contents",async kind=>{
 accepted=acceptance();render();await settle();let tree=render();
 const history=all(tree,n=>n.type==="details"&&text(n).startsWith("Quote history"))[0]!;
 const details={open:true,contains:()=>kind==="focus"};history.props.ref.current=details;
 if(kind==="manual"){
  details.open=false;all(history,n=>n.type==="summary")[0]!.props.onClick();details.open=true;
 }
 if(kind==="unsaved"){
  all(tree,n=>n.props["aria-label"]==="Confirmed recipient")[0]!.props.onChange({target:{value:"edited@example.invalid"}});tree=render();
 }
 vi.stubGlobal("localStorage",{setItem:vi.fn()});
 activation={id:jobId,acceptedDocumentId:jobId,acceptedDocumentVersion:1,acceptedDocumentHash:"a".repeat(64),acceptedNetPence:10000,recoveryCapPence:null,policyVersion:"reference_fee_policy_v3",scenario:"no_charge",baseStatus:"none",baseCreditPence:0,activatedAt:"2026-11-09T00:00:00Z"};
 await button(tree,"Start this practice job").props.onClick();await settle();tree=render();
 expect(details.open).toBe(kind!=="saved");
 expect(all(tree,n=>n.props["aria-label"]==="Accepted terms")).toHaveLength(1);
 expect(text(tree)).toContain("Saved proof controls");expect(text(tree)).toContain("Invoice controls");
});

it("keeps a failed saved-reference read unavailable",async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url,init)=>String(url).endsWith("/delivery")?{ok:false} as Response:original(url,init));
 render();await settle();const tree=render();expect(text(tree)).toContain("Quote data could not be loaded");
 expect(text(tree)).not.toContain("Q-0042");expect(text(tree)).not.toContain("Q-0001");
});
it("clears accepted terms, customer and Start state when changing jobs",async()=>{
 accepted=acceptance();delivery.acceptedDocumentReferences={"old-document":{reference:"Q-0007",documentVersion:1}};
 render();await settle();expect(text(render())).toContain("Q-0007");
 accepted=null;delivery=null;const nextId="11111111-1111-4111-8111-111111111113";
 render(nextId);await settle();const tree=render(nextId);
 expect(text(tree)).not.toContain("Q-0007");expect(all(tree,n=>n.props["aria-label"]==="Accepted terms")).toHaveLength(0);
 expect(all(tree,n=>n.props.id==="practice-start-job")).toHaveLength(0);
});
it("keeps a lost send response unresolved and exposes reconciliation",async()=>{
 render();await settle();await button(render(),"Preview immutable quote").props.onClick();
 vi.mocked(fetch).mockRejectedValueOnce(new Error("Fictional connection lost"));
 await button(render(),"Simulate sending this quote").props.onClick();await settle();
 expect(text(render())).toContain("Delivery outcome unknown");expect(button(render(),"Reconcile fake receipt")).toBeDefined();
 expect(all(render(),n=>n.type==="button"&&text(n)==="Record practice acceptance")).toHaveLength(0);
});
