import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "./tenant-context.js";

export class PracticeAccessError extends Error {
 constructor(readonly code: "UNAUTHENTICATED" | "NOT_FOUND" | "SYNTHETIC_MODE_REQUIRED") { super(code); }
}
export const practiceSessionV1 = z.string().uuid();
const principalV1 = z.object({tenant_id:z.string().uuid(),membership_id:z.string().uuid(),identity_user_id:z.string().uuid()}).strict();
const digestToken = (token: string) => createHash("sha256").update(token).digest("hex");
function syntheticOnly() { if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED"); }
export async function issuePracticeSession(pool: Pool): Promise<string> {
 syntheticOnly(); const token=randomUUID();
 await pool.query("SELECT app.issue_practice_session($1)",[digestToken(token)]); return token;
}
export async function authenticatePracticeSession(pool: Pool, token: string | undefined, requestedTenantId?: string) {
 syntheticOnly(); const parsed=practiceSessionV1.safeParse(token);
 if(!parsed.success)throw new PracticeAccessError("UNAUTHENTICATED");
 const digest=digestToken(parsed.data);
 const row=(await pool.query(requestedTenantId?"SELECT * FROM app.authenticate_practice_session($1,$2)":"SELECT * FROM app.authenticate_practice_session($1)",requestedTenantId?[digest,requestedTenantId]:[digest])).rows[0];
 if(!row)throw new PracticeAccessError("UNAUTHENTICATED"); const principal=principalV1.parse(row);
 const context=verifiedTenantContextFromMembership({tenantId:principal.tenant_id,membershipId:principal.membership_id,identityUserId:principal.identity_user_id} as AuthenticatedMembership);
 return {context,digest,membershipId:principal.membership_id,identityUserId:principal.identity_user_id};
}
/** Immutable job ownership is checked before any projection, command or replay. */
export async function authorizePracticeJob(pool: Pool, token: string | undefined, id: unknown, kind: "job" | "case" | "decision" = "job") {
 const auth=await authenticatePracticeSession(pool,token);
 if(!z.string().uuid().safeParse(id).success)throw new PracticeAccessError("NOT_FOUND");
 // A short tenant transaction solely reads immutable ownership. No business lock,
 // audit allocation or action can precede this check. No existence is disclosed.
 const sql=kind==="case"?"SELECT j.id FROM app.job j JOIN app.recovery_case c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND c.id=$2 AND j.practice_session_digest=$3":kind==="decision"?"SELECT j.id FROM app.job j JOIN app.job_finding f ON(f.tenant_id,f.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND f.decision_id=$2 AND j.practice_session_digest=$3":"SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 AND practice_session_digest=$3";
 const found=await withTenant(pool,auth.context,async db=>(await db.$client.query(sql,[auth.context.tenantId,id,auth.digest])).rows[0]);
 if(!found)throw new PracticeAccessError("NOT_FOUND"); return auth;
}
