import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import type { AuditEventInput } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const actionSchema = z.object({
  actionType: z.string().min(1).max(100), recipient: z.string().max(320).nullable(),
  contentHash: sha256, aggregateRevision: z.number().int().nonnegative(),
  amountPence: z.number().int().nonnegative().nullable(), currency: z.literal("GBP").nullable(),
  policyVersion: z.string().min(1).max(80), expiresAt: z.coerce.date(),
}).strict().refine((v) => (v.amountPence === null) === (v.currency === null), "amount and currency must appear together");
export const consequentialCommandV1Schema = z.object({
  version: z.literal("command.v1"), commandId: uuid, commandType: z.string().min(1).max(100),
  semanticKey: z.string().min(1).max(300), actorMembershipId: uuid,
  subjectType: z.string().min(1).max(100), subjectRef: z.string().min(1).max(200),
  decisionId: uuid.optional(), resolutionId: uuid.optional(), authorizationId: uuid.optional(),
  action: actionSchema,
}).strict();
export type ConsequentialCommand = z.infer<typeof consequentialCommandV1Schema>;
export type ExactAction = z.infer<typeof actionSchema>;
export const decisionDismissCommandV1Schema = z.object({
  version:z.literal("decision-resolution-command.v1"),commandId:uuid,semanticKey:z.string().min(1).max(300),actorMembershipId:uuid,
  decisionId:uuid,findingFingerprint:sha256,resolution:z.enum(["dismissed","rejected"]),expectedSnapshotRevision:z.number().int().nonnegative(),
}).strict();
export type DecisionDismissCommand=z.infer<typeof decisionDismissCommandV1Schema>;

/** Contract reserved for M4. No dispatcher accepts this type while the gate is disabled. */
export interface StandingAuthorizationV1 {
  readonly version: "standing-authorization.v1"; readonly scope: string;
  readonly maximumAmountPence: number | null; readonly expiresAt: Date; readonly revokedAt: Date | null;
}
export const UNATTENDED_COMMERCIAL_EXECUTION_ENABLED = false as const;

export class CommandError extends Error {
  constructor(readonly code: "COMMAND_CONFLICT"|"FORBIDDEN"|"AUTHORIZATION_INVALID") { super(code); this.name="CommandError"; }
}
const canonical = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v)
  ? `[${v.map(canonical).join(",")}]`
  : `{${Object.entries(v as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
const hashRequest = (v: ConsequentialCommand) => {
  const { commandId: _commandId, decisionId: _decisionId, resolutionId: _resolutionId, authorizationId: _authorizationId, ...semanticPayload } = v;
  return createHash("sha256").update(canonical(semanticPayload)).digest("hex");
};

export interface CommandMutation<TResult extends Record<string, unknown>> {
  /** Must lock and mutate every business aggregate before returning. Audit append follows immediately. */
  mutate(database: TenantTransaction, command: ConsequentialCommand): Promise<TResult>;
  auditEvents?(result: TResult, command: ConsequentialCommand): readonly AuditEventInput[];
}

export class UserCommandDispatcher {
  constructor(private readonly pool: Pool) {}
  async dispatch<TResult extends Record<string, unknown>>(context: VerifiedTenantContext, raw: unknown, handler: CommandMutation<TResult>): Promise<TResult> {
    const command=consequentialCommandV1Schema.parse(raw), requestHash=hashRequest(command);
    return withTenant(this.pool,context,async database=>{
      const claimed=await database.$client.query(`INSERT INTO app.command_receipt
        (command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
        VALUES($1,$2,$3,$4,$5,'processing',$6) ON CONFLICT DO NOTHING RETURNING command_id`,
        [command.commandId,context.tenantId,command.commandType,command.semanticKey,requestHash,command.actorMembershipId]);
      if(!claimed.rowCount){
        const prior=(await database.$client.query<{request_hash:string;status:string;result:TResult}>(
          `SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND
           (command_id=$2 OR (command_type=$3 AND semantic_key=$4))`,[context.tenantId,command.commandId,command.commandType,command.semanticKey])).rows[0];
        if(!prior || prior.request_hash!==requestHash) throw new CommandError("COMMAND_CONFLICT");
        if(prior.status==="succeeded") return prior.result;
        throw new CommandError("COMMAND_CONFLICT");
      }
      // Do not upgrade the membership KEY SHARE lock already taken by the receipt's
      // foreign key. Concurrent commands can each hold that lock, and attempting to
      // upgrade both to FOR UPDATE before taking their aggregate lock deadlocks.
      // Membership is checked again at action execution; command authorization does
      // not need to mutate or serialize on this row.
      const member=(await database.$client.query<{role:string}>(`SELECT role FROM app.membership WHERE tenant_id=$1 AND id=$2
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[context.tenantId,command.actorMembershipId])).rows[0];
      if(!member || member.role!=="owner") throw new CommandError("FORBIDDEN");
      if (command.action.expiresAt.getTime() <= Date.now()) throw new CommandError("AUTHORIZATION_INVALID");
      const decisionId=command.decisionId??randomUUID(), resolutionId=command.resolutionId??randomUUID(), authorizationId=command.authorizationId??randomUUID();
      if(command.decisionId){const existing=(await database.$client.query(`SELECT 1 FROM app.decision WHERE tenant_id=$1 AND id=$2 AND subject_type=$3 AND subject_ref=$4 AND action_type=$5`,[context.tenantId,decisionId,command.subjectType,command.subjectRef,command.action.actionType])).rows[0];if(!existing)throw new CommandError("AUTHORIZATION_INVALID");}else await database.$client.query(`INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,$3,$4,$5)`,[decisionId,context.tenantId,command.subjectType,command.subjectRef,command.action.actionType]);
      await database.$client.query(`INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)`,[resolutionId,context.tenantId,decisionId,command.actorMembershipId]);
      await database.$client.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[authorizationId,context.tenantId,decisionId,resolutionId,command.actorMembershipId,command.action.actionType,command.action.recipient,command.action.contentHash,command.action.aggregateRevision,command.action.amountPence,command.action.currency,command.action.policyVersion,command.action.expiresAt]);
      const result=await handler.mutate(database,command);
      await appendAuditBatch(database,[...(handler.auditEvents?.(result,command)??[]),{id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType:"command.succeeded",subjectType:command.subjectType,subjectRef:command.subjectRef,payload:{references:{commandId:command.commandId,authorizationId},classifications:{action:"commercial"}}}]);
      await database.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,command.commandId,JSON.stringify(result)]);
      return result;
    });
  }
  /** Non-consequential inbox resolution. Dismiss/reject is audited and intentionally creates no action authorization. */
  async dismissDecision(context:VerifiedTenantContext,raw:unknown):Promise<{decisionId:string;resolution:"dismissed"|"rejected";authorizedAction:false}>{const command=decisionDismissCommandV1Schema.parse(raw);const requestHash=createHash("sha256").update(canonical(command)).digest("hex");return withTenant(this.pool,context,async database=>{const claimed=await database.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'finding.resolve',$3,$4,'processing',$5) ON CONFLICT DO NOTHING RETURNING command_id`,[command.commandId,context.tenantId,command.semanticKey,requestHash,command.actorMembershipId]);if(!claimed.rowCount){const prior=(await database.$client.query<{request_hash:string;result:{decisionId:string;resolution:"dismissed"|"rejected";authorizedAction:false}}>(`SELECT request_hash,result FROM app.command_receipt WHERE tenant_id=$1 AND (command_id=$2 OR (command_type='finding.resolve' AND semantic_key=$3))`,[context.tenantId,command.commandId,command.semanticKey])).rows[0];if(!prior||prior.request_hash!==requestHash)throw new CommandError("COMMAND_CONFLICT");return prior.result;}const member=(await database.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL`,[context.tenantId,command.actorMembershipId])).rows[0];if(!member)throw new CommandError("FORBIDDEN");const finding=(await database.$client.query<{id:string}>(`SELECT id FROM app.job_finding WHERE tenant_id=$1 AND decision_id=$2 AND fingerprint=$3 AND snapshot_revision=$4`,[context.tenantId,command.decisionId,command.findingFingerprint,command.expectedSnapshotRevision])).rows[0];if(!finding)throw new CommandError("AUTHORIZATION_INVALID");await database.$client.query(`INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),context.tenantId,command.decisionId,command.resolution,command.actorMembershipId]);const result={decisionId:command.decisionId,resolution:command.resolution,authorizedAction:false as const};await appendAuditBatch(database,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType:"finding.resolved",subjectType:"finding",subjectRef:finding.id,payload:{references:{decisionId:command.decisionId,findingFingerprint:command.findingFingerprint,resolution:command.resolution,authorizationCreated:"false"},classifications:{action:"operational"}}}]);await database.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,command.commandId,JSON.stringify(result)]);return result;});}

}

/** The only boundary allowed to invoke a commercial adapter. It always rechecks the exact immutable grant. */
export async function executeAuthorizedCommercialAction<T>(database: TenantTransaction, authorizationId: string, requested: ExactAction, invoke: () => Promise<T>): Promise<T> {
  uuid.parse(authorizationId); const action=actionSchema.parse(requested);
  const row=(await database.$client.query<Record<string,unknown>>(`SELECT a.* FROM app.action_authorization a
    JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id
    JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id
    WHERE a.id=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND r.resolution='approved'
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`,[authorizationId])).rows[0];
  const matches=row && row.action_type===action.actionType && row.recipient===action.recipient && row.content_hash===action.contentHash &&
    Number(row.aggregate_revision)===action.aggregateRevision && (row.amount_pence===null?action.amountPence===null:Number(row.amount_pence)===action.amountPence) &&
    row.currency===action.currency && row.policy_version===action.policyVersion;
  if(!matches) throw new CommandError("AUTHORIZATION_INVALID");
  return invoke();
}
