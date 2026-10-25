import type { Pool } from "pg";
import { PracticeAccessError } from "@jobguard/db";
import { CommercialIntegrityV3Repository } from "../../../packages/db/dist/commercial-integrity-v3-repository.js";
import { CommercialIntegrityPersistenceError } from "../../../packages/db/dist/commercial-integrity-v3-sources.js";
import { PracticeAccess } from "./practice-access.js";
import { commercialIntegrityQueryV3, commercialIntegrityReviewV3Schema, IntegrityV3Error } from "./commercial-integrity-v3.contracts.js";
export type CommercialIntegrityV3Feedback = Awaited<ReturnType<CommercialIntegrityV3Application["review"]>>;
export type CommercialIntegrityV3View = Awaited<ReturnType<CommercialIntegrityV3Application["view"]>>;
/** Only CH6-P reads and its advisory receipt writer are reachable from this boundary. */
export class CommercialIntegrityV3Application {
 constructor(private readonly pool: Pool, private readonly environment = process.env.JOBGUARD_ENV) {}
 // @jobguard/db resolves types to src but execution to dist. Until the coordinator
 // exports P from its barrel, those identical nominal brands have distinct declarations.
 // Pass the SAME verified object; never rebuild or brand caller-supplied fields.
 private runtimeContext(context: Awaited<ReturnType<PracticeAccess["job"]>>["context"]) {
  return context as unknown as Parameters<CommercialIntegrityV3Repository["read"]>[0];
 }
 private async authorized<T>(sessionId: string | undefined, jobId: string, run: (repository: CommercialIntegrityV3Repository, practice: Awaited<ReturnType<PracticeAccess["job"]>>, id: string) => Promise<T>): Promise<T> {
  // Refuse before constructing access/repository or looking up even the session.
  if (this.environment !== "synthetic_demo" || process.env.JOBGUARD_ENV !== "synthetic_demo") throw new IntegrityV3Error("SYNTHETIC_MODE_REQUIRED");
  try {
   const id = jobId.toLowerCase();
   const practice = await new PracticeAccess(this.pool, sessionId?.toLowerCase()).job(id);
   return await run(new CommercialIntegrityV3Repository(this.pool), practice, id);
  } catch (error) {
   if (error instanceof IntegrityV3Error) throw error;
   if (error instanceof PracticeAccessError || error instanceof CommercialIntegrityPersistenceError) throw new IntegrityV3Error(error.code);
   throw new IntegrityV3Error("INTEGRITY_UNAVAILABLE");
  }
 }
 family(sessionId: string | undefined, jobId: string) {
  return this.authorized(sessionId, jobId, (r, p, id) => r.readFamily(this.runtimeContext(p.context), { membershipId:p.membershipId, identityUserId:p.identityUserId }, p.digest, id));
 }
 view(sessionId: string | undefined, jobId: string, rawQuery: unknown) {
  return this.authorized(sessionId, jobId, async (r, p, id) => {
   if (!commercialIntegrityQueryV3.safeParse(rawQuery).success) throw new IntegrityV3Error("INVALID_INTEGRITY_QUERY");
   const saved = await r.read(this.runtimeContext(p.context), { membershipId:p.membershipId, identityUserId:p.identityUserId }, p.digest, id);
   return { ...saved, feedback:saved.feedback.map(publicFeedback), environment: "synthetic_demo" as const, jobId:id,
    notice: "Practice sandbox — synthetic data; nothing is sent or charged",
    decisionRecord: { id: "D11", status: "proposed", approvalEvidence: null }, realExternalActions: 0 as const };
  });
 }
 review(sessionId: string | undefined, jobId: string, rawReview: unknown) {
  return this.authorized(sessionId, jobId, async (r, p, id) => {
   const input = commercialIntegrityReviewV3Schema.safeParse(rawReview);
   if (!input.success) throw new IntegrityV3Error("INVALID_INTEGRITY_REVIEW");
   return publicFeedback(await r.review(this.runtimeContext(p.context), { membershipId:p.membershipId, identityUserId:p.identityUserId }, p.digest, id, { ...input.data, commandId:input.data.commandId.toLowerCase() }));
  });
 }
}

/** Authority bindings are private persistence metadata, never browser session handles. */
function publicFeedback(row: Awaited<ReturnType<CommercialIntegrityV3Repository["review"]>>) {
 return { version:row.version, commandId:row.commandId, jobId:row.jobId, findingKey:row.findingKey,
  findingSnapshotHash:row.findingSnapshotHash, outcome:row.outcome, explanation:row.explanation, recordedAt:row.recordedAt };
}
