import { afterEach, expect, it, vi } from "vitest";
import { MeterWorkStateApplication } from "./meter-today.application.js";
const tenant="00000000-0000-4000-8000-000000000001", actor="00000000-0000-4000-8000-000000000002";
const credentials={sessionToken:"s".repeat(32),csrfToken:"c".repeat(24),tenantHeader:tenant,origin:"https://company.invalid"};
function fixture() {
 const command=vi.fn(async()=>({saved:true}));
 const authenticate=vi.fn(async(token:string)=>token===credentials.sessionToken?{identityUserId:tenant,sessionId:tenant,csrfToken:credentials.csrfToken}:undefined);
 const findMembership=vi.fn(async(_:unknown,id:string)=>id===tenant?{id:actor,identityUserId:tenant,tenantId:tenant,role:"owner"}:undefined);
 return {command,authenticate,findMembership,app:new MeterWorkStateApplication({allowedOrigin:credentials.origin,provider:{authenticate,findMembership}} as never,{command} as never)};
}
afterEach(()=>vi.unstubAllEnvs());
it("derives company and actor from verified session authority, not the command body",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo"); const f=fixture();
 const raw={version:"job-work-state-command.v1",commandId:actor,expectedRevision:0,action:"finish"};
 expect(await f.app.command(credentials,tenant,raw)).toEqual({saved:true});
 expect(f.command).toHaveBeenCalledWith(expect.objectContaining({tenantId:tenant}),tenant,actor,raw);
});
it.each([
 {sessionToken:undefined},{sessionToken:"x".repeat(32)},{csrfToken:undefined},{csrfToken:"x".repeat(24)},
 {origin:"https://foreign.invalid"},{tenantHeader:actor},
])("refuses invalid credentials before commands: %j",async(change)=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");const f=fixture();
 await expect(f.app.command({...credentials,...change},tenant,{})).rejects.toThrow(); expect(f.command).not.toHaveBeenCalled();
});
it("rechecks membership and session; refuses production",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");const f=fixture();
 f.findMembership.mockResolvedValueOnce({id:actor,identityUserId:tenant,tenantId:tenant,role:"owner"}).mockResolvedValueOnce(undefined);
 await expect(f.app.command(credentials,tenant,{})).rejects.toThrow("METER_FORBIDDEN");expect(f.command).not.toHaveBeenCalled();
 const revoked=fixture();
 revoked.authenticate.mockResolvedValueOnce({identityUserId:tenant,sessionId:tenant,csrfToken:credentials.csrfToken}).mockResolvedValueOnce(undefined);
 await expect(revoked.app.command(credentials,tenant,{})).rejects.toThrow("METER_FORBIDDEN");expect(revoked.command).not.toHaveBeenCalled();
 vi.stubEnv("JOBGUARD_ENV","production");await expect(f.app.command(credentials,tenant,{})).rejects.toThrow("METER_FORBIDDEN");
});
