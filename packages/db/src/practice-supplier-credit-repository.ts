import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { recoveryEligibilityCommandV3, recoveryEligibilityViewV3 } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import type { RecoveryEligibilityV3Review } from "./recovery-eligibility-v3-repository.js";

// Internal versioned database result boundary. Authority and hashes come from SQL.
const writerReply = z.object({
  id: z.guid({ error: "Invalid uuid" }), revision: z.number().int().positive(), caseRevision: z.number().int().positive(), sourceEventId: z.guid({ error: "Invalid uuid" }),
  result: z.unknown(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/u), resultHash: z.string().regex(/^[a-f0-9]{64}$/u),
  actorMembershipId: z.guid({ error: "Invalid uuid" }), commandId: z.guid({ error: "Invalid uuid" }), replayed: z.boolean(),
}).strict();
const knownRefusals = new Set([
  "INVALID_COMMAND", "ELIGIBILITY_REVIEWER_FORBIDDEN", "RECOVERY_JOB_NOT_FOUND", "RECOVERY_CASE_NOT_FOUND",
  "IDEMPOTENCY_PAYLOAD_CONFLICT", "ELIGIBILITY_STALE_REVISION", "ELIGIBILITY_FIXTURE_MISMATCH", "ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE",
]);

/** Synthetic candidate writer. No supplied actor, amount, source or result reaches SQL. */
export async function reviewPracticeSupplierCredit(pool: Pool, context: VerifiedTenantContext, jobId: string, raw: unknown, sessionDigest: string): Promise<RecoveryEligibilityV3Review> {
  const command = recoveryEligibilityCommandV3.parse(raw);
  try {
    return await withTenant(practiceMaterialPool(pool, sessionDigest), context, async db => {
      await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
      const row = (await db.$client.query<{ reply: unknown }>("SELECT app.pf1b_review_supplier_credit($1,$2,$3::jsonb) reply", [context.tenantId, jobId, JSON.stringify(command)])).rows[0];
      const validated = writerReply.safeParse(row?.reply);
      if (!validated.success) throw new Error("PF1B_WRITER_RESULT_INVALID");
      const reply = validated.data;
      const candidate = recoveryEligibilityViewV3.safeParse(reply.result);
      if (!candidate.success) throw new Error("PF1B_WRITER_RESULT_INVALID");
      if (!reply.replayed) {
        // The writer has already acquired every business lock. Audit is last.
        await appendAuditBatch(db, [{
          id: randomUUID(), version: "audit.v1", actorRef: `membership:${reply.actorMembershipId}`, eventType: "recovery.eligibility.v3_reviewed", subjectType: "recovery_case", subjectRef: command.caseId.toLowerCase(),
          payload: { references: { jobId: jobId.toLowerCase(), reviewId: reply.id, commandId: reply.commandId }, hashes: { command: reply.payloadHash, result: reply.resultHash }, classifications: { recovery: "financial" } },
        }]);
      }
      return { id: reply.id, revision: reply.revision, caseRevision: reply.caseRevision, sourceEventId: reply.sourceEventId, result: candidate.data };
    });
  } catch (error) {
    // Only SQL's precise known pre-commit refusals are mapped. Unexpected failures
    // keep their original code so the existing transport reports outcome unknown.
    if (error instanceof Error && knownRefusals.has(error.message) && "code" in error && typeof error.code === "string" && ["42501", "0A000", "22023", "23514", "23505", "40001"].includes(error.code)) {
      throw Object.assign(new Error(error.message, { cause: error }), { code: error.message });
    }
    throw error;
  }
}
