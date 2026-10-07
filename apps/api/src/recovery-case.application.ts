import { PracticeAccess } from "./practice-access.js";
import type { Pool } from "pg";
import { RecoveryCaseRepository } from "@jobguard/db";
import { recoveryCaseCommandV1, recoveryEligibilityCommandV1 } from "./recovery-case.contracts.js";

// Existing synthetic principal bridge: no client-selected identity or tenant.

export class RecoveryCaseApplication { private readonly access: PracticeAccess; 
 private repo;
 constructor(private readonly pool: Pool, private readonly sessionId?: string) {this.access = new PracticeAccess(pool, sessionId); this.repo = new RecoveryCaseRepository(pool); }
 async list(jobId: string) {const practice = await this.access.job(jobId);
  return { version: "recovery-case-workbench.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, cases: await this.repo.list(practice.context, jobId) };
 }
 async command(jobId: string, raw: unknown) {const practice = await this.access.job(jobId);
  await this.repo.command(practice.context, jobId, recoveryCaseCommandV1.parse(raw));
  return this.list(jobId);
 }
 async eligibility(jobId: string, raw: unknown, sessionId?: string) {if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new Error("ELIGIBILITY_REVIEWER_FORBIDDEN");const practice = await new PracticeAccess(this.pool, sessionId ?? this.sessionId).job(jobId);
  // The repository verifies the recorded, active owner membership under lock and
  // persists its ID in both the immutable eligibility revision and audit event.
  await this.repo.eligibilityCommand(practice.context, jobId, recoveryEligibilityCommandV1.parse(raw), {
   membershipId: practice.membershipId, identityUserId: practice.identityUserId});
  return new RecoveryCaseApplication(this.pool,sessionId ?? this.sessionId).list(jobId);
 }
}
