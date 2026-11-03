import { z } from "zod";
import type { TenantTransaction } from "./tenant-context.js";
import { PracticeAccessError, practiceOwnedJobsSql } from "./practice-session.js";
import { commercialIntegrityV3InputSchema, type CommercialIntegrityV3Input } from "@jobguard/core";

export type CommercialIntegrityActor = Readonly<{ membershipId: string; identityUserId: string }>;
export type CommercialIntegrityScope = Readonly<{ tenantId: string; jobId: string; digest: string; actor: CommercialIntegrityActor }>;
export type CommercialIntegrityV3OrdinaryFacts = CommercialIntegrityV3Input["ordinaryFacts"];
export class CommercialIntegrityPersistenceError extends Error {
 constructor(readonly code: "INTEGRITY_FAMILY_UNAVAILABLE" | "INTEGRITY_SOURCE_UNAVAILABLE" | "INTEGRITY_SOURCE_CHANGED" | "INTEGRITY_RETRY_REQUIRED" | "IDEMPOTENCY_CONFLICT" | "INVALID_INTEGRITY_REVIEW") { super(code); }
}
const uuid = z.string().uuid().transform(v => v.toLowerCase());
export function canonicalIntegrityScope(tenantId: string, actor: CommercialIntegrityActor, digest: string, jobId: string): CommercialIntegrityScope {
 const parsed = z.object({ tenantId: uuid, jobId: uuid, digest: z.string().regex(/^[a-f0-9]{64}$/u), actor: z.object({ membershipId: uuid, identityUserId: uuid }).strict() }).strict().safeParse({ tenantId, jobId, digest, actor });
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
 if (!parsed.success) throw new PracticeAccessError("NOT_FOUND");
 return parsed.data;
}
export async function authorizeIntegrityScope(db: TenantTransaction, s: CommercialIntegrityScope): Promise<void> {
 const found = await db.$client.query(`${practiceOwnedJobsSql("$2")}
 SELECT j.id FROM practice_owned_job j
 JOIN app.authenticate_practice_session($2,$1) a ON a.tenant_id=$1
 WHERE j.id=$3 AND a.membership_id=$4 AND a.identity_user_id=$5`,
 [s.tenantId,s.digest,s.jobId,s.actor.membershipId,s.actor.identityUserId]);
 if (!found.rowCount) throw new PracticeAccessError("NOT_FOUND");
}
// Minimal version discriminator only. Never use activation.effects (tenant-wide counts).
export const integrityFamilySql = `SELECT j.saved_v1_sample,j.provenance,j.fee_policy_version job_policy,
 a.fee_policy_version activation_policy,t.policy_version terms_policy,t.commercial_track terms_track,c.job_track,c.environment
 FROM app.job j LEFT JOIN app.job_activation a ON(a.tenant_id,a.job_id)=(j.tenant_id,j.id)
 LEFT JOIN app.job_activation_terms t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
 LEFT JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=$1 AND j.id=$2`;
export function selectIntegrityFamily(row: { saved_v1_sample: boolean; provenance: string; job_policy: string | null; activation_policy: string | null; terms_policy: string | null; terms_track: string | null; job_track: string | null; environment: string | null }): "v1" | "v3" {
 const policies = [row.job_policy,row.activation_policy,row.terms_policy].filter((v): v is string => v !== null);
 if ((row.environment !== null && row.environment !== "synthetic_demo") || [row.terms_track,row.job_track].some(v => v !== null && v !== "small_builder") || policies.some(v => !["reference_fee_policy_v1","reference_fee_policy_v3"].includes(v))) throw new CommercialIntegrityPersistenceError("INTEGRITY_FAMILY_UNAVAILABLE");
 const v1 = row.saved_v1_sample || policies.includes("reference_fee_policy_v1"), v3 = policies.includes("reference_fee_policy_v3");
 if (v1 && v3) throw new CommercialIntegrityPersistenceError("INTEGRITY_FAMILY_UNAVAILABLE");
 if (v1) return "v1";
 if (row.provenance !== "system_generated_quote") throw new CommercialIntegrityPersistenceError("INTEGRITY_FAMILY_UNAVAILABLE"); // CI-H7
 return "v3"; // installed start rule: new generated captures always use v3
}
export async function readIntegrityFamily(db: TenantTransaction, s: CommercialIntegrityScope) {
 await authorizeIntegrityScope(db,s);
 const row = (await db.$client.query(integrityFamilySql,[s.tenantId,s.jobId])).rows[0];
 if (!row) throw new PracticeAccessError("NOT_FOUND");
 return selectIntegrityFamily(row);
}
// Historical 0330 upgrade projection; current runtime reads use 0331 below. The 0330 writer re-resolves exactly this activity. No attestation is settlement proof.
export const integrityActivitySql = `SELECT jsonb_build_object('source',jsonb_build_object(
 'tenantId',x.tenant_id,'jobId',x.job_id,'scopeId',$3::text,'sourceId',x.id::text,'sourceType',x.kind,
 'revision','1','hash',encode(sha256(convert_to(x.identity,'UTF8')),'hex'),
 'recordedAt',to_char(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'provenance',x.provenance),
 'activityKind',x.activity_kind) fact FROM (
 SELECT i.tenant_id,i.job_id,i.id,i.created_at,'customer_invoice'::text kind,'invoice'::text activity_kind,'server_recorded'::text provenance,
 i.id::text||':'||i.source_hash::text||':'||i.pdf_sha256::text identity FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2
 UNION ALL SELECT p.tenant_id,p.job_id,p.id,p.created_at,'customer_payment','payment','builder_attested',
 p.id::text||':'||p.invoice_id::text||':'||p.amount_pence::text FROM app.customer_payment p WHERE p.tenant_id=$1 AND p.job_id=$2
 ) x ORDER BY x.kind,x.id`;
export async function readCommercialIntegrityV3OrdinaryFacts(db: TenantTransaction, scope: CommercialIntegrityScope, evaluatedAt: string): Promise<CommercialIntegrityV3OrdinaryFacts> {
 await authorizeIntegrityScope(db,scope);
 const lock = await db.$client.query("SELECT id FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[scope.tenantId,scope.jobId]);
 const activity = (await db.$client.query<{ fact: CommercialIntegrityV3OrdinaryFacts["activity"][number] }>(integrityActivitySql,[scope.tenantId,scope.jobId,scope.digest])).rows.map(r=>r.fact);
 // Validate the supplied server time without rounding away microseconds.
 if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/u.test(evaluatedAt)) throw new CommercialIntegrityPersistenceError("INTEGRITY_SOURCE_UNAVAILABLE");
 return { lockState: lock.rowCount ? "present" : "absent", activity, quotes: [], activations: [], workEvents: [], assertions: [] };
}
/** 0331 returns only authorised ordinary facts, or an exact completed publication after lock. */
export async function readCommercialIntegrityV3Input(db: TenantTransaction, scope: CommercialIntegrityScope) {
 await authorizeIntegrityScope(db,scope);
 const row=await db.$client.query<{result:unknown}>("SELECT app.ch6_integrity_sources($1,$2,$3) result",[scope.tenantId,scope.jobId,scope.digest]).then(r=>r.rows[0]).catch((error:unknown)=>{
  const code=(error as Error).message;
  if(code==="NOT_FOUND")throw new PracticeAccessError("NOT_FOUND");
  if(code==="INTEGRITY_FAMILY_UNAVAILABLE"||code==="INTEGRITY_SOURCE_UNAVAILABLE")throw new CommercialIntegrityPersistenceError(code);
  throw error;
 });
 const parsed=z.object({input:commercialIntegrityV3InputSchema,availability:z.array(z.string())}).strict().safeParse(row?.result);
 if(!parsed.success)throw new CommercialIntegrityPersistenceError("INTEGRITY_SOURCE_UNAVAILABLE");
 if(parsed.data.input.tenantId!==scope.tenantId||parsed.data.input.jobId!==scope.jobId||parsed.data.input.scopeId!==scope.digest)throw new CommercialIntegrityPersistenceError("INTEGRITY_SOURCE_UNAVAILABLE");
 return parsed.data;
}
