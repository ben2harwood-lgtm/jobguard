import type { Pool } from "pg";
import { DEMO_EMPTY_TENANT_ID, authenticatePracticeSession, authorizePracticeJob, PracticeAccessError, withTenant } from "@jobguard/db";
import { z } from "zod";

/** Shared synthetic principal bridge. Cookie shape is never authority. */
export class PracticeAccess {
 constructor(private readonly pool: Pool, private readonly sessionId?: string) {}
 session() { return authenticatePracticeSession(this.pool,this.sessionId); }
 job(id: unknown) { return authorizePracticeJob(this.pool,this.sessionId,id); }
 case(id: unknown) { return authorizePracticeJob(this.pool,this.sessionId,id,"case"); }
 async command(raw: unknown, action: "list" | "evaluate" | "dismiss") {
  const auth=await this.session();
  const input=z.object({tenantId:z.string().uuid(),jobId:z.string().uuid().optional(),decisionId:z.string().uuid().optional()}).passthrough().safeParse(raw);
  if(input.success&&action==="list"&&input.data.tenantId===DEMO_EMPTY_TENANT_ID)return authenticatePracticeSession(this.pool,this.sessionId,DEMO_EMPTY_TENANT_ID);
  if(!input.success||input.data.tenantId!==auth.context.tenantId)throw new PracticeAccessError("NOT_FOUND");
  if(action==="dismiss")return authorizePracticeJob(this.pool,this.sessionId,input.data.decisionId,"decision");
  if(input.data.jobId)return this.job(input.data.jobId);
  if(action!=="list")throw new PracticeAccessError("NOT_FOUND"); return auth;
 }
 async subject(jobId: string, kind: "upload" | "evidence", id: string) {
  const auth=await this.job(jobId);
  const table=kind==="upload"?"app.evidence_upload":"app.evidence_object";
  const found=await withTenant(this.pool,auth.context,async db=>(await db.$client.query(`SELECT id FROM ${table} WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[auth.context.tenantId,jobId,id])).rows[0]);
  if(!found)throw new PracticeAccessError("NOT_FOUND");
 }

}

export function practiceCookie(cookie: string | undefined): string | undefined {
 return cookie?.split(";").map(x=>x.trim()).find(x=>x.startsWith("jg_session="))?.slice(11);
}
