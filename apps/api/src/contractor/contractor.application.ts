import { z } from "zod";
import type { Pool } from "pg";
import { ContractorRepository } from "@jobguard/db";
import { ContractorError, contractorQueryV1 } from "@jobguard/core";
const sessionV1 = z.object({ version: z.literal("contractor-principal.v1"), sessionId: z.string().uuid() }).strict();
const startV1 = z.object({ version: z.literal("contractor-practice.v1"), environment: z.literal("synthetic_demo") }).strict();
/** Server-only composition; all tenant/membership authority comes from the persisted bearer session. */
export class ContractorApplication {
 private readonly repository: ContractorRepository;
 constructor(pool: Pool) { this.repository = new ContractorRepository(pool); }
 private session(raw: unknown) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ContractorError("MODE_FORBIDDEN");
  const parsed=sessionV1.safeParse(raw);
  if(!parsed.success) throw new ContractorError("UNAUTHENTICATED");
  return parsed.data.sessionId;
 }
 async start(principal: unknown, raw: unknown) {
  const session=this.session(principal);
  if(!startV1.safeParse(raw).success) throw new ContractorError("INVALID_COMMAND");
  const member=await this.repository.startPractice(session);
  return this.repository.query(member,{version:"contractor-query.v1",tenantId:member.tenantId,resource:"organisation"});
 }
 async read(principal: unknown, raw: unknown) {
  const session=this.session(principal);
  const query=contractorQueryV1.safeParse(raw);
  if(!query.success) throw new ContractorError("INVALID_COMMAND");
  return this.repository.query(await this.repository.resolveSession(session),query.data);
 }
 async resume(principal: unknown) {
  const member=await this.repository.resolveSession(this.session(principal));
  return this.repository.query(member,{version:"contractor-query.v1",tenantId:member.tenantId,resource:"organisation"});
 }
 async command(principal: unknown, raw: unknown) {
  const member=await this.repository.resolveSession(this.session(principal));
  return this.repository.command(member,raw);
 }
}
export function createContractorApplication(dependencies: {pool:Pool}) {return new ContractorApplication(dependencies.pool);}
export function contractorHttpStatus(error: unknown) {
 const code=(error as {code?:string}).code;
 return code==="UNAUTHENTICATED"?401:code==="NOT_FOUND"?404:code==="FORBIDDEN"||code==="MODE_FORBIDDEN"?403:code==="STALE_REVISION"||code==="COMMAND_CONFLICT"?409:code==="INVALID_COMMAND"||code==="INVALID_RULE_DOCUMENT"?422:503;
}
