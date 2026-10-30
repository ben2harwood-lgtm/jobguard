import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { SuccessFeeError } from "@jobguard/core";
const {view,command,workspace}=vi.hoisted(()=>({view:vi.fn(),command:vi.fn(),workspace:vi.fn()}));
vi.mock("../../../../lib/workspace-server",()=>({workspaceApplication:workspace}));
import { GET,POST } from "./route";
const id="10000000-0000-4000-8000-000000000001",params={params:Promise.resolve({id})},url=`https://synthetic.invalid/api/jobs/${id}/success-fees`;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");workspace.mockResolvedValue({successFees:{view,command}});view.mockResolvedValue({state:"dependency_bound"});command.mockRejectedValue(new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND"));});
afterEach(()=>vi.unstubAllEnvs());
it("Next delegates with a deferred body and bounded no-store refusal",async()=>{
 const r=await GET(new Request(url),params);expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");expect(view).toHaveBeenCalledWith(id,{},false);
 const request=new Request(url,{method:"POST",body:'{"action":"review"}'}),json=vi.spyOn(request,"json");
 const denied=await POST(request,params);expect(denied.status).toBe(503);expect(await denied.json()).toEqual({code:"SUCCESS_FEE_DEPENDENCY_BOUND"});expect(denied.headers.get("Cache-Control")).toBe("no-store");expect(json).not.toHaveBeenCalled();
 const body=command.mock.calls[0]?.[1];expect(typeof body).toBe("function");expect(await body()).toEqual({action:"review"});expect(json).toHaveBeenCalledTimes(1);
});
it("passes query and tenant selection presence to the shared authorization boundary",async()=>{
 await GET(new Request(url+'?tenantId=forged',{headers:{"x-tenant-id":""}}),params);expect(view).toHaveBeenCalledWith(id,{tenantId:"forged"},true);
 await POST(new Request(url,{method:"POST",headers:{"x-jobguard-tenant-id":"forged"},body:"{}"}),params);expect(command).toHaveBeenCalledWith(id,expect.any(Function),{},true);
});
it.each(["","pilot_no_charge","provider_sandbox","production_billing"])("rejects %s before workspace/body access",async mode=>{
 vi.stubEnv("JOBGUARD_ENV",mode);const request=new Request(url,{method:"POST",body:"broken"}),json=vi.spyOn(request,"json");
 for(const response of [await GET(new Request(url),params),await POST(request,params)]){expect(response.status).toBe(403);expect(response.headers.get("Cache-Control")).toBe("no-store");}
 expect(workspace).not.toHaveBeenCalled();expect(json).not.toHaveBeenCalled();
});
