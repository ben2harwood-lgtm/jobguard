import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({list:vi.fn(),promote:vi.fn(),cookie:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:async()=>({get:mocks.cookie})}));
vi.mock("../../../../lib/synthetic-server",()=>({syntheticPool:()=>({})}));
vi.mock("@jobguard/api/workspace",()=>({ConnectorPromotionApplication:class {list=mocks.list; promote=mocks.promote;},workOrderHttpFailure:()=>({status:404,body:{code:"NOT_FOUND"}})}));
import { GET, POST } from "./route";
beforeEach(()=>{vi.clearAllMocks(); mocks.cookie.mockReturnValue({value:"human-session"});});
it("uses only the cookie session and refuses foreign origins before calling the application",async()=>{
 const response=await POST(new Request("http://localhost/api/contractor/work-order-imports/connector-promotions",{method:"POST",headers:{origin:"https://foreign.invalid"},body:"{}"}));
 expect(response.status).toBe(404);expect(mocks.promote).not.toHaveBeenCalled();
});
it("lists with no-store and sends the exact selection to the human application",async()=>{
 mocks.list.mockResolvedValue([]);expect((await GET()).headers.get("cache-control")).toBe("no-store");
 expect(mocks.list).toHaveBeenCalledWith({version:"contractor-principal.v1",sessionId:"human-session"});
 const selection={version:"connector-promotion.v1",namespace:"fixture:source",eventId:"fixture:event"};mocks.promote.mockResolvedValue({batchId:"result"});
 const response=await POST(new Request("http://localhost/api/contractor/work-order-imports/connector-promotions",{method:"POST",headers:{origin:"http://localhost"},body:JSON.stringify(selection)}));
 expect(response.status).toBe(200);expect(mocks.promote).toHaveBeenCalledWith({version:"contractor-principal.v1",sessionId:"human-session"},selection);
});
