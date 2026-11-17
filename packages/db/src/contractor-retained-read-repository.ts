import type { Pool } from "pg";
import { ContractorError, contractorQueryV1, contractorWorkspaceV1, type ContractorWorkspace } from "@jobguard/core";
import { ContractorEntitlementAuthorityRepository } from "./contractor-entitlement-authority-repository.js";
import type { TenantTransaction } from "./tenant-context.js";
/** Session-bound historical projection only; never an authority source for commands. */
export class ContractorRetainedReadRepository {
 private readonly authority: ContractorEntitlementAuthorityRepository;
 constructor(pool: Pool) { this.authority=new ContractorEntitlementAuthorityRepository(pool); }
 private async read(db: TenantTransaction, sessionId: string, query: ReturnType<typeof contractorQueryV1.parse>): Promise<ContractorWorkspace> {
  try {
   const row=(await db.$client.query<{workspace:unknown}>("SELECT app.mon8_retained_contractor_workspace($1,$2::jsonb) workspace",[sessionId,JSON.stringify(query)])).rows[0];
   return contractorWorkspaceV1.parse(row?.workspace);
  } catch(error) {
   const code=(error as {message?:string}).message;
   if(code==="FORBIDDEN"||code==="NOT_FOUND"||code==="INVALID_COMMAND"||code==="MODE_FORBIDDEN") throw new ContractorError(code);
   throw error;
  }
 }
 async query(sessionId: string, raw: unknown): Promise<ContractorWorkspace> {
  const query=contractorQueryV1.safeParse(raw);
  if(!query.success) throw new ContractorError("INVALID_COMMAND");
  return this.authority.withAuthority(sessionId,db=>this.read(db,sessionId,query.data));
 }
 async resume(sessionId: string): Promise<ContractorWorkspace> {
  return this.authority.withAuthority(sessionId,(db,authority)=>this.read(db,sessionId,{version:"contractor-query.v1",tenantId:authority.tenantId,resource:"organisation"}));
 }
}
