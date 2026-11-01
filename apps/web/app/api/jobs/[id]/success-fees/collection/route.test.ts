import {afterEach,beforeEach,expect,it,vi} from "vitest";
import { SuccessFeeError } from "@jobguard/core";
const {view,command,workspace}=vi.hoisted(()=>({view:vi.fn(),command:vi.fn(),workspace:vi.fn()}));
vi.mock("../../../../../lib/workspace-server",()=>({workspaceApplication:workspace}));
import {GET,POST} from "./route";
const id="10000000-0000-4000-8000-000000000001",params={params:Promise.resolve({id})},url=`https://synthetic.invalid/api/jobs/${id}/success-fees/collection`;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");workspace.mockResolvedValue({successFees:{collection:view,collect:command}});view.mockResolvedValue({});});
afterEach(()=>vi.unstubAllEnvs());
it("reads never command and always use no-store",async()=>{
 const r=await GET(new Request(url),params);expect(r.headers.get("Cache-Control")).toBe("no-store");expect(view).toHaveBeenCalledWith(id,{},false);expect(command).not.toHaveBeenCalled();
});
it("defers JSON until authorized and returns bounded conflict errors",async()=>{
 command.mockRejectedValue(new SuccessFeeError("SUCCESS_FEE_STALE"));
 const request=new Request(url,{method:"POST",body:'{"action":"collect"}'}),json=vi.spyOn(request,"json"),r=await POST(request,params);
 expect(r.status).toBe(409);expect(await r.json()).toEqual({code:"SUCCESS_FEE_STALE"});expect(json).not.toHaveBeenCalled();
 expect(await command.mock.calls[0]![1]()).toEqual({action:"collect"});
});
it("rejects production before workspace access; passes tenant/query claims for refusal",async()=>{
 await GET(new Request(url+"?tenantId=foreign",{headers:{"x-tenant-id":""}}),params);expect(view).toHaveBeenCalledWith(id,{tenantId:"foreign"},true);
 vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","production");
 for(const r of [await GET(new Request(url),params),await POST(new Request(url,{method:"POST",body:"{"}),params)])expect(r.status).toBe(403);
 expect(workspace).not.toHaveBeenCalled();
});
