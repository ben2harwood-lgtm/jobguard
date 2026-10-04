import type { Pool } from "pg";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, RecoveryCaseRepository, readSyntheticDemoJob, verifiedTenantContextFromMembership } from "@jobguard/db";
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
  return this.view(jobId);
 }
 // The refreshed list returned after a write that has just verified the membership inside its own transaction; it is never a way in for a read.
 private async view(jobId: string) {
  return { version: "recovery-case-workbench.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, cases: await this.repo.list(context(), jobId) };
 }
 async command(jobId: string, raw: unknown) {
  // M4-1-S-R: the reviewer is the server-selected synthetic membership, never a client value. Job access is checked first as a cheap preflight;
  // the repository rechecks the membership inside its own write transaction (revocation cannot race the write).
  await readSyntheticDemoJob(this.pool, jobId);
  await this.repo.command(context(), jobId, recoveryCaseCommandV1.parse(raw), { membershipId: membership.membershipId, identityUserId: membership.identityUserId });
  return this.view(jobId);
 }
 async eligibility(jobId: string, raw: unknown, sessionId: string | undefined) {
  if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(sessionId)) throw new Error("UNAUTHENTICATED");
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("ELIGIBILITY_REVIEWER_FORBIDDEN");
  // The repository verifies the recorded, active owner membership under lock and
  // persists its ID in both the immutable eligibility revision and audit event.
  await this.repo.eligibilityCommand(context(), jobId, recoveryEligibilityCommandV1.parse(raw), {
   membershipId: membership.membershipId, identityUserId: membership.identityUserId,
  });
  return this.view(jobId);
 }
}
