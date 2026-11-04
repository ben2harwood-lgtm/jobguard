import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({read:vi.fn(),token:"session"}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:state.token})})}));
vi.mock("../../../../lib/merchant-reliability-server",()=>({readMerchantDeliveryRecord:state.read}));
import { GET } from "./route";
const id="10000000-0000-4000-8000-000000000001";
const get=(suffix="",headers={})=>GET(new Request(`https://company.invalid/api/jobs/${id}/merchant-reliability${suffix}`,{headers}),{params:Promise.resolve({id})});
beforeEach(()=>{state.read.mockResolvedValue({version:"merchant-delivery-record.v1",suppliers:[]});});
afterEach(()=>vi.resetAllMocks());
it("uses only cookie session, job locator and origin; never caches",async()=>{
 const response=await get(); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
 expect(state.read).toHaveBeenCalledWith("session",null,id);
});
it("rejects supplied tenant, actor and session selectors",async()=>{
 for(const name of ["tenantId","actorId","sessionId"]) expect((await get(`?${name}=${id}`)).status).toBe(400);
 for(const name of ["x-tenant-id","x-actor-id","x-session-id"]) expect((await get("",{[name]:id})).status).toBe(400);
 expect(state.read).not.toHaveBeenCalled();
});
it("hides unexpected database details and keeps failures uncached",async()=>{
 state.read.mockRejectedValue(new Error("private supplier")); const response=await get();
 expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private supplier");
 expect(response.headers.get("Cache-Control")).toBe("no-store");
});

const auth=vi.hoisted(()=>({session:vi.fn(),context:vi.fn(),read:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../../../../lib/identity-server",()=>({identityApplication:()=>({allowedOrigin:"https://company.invalid",session:auth.session,context:auth.context,provider:{digest:()=>"a".repeat(64)}})}));
vi.mock("../../../../lib/synthetic-server",()=>({syntheticPool:()=>({})}));
vi.mock("@jobguard/db",()=>({MerchantReliabilityRepository:class { read=auth.read; }}));
it("server refuses production, missing sessions, non-owners, ambiguous sessions and bad origins",async()=>{
 const {readMerchantDeliveryRecord}=await vi.importActual<typeof import("../../../../lib/merchant-reliability-server")>("../../../../lib/merchant-reliability-server");
 vi.stubEnv("JOBGUARD_ENV","production"); await expect(readMerchantDeliveryRecord("s",null,id)).rejects.toThrow();
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 await expect(readMerchantDeliveryRecord("s","https://foreign.invalid",id)).rejects.toThrow();
 auth.session.mockRejectedValueOnce(new Error("UNAUTHENTICATED")); await expect(readMerchantDeliveryRecord(undefined,null,id)).rejects.toThrow();
 for(const memberships of [[],[{tenantId:id,role:"foreman"}],[{tenantId:id,role:"owner"},{tenantId:id,role:"owner"}]]) {
  auth.session.mockResolvedValue({memberships,csrfToken:"csrf"}); await expect(readMerchantDeliveryRecord("s",null,id)).rejects.toThrow();
 }
 expect(auth.read).not.toHaveBeenCalled();
 auth.session.mockResolvedValue({memberships:[{tenantId:id,role:"owner"}],csrfToken:"csrf"}); auth.context.mockResolvedValue({tenantId:id});
 await readMerchantDeliveryRecord("s",null,id);
 expect(auth.read).toHaveBeenCalledWith({tenantId:id},"a".repeat(64),id);
 vi.unstubAllEnvs();
});
