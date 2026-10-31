// TEST ONLY: pre-0475 dispatcher protocol from d2a1f8db^, for real partial-schema
// upgrade fixtures. Current/malformed schemas always use the production client.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "../src/tenant-context.js";
import { appendAuditBatch } from "../src/audit.js";
import type { ConsequentialCommand, CommandMutation } from "../src/commands.js";
const canonical = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v)
  ? `[${v.map(canonical).join(",")}]`
  : `{${Object.entries(v as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
const hashRequest = (v: ConsequentialCommand) => {
  const { commandId: _commandId, decisionId: _decisionId, resolutionId: _resolutionId, authorizationId: _authorizationId, ...semanticPayload } = v;
  return createHash("sha256").update(canonical(semanticPayload)).digest("hex");
};


export function legacyCommandModule(commands: typeof import("../src/commands.js")) {
 const { CommandError, consequentialCommandV1Schema, decisionDismissCommandV1Schema } = commands;
class HistoricalCommandDispatcher {
  constructor(private readonly pool: Pool) {}
  async dispatch<TResult extends Record<string, unknown>>(context: VerifiedTenantContext, raw: unknown, handler: CommandMutation<TResult>): Promise<TResult> {
    const parsed=consequentialCommandV1Schema.parse(raw);
    const binding=handler.inputHash?.(parsed);
    if (binding && !/^[a-f0-9]{64}$/u.test(binding)) throw new CommandError("AUTHORIZATION_INVALID");
    const command=binding ? { ...parsed, semanticKey: parsed.semanticKey.replace(/:lp3=[a-f0-9]{64}$/u, "") + `:lp3=${binding}` } : parsed;
    if (command.semanticKey.length > 300) throw new CommandError("COMMAND_CONFLICT");
    const requestHash=hashRequest(command);
    return withTenant(this.pool,context,async database=>{
      if (handler.lock) {
        const member=(await database.$client.query<{role:string}>(`SELECT role FROM app.membership WHERE tenant_id=$1 AND id=$2
          AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[context.tenantId,command.actorMembershipId])).rows[0];
        if (!member || member.role!=="owner") throw new CommandError("FORBIDDEN");
        await handler.lock(database, command);
      }
      const claimed=await database.$client.query(`INSERT INTO app.command_receipt
        (command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
        VALUES($1,$2,$3,$4,$5,'processing',$6) ON CONFLICT DO NOTHING RETURNING command_id`,
        [command.commandId,context.tenantId,command.commandType,command.semanticKey,requestHash,command.actorMembershipId]);
      if(!claimed.rowCount){
        const prior=(await database.$client.query<{request_hash:string;status:string;result:TResult}>(
          `SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND
           (command_id=$2 OR (command_type=$3 AND semantic_key=$4))`,[context.tenantId,command.commandId,command.commandType,command.semanticKey])).rows[0];
        if(!prior || prior.request_hash!==requestHash) throw new CommandError("COMMAND_CONFLICT");
        if(prior.status==="succeeded") {
          if(binding){
            const active=(await database.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[context.tenantId,command.actorMembershipId])).rows[0];
            if(!active)throw new CommandError("FORBIDDEN");
          }
          return prior.result;
        }
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
      const result=await handler.mutate(database,{...command,decisionId,resolutionId,authorizationId});
      await appendAuditBatch(database,[...(handler.auditEvents?.(result,command)??[]),{id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType:"command.succeeded",subjectType:command.subjectType,subjectRef:command.subjectRef,payload:{references:{commandId:command.commandId,authorizationId},classifications:{action:"commercial"}}}]);
      await database.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,command.commandId,JSON.stringify(result)]);
      return result;
    });
  }
  /** Non-consequential inbox resolution. Dismiss/reject is audited and intentionally creates no action authorization. */
  async dismissDecision(context:VerifiedTenantContext,raw:unknown):Promise<{decisionId:string;resolution:"dismissed"|"rejected";authorizedAction:false}>{const command=decisionDismissCommandV1Schema.parse(raw);const requestHash=createHash("sha256").update(canonical(command)).digest("hex");return withTenant(this.pool,context,async database=>{const claimed=await database.$client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'finding.resolve',$3,$4,'processing',$5) ON CONFLICT DO NOTHING RETURNING command_id`,[command.commandId,context.tenantId,command.semanticKey,requestHash,command.actorMembershipId]);if(!claimed.rowCount){const prior=(await database.$client.query<{request_hash:string;result:{decisionId:string;resolution:"dismissed"|"rejected";authorizedAction:false}}>(`SELECT request_hash,result FROM app.command_receipt WHERE tenant_id=$1 AND (command_id=$2 OR (command_type='finding.resolve' AND semantic_key=$3))`,[context.tenantId,command.commandId,command.semanticKey])).rows[0];if(!prior||prior.request_hash!==requestHash)throw new CommandError("COMMAND_CONFLICT");return prior.result;}const member=(await database.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[context.tenantId,command.actorMembershipId])).rows[0];if(!member)throw new CommandError("FORBIDDEN");const finding=(await database.$client.query<{id:string}>(`SELECT id FROM app.job_finding WHERE tenant_id=$1 AND decision_id=$2 AND fingerprint=$3 AND snapshot_revision=$4`,[context.tenantId,command.decisionId,command.findingFingerprint,command.expectedSnapshotRevision])).rows[0];if(!finding)throw new CommandError("AUTHORIZATION_INVALID");await database.$client.query(`INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),context.tenantId,command.decisionId,command.resolution,command.actorMembershipId]);const result={decisionId:command.decisionId,resolution:command.resolution,authorizedAction:false as const};await appendAuditBatch(database,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType:"finding.resolved",subjectType:"finding",subjectRef:finding.id,payload:{references:{decisionId:command.decisionId,findingFingerprint:command.findingFingerprint,resolution:command.resolution,authorizationCreated:"false"},classifications:{action:"operational"}}}]);await database.$client.query(`UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,command.commandId,JSON.stringify(result)]);return result;});}

}


 class SchemaAwareDispatcher extends commands.UserCommandDispatcher {
  constructor(private readonly fixturePool: Pool) { super(fixturePool); }
  private async historical(): Promise<boolean> {
   // Unit transport doubles embedded in integration files keep the current client.
   if (typeof this.fixturePool.query !== "function") return false;
   const row = (await this.fixturePool.query<{begin_installed:boolean;complete_installed:boolean;claims_installed:boolean}>(`SELECT
    to_regprocedure('app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)') IS NOT NULL AS begin_installed,
    to_regprocedure('app.complete_command(uuid,jsonb)') IS NOT NULL AS complete_installed,
    to_regclass('app.command_lifecycle_claim') IS NOT NULL AS claims_installed`)).rows[0];
   return row?.begin_installed === false && row.complete_installed === false && row.claims_installed === false;
  }
  override async dispatch<TResult extends Record<string,unknown>>(context:VerifiedTenantContext,raw:unknown,handler:CommandMutation<TResult>):Promise<TResult> {
   if (await this.historical()) return new HistoricalCommandDispatcher(this.fixturePool).dispatch(context,raw,handler);
   return super.dispatch(context,raw,handler);
  }
  override async dismissDecision(context:VerifiedTenantContext,raw:unknown) {
   if (await this.historical()) return new HistoricalCommandDispatcher(this.fixturePool).dismissDecision(context,raw);
   return super.dismissDecision(context,raw);
  }
 }
 return { ...commands, UserCommandDispatcher: SchemaAwareDispatcher };
}
