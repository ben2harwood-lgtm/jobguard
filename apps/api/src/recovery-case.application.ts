import { PracticeAccess } from "./practice-access.js";
import { ZodError } from "zod";
import type { Pool } from "pg";
import { PracticeAccessError, RecoveryCaseRepository, RecoveryCommandOutcomeUnknownError, practiceMaterialPool } from "@jobguard/db";
import { recoveryCaseCommandV1, recoveryEligibilityCommandV1, recoveryCommandRefusalRulesV1 } from "./recovery-case.contracts.js";

type PracticePrincipal = Awaited<ReturnType<PracticeAccess["job"]>>;
export class RecoveryCaseApplication {
 private readonly access: PracticeAccess;
 constructor(private readonly pool: Pool, private readonly sessionId?: string) {
  this.access = new PracticeAccess(pool, sessionId);
 }
 async list(jobId: string) {
  const practice = await this.access.job(jobId);
  return this.view(jobId, practice);
 }
 // A command reply reads current state, not a historical command snapshot. The
 // membership is rechecked in the read transaction, using the authorized principal.
 private repository(practice: PracticePrincipal) {
  return new RecoveryCaseRepository(practiceMaterialPool(this.pool, practice.digest));
 }
 private async view(jobId: string, practice: PracticePrincipal, affectedCaseId?: string) {
  return { version: "recovery-case-workbench.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const,
   cases: await this.repository(practice).listForMember(practice.context, jobId, {membershipId:practice.membershipId,identityUserId:practice.identityUserId}),
   ...(affectedCaseId === undefined ? {} : {affectedCaseId}) };
 }
 private async committedView(jobId: string, practice: PracticePrincipal, affectedCaseId: string) {
  try { return await this.view(jobId, practice, affectedCaseId); }
  catch(cause) { throw new RecoveryCommandOutcomeUnknownError(cause); }
 }
 async command(jobId: string, raw: unknown) {
  const practice = await this.access.job(jobId);
  const affected = await this.repository(practice).command(practice.context, jobId, recoveryCaseCommandV1.parse(await recoveryInput(raw)),
   {membershipId:practice.membershipId,identityUserId:practice.identityUserId});
  return this.committedView(jobId, practice, affected.id);
 }
 async eligibility(jobId: string, raw: unknown, sessionId?: string) {
  if(process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("ELIGIBILITY_REVIEWER_FORBIDDEN");
  const practice = await new PracticeAccess(this.pool, sessionId ?? this.sessionId).job(jobId);
  const affected = await this.repository(practice).eligibilityCommand(practice.context, jobId, recoveryEligibilityCommandV1.parse(await recoveryInput(raw)),
   {membershipId:practice.membershipId,identityUserId:practice.identityUserId});
  return this.committedView(jobId, practice, affected.id);
 }
}

// A Next request can defer reading JSON until PracticeAccess has authorized its job.
class RecoveryInputError extends Error { readonly code = "INVALID_COMMAND"; }
async function recoveryInput(raw: unknown): Promise<unknown> {
 if(typeof raw !== "function")return raw;
 try { return await raw(); }
 catch { throw new RecoveryInputError("INVALID_COMMAND"); }
}

// Shared by Next and Nest. Only known pre-commit domain refusals get 4xx;
// unexpected database/commit failures and typed post-commit failures stay unknown.
/** A plain read changes nothing, so it is never "outcome unknown": authorization failures keep their meaning (Codex P2 4196878215). */
export function recoveryReadFailure(error: unknown) {
 if(error instanceof PracticeAccessError)throw error;
 const code=error instanceof Error ? ("code" in error && typeof error.code === "string" ? error.code : error.message) : "DATABASE_UNAVAILABLE";
 const statuses:Record<string,number>={ UNAUTHENTICATED:401, MEMBERSHIP_FORBIDDEN:403, JOB_NOT_FOUND:404, RECOVERY_JOB_NOT_FOUND:404, DATABASE_UNAVAILABLE:503 };
 // Anything unclassified (a dropped connection, 57P01, a driver error) is a retryable server failure, never a 4xx refusal (Codex P2 4197033524).
 const status=Object.hasOwn(statuses,code)?statuses[code]:undefined;
 return status===undefined ? { status: 503, body: { code: "DATABASE_UNAVAILABLE" } } : { status, body: { code } };
}
export function recoveryCommandFailure(error: unknown) {
 const unknown = { status: 503, body: { version: "recovery-command-error.v1" as const, code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", outcome: "unknown" as const, message: "Your last action may or may not have been saved. Retry with the same command id." } };
 if(error instanceof PracticeAccessError)throw error;
 if(error instanceof RecoveryCommandOutcomeUnknownError)return unknown;
 if(error instanceof ZodError || error instanceof RecoveryInputError)return { status: 400, body: { code: "INVALID_COMMAND" } };
 const code=error instanceof Error ? ("code" in error && typeof error.code === "string" ? error.code : error.message) : undefined;
 if(code===undefined||!Object.hasOwn(recoveryCommandRefusalRulesV1,code))return unknown;
 const refusal=recoveryCommandRefusalRulesV1[code as keyof typeof recoveryCommandRefusalRulesV1];
 const requiresReview=code==="ELIGIBILITY_STALE_REVISION"||code==="ELIGIBILITY_REVIEW_REQUIRED";
 // A forbidden transition carries a plain sentence from the domain ("<event> is not allowed from <state>"): identifiers only, no amounts or people.
 const message=requiresReview ? "Review the changed evidence before approving" : code==="RECOVERY_TRANSITION_FORBIDDEN" && error instanceof Error && error.message!==code ? error.message : code;
 return {status:refusal.status,body:{code,message}};
}
