import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { SuccessFeeError } from "@jobguard/core";
const {view,command,download,workspace}=vi.hoisted(()=>({view:vi.fn(),command:vi.fn(),download:vi.fn(),workspace:vi.fn()}));
vi.mock("../../../../../lib/workspace-server",()=>({workspaceApplication:workspace}));
import { GET,POST } from "./route";
import { GET as DOWNLOAD } from "./[statementId]/route";
const id="10000000-0000-4000-8000-000000000001",sid="10000000-0000-4000-8000-000000000002",params={params:Promise.resolve({id})},fileParams={params:Promise.resolve({id,statementId:sid})},url=`https://synthetic.invalid/api/jobs/${id}/success-fees/statements`;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");workspace.mockResolvedValue({successFees:{statements:view,issueStatement:command,downloadStatement:download}});view.mockResolvedValue({statements:[]});download.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
it("read and versioned download never invoke a command; preserve exact bytes, hash and no-store",async()=>{
 const response=await GET(new Request(url),params);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(view).toHaveBeenCalledWith(id,{},false);
 download.mockResolvedValue({canonicalJson:'{"vatLabel":"VAT not calculated"}',documentHash:"a".repeat(64),filename:"DEMO-FEE-000001.v1.json"});
 const file=await DOWNLOAD(new Request(`${url}/${sid}`),fileParams);
 expect(await file.text()).toBe('{"vatLabel":"VAT not calculated"}');expect(file.headers.get("X-Content-SHA256")).toBe("a".repeat(64));expect(file.headers.get("Content-Disposition")).toBe('attachment; filename="DEMO-FEE-000001.v1.json"');expect(file.headers.get("Cache-Control")).toBe("no-store");expect(command).not.toHaveBeenCalled();
});
it("missing/foreign downloads are 404; stale approvals are bounded 409, with JSON deferred",async()=>{
 expect((await DOWNLOAD(new Request(`${url}/${sid}`),fileParams)).status).toBe(404);
 command.mockRejectedValue(new SuccessFeeError("SUCCESS_FEE_STALE"));
 const request=new Request(url,{method:"POST",body:'{"action":"approve"}'}),json=vi.spyOn(request,"json"),response=await POST(request,params);
 expect(response.status).toBe(409);expect(await response.json()).toEqual({code:"SUCCESS_FEE_STALE"});expect(json).not.toHaveBeenCalled();
 expect(await command.mock.calls[0]![1]()).toEqual({action:"approve"});
});
it("all transports reject production before workspace access and pass tenant/query claims for refusal",async()=>{
 await GET(new Request(url+'?tenantId=foreign',{headers:{"x-tenant-id":""}}),params);expect(view).toHaveBeenCalledWith(id,{tenantId:"foreign"},true);
 await DOWNLOAD(new Request(`${url}/${sid}`,{headers:{"x-jobguard-tenant-id":"foreign"}}),fileParams);expect(download).toHaveBeenCalledWith(id,sid,{},true);
 vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","production");
 for(const result of [await GET(new Request(url),params),await POST(new Request(url,{method:"POST",body:"{"}),params),await DOWNLOAD(new Request(`${url}/${sid}`),fileParams)])expect(result.status).toBe(403);
 expect(workspace).not.toHaveBeenCalled();
});
