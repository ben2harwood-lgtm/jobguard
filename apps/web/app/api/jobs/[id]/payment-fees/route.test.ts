import { randomUUID } from "node:crypto";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({get:vi.fn(),command:vi.fn()}));
vi.mock("../../../../lib/workspace-server",()=>({workspaceApplication:async()=>({paymentFees:mocks})}));
vi.mock("@jobguard/api/workspace",()=>({paymentFeeFailure:(error:unknown)=>error instanceof Error&&error.message==="PAYMENT_FEE_PAUSED"?{status:409,body:{code:error.message}}:null}));
import { GET,POST } from "./route";
const environment=process.env.JOBGUARD_ENV,id=randomUUID(),url=`https://synthetic.invalid/api/jobs/${id}/payment-fees`;
const params=()=>({params:Promise.resolve({id})});
beforeEach(()=>{vi.clearAllMocks();process.env.JOBGUARD_ENV="synthetic_demo";mocks.get.mockResolvedValue({statements:[]});mocks.command.mockResolvedValue({productionEnabled:false});});
afterEach(()=>{if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
it("forwards query and intent through the authenticated application, with no-store responses",async()=>{
 const p={version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId:randomUUID()};
 const read=await GET(new Request(url),params());expect(read.status).toBe(200);expect(read.headers.get("Cache-Control")).toBe("no-store");
 const response=await POST(new Request(url,{method:"POST",body:JSON.stringify(p)}),params());expect(response.status).toBe(200);
 expect(mocks.get).toHaveBeenCalledWith(id,{});expect(mocks.command).toHaveBeenCalledWith(id,p,{});
});
it("retains explicit dispute errors and rejects malformed JSON and production",async()=>{
 mocks.command.mockRejectedValue(new Error("PAYMENT_FEE_PAUSED"));
 const response=await POST(new Request(url,{method:"POST",body:"{}"}),params());expect(response.status).toBe(409);expect(await response.json()).toEqual({code:"PAYMENT_FEE_PAUSED"});
 expect((await POST(new Request(url,{method:"POST",body:"{"}),params())).status).toBe(400);
 process.env.JOBGUARD_ENV="production";expect((await GET(new Request(url),params())).status).toBe(403);
});
