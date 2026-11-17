import { afterEach,expect,it,vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readSimulationFeeStatements,SimulationFeeStatements } from "./simulation-fee-statements";
const state=vi.hoisted(()=>({values:[] as unknown[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState:(initial:unknown)=>[state.values.length?state.values.shift():initial,vi.fn()],useEffect:()=>undefined}));
afterEach(()=>{state.values=[];vi.unstubAllGlobals();});
const jobId="11111111-1111-4111-8111-111111111111";
it("finishes both bounded reads across navigation and waits for the statement body",async()=>{
 let finish!:(value:unknown)=>void;
 const body=new Promise(resolve=>{finish=resolve;});
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({state:"catch_review_available"})}).mockResolvedValueOnce({ok:true,json:()=>body});
 vi.stubGlobal("fetch",fetch);
 let settled=false;const read=readSimulationFeeStatements(jobId).then(view=>{settled=true;return view;});
 await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
 expect(settled).toBe(false);
 expect(fetch).toHaveBeenNthCalledWith(1,`/api/jobs/${jobId}/success-fees`,{cache:"no-store",keepalive:true});
 expect(fetch).toHaveBeenNthCalledWith(2,`/api/jobs/${jobId}/success-fees/statements`,{cache:"no-store",keepalive:true});
 finish({version:"simulation-fee-statement-view.v1",jobId,statements:[]});
 expect(await read).toEqual({available:true,statements:[]});
});
it.each([false,true])("does not start a statement request without catch availability (HTTP OK=%s)",async ok=>{
 const fetch=vi.fn(async()=>({ok,json:async()=>({state:"dependency_bound"})}));vi.stubGlobal("fetch",fetch);
 expect(await readSimulationFeeStatements(jobId)).toEqual({available:false,statements:[]});expect(fetch).toHaveBeenCalledTimes(1);
});
it("gives the native download link the exact versioned filename",()=>{
 vi.stubGlobal("React",React);
 state.values=[true,[{documentHash:"a".repeat(64),document:{statementId:jobId,number:"DEMO-FEE-000001",cumulativeFeePrincipal:{pence:6000},documentPrincipal:{pence:6000},qualifyingPrincipal:{numerator:"60000",denominator:"1"},sourceSnapshot:{sources:[],derivations:[],adjustments:{paymentReversalIds:[],creditNoteIds:[],evidenceInvalidationIds:[]}},postingHistory:[]}}],"",false,null];
 const html=renderToStaticMarkup(React.createElement(SimulationFeeStatements,{jobId}));
 expect(html).toContain(`href="/api/jobs/${jobId}/success-fees/statements/${jobId}" download="DEMO-FEE-000001.v1.json"`);
});


it.each(["availability","statements"])("awaits the complete %s refusal body instead of abandoning it",async refused=>{
 let finish!:(value:unknown)=>void;const body=new Promise(resolve=>{finish=resolve;});
 const refusedJson=vi.fn(()=>body);
 const fetch=vi.fn();
 if(refused==="statements")fetch.mockResolvedValueOnce({ok:true,json:async()=>({state:"catch_review_available"})});
 fetch.mockResolvedValueOnce({ok:false,json:refusedJson});vi.stubGlobal("fetch",fetch);
 let settled=false;const read=readSimulationFeeStatements(jobId).then(view=>{settled=true;return view;});
 await vi.waitFor(()=>expect(refusedJson).toHaveBeenCalledOnce());expect(settled).toBe(false);
 finish({code:"SUCCESS_FEE_FORBIDDEN"});
 expect(await read).toEqual({available:refused==="statements",statements:[]});
 expect(fetch).toHaveBeenCalledTimes(refused==="statements"?2:1);
});

it("names simultaneous statement and collection errors without hiding either failure",()=>{
 vi.stubGlobal("React",React);
 const record={documentHash:"a".repeat(64),document:{statementId:jobId,number:"DEMO-FEE-000001",cumulativeFeePrincipal:{pence:28200},documentPrincipal:{pence:28200},qualifyingPrincipal:{numerator:"282000",denominator:"1"},sourceSnapshot:{sources:[],derivations:[],adjustments:{paymentReversalIds:[],creditNoteIds:[],evidenceInvalidationIds:[]}},postingHistory:[]}};
 state.values=[true,[record],"This statement could not be saved or approved. Refresh the source review and try again.",false,null,null,false,"Collection records could not be loaded."];
 const html=renderToStaticMarkup(React.createElement(SimulationFeeStatements,{jobId}));
 expect(html.match(/role="alert"/gu)).toHaveLength(2);
 expect(html).toContain('role="alert" aria-label="Simulation statement error">This statement could not be saved or approved. Refresh the source review and try again.</p>');
 expect(html).toContain('role="alert" aria-label="Simulation collection error">Collection records could not be loaded.</p>');
});
