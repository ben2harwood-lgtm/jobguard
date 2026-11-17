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

afterEach(()=>vi.unstubAllGlobals());
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
