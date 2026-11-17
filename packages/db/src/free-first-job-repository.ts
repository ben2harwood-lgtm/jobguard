import { z } from "zod";
import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
export class FreeFirstJobPersistenceError extends Error {
 constructor(readonly code:"INVALID_FREE_FIRST_JOB_INPUT"|"FREE_FIRST_JOB_ACCESS_DENIED"|"FREE_FIRST_JOB_SYNTHETIC_ONLY"|"FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C"|"FREE_FIRST_JOB_UNAVAILABLE"|"COMMAND_CONFLICT"|"EXACT_ACTIVATION_AUTHORIZATION_MISMATCH"|"TRIAL_IDENTITY_REQUIRED"|"TRIAL_COMPLETED_CARD_REQUIRED"|"CAPACITY_ADMISSION_UNAVAILABLE"|"TRIAL_TARGET_UNAVAILABLE"|"TRIAL_SUBSCRIPTION_TERMS_REQUIRED"|"TRIAL_CARD_ATTEMPT_REQUIRED"|"TRIAL_IDENTITY_CONFLICT"|"TRIAL_LEGACY_POLICY_CONVERSION_FORBIDDEN"){super(code);this.name="FreeFirstJobPersistenceError";}
}
export const trialAdmissionV1=z.object({
 version:z.literal("trial-admission.v1"),activationId:z.string().uuid(),termsId:z.string().uuid(),jobId:z.string().uuid(),
 acceptedDocumentId:z.string().uuid(),acceptedDocumentVersion:z.number().int().safe().positive().max(2147483647),acceptedDocumentHash:z.string().regex(/^[a-f0-9]{64}$/u),
 expectedJobRevision:z.number().int().safe().nonnegative(),authorizationId:z.string().uuid(),
}).strict();
export const trialCardRequestV1=z.object({version:z.literal("trial-card-request.v1")}).strict();
export const trialCardAttemptV1=z.object({version:z.literal("trial-card-attempt.v1"),environment:z.literal("synthetic_demo"),hypothetical:z.literal(true),attemptId:z.string().uuid(),verificationId:z.string().uuid(),status:z.literal("requested")}).strict();
export function assertTrialSynthetic(){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_SYNTHETIC_ONLY");
}
export function trialInput<T>(schema:z.ZodType<T>,raw:unknown):T{
 const parsed=schema.safeParse(raw);if(!parsed.success)throw new FreeFirstJobPersistenceError("INVALID_FREE_FIRST_JOB_INPUT");return parsed.data;
}
export function trialFailure(error:unknown):never{
 if(error instanceof FreeFirstJobPersistenceError)throw error;
 const message=error instanceof Error?error.message:"";
 if(message==="METER_FORBIDDEN"||message==="FREE_FIRST_JOB_ACCESS_DENIED")throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_ACCESS_DENIED");
 if(["TRIAL_SUBSCRIPTION_TERMS_REQUIRED","TRIAL_COMPLETED_CARD_REQUIRED","CAPACITY_ADMISSION_UNAVAILABLE","TRIAL_TARGET_UNAVAILABLE","TRIAL_CARD_ATTEMPT_REQUIRED","TRIAL_IDENTITY_CONFLICT","TRIAL_LEGACY_POLICY_CONVERSION_FORBIDDEN"].includes(message))throw new FreeFirstJobPersistenceError(message as FreeFirstJobPersistenceError["code"]);
 if(message==="FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C"||message==="COMMAND_CONFLICT"||message==="TRIAL_IDENTITY_REQUIRED"||message==="EXACT_ACTIVATION_AUTHORIZATION_MISMATCH")throw new FreeFirstJobPersistenceError(message);
 throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_UNAVAILABLE");
}
/** Uncomposed denial boundary. This cannot replace dispatcher exact commercial approval. */
export class FreeFirstJobRepository {
 constructor(private readonly pool:Pool){}
 async admit(context:VerifiedTenantContext,digest:string,commandId:string,raw:unknown):Promise<never>{
  assertTrialSynthetic();const input=trialInput(trialAdmissionV1,raw);
  trialInput(z.string().regex(/^[a-f0-9]{64}$/u),digest);trialInput(z.string().uuid(),commandId);
  try{
   await withTenant(this.pool,context,async db=>{
    assertTrialSynthetic();await db.$client.query("SELECT app.mon3_admit($1,$2,$3,$4::jsonb)",[context.tenantId,digest,commandId,JSON.stringify(input)]);
    // Fail closed even if a future database unexpectedly returns without C application composition.
    throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C");
   });
  }catch(error){trialFailure(error);}
  throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C");
 }
}
