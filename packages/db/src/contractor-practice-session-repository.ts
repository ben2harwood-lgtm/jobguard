import type { Pool } from "pg";
import { z } from "zod";
import { ContractorPracticeSessionError, contractorPracticeSessionRevokedV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { appendAuditBatch } from "./audit.js";
import { derivedUuid } from "./work-order-repository.js";
const routineAnswer = z.object({ session: z.guid({ error: "Invalid uuid" }), member: z.guid({ error: "Invalid uuid" }), revokedAt: z.iso.datetime({ precision: 6, error: "Invalid datetime" }) }).strict();
export class ContractorPracticeSessionRepository {
 constructor(private readonly pool: Pool) {}
 async revoke(context: VerifiedTenantContext, sessionId: string) {
  try {
   return await withTenant(this.pool, context, async db => {
    const answer = (await db.$client.query<{ result: unknown }>("SELECT app.revoke_contractor_practice_session($1) result", [sessionId])).rows[0]?.result;
    const parsed = routineAnswer.safeParse(answer);
    if (!parsed.success) throw new ContractorPracticeSessionError("PRACTICE_SESSION_UNAVAILABLE");
    const result = parsed.data;
    // Last write: the merged audit append owns the final contending lock.
    await appendAuditBatch(db, [{
     id: derivedUuid(`practice-session-revoked:${context.tenantId}:${result.session}`), version: "audit.v1", eventType: "contractor.practice_session.revoked",
     subjectType: "practice-session", subjectRef: result.session, actorRef: `membership:${result.member}`,
     payload: { references: { session: result.session, environment: "synthetic_demo" }, classifications: { action: "security" } },
    }]);
    return contractorPracticeSessionRevokedV1.parse({ version: "contractor-practice-session-revoked.v1", environment: "synthetic_demo", realExternalActions: 0, revokedAt: result.revokedAt });
   });
  } catch (error) {
   const message = error instanceof Error ? error.message : undefined;
   throw new ContractorPracticeSessionError(message === "MODE_FORBIDDEN" || message === "UNAUTHENTICATED" ? message : "PRACTICE_SESSION_UNAVAILABLE");
  }
 }
}
