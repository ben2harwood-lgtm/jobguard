import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("../../../../origin",()=>({isTrustedBrowserOrigin:()=>false}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined})}));
vi.mock("../../../../../../lib/synthetic-server",()=>({syntheticPool:()=>{throw new Error("must not connect");}}));
import {POST} from "./route";
it("E6-30 Next write returns no-store refusal for untrusted origin before persistence",async()=>{
 const result=await POST(new Request("http://localhost/api/contractor/jobs/missing/billing/export",{method:"POST"}),{params:Promise.resolve({id:"missing",action:"export"})});
 expect(result.status).toBe(403);expect(result.headers.get("cache-control")).toBe("no-store");expect(await result.json()).toEqual({version:"contractor-billing-error.v1",code:"BILLING_FORBIDDEN"});
});
