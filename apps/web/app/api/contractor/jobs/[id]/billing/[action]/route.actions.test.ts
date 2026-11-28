import {createHash} from "node:crypto";
import {afterEach,expect,it,vi} from "vitest";
import {ContractorBillingError} from "@jobguard/core";
const download=vi.hoisted(()=>vi.fn());
const calls=vi.hoisted(()=>[] as {method:string;job:string;raw:unknown}[]);
vi.mock("server-only",()=>({}));
vi.mock("../../../../origin",()=>({isTrustedBrowserOrigin:()=>true}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"session-1"})})}));
vi.mock("../../../../../../lib/synthetic-server",()=>({syntheticPool:()=>({})}));
vi.mock("@jobguard/api/workspace",async original=>{
 const real=await original<typeof import("@jobguard/api/workspace")>();
 class BillingApplication{constructor(_pool:unknown){} download=download;}
 for(const method of ["finalise","import","approveDelivery","advance"])(BillingApplication.prototype as unknown as Record<string,unknown>)[method]=async(_s:unknown,job:string,raw:unknown)=>{calls.push({method,job,raw});return {ok:method};};
 return {...real,BillingApplication};
});
import {GET,POST} from "./route";
const post=(action:string,body:unknown)=>POST(new Request(`http://localhost/api/contractor/jobs/job-1/billing/${action}`,{method:"POST",body:JSON.stringify(body)}),{params:Promise.resolve({id:"job-1",action})});
afterEach(()=>{calls.length=0;download.mockReset();vi.unstubAllEnvs();});
it("ENT-6 part 2: each screen action reaches exactly its own application method",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 for(const [action,method] of [["export","finalise"],["import","import"],["approve-delivery","approveDelivery"],["advance-delivery","advance"]] as const){
  const result=await post(action,{action});
  expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toBe("no-store");expect(await result.json()).toEqual({ok:method});
  expect(calls.at(-1)).toEqual({method,job:"job-1",raw:{action}});
 }
 expect(calls).toHaveLength(4);
});
it("ENT-6 part 2: an unknown action and a non-synthetic mode are refused before any application call",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const unknown=await post("retry-everything",{});
 expect(unknown.status).toBe(400);expect(await unknown.json()).toEqual({version:"contractor-billing-error.v1",code:"BILLING_INVALID"});
 vi.stubEnv("JOBGUARD_ENV","production");
 const live=await post("advance-delivery",{});
 expect((await live.json()).code).toBe("MODE_FORBIDDEN");
 expect(calls).toHaveLength(0);
});

const getDownload=()=>GET(new Request("http://localhost/api/contractor/jobs/job-1/billing/download?batchId=batch-1"),{
 params:Promise.resolve({id:"job-1",action:"download"}),
});
it("returns the exact CSV bytes and download headers for an authorised artifact",async()=>{
 const csv='description,approved_net_pence,currency\r\n"Fictional café clearance","108000","GBP"\r\n';
 const bytes=Buffer.from(csv,"utf8");
 const hash=createHash("sha256").update(bytes).digest("hex");
 download.mockResolvedValueOnce({csv,hash});

 const response=await getDownload();
 expect(download).toHaveBeenCalledExactlyOnceWith("session-1","job-1","batch-1");
 expect(response.status).toBe(200);
 expect(response.headers.get("content-disposition")).toBe('attachment; filename="jobguard-billing-export.csv"');
 expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
 expect(response.headers.get("cache-control")).toBe("no-store");
 expect(response.headers.get("x-content-sha256")).toBe(hash);
 expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
});
it("keeps an application download refusal as no-store JSON without attachment headers",async()=>{
 download.mockRejectedValueOnce(new ContractorBillingError("BILLING_NOT_FOUND"));

 const response=await getDownload();
 expect(response.status).toBe(404);
 expect(response.headers.get("cache-control")).toBe("no-store");
 expect(response.headers.get("content-type")).toContain("application/json");
 expect(response.headers.get("content-disposition")).toBeNull();
 expect(response.headers.get("x-content-sha256")).toBeNull();
 expect(await response.json()).toEqual({version:"contractor-billing-error.v1",code:"BILLING_NOT_FOUND"});
});
