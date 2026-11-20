import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinalCheckReveal } from "./final-check-reveal";
import { JOB_SAVED_EVENT } from "./job-page-fetch";
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
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = typeof value === "function" ? value(slots[index]!.value) : value; }];
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
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" })); });
afterEach(() => { hooks.reset(); vi.useRealTimers(); vi.unstubAllGlobals(); });



const jobId="18000000-0000-4000-8000-000000000001", lockId="18000000-0000-4000-8000-000000000002";
const saved=(state:string)=>({state,items:[],...(state==="unlocked"?{}:{lockId})});
const response=(body:unknown,ok=true,status=200)=>({ok,status,json:async()=>body});
let status="unlocked";
function server(){
 status="unlocked";
 const fetch=vi.fn(async(input:string,_init?:RequestInit)=>response(input.endsWith("/disputes")?[]:saved(status)));
 vi.stubGlobal("fetch",fetch);return fetch;
}
function render(id=jobId){hooks.render();const tree=FinalCheckReveal({jobId:id});hooks.effects();return tree;}
type Element=React.ReactElement<Record<string,unknown>>;
function nodes(node:React.ReactNode):Element[]{
 if(Array.isArray(node))return node.flatMap(nodes);
 if(!React.isValidElement<Record<string,unknown>>(node))return [];
 return [node,...nodes(node.props.children as React.ReactNode)];
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const delayedResponse = (milliseconds: number, body: unknown, ok = true, status = 200) =>
 new Promise<ReturnType<typeof response>>(resolve => setTimeout(() => resolve(response(body, ok, status)), milliseconds));
const button=(tree:React.ReactNode,name:string)=>nodes(tree).find(n=>n.type==="button"&&n.props.children===name)!;
const text=(tree:React.ReactNode)=>JSON.stringify(tree);
const click=(tree:React.ReactNode,name:string)=>(button(tree,name).props.onClick as ()=>void)();
function changed(id=jobId){window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT,{detail:{jobId:id}}));}
it("rereads unlocked to pending after lock, then automatically completes without Run or Load",async()=>{
 vi.useFakeTimers({toFake:["setInterval","clearInterval"]});const fetch=server();render();await tick();
 expect(text(render())).toContain("runs after you complete");status="pending";changed();await tick();render();
 status="completed";await vi.advanceTimersByTimeAsync(2000);await tick();
 expect(text(render())).toContain("found nothing missing");
 expect(fetch.mock.calls.every(call=>!(call[1] as RequestInit|undefined)?.method)).toBe(true);
 const count=fetch.mock.calls.length;await vi.advanceTimersByTimeAsync(6000);expect(fetch).toHaveBeenCalledTimes(count);
});
it("pending becomes durable failure and offers visible Try again",async()=>{
 vi.useFakeTimers({toFake:["setInterval","clearInterval"]});server();status="pending";render();await tick();render();
 status="failed";await vi.advanceTimersByTimeAsync(2000);await tick();const tree=render();
 expect(button(tree,"Try again").props.disabled).toBe(false);expect(text(tree)).not.toContain("still running");
});
it.each(["pending conflict","lost reply"])("%s rereads saved state after exactly one POST even on double tap",async kind=>{
 const fetch=server();status="failed";render();await tick();const tree=render();
 fetch.mockImplementation(async(input:string,init?:RequestInit)=>{
  if(init?.method==="POST"){status="pending";if(kind==="lost reply")throw new Error("lost");return response({code:"FINAL_CHECK_PENDING"},false,409);}
  return response(input.endsWith("/disputes")?[]:saved(status));
 });
 click(tree,"Try again");click(tree,"Try again");await tick();const next=render();
 expect(fetch.mock.calls.filter(call=>(call[1] as RequestInit|undefined)?.method==="POST")).toHaveLength(1);
 expect(text(next)).toContain("Running JobGuard");expect(button(next,"Run the final check (practice)").props.disabled).toBe(true);
});
it("legacy restart refusal explains the limit and preserves explicit retry on saved failure",async()=>{
 const fetch=server();status="failed";render();await tick();
 fetch.mockImplementation(async(input:string,init?:RequestInit)=>init?.method==="POST"?response({code:"FINAL_CHECK_RESTART_REFUSED"},false,409):response(input.endsWith("/disputes")?[]:saved("failed")));
 click(render(),"Try again");await tick();const tree=render();expect(text(tree)).toContain("Some older checks cannot be restarted");expect(button(tree,"Try again").props.disabled).toBe(false);
});
it.each([403,500])("read refusal %s clears completed revealed data, stops polling and remains unavailable rather than failed",async code=>{
 vi.useFakeTimers({toFake:["setInterval","clearInterval"]});const fetch=server();status="completed";render();await tick();render();
 fetch.mockResolvedValue(response({},false,code));click(render(),"Load the saved final check");await vi.advanceTimersByTimeAsync(2000);await tick();const tree=render();
 expect(text(tree)).toContain("unavailable");expect(text(tree)).not.toContain("could not finish");expect(button(tree,"Load the saved final check")).toBeDefined();
 const count=fetch.mock.calls.length;await vi.advanceTimersByTimeAsync(6000);expect(fetch).toHaveBeenCalledTimes(count);
});
it("page return rereads saved state, while unrelated jobs cannot trigger reads",async()=>{
 const fetch=server();render();await tick();const count=fetch.mock.calls.length;changed("another-job");expect(fetch).toHaveBeenCalledTimes(count);
 status="completed";window.dispatchEvent(new Event("focus"));await tick();expect(text(render())).toContain("found nothing missing");
});
it("navigation rejects obsolete replies and unmount removes listeners",async()=>{
 const fetch=server();let finish!:(value:ReturnType<typeof response>)=>void;
 fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render();
 render("18000000-0000-4000-8000-000000000009");await tick();finish(response(saved("failed")));await tick();
 expect(text(render("18000000-0000-4000-8000-000000000009"))).not.toContain("could not finish");
 hooks.reset();const count=fetch.mock.calls.length;changed();window.dispatchEvent(new Event("focus"));expect(fetch).toHaveBeenCalledTimes(count);
});
it("bounded polling pauses without declaring failure and retains manual refresh",async()=>{
 vi.useFakeTimers({toFake:["setInterval","clearInterval"]});server();status="pending";render();await tick();render();
 await vi.advanceTimersByTimeAsync(242000);await tick();const tree=render();expect(text(tree)).toContain("Automatic refresh has paused");expect(text(tree)).not.toContain("could not finish");expect(button(tree,"Load the saved final check").props.disabled).toBe(false);
});

it("a lost restart reply followed by unavailable reads blocks another POST until saved failure establishes no admission",async()=>{
 const fetch=server();status="failed";render();await tick();let unavailable=true;
 fetch.mockImplementation(async(input:string,init?:RequestInit)=>{
  if(init?.method==="POST")throw new Error("lost");
  return unavailable?response({},false,503):response(input.endsWith("/disputes")?[]:saved("failed"));
 });
 click(render(),"Try again");await tick();expect(text(render())).toContain("unknown");
 unavailable=false;click(render(),"Load the saved final check");await tick();expect(button(render(),"Try again").props.disabled).toBe(false);
 expect(fetch.mock.calls.filter(call=>call[1]?.method==="POST")).toHaveLength(1);
});
it("losing access during the disputes read also clears the saved reveal",async()=>{
 const fetch=server();fetch.mockImplementation(async input=>input.endsWith("/disputes")?response({},false,403):response(saved("completed")));
 render();await tick();expect(text(render())).toContain("unavailable");expect(text(render())).not.toContain("found nothing missing");
});
it("a stalled saved read is cancelled and shown as unavailable, never a failed check",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});const fetch=server();
 fetch.mockImplementation((_input:string,init?:RequestInit)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener("abort",()=>reject(new Error("aborted")));}));
 render();await vi.advanceTimersByTimeAsync(10000);await tick();const tree=render();
 expect(text(tree)).toContain("unavailable");expect(text(tree)).not.toContain("could not finish");expect(button(tree,"Load the saved final check").props.disabled).toBe(false);
});
it("accepts two sequential seven-second reads without losing the saved pending check", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
 const fetch = server();
 fetch.mockImplementation(input => delayedResponse(7000, input.endsWith("/disputes") ? [] : saved("pending")));
 render();
 await vi.advanceTimersByTimeAsync(6999);
 expect(fetch).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1); await tick();
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(fetch.mock.calls[1]![0]).toBe(`/api/jobs/${jobId}/final-check/disputes`);
 await vi.advanceTimersByTimeAsync(3000); await tick();
 const waiting = render();
 expect(waiting.props["aria-busy"]).toBe(true);
 expect(text(waiting)).not.toContain("unavailable");
 expect(text(waiting)).not.toContain("Running JobGuard");
 await vi.advanceTimersByTimeAsync(4000); await tick();
 const loaded = render();
 expect(text(loaded)).toContain("Running JobGuard");
 expect(button(loaded, "Run the final check (practice)").props.disabled).toBe(false);
 expect(loaded.props["aria-busy"]).toBe(false);
 expect(fetch.mock.calls.every(call => !call[1]?.method)).toBe(true);
});
it("navigation while a restart is in flight rejects its late reply",async()=>{
 const fetch=server();status="failed";render();await tick();let finish!:(value:ReturnType<typeof response>)=>void;
 fetch.mockImplementation(async(input:string,init?:RequestInit)=>init?.method==="POST"?new Promise(resolve=>{finish=resolve;}):response(input.endsWith("/disputes")?[]:saved("unlocked")));
 click(render(),"Try again");render("18000000-0000-4000-8000-000000000099");await tick();finish(response({code:"FORBIDDEN"},false,403));await tick();
 const tree=render("18000000-0000-4000-8000-000000000099");expect(text(tree)).not.toContain("server refused");expect(text(tree)).toContain("runs after you complete");
});


it.each([403, 500, "abort"] as const)("retains pending after read failure %s and recovers on the existing poll", async failure => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
 const fetch = server(); status = "pending"; render(); await tick(); render();
 const poll = vi.spyOn(globalThis, "setInterval");
 if (failure === "abort") {
  fetch.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
   init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  }));
 } else fetch.mockResolvedValueOnce(response({}, false, failure));
 await vi.advanceTimersByTimeAsync(2000); await tick(); render();
 if (failure === "abort") { await vi.advanceTimersByTimeAsync(10000); await tick(); }
 const tree = render();
 expect(text(tree)).toContain("Running JobGuard");
 expect(nodes(tree).find(node => node.props.role === "status" && String(node.props.children).includes("temporarily unavailable"))).toBeDefined();
 expect(text(tree)).not.toContain("could not finish");
 status = "completed";
 await vi.advanceTimersByTimeAsync(2000); await tick();
 expect(text(render())).toContain("found nothing missing");
 expect(text(render())).not.toContain("temporarily unavailable");
 expect(poll).not.toHaveBeenCalled(); poll.mockRestore();
 const count = fetch.mock.calls.length;
 await vi.advanceTimersByTimeAsync(6000); expect(fetch).toHaveBeenCalledTimes(count);
});

it("rejects an older pending reply after a newer completed read", async () => {
 const fetch = server(); status = "pending"; render(); await tick(); render();
 let finish!: (value: ReturnType<typeof response>) => void;
 fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 click(render(), "Load the saved final check");
 status = "completed"; window.dispatchEvent(new Event("focus")); await tick(); render();
 finish(response(saved("pending"))); await tick();
 expect(text(render())).toContain("found nothing missing");
});

it("unmount leaves a pending poll unaborted, discards it, and removes its timer and listeners", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
 const fetch = server(); status = "pending"; render(); await tick(); render();
 let signal: AbortSignal | undefined;
 fetch.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
  signal = init?.signal ?? undefined;
  signal?.addEventListener("abort", () => reject(new Error("aborted")));
 }));
 await vi.advanceTimersByTimeAsync(2000); render();
 hooks.reset(); await tick();
 expect(signal?.aborted).toBe(false); expect(vi.getTimerCount()).toBe(0);
 const count = fetch.mock.calls.length;
 changed(); window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange"));
 await vi.advanceTimersByTimeAsync(12000); expect(fetch).toHaveBeenCalledTimes(count);
});

it("failed polls count toward the existing refresh cap without resetting it", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
 const fetch = server(); status = "pending"; render(); await tick(); render();
 fetch.mockResolvedValue(response({}, false, 503));
 for (let count = 0; count < 121; count++) {
  await vi.advanceTimersByTimeAsync(2000); await tick(); render();
 }
 expect(text(render())).toContain("Automatic refresh has paused");
 expect(text(render())).toContain("Running JobGuard");
 // One initial saved read and disputes read, then exactly 120 failed polls.
 expect(fetch).toHaveBeenCalledTimes(122);
 await vi.advanceTimersByTimeAsync(6000); expect(fetch).toHaveBeenCalledTimes(122);
});


it("a timed-out poll cannot restart polling after the cap has paused it", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
 const fetch = server(); status = "pending"; render(); await tick(); render();
 await vi.advanceTimersByTimeAsync(238000); await tick(); render();
 fetch.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
 }));
 await vi.advanceTimersByTimeAsync(4000); await tick(); render();
 expect(text(render())).toContain("Automatic refresh has paused");
 await vi.advanceTimersByTimeAsync(8000); await tick(); render();
 expect(text(render())).toContain("Automatic refresh has paused");
 expect(vi.getTimerCount()).toBe(0);
 const count = fetch.mock.calls.length;
 await vi.advanceTimersByTimeAsync(6000); expect(fetch).toHaveBeenCalledTimes(count);
});


it.each(["ok", "failed", "timeout"])("coalesces overlapping loads into one follow-up after %s without aborting", async outcome => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 const fetch = server();
 let finish!: (value: ReturnType<typeof response>) => void;
 let signal: AbortSignal | undefined;
 fetch.mockImplementationOnce((_input, init) => {
  signal = init?.signal ?? undefined;
  return new Promise(resolve => { finish = resolve; });
 });
 const tree = render();
 click(tree, "Load the saved final check");
 window.dispatchEvent(new Event("focus")); changed();
 document.dispatchEvent(new Event("visibilitychange"));
 expect(fetch).toHaveBeenCalledTimes(1); expect(signal?.aborted).toBe(false);
 if (outcome === "timeout") await vi.advanceTimersByTimeAsync(10000);
 else finish(outcome === "failed" ? response({}, false, 503) : response(saved("unlocked")));
 await tick();
 expect(signal?.aborted).toBe(false); expect(fetch).toHaveBeenCalledTimes(2);
 expect(text(render())).toContain("runs after you complete");
 if (outcome === "timeout") { finish(response(saved("failed"))); await tick(); }
 expect(text(render())).not.toContain("could not finish");
 await tick(); expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(["unmount", "job change"])("%s aborts nothing, discards outstanding and timed-out reads and a queued reread", async departure => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 const fetch = server(); const signals: AbortSignal[] = [];
 fetch.mockImplementation((_input, init) => new Promise((_resolve, reject) => {
  const signal = init!.signal!; signals.push(signal);
  signal.addEventListener("abort", () => reject(new Error("aborted")));
 }));
 render(); changed();
 await vi.advanceTimersByTimeAsync(10000); await tick();
 expect(signals).toHaveLength(2); expect(signals.every(signal => !signal.aborted)).toBe(true);
 changed();
 if (departure === "unmount") hooks.reset();
 else render("18000000-0000-4000-8000-000000000009");
 await tick();
 expect(signals[0]!.aborted).toBe(false); expect(signals[1]!.aborted).toBe(false);
 expect(fetch).toHaveBeenCalledTimes(departure === "unmount" ? 2 : 3);
});


const finding = { signalId: "18000000-0000-4000-8000-000000000003", signalRevision: 1,
 description: "heated towel rail", evidence: [], comparisons: { lockedLineIds: [], baselineItemIds: [] }, disposition: null, answer: null };
const reveal = (estimate: unknown = 18000, state = "completed") => ({ ...saved(state),
 runId: "18000000-0000-4000-8000-000000000004", items: [{ ...finding, estimatedValuePence: estimate }] });
// Execute the finding component too: the parent hook harness otherwise stops at its element.
function screen(id = jobId) {
 const tree = render(id);
 const cards = nodes(tree).filter(node => typeof node.type === "function" && node.props.revealed)
  .map(node => (node.type as (props: Record<string, unknown>) => React.ReactNode)(node.props));
 return text([tree, cards]);
}
function serveReveal(body: unknown) {
 const fetch = server();
 fetch.mockImplementation(async input => response(input.endsWith("/disputes") ? [] : body));
 return fetch;
}
it.each([[18000, "£180.00"], [15000, "£150.00"], [18007, "£180.07"], [0, "£0.00"]])(
 "displays saved estimate %s as a proposal without writing", async (estimate, label) => {
 const fetch = serveReveal(reveal(estimate)); render(); await tick();
 const view = screen(); expect(view).toContain(`Estimated extra: ${label}`);
 expect(view).toContain("Proposal only"); expect(view).toContain("price and approve");
 expect(fetch.mock.calls.every(call => !call[1]?.method)).toBe(true);
 click(render(), "Load the saved final check"); await tick(); expect(screen()).toContain(`Estimated extra: ${label}`);
});
it.each(["absent", "null"])("uses Needs a price only for %s estimates", async kind => {
 const body = reveal(null); if (kind === "absent") delete (body.items[0] as { estimatedValuePence?: unknown }).estimatedValuePence;
 serveReveal(body); render(); await tick();
 expect(screen()).toContain("Needs a price"); expect(screen()).not.toContain("£0.00");
});
it.each([-1, 18000.5, Number.MAX_SAFE_INTEGER + 1, 1_000_000_000_001, "18000", NaN, Infinity, -Infinity])(
 "refuses malformed estimate %s and clears the previous price", async estimate => {
 const fetch = serveReveal(reveal()); render(); await tick(); expect(screen()).toContain("Estimated extra: £180.00");
 fetch.mockResolvedValue(response(reveal(estimate))); click(render(), "Load the saved final check"); await tick();
 const view = screen(); expect(view).toContain("unavailable"); expect(view).not.toContain("heated towel rail");
 expect(view).not.toContain("Estimated extra"); expect(view).not.toContain("Needs a price");
});
it.each(["unlocked", "pending", "failed"])("never displays findings or prices in %s even if items are supplied", async state => {
 serveReveal(reveal(18000, state)); render(); await tick();
 const view = screen(); expect(view).not.toContain("heated towel rail"); expect(view).not.toContain("Estimated extra");
});
it.each([401, 403, 500, "disputes revoked"] as const)("removes an existing finding and price after %s", async failure => {
 const fetch = serveReveal(reveal()); render(); await tick(); expect(screen()).toContain("Estimated extra: £180.00");
 fetch.mockImplementation(async input => failure === "disputes revoked"
  ? input.endsWith("/disputes") ? response({}, false, 403) : response(reveal())
  : response({}, false, failure));
 click(render(), "Load the saved final check"); await tick();
 const view = screen(); expect(view).toContain("unavailable"); expect(view).not.toContain("heated towel rail"); expect(view).not.toContain("Estimated extra");
});
it("hides the old job immediately and discards its late priced reply after navigation", async () => {
 const fetch = serveReveal(reveal()); render(); await tick(); expect(screen()).toContain("Estimated extra: £180.00");
 let finish!: (value: ReturnType<typeof response>) => void;
 fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 click(render(), "Load the saved final check");
 fetch.mockImplementation(async () => response(saved("unlocked")));
 const nextJob = "18000000-0000-4000-8000-000000000099";
 expect(screen(nextJob)).not.toContain("Estimated extra"); await tick();
 finish(response(reveal(99999))); await tick();
 expect(screen(nextJob)).not.toContain("heated towel rail"); expect(screen(nextJob)).not.toContain("Estimated extra");
});

it("a slow authorised unlocked read never starts the disputes phase", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 const fetch = server(); fetch.mockImplementation(() => delayedResponse(7000, saved("unlocked")));
 render(); await vi.advanceTimersByTimeAsync(7000); await tick();
 expect(text(render())).toContain("runs after you complete");
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(button(render(), "Load the saved final check").props.disabled).toBe(false);
 await vi.advanceTimersByTimeAsync(20000);
 expect(fetch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});

it("a first-phase deadline discards a late locked reply without reading disputes", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 const fetch = server(); let finish!: (value: ReturnType<typeof response>) => void;
 fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 render(); await vi.advanceTimersByTimeAsync(9999);
 expect(render().props["aria-busy"]).toBe(true);
 await vi.advanceTimersByTimeAsync(1); await tick();
 expect(text(render())).toContain("unavailable");
 expect(button(render(), "Load the saved final check").props.disabled).toBe(false);
 finish(response(reveal())); await tick();
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(screen()).not.toContain("heated towel rail");
 expect(vi.getTimerCount()).toBe(0);
});

it("bounds a stalled disputes body independently and discards it after a newer saved read", async () => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 const fetch = server(); let finishBody!: (value: unknown) => void;
 fetch.mockImplementation(input => input.endsWith("/disputes")
  ? Promise.resolve({ ...response([]), json: () => new Promise(resolve => { finishBody = resolve; }) })
  : delayedResponse(9000, reveal()));
 render(); await vi.advanceTimersByTimeAsync(9000); await tick();
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(screen()).not.toContain("heated towel rail");
 await vi.advanceTimersByTimeAsync(9999); await tick();
 expect(render().props["aria-busy"]).toBe(true);
 expect(screen()).not.toContain("heated towel rail");
 await vi.advanceTimersByTimeAsync(1); await tick();
 expect(text(render())).toContain("unavailable");
 expect(button(render(), "Load the saved final check").props.disabled).toBe(false);
 fetch.mockResolvedValue(response(saved("unlocked")));
 click(render(), "Load the saved final check"); await tick();
 expect(text(render())).toContain("runs after you complete");
 finishBody([{}]); await tick();
 expect(screen()).not.toContain("heated towel rail");
 expect(screen()).not.toContain("final-check-disputes");
 expect(text(render())).toContain("runs after you complete");
 expect(fetch.mock.calls.every(call => !call[1]?.signal?.aborted)).toBe(true);
 expect(vi.getTimerCount()).toBe(0);
});

it.each([401, 403])("a delayed disputes refusal %s still removes a previously authorised finding", async code => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 const fetch = serveReveal(reveal()); render(); await tick();
 expect(screen()).toContain("Estimated extra: £180.00");
 fetch.mockImplementation(input => input.endsWith("/disputes")
  ? delayedResponse(7000, {}, false, code)
  : delayedResponse(7000, reveal()));
 click(render(), "Load the saved final check");
 await vi.advanceTimersByTimeAsync(10000); await tick();
 expect(render().props["aria-busy"]).toBe(true);
 await vi.advanceTimersByTimeAsync(4000); await tick();
 const view = screen();
 expect(view).toContain("unavailable"); expect(view).not.toContain("heated towel rail");
 expect(view).not.toContain("Estimated extra");
 expect(button(render(), "Load the saved final check").props.disabled).toBe(false);
 expect(vi.getTimerCount()).toBe(0);
});

it.each(["job change", "unmount"])("%s discards a late disputes reply and cleans its phase timer without aborting", async departure => {
 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
 const fetch = server(); let finish!: (value: ReturnType<typeof response>) => void;
 fetch.mockImplementation(input => input.endsWith("/disputes")
  ? new Promise(resolve => { finish = resolve; })
  : delayedResponse(7000, reveal()));
 render(); await vi.advanceTimersByTimeAsync(7000); await tick();
 expect(fetch).toHaveBeenCalledTimes(2);
 const signals = fetch.mock.calls.map(call => call[1]!.signal!);
 expect(screen()).not.toContain("heated towel rail");
 const nextJob = "18000000-0000-4000-8000-000000000099";
 fetch.mockResolvedValue(response(saved("unlocked")));
 if (departure === "unmount") hooks.reset(); else render(nextJob);
 await tick();
 const calls = fetch.mock.calls.length;
 finish(response([{}])); await tick(); await vi.advanceTimersByTimeAsync(20000);
 if (departure === "job change") {
  expect(screen(nextJob)).toContain("runs after you complete");
  expect(screen(nextJob)).not.toContain("heated towel rail");
  expect(screen(nextJob)).not.toContain("final-check-disputes");
 }
 expect(fetch).toHaveBeenCalledTimes(calls);
 expect(signals.every(signal => !signal.aborted)).toBe(true);
 expect(vi.getTimerCount()).toBe(0);
});
