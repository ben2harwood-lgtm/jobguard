import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, FinalCheckRepository, practiceOwnedJobsSql } from "@jobguard/db";
import { FinalCheckApplication } from "./final-check.application.js";
const id="18000000-0000-4000-8000-000000000002",session="18000000-0000-4000-8000-000000000001";
function fixture(owns=true){vi.stubEnv("JOBGUARD_ENV","synthetic_demo");const query=vi.fn(async(sql:string)=>({rows:sql.includes("authenticate_practice_session")?[{tenant_id:DEMO_TENANT_ID,membership_id:DEMO_MEMBERSHIP_ID,identity_user_id:DEMO_IDENTITY_USER_ID}]:sql.startsWith(practiceOwnedJobsSql())&&owns?[{id}]:[]}));return {query,app:new FinalCheckApplication({query,connect:async()=>({query,release:vi.fn()})} as unknown as Pool,session)};}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("SV5-21 SV5-30 authorizes before command parsing or hidden subject lookup",async()=>{
 const f=fixture(false),spy=vi.spyOn(FinalCheckRepository.prototype,"disposition");
 await expect(f.app.disposition(id,{actor:id,signalId:id})).rejects.toMatchObject({code:"NOT_FOUND"});expect(spy).not.toHaveBeenCalled();
});
it("SV5-24 pre-lock read returns fixed running state through controlled projection",async()=>{
 const f=fixture();vi.spyOn(FinalCheckRepository.prototype,"read").mockResolvedValue({state:"unlocked",items:[]});
 expect(await f.app.get(id)).toEqual({state:"unlocked",items:[],message:"Running JobGuard's final check"});
});
it("SV5-04 zero completed result gives the exact server message",async()=>{
 const f=fixture();vi.spyOn(FinalCheckRepository.prototype,"read").mockResolvedValue({state:"completed",items:[]});
 expect((await f.app.get(id)).message).toBe("JobGuard's final check found nothing missing from your bill.");
});
it("SV5-30 strict disposition refuses client authority after access",async()=>{
 const f=fixture(),spy=vi.spyOn(FinalCheckRepository.prototype,"disposition");
 await expect(f.app.disposition(id,{version:"final-check.disposition.v1",tenantId:DEMO_TENANT_ID})).rejects.toMatchObject({code:"INVALID_FINAL_CHECK_INPUT"});expect(spy).not.toHaveBeenCalled();
});
