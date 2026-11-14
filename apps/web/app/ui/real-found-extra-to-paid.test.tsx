import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JobVariations } from "./job-variations";
import { JOB_SAVED_EVENT } from "./job-page-fetch";
vi.mock("@jobguard/api/variation-contracts", () => import("../../../api/src/variation/contracts.js"));
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

beforeEach(()=>{vi.stubGlobal("React",React);vi.stubGlobal("window",new EventTarget());});
afterEach(()=>{hooks.reset();vi.unstubAllGlobals();});
const id=(n:number)=>`18000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const jobId=id(1),variationId=id(2);
const draft={id:variationId,scopeItemId:id(3),existingScopeItemId:null,lineageParentScopeItemId:id(4),description:"heated towel rail",captureText:"heated towel rail",state:"draft",currentRevisionId:null,revisions:[]};
const workspace=(variations:unknown[]=[draft],job=jobId)=>({version:1,environment:"synthetic_demo",jobId:job,baselinePence:20000,capPence:0,parentScopeItemId:id(4),approvedAdditionsPence:0,approvedOmissionsPence:0,pendingExtrasPence:0,variations});
const item={signalId:id(5),signalRevision:1,description:"heated towel rail",evidence:[],comparisons:{lockedLineIds:[],baselineItemIds:[]},disposition:"confirmed_extra",answer:null,variationId,estimatedValuePence:18000};
const reveal=(overrides:object={})=>({state:"completed",items:[{...item,...overrides}]});
type Element=React.ReactElement<Record<string,unknown>>;
function nodes(node:React.ReactNode):Element[]{
 if(Array.isArray(node))return node.flatMap(nodes);
 if(!React.isValidElement<Record<string,unknown>>(node))return [];
 return [node,...nodes(node.props.children as React.ReactNode)];
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const render=(job=jobId)=>{hooks.render();const tree=JobVariations({jobId:job});hooks.effects();return tree;};
const input=(tree:React.ReactNode,label:string)=>nodes(tree).find(n=>n.props["aria-label"]===label)!;
const button=(tree:React.ReactNode,label:string)=>nodes(tree).find(n=>n.type==="button"&&n.props.children===label)!;
const click=(node:Element)=>(node.props.onClick as ()=>void)();
function setup(read:unknown=reveal(),saved:unknown=workspace()){
 const fetch=vi.fn().mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith("/final-check")?read:saved}));
 vi.stubGlobal("fetch",fetch);return fetch;
}
const savedEvent=(job=jobId)=>window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT,{detail:{jobId:job}}));

it("a confirmed saved draft appears immediately with a proposed price, without saving or approving it",async()=>{
 let saved=workspace([]);const fetch=setup();fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith("/final-check")?reveal():saved}));
 render();await tick();render();saved=workspace();savedEvent();await tick();render();
 const tree=render();expect(input(tree,"New price heated towel rail").props.value).toBe("180.00");
 expect(JSON.stringify(tree)).toContain("Proposed price from the evidence");
 expect(button(tree,"Approve exact revision")).toBeUndefined();
 expect(fetch.mock.calls.every(call=>!call[1]?.method)).toBe(true);
});
it("reload restores the exact draft proposal; refresh preserves its edited price and unrelated input",async()=>{
 setup();render();await tick();render();let tree=render();
 (input(tree,"New price heated towel rail").props.onChange as (e:unknown)=>void)({target:{value:"175.00"}});
 const description=nodes(tree).find(n=>n.type==="input"&&!n.props["aria-label"])!;
 (description.props.onChange as (e:unknown)=>void)({target:{value:"Unrelated unsaved work"}});
 savedEvent();await tick();tree=render();
 expect(input(tree,"New price heated towel rail").props.value).toBe("175.00");
 expect(nodes(tree).some(n=>n.props.value==="Unrelated unsaved work")).toBe(true);
 hooks.reset();render();await tick();render();expect(input(render(),"New price heated towel rail").props.value).toBe("180.00");
});
it.each([
 ["missing",{estimatedValuePence:undefined}], ["null",{estimatedValuePence:null}],
 ["fraction",{estimatedValuePence:18000.5}], ["negative",{estimatedValuePence:-1}],
 ["too large",{estimatedValuePence:1_000_000_000_001}], ["unsafe",{estimatedValuePence:Number.MAX_SAFE_INTEGER+1}],
 ["string",{estimatedValuePence:"18000"}], ["bad identity",{variationId:"bad"}],
 ["missing identity",{variationId:undefined}], ["other identity",{variationId:id(99)}],
])("%s never proposes a price for this draft",async(_name,overrides)=>{
 setup(reveal(overrides));render();await tick();render();let tree=render();
 if(!input(tree,"New price heated towel rail")){click(button(tree,"Change price"));tree=render();}
 expect(input(tree,"New price heated towel rail").props.value).toBe("");expect(JSON.stringify(tree)).toContain("Needs a price");
});
it.each(["pending","failed","unlocked"])("%s reveal supplies no proposals",async(state)=>{
 setup({...reveal(),state});render();await tick();render();click(button(render(),"Change price"));
 expect(input(render(),"New price heated towel rail").props.value).toBe("");
});
it("a saved price revision wins over the evidence estimate",async()=>{
 const revision={id:id(6),revision:1,description:draft.description,quantity:"1",unit:"item",unitRatePence:19000,signedDeltaPence:19000,contentHash:"a".repeat(64),approved:false,rejected:false,actor:"Builder",source:"builder"};
 setup(reveal(),workspace([{...draft,state:"priced",currentRevisionId:revision.id,revisions:[revision]}]));render();await tick();render();
 click(button(render(),"Change price"));expect(input(render(),"New price heated towel rail").props.value).toBe("190.00");
});
it("saving £180 net uses the saved variation ID and null prior revision, once despite duplicate clicks",async()=>{
 const fetch=setup();render();await tick();render();const tree=render();const save=button(tree,"Save new proposed revision");
 let finish!:(response:unknown)=>void;fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 click(save);click(save);
 const posts=fetch.mock.calls.filter(call=>call[1]?.method==="POST");expect(posts).toHaveLength(1);
 expect(JSON.parse(posts[0]![1].body)).toMatchObject({action:"revise",variationId,expectedRevisionId:null,price:{unitRatePence:18000,direction:"addition"}});
 finish({ok:true,json:async()=>workspace()});await tick();
});
it("foreign-session reveal refusal supplies no price",async()=>{
 const fetch=setup();fetch.mockImplementation(async(url:string)=>url.endsWith("/final-check")?{ok:false,status:403,json:async()=>reveal()}:{ok:true,json:async()=>workspace()});
 render();await tick();render();click(button(render(),"Change price"));expect(input(render(),"New price heated towel rail").props.value).toBe("");
});
it("navigation rejects a delayed other-job response and ignores other-job save events",async()=>{
 const fetch=setup();let finish!:(value:unknown)=>void;fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render();const next=id(88);fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith("/final-check")?{state:"completed",items:[]}:workspace([],next)}));
 render(next);await tick();finish({ok:true,json:async()=>workspace()});await tick();expect(JSON.stringify(render(next))).not.toContain("heated towel rail");
 const count=fetch.mock.calls.length;savedEvent();await tick();expect(fetch).toHaveBeenCalledTimes(count);
});

it("requires a separately saved price and then approval of that exact saved revision",async()=>{
 const fetch=setup();render();await tick();render();const revision={id:id(6),revision:1,description:draft.description,quantity:"1",unit:"item",unitRatePence:18000,signedDeltaPence:18000,contentHash:"a".repeat(64),approved:false,rejected:false,actor:"Builder",source:"builder"};
 fetch.mockImplementation(async(_url:string,init?:RequestInit)=>{
  const command=init?.body?JSON.parse(String(init.body)):null;
  return {ok:true,json:async()=>workspace([{...draft,state:command?.action==="approve"?"approved":"priced",currentRevisionId:revision.id,revisions:[{...revision,approved:command?.action==="approve"}]}])};
 });
 click(button(render(),"Save new proposed revision"));await tick();
 expect(fetch.mock.calls.filter(call=>call[1]?.method==="POST")).toHaveLength(1);
 click(button(render(),"Approve exact revision"));await tick();
 const commands=fetch.mock.calls.filter(call=>call[1]?.method==="POST").map(call=>JSON.parse(call[1].body));
 expect(commands.map(c=>c.action)).toEqual(["revise","approve"]);
 expect(commands[1]).toMatchObject({variationId,revisionId:revision.id,attestation:"Builder-recorded practice acceptance — not an authenticated customer signature"});
 expect(JSON.stringify(render())).toContain("Approved immutable commercial fact");
});

it("automatic opening keeps Change price visible and repeated clicks preserve unsaved input",async()=>{
 const fetch=setup();render();await tick();render();let tree=render();
 expect(input(tree,"New price heated towel rail").props.value).toBe("180.00");
 expect(button(tree,"Change price")).toBeDefined();
 (input(tree,"New price heated towel rail").props.onChange as (e:unknown)=>void)({target:{value:"175.00"}});
 click(button(render(),"Change price"));click(button(render(),"Change price"));
 tree=render();expect(input(tree,"New price heated towel rail").props.value).toBe("175.00");
 expect(fetch.mock.calls.every(call=>!call[1]?.method)).toBe(true);
 click(button(tree,"Save new proposed revision"));await tick();
 const post=fetch.mock.calls.find(call=>call[1]?.method==="POST")!;
 expect(JSON.parse(post[1].body)).toMatchObject({action:"revise",variationId,expectedRevisionId:null,price:{unitRatePence:17500}});
});
it("repeated Change price clicks after refresh retain the revision from when editing began",async()=>{
 const revision={id:id(6),revision:1,description:draft.description,quantity:"1",unit:"item",unitRatePence:19000,signedDeltaPence:19000,contentHash:"a".repeat(64),approved:false,rejected:false,actor:"Builder",source:"builder"};
 const fetch=setup(reveal(),workspace([{...draft,state:"priced",currentRevisionId:revision.id,revisions:[revision]}]));
 render();await tick();render();click(button(render(),"Change price"));
 (input(render(),"New price heated towel rail").props.onChange as (e:unknown)=>void)({target:{value:"185.00"}});
 const newer={...revision,id:id(7),revision:2};
 fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith("/final-check")?reveal():workspace([{...draft,state:"priced",currentRevisionId:newer.id,revisions:[revision,newer]}])}));
 savedEvent();await tick();render();click(button(render(),"Change price"));click(button(render(),"Change price"));
 expect(input(render(),"New price heated towel rail").props.value).toBe("185.00");
 click(button(render(),"Save new proposed revision"));await tick();
 const post=fetch.mock.calls.find(call=>call[1]?.method==="POST")!;
 expect(JSON.parse(post[1].body)).toMatchObject({action:"revise",variationId,expectedRevisionId:revision.id,price:{unitRatePence:18500}});
});
