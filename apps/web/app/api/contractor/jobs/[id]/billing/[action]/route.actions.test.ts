import {afterEach,expect,it,vi} from "vitest";
const calls=vi.hoisted(()=>[] as {method:string;job:string;raw:unknown}[]);
vi.mock("server-only",()=>({}));
vi.mock("../../../../origin",()=>({isTrustedBrowserOrigin:()=>true}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"session-1"})})}));
vi.mock("../../../../../../lib/synthetic-server",()=>({syntheticPool:()=>({})}));
vi.mock("@jobguard/api/workspace",async original=>{
 const real=await original<typeof import("@jobguard/api/workspace")>();
 class BillingApplication{constructor(_pool:unknown){}}
 for(const method of ["finalise","import","approveDelivery","advance"])(BillingApplication.prototype as unknown as Record<string,unknown>)[method]=async(_s:unknown,job:string,raw:unknown)=>{calls.push({method,job,raw});return {ok:method};};
 return {...real,BillingApplication};
});
import {POST} from "./route";
const post=(action:string,body:unknown)=>POST(new Request(`http://localhost/api/contractor/jobs/job-1/billing/${action}`,{method:"POST",body:JSON.stringify(body)}),{params:Promise.resolve({id:"job-1",action})});
afterEach(()=>{calls.length=0;vi.unstubAllEnvs();});
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
