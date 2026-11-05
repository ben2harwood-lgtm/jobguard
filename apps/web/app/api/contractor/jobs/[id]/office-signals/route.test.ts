import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { EnterpriseLivePromptPersistenceError } from "@jobguard/core";
const {read,cookie,pool}=vi.hoisted(()=>({read:vi.fn(),cookie:vi.fn(),pool:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:async()=>({get:cookie})}));
vi.mock("@jobguard/db",()=>({EnterpriseLivePromptRepository:class {officeSignals=read;}}));
vi.mock("../../../../../lib/synthetic-server",()=>({syntheticPool:pool}));
import { GET } from "./route";
const session="10000000-0000-4000-8000-000000000001",jobId="10000000-0000-4000-8000-000000000002";
const get=(query="")=>GET(new Request(`https://fictional.invalid/api/contractor/jobs/${jobId}/office-signals${query}`,{headers:{"x-tenant-id":"foreign",role:"owner"}}),{params:Promise.resolve({id:jobId})});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");cookie.mockReturnValue({value:session});read.mockResolvedValue({items:[],nextCursor:null});});
afterEach(()=>vi.unstubAllEnvs());
it("binds only the cookie session, path job and validated pagination; all responses are no-store",async()=>{
 const response=await get("?limit=2");
 expect(read).toHaveBeenCalledExactlyOnceWith(session,{version:"office-signals.v1",jobId,limit:2});
 expect(await response.json()).toEqual({items:[],nextCursor:null});expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each(["?tenantId=foreign","?role=supervisor","?limit=101","?after=bad"])("refuses invalid or forged query %s",async query=>{
 const response=await get(query);expect(response.status).toBe(400);expect(read).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toBe("no-store");
});
it("returns the same not-found response for every database detail-authority refusal",async()=>{
 read.mockRejectedValue(new EnterpriseLivePromptPersistenceError("EXTRA_FORBIDDEN"));
 const response=await get();expect(response.status).toBe(404);expect(await response.json()).toEqual({version:"office-signals-error.v1",code:"NOT_FOUND"});expect(response.headers.get("cache-control")).toBe("no-store");
});
it("refuses missing and revoked sessions",async()=>{
 cookie.mockReturnValueOnce(undefined);expect((await get()).status).toBe(401);expect(read).not.toHaveBeenCalled();
 read.mockRejectedValueOnce(Object.assign(new Error("revoked"),{code:"UNAUTHENTICATED"}));expect((await get()).status).toBe(401);
});
it("keeps non-synthetic mode dark before pool access",async()=>{
 vi.stubEnv("JOBGUARD_ENV","production_billing");const response=await get();expect(response.status).toBe(403);expect(pool).not.toHaveBeenCalled();
});
it("redacts unexpected database errors",async()=>{
 read.mockRejectedValue(new Error("secret PostgreSQL detail"));const response=await get();expect(response.status).toBe(503);expect(await response.text()).not.toContain("secret");
});
