import type { Pool } from "pg";
import { z } from "zod";
import { DEMO_MEMBERSHIP_ID, FinalAccountLockRepository, FinalAccountCommandService, VariationRepository, PracticeInvoiceRepository, practiceMaterialPool } from "@jobguard/db";
import { assertFinalAccountInvoiceGuard, FinalAccountLockError } from "@jobguard/core";
import { PracticeAccess } from "./practice-access.js";
import { finalAccountLockCommandV1,finalAccountDispositionCommandV1,finalCheckTermsAcceptanceCommandV1,finalReviewExtraCommandV1,lockBoundInvoiceCommandV1 } from "./final-account-lock.contracts.js";
function input<T>(schema:z.ZodType<T>,raw:unknown):T {
 const p=schema.safeParse(raw);if(!p.success)throw new FinalAccountLockError("INVALID_FINAL_ACCOUNT_LOCK_INPUT");return p.data;
}
/** This synthetic application shares the existing session/job authority seam. Contexts are per call. */
export class FinalAccountLockApplication {
 private readonly access:PracticeAccess;
 private readonly repo:FinalAccountLockRepository;
 private readonly accounts:FinalAccountCommandService;
 private readonly variations:VariationRepository;
 private readonly invoices:PracticeInvoiceRepository;
 constructor(private readonly pool:Pool,sessionId?:string){this.access=new PracticeAccess(pool,sessionId);this.repo=new FinalAccountLockRepository(pool);this.accounts=new FinalAccountCommandService(pool);this.variations=new VariationRepository(pool);this.invoices=new PracticeInvoiceRepository(pool);}
 async get(jobId:string){
  const auth=await this.access.job(jobId);
  const [view,account]=await Promise.all([this.repo.read(auth.context,jobId),this.accounts.read(auth.context,jobId)]);
  let invoiceGuard:"FINAL_ACCOUNT_LOCK_REQUIRED"|"FINAL_CHECK_NOT_COMPLETE"|"FINAL_CHECK_FAILED"|null=null;
  try{assertFinalAccountInvoiceGuard("final",view.lock?{id:view.lock.id,tenantId:auth.context.tenantId,jobId,serverTimestamp:view.lock.lockedAt}:null,view.check);}
  catch(error){if(!(error instanceof FinalAccountLockError) || !["FINAL_ACCOUNT_LOCK_REQUIRED","FINAL_CHECK_NOT_COMPLETE","FINAL_CHECK_FAILED"].includes(error.code))throw error;invoiceGuard=error.code as "FINAL_ACCOUNT_LOCK_REQUIRED"|"FINAL_CHECK_NOT_COMPLETE"|"FINAL_CHECK_FAILED";}
  return {version:"final-account-lock.view.v1" as const,jobId,account,captures:view.captures,lock:view.lock,dispositions:view.dispositions,termsAccepted:view.termsAccepted,checkStatus:view.checkStatus,invoiceGuard};
 }
 async lock(jobId:string,raw:unknown){
  const auth=await this.access.job(jobId),c=input(finalAccountLockCommandV1,raw);
  const {version:_version,...command}=c;
  // The immutable receipt result is returned directly: replay is byte-identical even if checking advances.
  return this.repo.lock(auth.context,{...command,jobId,actorMembershipId:DEMO_MEMBERSHIP_ID});
 }
 async disposition(jobId:string,raw:unknown){const auth=await this.access.job(jobId),{version:_version,...c}=input(finalAccountDispositionCommandV1,raw);return this.repo.disposition(auth.context,{...c,jobId,actorMembershipId:DEMO_MEMBERSHIP_ID});}
 async acceptTerms(jobId:string,raw:unknown){const auth=await this.access.job(jobId),{version:_version,...c}=input(finalCheckTermsAcceptanceCommandV1,raw);return this.repo.acceptTerms(auth.context,{...c,actorMembershipId:DEMO_MEMBERSHIP_ID});}
 async reviewExtra(jobId:string,raw:unknown){
  const auth=await this.access.job(jobId),c=input(finalReviewExtraCommandV1,raw);
  return this.variations.addFinalReviewExtra(auth.context,{version:"final-review-extra.v1",proposal:{version:"variation-proposal.v1",id:c.commandId,jobId,scopeItemId:c.scopeItemId,existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:c.captureText,description:c.description,suggestion:null},actorMembershipId:DEMO_MEMBERSHIP_ID,deviceId:null,deviceCapturedAt:null,
   price:c.price?{...c.price,confirmedByMembershipId:DEMO_MEMBERSHIP_ID,rateProvenance:{kind:"human_entered",sourceRef:"synthetic://final-review",sourceHash:"8".repeat(64),rateVersion:"builder-price-v1"}}:null});
 }
 async issueInvoice(jobId:string,raw:unknown){
  const auth=await this.access.job(jobId),{version:_version,...c}=input(lockBoundInvoiceCommandV1,raw);
  await new FinalAccountLockRepository(practiceMaterialPool(this.pool,auth.digest)).issueInvoice(auth.context,{...c,jobId,actorMembershipId:DEMO_MEMBERSHIP_ID});
  return {version:1 as const,environment:"synthetic_demo" as const,jobId,invoices:await this.invoices.list(auth.context,jobId)};
 }
}
