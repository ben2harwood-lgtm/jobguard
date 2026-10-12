import { afterEach,expect,it,vi } from "vitest";
import type { Pool } from "pg";
import { DEMO_IDENTITY_USER_ID,DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,FinalAccountLockRepository,VariationRepository,practiceOwnedJobsSql } from "@jobguard/db";
import { FinalAccountLockApplication } from "./final-account-lock.application.js";
const session="18000000-0000-4000-8000-000000000001",job="18000000-0000-4000-8000-000000000002",commandId="18000000-0000-4000-8000-000000000003",scopeItemId="18000000-0000-4000-8000-000000000004",revisionId="18000000-0000-4000-8000-000000000005";
function fixture(owns=true,authenticates=true){
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const query=vi.fn(async(sql:string)=>({rows:sql.includes("authenticate_practice_session")&&authenticates?[{tenant_id:DEMO_TENANT_ID,membership_id:DEMO_MEMBERSHIP_ID,identity_user_id:DEMO_IDENTITY_USER_ID}]:sql.startsWith(practiceOwnedJobsSql())&&owns?[{id:job}]:[]}));
 const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))} as unknown as Pool;
 return {query,app:new FinalAccountLockApplication(pool,session)};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("locks the exact revision through verified session/job scope, ignoring no client field",async()=>{
 const f=fixture(),lock=vi.spyOn(FinalAccountLockRepository.prototype,"lock").mockResolvedValue({id:commandId} as Awaited<ReturnType<FinalAccountLockRepository['lock']>>);
 const c={version:"final-account.lock.v1",commandId,finalAccountRevisionId:revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"};
 expect(await f.app.lock(job,c)).toEqual({id:commandId});
 expect(lock).toHaveBeenCalledWith(expect.objectContaining({tenantId:DEMO_TENANT_ID}),{commandId,jobId:job,actorMembershipId:DEMO_MEMBERSHIP_ID,finalAccountRevisionId:revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"});
 await expect(f.app.lock(job,{...c,captureRegisterHash:"a".repeat(64)})).rejects.toMatchObject({code:"INVALID_FINAL_ACCOUNT_LOCK_INPUT"});
 expect(lock).toHaveBeenCalledTimes(1);
});
it.each(["lock","disposition","acceptTerms","reviewExtra","issueInvoice"] as const)("%s refuses an unowned job before parsing and writing",async method=>{
 const f=fixture(false),lock=vi.spyOn(FinalAccountLockRepository.prototype,"lock"),extra=vi.spyOn(VariationRepository.prototype,"addFinalReviewExtra");
 await expect(f.app[method](job,{tenantId:DEMO_TENANT_ID})).rejects.toMatchObject({code:"NOT_FOUND"});
 expect(lock).not.toHaveBeenCalled();expect(extra).not.toHaveBeenCalled();
});
it("final-review proposal uses the server origin and existing exact price contract",async()=>{
 const f=fixture(),extra=vi.spyOn(VariationRepository.prototype,"addFinalReviewExtra").mockResolvedValue({variationId:commandId});
 await f.app.reviewExtra(job,{version:"final-review-extra.v1",commandId,scopeItemId,description:"Fictional tap",captureText:"Fictional tap",price:{quantity:"1",unit:"item",unitRatePence:40000,direction:"addition"}});
 expect(extra).toHaveBeenCalledWith(expect.objectContaining({tenantId:DEMO_TENANT_ID}),expect.objectContaining({version:"final-review-extra.v1",proposal:expect.objectContaining({id:commandId,jobId:job,scopeItemId}),price:expect.objectContaining({unitRatePence:40000,confirmedByMembershipId:DEMO_MEMBERSHIP_ID})}));
});
