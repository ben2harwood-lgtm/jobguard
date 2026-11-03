import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({family:vi.fn(),view:vi.fn(),review:vi.fn(),pool:vi.fn(),create:vi.fn(),cookie:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:state.cookie})}));
vi.mock("@jobguard/api/workspace",()=>({createWorkspaceApplication:state.create}));
vi.mock("../../../../../../lib/synthetic-server",()=>({syntheticPool:state.pool}));
import { POST as route } from "./route";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",args={params:Promise.resolve({id:job.toUpperCase()})};
const input={version:"commercial-integrity-review.v3",commandId:job};
const req=(query="",body:unknown=input)=>new Request(`https://synthetic.invalid/api/jobs/${job}/commercial-integrity/v3/reviews${query}`,{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.resetAllMocks();state.cookie.mockReturnValue({value:"session"});state.create.mockReturnValue({commercialIntegrityV3:state});state.review.mockResolvedValue({version:"saved",realExternalActions:0});});
afterEach(()=>vi.unstubAllEnvs());
it("returns the exact shared application payload and no-store",async()=>{
 const response=await route(req(),args);expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(await response.json()).toEqual({version:"saved",realExternalActions:0});
 expect(state.create).toHaveBeenCalledWith({pool:undefined,sessionId:"session"});
 expect(state.review).toHaveBeenCalledWith(job,input);
});
it("wrong environment refuses before pool, cookie or composition",async()=>{
 vi.stubEnv("JOBGUARD_ENV","production");const response=await route(req(),args);expect(response.status).toBe(403);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(state.pool).not.toHaveBeenCalled();expect(state.cookie).not.toHaveBeenCalled();expect(state.create).not.toHaveBeenCalled();
});
it.each([["UNAUTHENTICATED",401],["NOT_FOUND",404],["INVALID_INTEGRITY_REVIEW",400],["IDEMPOTENCY_CONFLICT",409],["INTEGRITY_SOURCE_CHANGED",409],["INTEGRITY_FAMILY_UNAVAILABLE",503]])("bounded typed failure %s",async(code,status)=>{
 state.review.mockRejectedValue({code});const response=await route(req(),args);expect(response.status).toBe(status);expect(await response.json()).toEqual({code});expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("fails closed until the coordinator composes the facade and hides raw errors",async()=>{
 state.create.mockReturnValue({});let response=await route(req(),args);expect(response.status).toBe(503);expect(await response.json()).toEqual({code:"INTEGRITY_UNAVAILABLE"});
 state.create.mockImplementation(()=>{throw new Error("secret SQL failure")});response=await route(req(),args);expect(await response.json()).toEqual({code:"INTEGRITY_UNAVAILABLE"});
});
it("ownership refusal precedes parsing even malformed JSON",async()=>{
 state.family.mockRejectedValue({code:"NOT_FOUND"});const request=new Request("https://synthetic.invalid",{method:"POST",body:"{"});const parse=vi.spyOn(request,"json");
 const response=await route(request,args);expect(response.status).toBe(404);expect(parse).not.toHaveBeenCalled();expect(state.review).not.toHaveBeenCalled();
});
it("malformed owned JSON is a typed no-store 400",async()=>{
 const response=await route(new Request("https://synthetic.invalid",{method:"POST",body:"{"}),args);expect(response.status).toBe(400);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(state.review).not.toHaveBeenCalled();
});
