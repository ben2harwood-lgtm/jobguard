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

/**
 * 0095's controlled adoption routine predates session ownership and cannot be
 * changed by this integration. An adopted job inherits its source's owner via
 * the immutable adoption audit event written in that same command transaction.
 * No first-touch claim or mutation of job ownership is permitted. UNION handles
 * repeated imports without duplicating identities or following cycles forever.
 */
export function practiceOwnedJobsSql(digestParameter: "$2" | "$3" = "$3") {
 return `WITH RECURSIVE practice_owned_job AS (
  SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=${digestParameter}
  UNION
  SELECT j.id FROM practice_owned_job source
  JOIN app.audit_event e ON e.tenant_id=$1 AND e.subject_type='job'
   AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
  JOIN app.job j ON j.tenant_id=e.tenant_id AND j.id::text=e.subject_ref
   AND j.provenance='imported' AND j.practice_session_digest IS NULL
 )`;
}
/** Immutable job ownership is checked before any projection, command or replay. */
export async function authorizePracticeJob(pool: Pool, token: string | undefined, id: unknown, kind: "job" | "case" | "decision" = "job") {
 const auth=await authenticatePracticeSession(pool,token);
 if(!z.string().uuid().safeParse(id).success)throw new PracticeAccessError("NOT_FOUND");
 // A short tenant transaction solely reads immutable ownership. No business lock,
 // audit allocation or action can precede this check. No existence is disclosed.
 const sql=practiceOwnedJobsSql()+(kind==="case"?" SELECT j.id FROM practice_owned_job j JOIN app.recovery_case c ON c.tenant_id=$1 AND c.job_id=j.id WHERE c.id=$2":kind==="decision"?" SELECT j.id FROM practice_owned_job j JOIN app.job_finding f ON f.tenant_id=$1 AND f.job_id=j.id WHERE f.decision_id=$2":" SELECT id FROM practice_owned_job WHERE id=$2");
 const found=await withTenant(pool,auth.context,async db=>(await db.$client.query(sql,[auth.context.tenantId,id,auth.digest])).rows[0]);
 if(!found)throw new PracticeAccessError("NOT_FOUND"); return auth;
}

/**
 * Adapter for repositories that use withTenant's promise-based connect/query
 * contract. Install the authenticated digest immediately after BEGIN, before
 * any business SQL. Transaction-local state rolls back/commits with that work;
 * the original pool and non-practice repositories are unchanged.
 * This is an application trust boundary, not protection from stolen DB credentials.
 */
export function practiceMaterialPool(pool: Pool, digest: string): Pool {
 syntheticOnly();
 if(!/^[0-9a-f]{64}$/u.test(digest))throw new PracticeAccessError("UNAUTHENTICATED");
 return new Proxy(pool, {
  get(target,key) {
   if(key==="connect")return async()=>{
    const client=await target.connect();
    return new Proxy(client,{
     get(connection,property) {
      if(property==="query")return async(sql:string,values?:unknown[])=>{
       const result=await connection.query(sql,values);
       // Only withTenant's exact BEGIN installs the digest; other callers run unscoped and fail closed.
       if(sql==="BEGIN")await connection.query("SELECT set_config('app.practice_material_digest', $1, true)",[digest]);
       return result;
      };
      const value=Reflect.get(connection,property);
      return typeof value==="function"?value.bind(connection):value;
     },
    });
   };
   const value=Reflect.get(target,key);
   return typeof value==="function"?value.bind(target):value;
  },
 });
}
