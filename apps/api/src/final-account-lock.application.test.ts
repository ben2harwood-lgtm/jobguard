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

it.each(["get","lock","disposition","acceptTerms","reviewExtra","issueInvoice"] as const)("%s rejects an unauthenticated caller before any business query",async method=>{
 const f=fixture(true,false);
 await expect(method==='get'?f.app.get(job):f.app[method](job,{})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 expect(f.query.mock.calls.every(([sql])=>sql.includes('authenticate_practice_session'))).toBe(true);
});
it("the new application rejects production mode before reading or writing business data",async()=>{
 const f=fixture();vi.stubEnv('JOBGUARD_ENV','production');
 await expect(f.app.lock(job,{})).rejects.toMatchObject({code:'SYNTHETIC_MODE_REQUIRED'});
 expect(f.query).not.toHaveBeenCalled();
});

// Coordinator r2: adapter boundary proof; PostgreSQL authority is covered separately.
it("PRE-Q4-05 r2 lock-bound issue carries only the authenticated session digest after access",async()=>{
 const {createHash}=await import("node:crypto");
 const {PracticeInvoiceRepository}=await import("@jobguard/db");
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const expected=createHash("sha256").update(session).digest("hex");
 vi.spyOn(FinalAccountLockRepository.prototype,"read").mockResolvedValue({lock:{id:commandId,lockedAt:"2026-10-13T00:00:00Z"},check:{lockId:commandId,tenantId:DEMO_TENANT_ID,jobId:job,evidenceCutoffAt:"2026-10-13T00:00:00Z",status:"completed"}} as Awaited<ReturnType<FinalAccountLockRepository["read"]>>);
 vi.spyOn(PracticeInvoiceRepository.prototype,"list").mockResolvedValue([]);
 let supplied:string|undefined;
 const query=vi.fn(async(sql:string,values?:unknown[])=>{
  if(sql.includes("authenticate_practice_session"))return {rows:[{tenant_id:DEMO_TENANT_ID,membership_id:DEMO_MEMBERSHIP_ID,identity_user_id:DEMO_IDENTITY_USER_ID}]};
  if(sql.startsWith(practiceOwnedJobsSql()))return {rows:[{id:job}]};
  if(sql.includes("app.practice_material_digest"))supplied=String(values?.[0]);
  if(sql.includes("app.issue_lock_bound_customer_invoice")){
   if(supplied!==expected)throw new Error("FORBIDDEN");
   return {rows:[{result:{invoiceId:commandId,netPence:1000,taxPence:200,totalPence:1200}}]};
  }
  if(sql.includes("FROM app.final_account_invoiced_line"))return {rows:[{final_account_line_id:scopeItemId,net_pence:"1000",tax_pence:"200",gross_pence:"1200"}]};
  return {rows:[]};
 });
 const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))} as unknown as Pool;
 const app=new FinalAccountLockApplication(pool,session);
 await expect(app.issueInvoice(job,{version:"lock-bound-invoice.issue.v1",commandId,finalAccountRevisionId:revisionId,expectedSourceHash:"a".repeat(64),invoiceKind:"final",recipient:"practice@example.invalid",issuedOn:"2026-10-13"})).resolves.toMatchObject({jobId:job,invoices:[]});
 expect(supplied).toBe(expected);
 const sql=query.mock.calls.map(([statement])=>statement);
 expect(sql.findIndex(statement=>statement.startsWith(practiceOwnedJobsSql()))).toBeLessThan(sql.findIndex(statement=>statement.includes("app.practice_material_digest")));
 expect(sql.findIndex(statement=>statement.includes("app.practice_material_digest"))).toBeLessThan(sql.findIndex(statement=>statement.includes("app.issue_lock_bound_customer_invoice")));
});
