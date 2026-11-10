import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "./tenant-context.js";

export class PracticeAccessError extends Error {
 constructor(readonly code: "UNAUTHENTICATED" | "NOT_FOUND" | "SYNTHETIC_MODE_REQUIRED") { super(code); }
}
export const practiceSessionV1 = z.string().uuid();
const principalV1 = z.object({tenant_id:z.string().uuid(),membership_id:z.string().uuid(),identity_user_id:z.string().uuid(),owner_digest:z.string().regex(/^[0-9a-f]{64}$/u).optional()}).strict();
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
 let result;
 try { result=await pool.query(requestedTenantId?"SELECT p.*, app.practice_owner_digest($1,$2) owner_digest FROM app.authenticate_practice_session($1,$2) p":"SELECT p.*, app.practice_owner_digest($1) owner_digest FROM app.authenticate_practice_session($1) p",requestedTenantId?[digest,requestedTenantId]:[digest]); } catch (error) {
  if ((error as {code?:string}).code==="28000")throw new PracticeAccessError("UNAUTHENTICATED");
  if ((error as {code?:string}).code!=="42883" ||
   !(error instanceof Error && error.message.startsWith("function app.practice_owner_digest(")))throw error;
  // Retain the supported pre-0942 anonymous upgrade path.
  result=await pool.query(requestedTenantId?"SELECT * FROM app.authenticate_practice_session($1,$2)":"SELECT * FROM app.authenticate_practice_session($1)",requestedTenantId?[digest,requestedTenantId]:[digest]);
 }
 const row=result.rows[0];
 if(!row)throw new PracticeAccessError("UNAUTHENTICATED"); const principal=principalV1.parse(row);
 const context=verifiedTenantContextFromMembership({tenantId:principal.tenant_id,membershipId:principal.membership_id,identityUserId:principal.identity_user_id} as AuthenticatedMembership, {kind:"practice",credential:digest});
 return {context,digest:principal.owner_digest ?? digest,membershipId:principal.membership_id,identityUserId:principal.identity_user_id};
}

/**
 * Controlled adoption routines create an unowned imported job; 0094
 * prohibits assigning ownership later. An adopted job inherits its source's owner via
 * the immutable v3 import record, or v1's succeeded command receipt and frozen parties.
 * No first-touch claim or mutation of job ownership is permitted. UNION handles
 * repeated imports without duplicating identities or following cycles forever.
 */
export function practiceOwnedJobsSql(digestParameter: "$2" | "$3" = "$3") {
 return `WITH RECURSIVE practice_owned_job AS (
  SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=${digestParameter}
  UNION
  SELECT j.id FROM practice_owned_job source
  JOIN app.job j ON j.tenant_id=$1
   AND j.provenance='imported' AND j.practice_session_digest IS NULL
  WHERE EXISTS (SELECT 1 FROM app.job_import_v3 iv
   WHERE iv.tenant_id=$1 AND iv.job_id=j.id AND iv.source_job_id=source.id)
  OR EXISTS (SELECT 1 FROM app.imported_job_baseline b
   JOIN app.job_party_binding imported ON (imported.tenant_id,imported.job_id,imported.id)=(b.tenant_id,b.job_id,b.party_binding_id)
   JOIN app.job_party_binding origin ON origin.tenant_id=b.tenant_id AND origin.job_id=source.id
    AND origin.customer_revision_id=imported.customer_revision_id
    AND origin.site_revision_id=imported.site_revision_id AND origin.paying_party_revision_id=imported.paying_party_revision_id
   WHERE b.tenant_id=$1 AND b.job_id=j.id
    AND NOT EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=b.tenant_id AND iv.job_id=b.job_id)
    AND EXISTS (SELECT 1 FROM app.command_receipt rv
     WHERE rv.tenant_id=$1 AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||j.id::text AND rv.result->>'jobId'=j.id::text
      AND rv.result->>'sourceJobId'=source.id::text))
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
 * contract. Install the authenticated digest after session binding, before
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
       // Only withTenant's exact tenant setup installs the digest, after binding.
       if(sql==="SELECT set_config('app.tenant_id', $1, true)")await connection.query("SELECT set_config('app.practice_material_digest', $1, true)",[digest]);
       return connection.query(sql,values);
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
