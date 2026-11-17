import {afterEach,beforeEach,expect,it,vi} from "vitest";
import { SuccessFeeError } from "@jobguard/core";
const {demoSettle,collect,workspace}=vi.hoisted(()=>({demoSettle:vi.fn(),collect:vi.fn(),workspace:vi.fn()}));
vi.mock("../../../../../../lib/workspace-server",()=>({workspaceApplication:workspace}));
import {POST} from "./route";
const id="10000000-0000-4000-8000-000000000001",params={params:Promise.resolve({id})},url=`https://synthetic.invalid/api/jobs/${id}/success-fees/collection/demo-settle`;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");workspace.mockResolvedValue({successFees:{demoSettle,collect}});});
afterEach(()=>vi.unstubAllEnvs());
it.each(["production","staging",""])("refuses JOBGUARD_ENV=%j before workspace access",async env=>{
 vi.stubEnv("JOBGUARD_ENV",env);
 const r=await POST(new Request(url,{method:"POST",body:"{}"}),params);
 expect(r.status).toBe(403);expect(await r.json()).toEqual({code:"SYNTHETIC_MODE_REQUIRED"});expect(workspace).not.toHaveBeenCalled();
});
it("defers JSON until authorized, passes tenant claims for refusal and returns bounded errors",async()=>{
 demoSettle.mockRejectedValue(new SuccessFeeError("SUCCESS_FEE_STALE"));
 const request=new Request(url+"?tenantId=foreign",{method:"POST",headers:{"x-tenant-id":""},body:'{"a":1}'}),json=vi.spyOn(request,"json"),r=await POST(request,params);
 expect(r.status).toBe(409);expect(await r.json()).toEqual({code:"SUCCESS_FEE_STALE"});expect(json).not.toHaveBeenCalled();
 expect(demoSettle).toHaveBeenCalledWith(id,expect.any(Function),{tenantId:"foreign"},true);
 demoSettle.mockRejectedValue(new SuccessFeeError("SUCCESS_FEE_FORBIDDEN"));
 expect((await POST(new Request(url,{method:"POST",body:"{}"}),params)).status).toBe(403);
});
