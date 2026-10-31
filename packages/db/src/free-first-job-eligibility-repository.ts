import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { assertTrialSynthetic, trialInput, trialFailure } from "./free-first-job-repository.js";

const sourceId = z.string().uuid().nullable();
export const trialEligibilityReadV1 = z.object({
 version: z.literal("trial-eligibility-read.v1"), environment: z.literal("synthetic_demo"), hypothetical: z.literal(true),
 jobId: z.string().uuid(), jobRevision: z.number().int().nonnegative().max(2147483647),
 targetStatus: z.enum(["unavailable", "ineligible"]),
 reasons: z.array(z.enum(["IMPORTED_TARGET", "HISTORICAL_TARGET", "SUPPORTED_TRACK_UNAVAILABLE", "STALE_QUOTE_OR_PARTIES", "IDENTITY_UNAVAILABLE", "ADD_A_CARD", "KEY_CHECK_UNAVAILABLE", "TERMS_UNAVAILABLE", "ADMISSION_DISABLED"])),
 identity: z.enum(["verified", "unavailable"]), cardGate: z.enum(["completed", "add_card", "optional_first"]),
 cardAction: z.literal("Add a card").nullable(), offerSkip: z.boolean(), keyCheck: z.literal("unavailable"), admission: z.literal("disabled"),
 sources: z.object({ documentId: sourceId, acceptanceId: sourceId, partyBindingId: sourceId, verificationId: sourceId, cardResultId: sourceId, termsId: sourceId }).strict(),
 revisionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict().superRefine((value, ctx) => {
 if (!value.reasons.includes("ADMISSION_DISABLED") || !value.reasons.includes("KEY_CHECK_UNAVAILABLE")
  || (value.cardAction === "Add a card") !== (value.cardGate === "add_card")
  || (value.identity === "verified" && value.sources.verificationId === null)
  || (value.cardGate === "completed") !== (value.sources.cardResultId !== null)
  || (value.offerSkip && (value.identity !== "verified" || value.cardGate !== "optional_first" || value.targetStatus === "ineligible"
   || !value.sources.documentId || !value.sources.acceptanceId || !value.sources.partyBindingId
   || value.reasons.some(reason => ["IMPORTED_TARGET", "HISTORICAL_TARGET", "SUPPORTED_TRACK_UNAVAILABLE", "STALE_QUOTE_OR_PARTIES", "IDENTITY_UNAVAILABLE", "ADD_A_CARD"].includes(reason))))) {
  ctx.addIssue({ code: "custom", message: "Inconsistent advisory eligibility" });
 }
});
export type TrialEligibilityReadV1 = z.infer<typeof trialEligibilityReadV1>;

/** Advisory company scope only. Never consumes keys or authorizes activation. */
export class FreeFirstJobEligibilityRepository {
 constructor(private readonly pool: Pool) {}
 async read(context: VerifiedTenantContext, digest: string, jobId: string): Promise<TrialEligibilityReadV1> {
  assertTrialSynthetic();
  trialInput(z.string().regex(/^[a-f0-9]{64}$/u), digest);
  trialInput(z.string().uuid(), jobId);
  try {
   return await withTenant(this.pool, context, async db => {
    assertTrialSynthetic();
    const result = (await db.$client.query("SELECT app.mon3_read_eligibility($1,$2,$3) result", [context.tenantId, digest, jobId])).rows[0]?.result;
    assertTrialSynthetic();
    const parsed = trialInput(trialEligibilityReadV1, result);
    if (parsed.jobId !== jobId) throw new Error("Eligibility target mismatch");
    return parsed;
   });
  } catch (error) { return trialFailure(error); }
 }
}
