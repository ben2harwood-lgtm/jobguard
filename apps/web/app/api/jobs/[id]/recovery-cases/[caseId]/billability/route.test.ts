import { expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({work:vi.fn(),failure:vi.fn()}));
vi.mock("../../../../../../lib/recovery-billability-server",()=>({recoveryBillabilityRequest:f.work,billabilityFailure:f.failure}));
import { GET, POST } from "./route";
const params={params:Promise.resolve({id:"job",caseId:"case"})};
it("POST and GET are no-store and delegate the exact path and request",async()=>{
 for(const method of [GET,POST]){
  f.work.mockResolvedValue({productionEnabled:false});const request=new Request("http://example.invalid");
  const response=await method(request,params);
  expect(f.work).toHaveBeenLastCalledWith(request,"job","case");expect(response.headers.get("cache-control")).toBe("no-store");
 }
});
it("returns typed refusal without leaking database messages",async()=>{
 f.work.mockRejectedValue(new Error("private SQL"));f.failure.mockReturnValue({status:404,code:"BILLABILITY_NOT_FOUND",message:"Unavailable"});
 const response=await POST(new Request("http://example.invalid"),params);
 expect(response.status).toBe(404);expect(await response.json()).toEqual({version:"recovery-billability-error.v1",code:"BILLABILITY_NOT_FOUND",message:"Unavailable"});
});
