import { afterEach,expect,it,vi } from "vitest";
import { readSimulationFeeCollection,writeSimulationFeeCollection } from "./simulation-fee-collection";
const jobId="11111111-1111-4111-8111-111111111111";
const view={version:"simulation-fee-collection-view.v1",jobId,attempts:[],settledPrincipal:0,refundedPrincipal:0,retainedPrincipal:0,outstandingPrincipal:28200,refundDue:0,collectionReserved:0,refundReserved:0,unknownOutcome:false};
afterEach(()=>vi.unstubAllGlobals());
it.each([true,false])("finishes the collection read body across navigation, including refusals (HTTP OK=%s)",async ok=>{
 let finish!:(value:unknown)=>void;
 const body=new Promise(resolve=>{finish=resolve;});
 const json=vi.fn(()=>body),fetch=vi.fn(async()=>({ok,json}));vi.stubGlobal("fetch",fetch);
 let settled=false;
 const read=readSimulationFeeCollection(jobId).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
 await vi.waitFor(()=>expect(json).toHaveBeenCalledOnce());expect(settled).toBe(false);
 expect(fetch).toHaveBeenCalledWith(`/api/jobs/${jobId}/success-fees/collection`,{cache:"no-store",keepalive:true});
 finish(ok?view:{code:"SUCCESS_FEE_FORBIDDEN"});
 const result=await read;
 if(ok)expect(result).toEqual({value:view});else expect(result).toEqual({error:expect.any(Error)});
});
it.each([true,false])("finishes the command body before returning to the refresh path (HTTP OK=%s)",async ok=>{
 let finish!:(value:unknown)=>void;
 const body=new Promise(resolve=>{finish=resolve;});
 const response={ok,json:vi.fn(()=>body)},fetch=vi.fn(async()=>response);vi.stubGlobal("fetch",fetch);
 const command={version:"simulation-fee-collection-command.v1",action:"redirect",commandId:jobId,attemptId:jobId};
 let settled=false;const write=writeSimulationFeeCollection(jobId,command).then(value=>{settled=true;return value;});
 await vi.waitFor(()=>expect(response.json).toHaveBeenCalledOnce());expect(settled).toBe(false);
 expect(fetch).toHaveBeenCalledWith(`/api/jobs/${jobId}/success-fees/collection`,{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
 finish(ok?{version:"simulation-fee-collection-result.v1",commandId:jobId,attemptId:jobId,replayed:false}:{code:"SUCCESS_FEE_STALE"});
 expect(await write).toBe(response);
});
