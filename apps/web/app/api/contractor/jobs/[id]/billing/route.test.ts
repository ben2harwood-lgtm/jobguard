import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}));
vi.mock("../../../../../lib/synthetic-server",()=>({syntheticPool:()=>{throw Object.assign(new Error("unavailable"),{code:"MODE_FORBIDDEN"});}}));
import {GET} from "./route";
it("E6-30 Next billing projection returns a typed no-store refusal when the mode is disabled",async()=>{
 const response=await GET(new Request("http://localhost/api/contractor/jobs/missing/billing"),{params:Promise.resolve({id:"missing"})});
 expect(response.status).toBe(403);expect(response.headers.get("cache-control")).toBe("no-store");expect(await response.json()).toEqual({version:"contractor-billing-error.v1",code:"MODE_FORBIDDEN"});
});
