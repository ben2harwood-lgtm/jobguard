import type { Pool } from "pg";
import { z } from "zod";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, RecoveryCaseRepository, verifiedTenantContextFromMembership } from "@jobguard/db";
import { recoveryCaseCommandV1, recoveryEligibilityCommandV1 } from "./recovery-case.contracts.js";
const context = () => verifiedTenantContextFromMembership({ identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
export class RecoveryCaseApplication {
  private readonly repo: RecoveryCaseRepository;
  constructor(pool: Pool) { this.repo = new RecoveryCaseRepository(pool); }
  async list(jobId: string) {
    return { version: "recovery-case-workbench.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, cases: await this.repo.list(context(), jobId) };
  }
  async command(jobId: string, raw: unknown, sessionId?: string) {
    const command = recoveryCaseCommandV1.parse(raw);
    if (command.action === "open" && (!z.string().uuid().safeParse(sessionId).success || process.env.JOBGUARD_ENV !== "synthetic_demo")) throw new Error("UNAUTHENTICATED");
    await this.repo.command(context(), jobId, command, command.action === "open" ? { sessionId: sessionId!, membershipId: DEMO_MEMBERSHIP_ID } : undefined);
    return this.list(jobId);
  }
  async eligibility(jobId: string, raw: unknown) {
    await this.repo.eligibilityCommand(context(), jobId, recoveryEligibilityCommandV1.parse(raw), "practice-owner");
    return this.list(jobId);
  }
}
