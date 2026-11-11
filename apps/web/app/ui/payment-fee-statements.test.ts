// This direct-component harness has no workspace provider. Navigation refresh is covered in job-final-account.test.tsx.
vi.mock("./job-facts-refresh",()=>({useJobFactsRefresh:()=>undefined}));
import { afterEach,expect,it,vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentFeeStatements,readPaymentFeeView,paymentFeeDisplayPence } from "./payment-fee-statements";
it("shows the statement principal and retained money using exact half-even at the display boundary",()=>{
 expect(paymentFeeDisplayPence({numerator:"80000",denominator:"1"})).toBe(80000);
 expect(paymentFeeDisplayPence({numerator:"80000",denominator:"1"},8000)).toBe(72000);
 // Subtract before rounding: half-even is not invariant under odd integer shifts.
 expect(paymentFeeDisplayPence({numerator:"11",denominator:"2"})).toBe(6);
 expect(paymentFeeDisplayPence({numerator:"11",denominator:"2"},1)).toBe(4);
});
it("never converts huge exact denominators to floating-point Infinity",()=>{
 const d=10n**400n;
 expect(paymentFeeDisplayPence({numerator:(80000n*d).toString(),denominator:d.toString()})).toBe(80000);
 expect(paymentFeeDisplayPence({numerator:(80000n*d+d/2n).toString(),denominator:d.toString()},1)).toBe(80000);
});

afterEach(()=>{vi.unstubAllGlobals();state.values=null;state.cursor=0;state.effects=[];});
const state = vi.hoisted(() => ({ values: null as unknown[] | null, cursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async importOriginal => {
 const original = await importOriginal<typeof React>();
 return { ...original,
  useState: (initial: unknown) => {
   if (!state.values) return original.useState(initial);
   const index=state.cursor++;
   return [state.values[index], (value: unknown) => { state.values![index]=value; }];
  },
  useEffect: (effect: () => unknown, deps: readonly unknown[]) => {
   if (state.values) state.effects.push(effect); else original.useEffect(effect as () => void, deps);
  },
 };
});
const jobId="11111111-1111-4111-8111-111111111111";
const emptyView={version:"payment-fee-view.v1",jobId,receipts:[],statements:[],standingAuthority:null,productionEnabled:false,realExternalActions:0};
it("finishes receipt reads across navigation and waits for the complete response body",async()=>{
 let finish!:(value:unknown)=>void;
 const body=new Promise(resolve=>{finish=resolve;});
 const json=vi.fn(()=>body),fetch=vi.fn(async()=>({ok:true,json}));
 vi.stubGlobal("fetch",fetch);
 let settled=false;
 const read=readPaymentFeeView(jobId).then(value=>{settled=true;return value;});
 await Promise.resolve();await Promise.resolve();
 expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/jobs/${jobId}/payment-fees`,{cache:"no-store",keepalive:true});
 expect(json).toHaveBeenCalledOnce();expect(settled).toBe(false);
 finish(emptyView);expect(await read).toEqual(emptyView);
});
it("consumes refused reads and rejects foreign-job and malformed successful answers",async()=>{
 const json=vi.fn(async()=>({code:"NOT_FOUND"}));
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json})));
 await expect(readPaymentFeeView(jobId)).rejects.toThrow("could not be loaded");
 expect(json).toHaveBeenCalledOnce();
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({...emptyView,jobId:"22222222-2222-4222-8222-222222222222"})})));
 await expect(readPaymentFeeView(jobId)).rejects.toThrow("another job");
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({})})));
 await expect(readPaymentFeeView(jobId)).rejects.toThrow();
});
it("makes no verification or guarantee claim before a receipt read has completed",()=>{
 vi.stubGlobal("React",React);
 const html=renderToStaticMarkup(React.createElement(PaymentFeeStatements,{jobId}));
 expect(html).toContain("Refresh fee statements");
 expect(html).not.toMatch(/verified|guaranteed/iu);
});

function settledPanel(view: unknown, error = "") {
 state.values = [0, view, error, false]; state.cursor = 0;
 vi.stubGlobal("React", React);
 return renderToStaticMarkup(React.createElement(PaymentFeeStatements,{jobId}));
}
it("consumes a new job's 404 as no receipts and renders the empty state without an alert",async()=>{
 const json=vi.fn(async()=>({code:"NOT_FOUND"}));
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,status:404,json})));
 await expect(readPaymentFeeView(jobId)).rejects.toThrow("No receipts yet");
 expect(json).toHaveBeenCalledOnce();
 const html=settledPanel(null);
 expect(html).toContain("No receipts yet");expect(html).not.toContain('role="alert"');
 expect(html).toContain('aria-label="Receipt fee statements"');expect(html).toContain("Refresh fee statements");
});
it("renders a valid empty receipt list without dropping existing authority controls or their test id",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>emptyView})));
 const html=settledPanel(await readPaymentFeeView(jobId));
 expect(html).toContain("No receipts yet");expect(html).not.toContain('role="alert"');
 expect(html).toContain('data-testid="standing-authority-state"');
 expect(html).toContain("Opt in to standing authority for simulation");
});
it.each([401,403,409,500,503])("preserves a real failure for HTTP %s",async status=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,status,json:async()=>({code:"FAILED"})})));
 await expect(readPaymentFeeView(jobId)).rejects.toThrow("Receipt statements could not be loaded.");
 const html=settledPanel(undefined,"Receipt statements could not be loaded.");
 expect(html).toContain('role="alert"');expect(html).toContain("Receipt statements could not be loaded.");expect(html).not.toContain("No receipts yet");
});
it("preserves network and malformed-body failures",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new TypeError("Network failed")));
 await expect(readPaymentFeeView(jobId)).rejects.toThrow("Network failed");
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,status:500,json:async()=>{throw new SyntaxError("Invalid JSON");}})));
 await expect(readPaymentFeeView(jobId)).rejects.toThrow("Invalid JSON");
});

it.each([404,500])("renders the actual completed read for HTTP %s",async status=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,status,json:async()=>({code:"NOT_FOUND"})})));
 settledPanel(undefined);
 state.effects.shift()!();
 await new Promise<void>(resolve=>setImmediate(resolve));
 state.cursor=0;
 const html=renderToStaticMarkup(React.createElement(PaymentFeeStatements,{jobId}));
 if(status===404){expect(html).toContain("No receipts yet");expect(html).not.toContain('role="alert"');}
 else {expect(html).toContain("Receipt statements could not be loaded.");expect(html).toContain('role="alert"');expect(html).not.toContain("No receipts yet");}
});
