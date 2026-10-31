import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { canonicalCommercialIntegritySnapshot, commercialIntegrityReviewV3Schema, evaluateCommercialIntegrityV3,
 type CommercialIntegrityFamilyV1, type CommercialIntegrityV3Result, type CommercialIntegrityReviewV3 } from "@jobguard/core";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { authorizeIntegrityScope, canonicalIntegrityScope, CommercialIntegrityPersistenceError, readIntegrityFamily,
 readCommercialIntegrityV3Input, type CommercialIntegrityActor, type CommercialIntegrityScope } from "./commercial-integrity-v3-sources.js";
export type { CommercialIntegrityActor } from "./commercial-integrity-v3-sources.js";
export type CommercialIntegrityV3Feedback = CommercialIntegrityReviewV3 & { jobId: string; membershipId: string; identityUserId: string; sessionDigest: string; recordedAt: string };
const feedbackMetadata = z.object({ jobId: z.string().uuid(), membershipId: z.string().uuid(), identityUserId: z.string().uuid(), sessionDigest: z.string().regex(/^[a-f0-9]{64}$/u), recordedAt: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/u) }).strict();
const feedbackSchema = {
 parse(raw: unknown): CommercialIntegrityV3Feedback {
  const {jobId,membershipId,identityUserId,sessionDigest,recordedAt,...review}=z.record(z.string(), z.unknown()).parse(raw);
  return {...commercialIntegrityReviewV3Schema.parse(review),...feedbackMetadata.parse({jobId,membershipId,identityUserId,sessionDigest,recordedAt})};
 },
 safeParse(raw: unknown): {success:true;data:CommercialIntegrityV3Feedback}|{success:false} {try{return {success:true,data:this.parse(raw)};}catch{return {success:false};}},
};
export type CommercialIntegrityV3StoredView = Readonly<{ version: "commercial-integrity-view.v3"; advisory: true; result: CommercialIntegrityV3Result; feedback: CommercialIntegrityV3Feedback[]; availability: readonly string[]; published: null }>;
const commandType = "commercial_integrity.review.v3";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function v3(db: Parameters<typeof authorizeIntegrityScope>[0], s: CommercialIntegrityScope) {
 if (await readIntegrityFamily(db,s) !== "v3") throw new CommercialIntegrityPersistenceError("INTEGRITY_FAMILY_UNAVAILABLE");
}
export class CommercialIntegrityV3Repository {
 constructor(private readonly pool: Pool) {}
 async readFamily(context: VerifiedTenantContext, actor: CommercialIntegrityActor, digest: string, jobId: string): Promise<CommercialIntegrityFamilyV1> {
  const s=canonicalIntegrityScope(context.tenantId,actor,digest,jobId);
  return withTenant(this.pool,context,async db=>{
   // Enforce the GET boundary in PostgreSQL, including nested authority readers.
   await db.$client.query("SET TRANSACTION READ ONLY");
   const family=await readIntegrityFamily(db,s); await authorizeIntegrityScope(db,s);
   return { version: "commercial-integrity-family.v1", environment: "synthetic_demo", jobId:s.jobId, family, realExternalActions:0 };
  });
 }
 private async view(db: Parameters<typeof authorizeIntegrityScope>[0], s: CommercialIntegrityScope): Promise<CommercialIntegrityV3StoredView> {
  const source=await readCommercialIntegrityV3Input(db,s);
  const evaluated=evaluateCommercialIntegrityV3(source.input);
  const result:CommercialIntegrityV3Result=source.availability.includes("receipt_line_source_handoff_unavailable")
   ? {...evaluated,unavailable:[...evaluated.unavailable,{kind:"explicit_allocations_avoid_catch_lines",reason:"source_absent"}]}
   : evaluated;
  const feedback=(await db.$client.query<{result:unknown}>(`SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_type=$2 AND status='succeeded'
   AND semantic_key LIKE $3 AND actor_membership_id=$4 AND result->>'sessionDigest'=$5 ORDER BY created_at,command_id`,[s.tenantId,commandType,`${s.jobId}:%`,s.actor.membershipId,s.digest])).rows.map(r=>feedbackSchema.parse(r.result));
  return {version:"commercial-integrity-view.v3",advisory:true,result,feedback,availability:source.availability,published:null};
 }
 async read(context: VerifiedTenantContext, actor: CommercialIntegrityActor, digest: string, jobId: string): Promise<CommercialIntegrityV3StoredView> {
  const s=canonicalIntegrityScope(context.tenantId,actor,digest,jobId);
  return withTenant(this.pool,context,async db=>{
   await db.$client.query("SET TRANSACTION READ ONLY");
   await v3(db,s);const view=await this.view(db,s);await v3(db,s);return view;
  });
 }
 async review(context: VerifiedTenantContext, actor: CommercialIntegrityActor, digest: string, jobId: string, rawReview: unknown): Promise<CommercialIntegrityV3Feedback> {
  const s=canonicalIntegrityScope(context.tenantId,actor,digest,jobId);
  return withTenant(this.pool,context,async db=>{
   await v3(db,s); // authority precedes input details and receipt lookup
   const parsed=commercialIntegrityReviewV3Schema.safeParse(rawReview);
   if(!parsed.success)throw new CommercialIntegrityPersistenceError("INVALID_INTEGRITY_REVIEW");
   const review:CommercialIntegrityReviewV3={...parsed.data,commandId:parsed.data.commandId.toLowerCase()};
   // SQL owns command contention, replay-before-recompute and atomic source verification/audit.
   // First look up genuine replay without evaluating today's finding.
   const prior=(await db.$client.query<{result:unknown;command_type:string;semantic_key:string;status:string;actor_membership_id:string}>("SELECT result,command_type,semantic_key,status,actor_membership_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[s.tenantId,review.commandId])).rows[0];
   if(prior){
    const result=feedbackSchema.safeParse(prior.result);
    if(!result.success||prior.command_type!==commandType||prior.status!=="succeeded"||prior.semantic_key!==`${s.jobId}:${review.commandId}`||prior.actor_membership_id!==s.actor.membershipId||result.data.sessionDigest!==s.digest||result.data.identityUserId!==s.actor.identityUserId||Object.entries(review).some(([k,v])=>result.data[k as keyof CommercialIntegrityV3Feedback]!==v))throw new CommercialIntegrityPersistenceError("IDEMPOTENCY_CONFLICT");
    // Writer independently checks request hash and current authority even on replay.
   }
   let snapshot:unknown=null;
   if(!prior){
    const view=await this.view(db,s),finding=view.result.findings.find(f=>f.key===review.findingKey);
    if(!finding||sha(canonicalCommercialIntegritySnapshot(finding.sourceSnapshot))!==review.findingSnapshotHash)throw new CommercialIntegrityPersistenceError("INTEGRITY_SOURCE_CHANGED");
    snapshot=finding.sourceSnapshot;
   }
   try {
    const row=(await db.$client.query<{result:unknown}>("SELECT app.ch6_record_integrity_review($1,$2,$3,$4::jsonb,$5::jsonb) result",[s.tenantId,s.jobId,s.digest,JSON.stringify(review),JSON.stringify(snapshot)])).rows[0]!;
    return feedbackSchema.parse(row.result);
   } catch(error) {
    const code=(error as Error).message;
    if(code === "NOT_FOUND")throw new PracticeAccessError("NOT_FOUND");
    if(["40P01","40001"].includes((error as {code?:string}).code??""))throw new CommercialIntegrityPersistenceError("INTEGRITY_RETRY_REQUIRED");
    if(["INTEGRITY_FAMILY_UNAVAILABLE","INTEGRITY_SOURCE_CHANGED","INTEGRITY_SOURCE_UNAVAILABLE","IDEMPOTENCY_CONFLICT","INVALID_INTEGRITY_REVIEW"].includes(code))throw new CommercialIntegrityPersistenceError(code as ConstructorParameters<typeof CommercialIntegrityPersistenceError>[0]);
    throw error;
   }
  });
 }
}
