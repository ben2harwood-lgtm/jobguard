import { ZodError } from "zod";
import type { Pool } from "pg";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, RecoveryCaseRepository, RecoveryCommandOutcomeUnknownError, readSyntheticDemoJob, verifiedTenantContextFromMembership } from "@jobguard/db";
import { recoveryCaseCommandV1, recoveryEligibilityCommandV1 } from "./recovery-case.contracts.js";

// Existing synthetic principal bridge: no client-selected identity or tenant.
const membership = { identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID };
const context = () => verifiedTenantContextFromMembership(membership as Parameters<typeof verifiedTenantContextFromMembership>[0]);
export class RecoveryCaseApplication {
 private repo;
 constructor(private readonly pool: Pool) { this.repo = new RecoveryCaseRepository(pool); }
 // M4-1-S-R repair 10: a read is authorized exactly like a write. The persisted membership and the job are verified through the existing
 // readSyntheticDemoJob boundary before any case is listed, so revocation or expiry stops reads as well as commands, and a job outside the
 // tenant is indistinguishable from a missing one.
 async list(jobId: string) {
  await readSyntheticDemoJob(this.pool, jobId);
  // The preflight above maps mode and database failures; the read itself rechecks membership and job in its own transaction (Codex P2).
  return { version: "recovery-case-workbench.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, cases: await this.repo.listForMember(context(), jobId, { membershipId: membership.membershipId, identityUserId: membership.identityUserId }) };
 }
 // The refreshed list returned after a write. It is a read of its own, so it rechecks the membership like any other read.
 // `affectedCaseId` is the case the command itself changed, exactly as the repository returned it. The list is read afterwards and may already hold cases
 // another browser opened in the meantime, so a client must select by this id and never infer it from the list.
 private async view(jobId: string, affectedCaseId?: string) {
  return { version: "recovery-case-workbench.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, cases: await this.repo.listForMember(context(), jobId, { membershipId: membership.membershipId, identityUserId: membership.identityUserId }), ...(affectedCaseId === undefined ? {} : { affectedCaseId }) };
 }
 private async committedView(jobId: string, affectedCaseId: string) {
  try { return await this.view(jobId, affectedCaseId); }
  catch(cause) { throw new RecoveryCommandOutcomeUnknownError(cause); }
 }
 async command(jobId: string, raw: unknown) {
  // M4-1-S-R: the reviewer is the server-selected synthetic membership, never a client value. Job access is checked first as a cheap preflight;
  // the repository rechecks the membership inside its own write transaction (revocation cannot race the write).
  await readSyntheticDemoJob(this.pool, jobId);
  const affected = await this.repo.command(context(), jobId, recoveryCaseCommandV1.parse(raw), { membershipId: membership.membershipId, identityUserId: membership.identityUserId });
  return this.committedView(jobId, affected.id);
 }
 async eligibility(jobId: string, raw: unknown, sessionId: string | undefined) {
  if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(sessionId)) throw new Error("UNAUTHENTICATED");
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("ELIGIBILITY_REVIEWER_FORBIDDEN");
  // The repository verifies the recorded, active owner membership under lock and
  // persists its ID in both the immutable eligibility revision and audit event.
  const affected = await this.repo.eligibilityCommand(context(), jobId, recoveryEligibilityCommandV1.parse(raw), {
   membershipId: membership.membershipId, identityUserId: membership.identityUserId,
  });
  return this.committedView(jobId, affected.id);
 }
}

// Shared by Next and Nest. Only known pre-commit domain refusals get 4xx;
// unexpected database/commit failures and typed post-commit failures stay unknown.
/** A plain read changes nothing, so it is never "outcome unknown": authorization failures keep their meaning (Codex P2 4196878215). */
export function recoveryReadFailure(error: unknown) {
 const code=error instanceof Error ? ("code" in error && typeof error.code === "string" ? error.code : error.message) : "DATABASE_UNAVAILABLE";
 const statuses:Record<string,number>={ UNAUTHENTICATED:401, MEMBERSHIP_FORBIDDEN:403, JOB_NOT_FOUND:404, RECOVERY_JOB_NOT_FOUND:404, DATABASE_UNAVAILABLE:503 };
 return { status: statuses[code] ?? 400, body: { code } };
}
export function recoveryCommandFailure(error: unknown) {
 const unknown = { status: 503, body: { version: "recovery-command-error.v1" as const, code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", outcome: "unknown" as const, message: "Your last action may or may not have been saved. Retry with the same command id." } };
 if(error instanceof RecoveryCommandOutcomeUnknownError)return unknown;
 if(error instanceof ZodError)return { status: 400, body: { code: "INVALID_COMMAND" } };
 const code=error instanceof Error ? ("code" in error && typeof error.code === "string" ? error.code : error.message) : undefined;
 const statuses:Record<string,number>={
  UNAUTHENTICATED:401, MEMBERSHIP_FORBIDDEN:403, RECOVERY_REVIEWER_FORBIDDEN:403, ELIGIBILITY_REVIEWER_FORBIDDEN:403,
  JOB_NOT_FOUND:404, RECOVERY_JOB_NOT_FOUND:404, RECOVERY_CASE_NOT_FOUND:404, ELIGIBILITY_REVIEW_NOT_FOUND:404,
  RECOVERY_STALE_REVISION:409, ELIGIBILITY_STALE_REVISION:409, ELIGIBILITY_REVIEW_REQUIRED:409, IDEMPOTENCY_PAYLOAD_CONFLICT:409,
  RECOVERY_SOURCE_NOT_RECOGNISED:400, RECOVERY_TRANSITION_FORBIDDEN:400, RECOVERY_CLAIM_BELOW_SETTLED:400,
  RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE:400, ELIGIBILITY_NOT_APPROVABLE:400,
 };
 if(code===undefined||statuses[code]===undefined)return unknown;
 const requiresReview=code==="ELIGIBILITY_STALE_REVISION"||code==="ELIGIBILITY_REVIEW_REQUIRED";
 return {status:statuses[code]!,body:{code,message:requiresReview ? "Review the changed evidence before approving" : code}};
}
