import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ContractorError, contractorCommandV1, contractorQueryV1, contractorWorkspaceV1, type ContractorCommand } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type AuthenticatedMembership, verifiedTenantContextFromMembership } from "./tenant-context.js";

const canonical = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.entries(v as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
const hash = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");
export type ContractorReceipt = { id: string; revision: number; kind: ContractorCommand["kind"]; environment: "synthetic_demo"; realExternalActions: 0 };
export type ContractorView = {
 version: "contractor-workspace.v1"; environment: "synthetic_demo"; tenantId: string; membershipId: string; revision: number; realExternalActions: 0;
 units: Array<{id:string;kind:string;parent_id:string|null;name:string}>; teams: Array<{id:string;branch_id:string;name:string}>;
 members: Array<{membership_id:string;email:string;client_id:string|null;revoked:boolean}>;
 grants: Array<{id:string;membership_id:string;role:string;scope_kind:string;scope_id:string;revoked:boolean}>;
 teamMemberships: Array<{membership_id:string;team_id:string;active:boolean}>;
 clients: Array<{id:string;name:string;branch_id:string}>;
 contracts: Array<{id:string;contract_id:string;client_id:string;revision:number;document:Record<string,unknown>;rule_version_id:string;rules:Record<string,unknown>}>;
};
function translate(error: unknown): never {
 if (error instanceof ContractorError) throw error;
 const message = (error as {message?:string}).message;
 const codes = ["FORBIDDEN","NOT_FOUND","STALE_REVISION","COMMAND_CONFLICT","MODE_FORBIDDEN","INVALID_COMMAND","INVALID_RULE_DOCUMENT"] as const;
 const matched = codes.find(code=>message===code);
 if(matched) throw new ContractorError(matched);
 if ((error as {code?:string}).code === "23505") throw new ContractorError("COMMAND_CONFLICT");
 if ((error as {code?:string}).code === "42501") throw new ContractorError("FORBIDDEN");
 if ((error as {code?:string}).code === "23503") throw new ContractorError("NOT_FOUND");
 throw error;
}
export class ContractorRepository {
 constructor(private readonly pool: Pool) {}
 async resolveSession(sessionId: string): Promise<AuthenticatedMembership> {
  const row=(await this.pool.query<{tenant_id:string;membership_id:string;identity_user_id:string}>("SELECT * FROM app.contractor_session($1)",[sessionId])).rows[0];
  if(!row) throw new ContractorError("UNAUTHENTICATED");
  return {tenantId:row.tenant_id,membershipId:row.membership_id,identityUserId:row.identity_user_id} as AuthenticatedMembership;
 }
 async startPractice(sessionId: string) {
  const client=await this.pool.connect();
  try {
   await client.query("BEGIN");
   const tenantId=(await client.query<{tenant_id:string}>("SELECT app.start_contractor_practice($1) tenant_id",[sessionId])).rows[0]!.tenant_id;
   // start_contractor_practice sets transaction-local context before returning.
   await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
   const assignments=(await client.query<{id:string}>("SELECT id FROM app.commercial_track_assignment WHERE tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM app.audit_event a WHERE a.tenant_id=$1 AND a.id=app.commercial_track_assignment.id)",[tenantId])).rows;
   for(const assignment of assignments) await appendAuditBatch({$client:client} as TenantTransaction,[{id:assignment.id,version:"audit.v1",actorRef:"operations:synthetic-generator",eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:tenantId,payload:{references:{assignment:assignment.id,environment:"synthetic_demo"},classifications:{action:"security"}}}]);
   await client.query("COMMIT");
   return this.resolveSession(sessionId);
  } catch(error) {await client.query("ROLLBACK");translate(error);} finally {client.release();}
 }
 private async verify(db: TenantTransaction, principal: AuthenticatedMembership) {
  const row=(await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND app.contractor_member_active(id)",[principal.tenantId,principal.membershipId,principal.identityUserId])).rows[0];
  if(!row) throw new ContractorError("FORBIDDEN");
 }
 async command(principal: AuthenticatedMembership, raw: unknown): Promise<ContractorReceipt> {
  const parsed=contractorCommandV1.safeParse(raw);
  if(!parsed.success) throw new ContractorError(parsed.error.issues.some(x=>x.path.includes("rules"))?"INVALID_RULE_DOCUMENT":"INVALID_COMMAND");
  const command=parsed.data;
  try { return await withTenant(this.pool,verifiedTenantContextFromMembership(principal),async db=>{
   await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))",[principal.tenantId]);
   await this.verify(db,principal);
   const result=(await db.$client.query<{result:ContractorReceipt}>("SELECT app.contractor_admin_command($1,$2::jsonb,$3) result",[principal.membershipId,JSON.stringify(command),hash(command)])).rows[0]!.result;
   const exists=await db.$client.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2",[principal.tenantId,command.commandId]);
   if(!exists.rowCount) await appendAuditBatch(db,[{id:command.commandId,version:"audit.v1",actorRef:`membership:${principal.membershipId}`,eventType:`contractor.${command.kind}`,subjectType:"contractor-administration",subjectRef:command.id,payload:{references:{command:command.commandId,environment:"synthetic_demo"},hashes:{document:hash(command)},classifications:{action:"security"}}}]);
   return result;
  }); } catch(error) {translate(error);}
 }
 async query(principal: AuthenticatedMembership, raw: unknown): Promise<ContractorView> {
  const query=contractorQueryV1.parse(raw);
  if(query.tenantId!==principal.tenantId) throw new ContractorError("NOT_FOUND");
  return withTenant(this.pool,verifiedTenantContextFromMembership(principal),async db=>{
   await db.$client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,54))",[principal.tenantId]);
   await this.verify(db,principal);
   const m=principal.membershipId;
   // Evaluate the per-row authorisation function once per addressable ID (not once per member x grant), then filter by that set.
   const readable=(await db.$client.query<{id:string}>("SELECT id FROM (SELECT id FROM app.org_unit UNION SELECT id FROM app.team UNION SELECT id FROM app.client_organisation UNION SELECT nullif(current_setting('app.tenant_id',true),'')::uuid) x WHERE app.contractor_allowed($1,'organisation.read',id)",[m])).rows.map(x=>x.id);
   const unitRows=(await db.$client.query<ContractorView['units'][number]>("SELECT id,kind,parent_id,name FROM app.org_unit WHERE id=ANY($1::uuid[]) ORDER BY kind,name",[readable])).rows;
   const teamRows=(await db.$client.query<ContractorView['teams'][number]>("SELECT id,branch_id,name FROM app.team WHERE id=ANY($1::uuid[]) ORDER BY name",[readable])).rows;
   const admin=unitRows.length>0||teamRows.length>0;
   if(query.resource==='organisation'&&!admin) throw new ContractorError("NOT_FOUND");
   const units=admin?unitRows:[];
   const teams=admin?teamRows:[];
   const members=admin?(await db.$client.query<ContractorView['members'][number]>("SELECT c.membership_id,c.email,c.client_id,NOT app.contractor_member_active(c.membership_id) revoked FROM app.contractor_member c WHERE EXISTS(SELECT 1 FROM app.role_grant g WHERE g.membership_id=c.membership_id AND g.scope_id=ANY($1::uuid[])) ORDER BY c.email",[readable])).rows:[];
   const grants=admin?(await db.$client.query<ContractorView['grants'][number]>("SELECT g.*,EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.grant_id=g.id) revoked FROM app.role_grant g WHERE g.scope_id=ANY($1::uuid[])",[readable])).rows:[];
   const teamMemberships=admin?(await db.$client.query<ContractorView['teamMemberships'][number]>("SELECT DISTINCT ON(membership_id,team_id) membership_id,team_id,active FROM app.team_membership WHERE team_id=ANY($1::uuid[]) ORDER BY membership_id,team_id,revision DESC",[readable])).rows:[];
   const clients=(await db.$client.query<ContractorView['clients'][number]>("SELECT id,name,branch_id FROM app.client_organisation WHERE app.contractor_allowed($1,'contract.read',id) ORDER BY name",[m])).rows;
   const contracts=(await db.$client.query<ContractorView['contracts'][number]>(`SELECT v.id,v.contract_id,v.client_id,v.revision,v.document,v.rule_version_id,r.document rules FROM app.client_contract_version v JOIN app.approval_rule_version r ON(r.tenant_id,r.id)=(v.tenant_id,v.rule_version_id) WHERE app.contractor_allowed($1,'contract.read',v.client_id,v.contract_id) AND ($2::uuid IS NULL OR v.contract_id=$2) ORDER BY v.contract_id,v.revision`,[m,query.resource==='contracts'?query.id??null:null])).rows;
   if(query.id&&(query.resource==='contracts'?!contracts.length:![...units,...teams,...clients].some(x=>x.id===query.id))) throw new ContractorError("NOT_FOUND");
   // Restricted readers cannot infer unrelated administrative activity from revision/counts.
   const revision=admin?Number((await db.$client.query("SELECT count(*) n FROM app.command_receipt WHERE command_type LIKE 'contractor.%'")).rows[0].n):0;
   return contractorWorkspaceV1.parse({version:"contractor-workspace.v1",environment:"synthetic_demo",tenantId:principal.tenantId,membershipId:m,revision,realExternalActions:0,units,teams,members,grants,teamMemberships,clients,contracts});
  });
 }
}
