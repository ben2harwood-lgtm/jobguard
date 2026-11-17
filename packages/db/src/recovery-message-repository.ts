import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  buildCanonicalRecoveryMessage, buildEvidenceManifest, canonicalManifest, manifestDigest, matchesRecoveryMessageApproval, verifyStandalonePack,
  recoveryMessageCommandV1, recoveryMessagePreviewV1, renderStandalonePack, sha256,
  type CanonicalRecoveryMessage, type RecoveryMessageCommand,
} from "@jobguard/core";
import { loadEvidencePackSources } from "./evidence-pack-sources.js";
import { appendAuditBatch } from "./audit.js";
import { appendOutboundAction } from "./outbox.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export type RecoveryMessageActor = { membershipId: string; actorRef: string; sessionId: string };
export type RecoveryMessageView = CanonicalRecoveryMessage & {
  id: string; revision: number; status: "previewed" | "queued" | "simulated_delivery" | "outcome_unknown" | "retryable" | "cancelled";
  attempts: number; actionId: string | null; authorizationId: string | null; decisionId: string | null; createdAt: string; sinkCount: number;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const changed = () => new Error("RECOVERY_MESSAGE_CHANGED");
const actionType = "recovery.message.simulate";
function requireSyntheticEnvironment() { if(process.env.JOBGUARD_ENV!=="synthetic_demo") throw new Error("RECOVERY_MESSAGE_ENVIRONMENT_FORBIDDEN"); }
/** Called before the opening command audit so case identity and session scope commit together. */
export async function bindRecoveryMessageCaseSession(db:TenantTransaction,ctx:VerifiedTenantContext,caseId:string,sessionId:string,membershipId:string) {
  requireSyntheticEnvironment();
  const member=await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE",[ctx.tenantId,membershipId]);
  if(!member.rowCount)throw new Error("RECOVERY_MESSAGE_FORBIDDEN");
  const row=(await db.$client.query<{job_id:string}>("SELECT job_id FROM app.recovery_case WHERE tenant_id=$1 AND id=$2 AND synthetic=true",[ctx.tenantId,caseId])).rows[0];
  if(!row)throw new Error("RECOVERY_CASE_NOT_FOUND");
  const wrongRun=await db.$client.query("SELECT 1 FROM app.sandbox_run r WHERE r.tenant_id=$1 AND r.job_id=$2 AND (r.session_id<>$3 OR EXISTS(SELECT 1 FROM app.sandbox_run_event e WHERE e.tenant_id=r.tenant_id AND e.run_id=r.id AND e.kind='archived'))",[ctx.tenantId,row.job_id,sessionId]);
  if(wrongRun.rowCount)throw new Error("RECOVERY_MESSAGE_FORBIDDEN");
  await db.$client.query("INSERT INTO app.recovery_message_case_access(tenant_id,job_id,case_id,session_id,membership_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[ctx.tenantId,row.job_id,caseId,sessionId,membershipId]);
  const bound=await db.$client.query("SELECT 1 FROM app.recovery_message_case_access WHERE tenant_id=$1 AND case_id=$2 AND session_id=$3 AND membership_id=$4",[ctx.tenantId,caseId,sessionId,membershipId]);
  if(!bound.rowCount)throw new Error("RECOVERY_MESSAGE_FORBIDDEN");
}
const immutable = (snapshot: CanonicalRecoveryMessage) => { const {contentHash: _hash, ...payload} = snapshot; return JSON.stringify(payload); };

/** Synthetic-only repository. Exact grants are normal Decisions, and all fake effects use durable outbox records. */
export class RecoveryMessageRepository {
  constructor(private readonly pool: Pool) {}

  async bindSession(ctx: VerifiedTenantContext, caseId: string, sessionId: string, membershipId: string) {
    requireSyntheticEnvironment();
    return withTenant(this.pool,ctx,db=>bindRecoveryMessageCaseSession(db,ctx,caseId,sessionId,membershipId));
  }

  async read(ctx: VerifiedTenantContext, caseId: string, actor: RecoveryMessageActor) {
    requireSyntheticEnvironment();
    return withTenant(this.pool,ctx, async db => {
      const jobId=await this.access(db,ctx,caseId,actor);
      const rows=await db.$client.query<any>(`SELECT p.*,a.outbox_action_id,a.authorization_id,z.decision_id,o.status,
       coalesce((SELECT max(e.revision) FROM app.recovery_message_event e WHERE e.tenant_id=p.tenant_id AND e.message_id=p.id),1) message_revision,
       (SELECT e.kind FROM app.recovery_message_event e WHERE e.tenant_id=p.tenant_id AND e.message_id=p.id ORDER BY revision DESC LIMIT 1) last_event,
       (SELECT count(*)::int FROM app.action_attempt x WHERE x.tenant_id=p.tenant_id AND x.action_id=a.outbox_action_id) attempts,
       (SELECT count(*)::int FROM app.recovery_message_sink s WHERE s.tenant_id=p.tenant_id AND s.message_id=p.id) sink_count
       FROM app.recovery_message_preview p LEFT JOIN app.recovery_message_approval a ON(a.tenant_id,a.message_id)=(p.tenant_id,p.id)
       LEFT JOIN app.action_authorization z ON(z.tenant_id,z.id)=(a.tenant_id,a.authorization_id)
       LEFT JOIN app.action_outbox o ON(o.tenant_id,o.id)=(a.tenant_id,a.outbox_action_id)
       WHERE p.tenant_id=$1 AND p.case_id=$2 AND p.session_id=$3 ORDER BY p.created_at,p.id`,[ctx.tenantId,caseId,actor.sessionId]);
      const messages:RecoveryMessageView[]=rows.rows.map(r=>({...r.snapshot,id:r.id,revision:Number(r.message_revision),status:r.status==='succeeded'?'simulated_delivery':r.status==='outcome_unknown'?'outcome_unknown':r.status==='retryable'?'retryable':r.status==='cancelled'||r.last_event==='cancelled'?'cancelled':r.status?'queued':'previewed',attempts:r.attempts,actionId:r.outbox_action_id??null,authorizationId:r.authorization_id??null,decisionId:r.decision_id??null,createdAt:new Date(r.created_at).toISOString(),sinkCount:r.sink_count}));
      const sink=(await db.$client.query<any>("SELECT outbox_action_id AS \"actionId\",message_id AS \"messageId\",body,recipient,content_hash AS \"contentHash\",attachment_hash AS \"attachmentHash\",environment FROM app.recovery_message_sink WHERE tenant_id=$1 AND case_id=$2 ORDER BY created_at,id",[ctx.tenantId,caseId])).rows;
      return {caseId,jobId,messages,latest:messages.at(-1)??null,sink,sinkCount:sink.length,realExternalActions:0 as const,environment:"synthetic_demo" as const};
    });
  }

  async preview(ctx:VerifiedTenantContext,caseId:string,raw:unknown,actor:RecoveryMessageActor) {
    requireSyntheticEnvironment();
    const input=recoveryMessagePreviewV1.parse(raw),requestHash=hash({caseId,input,sessionId:actor.sessionId});
    await withTenant(this.pool,ctx,async db=>{
      await this.commandLock(db,ctx,input.commandId);await this.lock(db,ctx,caseId);const jobId=await this.access(db,ctx,caseId,actor);
      const replay=(await db.$client.query<any>("SELECT request_hash FROM app.recovery_message_preview WHERE tenant_id=$1 AND command_id=$2 UNION ALL SELECT request_hash FROM app.recovery_message_event WHERE tenant_id=$1 AND command_id=$2",[ctx.tenantId,input.commandId])).rows[0];
      if(replay){if(replay.request_hash!==requestHash)throw new Error("IDEMPOTENCY_PAYLOAD_CONFLICT");return;}
      const {snapshot,packRevisionId}=await this.current(db,ctx,caseId);
      if(snapshot.caseRevision!==input.expectedCaseRevision||snapshot.packId!==input.packId)throw changed();
      const id=randomUUID();
      await db.$client.query(`INSERT INTO app.recovery_message_preview(id,tenant_id,job_id,case_id,session_id,command_id,request_hash,case_revision,pack_revision_id,amount_pence,currency,sender,recipient,body,content_hash,immutable_content,snapshot,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'GBP',$11,$12,$13,$14,$15,$16,$17,'synthetic_demo')`,[id,ctx.tenantId,jobId,caseId,actor.sessionId,input.commandId,requestHash,snapshot.caseRevision,packRevisionId,snapshot.amountPence,snapshot.sender,snapshot.recipient,snapshot.body,snapshot.contentHash,immutable(snapshot),JSON.stringify(snapshot),actor.membershipId]);
      await this.audit(db,actor,id,"previewed",input.commandId,requestHash);
    });
    return this.read(ctx,caseId,actor);
  }

  async command(ctx:VerifiedTenantContext,caseId:string,raw:unknown,actor:RecoveryMessageActor) {
    requireSyntheticEnvironment();
    const input=recoveryMessageCommandV1.parse(raw),requestHash=hash({caseId,input,sessionId:actor.sessionId});
    let execution:{actionId:string;snapshot:CanonicalRecoveryMessage;jobId:string;attempt:number}|undefined;
    await withTenant(this.pool,ctx,async db=>{
      await this.commandLock(db,ctx,input.commandId);await this.lock(db,ctx,caseId);const jobId=await this.access(db,ctx,caseId,actor);
      const replay=(await db.$client.query<any>("SELECT request_hash FROM app.recovery_message_event WHERE tenant_id=$1 AND command_id=$2 UNION ALL SELECT request_hash FROM app.recovery_message_preview WHERE tenant_id=$1 AND command_id=$2",[ctx.tenantId,input.commandId])).rows[0];
      if(replay){if(replay.request_hash!==requestHash)throw new Error("IDEMPOTENCY_PAYLOAD_CONFLICT");return;}
      const p=(await db.$client.query<any>(`SELECT p.*,a.outbox_action_id,a.authorization_id,o.status,
       coalesce((SELECT max(e.revision) FROM app.recovery_message_event e WHERE e.tenant_id=p.tenant_id AND e.message_id=p.id),1) message_revision,
       (SELECT e.kind FROM app.recovery_message_event e WHERE e.tenant_id=p.tenant_id AND e.message_id=p.id ORDER BY revision DESC LIMIT 1) last_event
       FROM app.recovery_message_preview p LEFT JOIN app.recovery_message_approval a ON(a.tenant_id,a.message_id)=(p.tenant_id,p.id)
       LEFT JOIN app.action_outbox o ON(o.tenant_id,o.id)=(a.tenant_id,a.outbox_action_id)
       WHERE p.tenant_id=$1 AND p.case_id=$2 AND p.id=$3 AND p.session_id=$4`,[ctx.tenantId,caseId,input.messageId,actor.sessionId])).rows[0];
      if(!p)throw new Error("RECOVERY_MESSAGE_NOT_FOUND");
      if(Number(p.message_revision)!==input.expectedRevision)throw changed();
      const snapshot=p.snapshot as CanonicalRecoveryMessage;
      let eventKind:string=input.action;
      if(input.action==='approve'){
        if(p.outbox_action_id||p.last_event==='cancelled'||!matchesRecoveryMessageApproval(snapshot,input))throw changed();
        if((await this.current(db,ctx,caseId)).snapshot.contentHash!==snapshot.contentHash)throw changed();
        // A new preview cannot bypass an uncertain or completed effect for this case.
        const existing=await db.$client.query("SELECT 1 FROM app.recovery_message_approval a JOIN app.action_outbox o ON(o.tenant_id,o.id)=(a.tenant_id,a.outbox_action_id) WHERE a.tenant_id=$1 AND a.case_id=$2 AND o.status<>'cancelled'",[ctx.tenantId,caseId]);
        if(existing.rowCount)throw new Error("RECOVERY_MESSAGE_EXISTING_EFFECT_CONFLICT");
        const decisionId=randomUUID(),resolutionId=randomUUID(),authorizationId=randomUUID(),actionId=randomUUID(),expiresAt=new Date(Date.now()+3600_000);
        await db.$client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES($1,$2,'recovery_message',$3,$4)",[decisionId,ctx.tenantId,p.id,actionType]);
        await db.$client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES($1,$2,$3,'approved',$4)",[resolutionId,ctx.tenantId,decisionId,actor.membershipId]);
        await db.$client.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'GBP',$11,$12)`,[authorizationId,ctx.tenantId,decisionId,resolutionId,actor.membershipId,actionType,snapshot.recipient,snapshot.contentHash,snapshot.caseRevision,snapshot.amountPence,snapshot.policyVersion,expiresAt]);
        await appendOutboundAction(db,ctx.tenantId,{version:"outbound-action.v1",id:actionId,authorizationId,adapter:"fake_recovery_message",providerEffectKey:`recovery-message:${p.id}`,actionType,recipient:snapshot.recipient,contentHash:snapshot.contentHash,immutableContent:p.immutable_content,aggregateRevision:snapshot.caseRevision,amountPence:snapshot.amountPence,currency:"GBP",policyVersion:snapshot.policyVersion,authorizationExpiresAt:expiresAt});
        await db.$client.query("INSERT INTO app.recovery_message_approval(tenant_id,job_id,case_id,message_id,authorization_id,outbox_action_id,environment)VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo')",[ctx.tenantId,jobId,caseId,p.id,authorizationId,actionId]);
        eventKind='approved';
      } else if(input.action==='cancel'){
        if(['executing','succeeded'].includes(p.status)||p.last_event==='cancelled')throw new Error("RECOVERY_MESSAGE_NOT_CANCELLABLE");
        if(p.outbox_action_id){await db.$client.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL",[ctx.tenantId,p.authorization_id]);await db.$client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[ctx.tenantId,p.outbox_action_id]);}
        eventKind='cancelled';
      } else if(input.action==='retry'){
        if(p.status!=='retryable')throw new Error("RECOVERY_MESSAGE_UNSAFE_RETRY");
        if(!await this.authorized(db,ctx,p.authorization_id,snapshot)||(await this.current(db,ctx,caseId)).snapshot.contentHash!==snapshot.contentHash)throw changed();
        await db.$client.query("UPDATE app.action_outbox SET status='pending',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[ctx.tenantId,p.outbox_action_id]);
      } else if(input.action==='reconcile'){
        if(p.status==='executing') {
          const stale=await db.$client.query("UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND claimed_at<clock_timestamp()-interval '5 minutes' RETURNING id",[ctx.tenantId,p.outbox_action_id]);
          if(!stale.rowCount)throw new Error("RECOVERY_MESSAGE_EXECUTION_PENDING");
          p.status='outcome_unknown';
        }
        if(p.status!=='outcome_unknown')throw new Error("RECOVERY_MESSAGE_NOT_RECONCILABLE");
        const sink=await db.$client.query("SELECT 1 FROM app.recovery_message_sink WHERE tenant_id=$1 AND outbox_action_id=$2",[ctx.tenantId,p.outbox_action_id]);
        if(sink.rowCount){await db.$client.query("UPDATE app.action_outbox SET status='succeeded',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[ctx.tenantId,p.outbox_action_id]);eventKind='reconciled';}else eventKind='outcome_unknown';
      } else {
        if(!['pending','retryable'].includes(p.status))throw new Error(p.status==='outcome_unknown'?"RECOVERY_MESSAGE_RECONCILE_REQUIRED":"RECOVERY_MESSAGE_NOT_ADVANCEABLE");
        const valid=await this.authorized(db,ctx,p.authorization_id,snapshot);
        let currentMatches=false;try{currentMatches=(await this.current(db,ctx,caseId)).snapshot.contentHash===snapshot.contentHash;}catch{currentMatches=false;}
        if(!valid||!currentMatches){await db.$client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[ctx.tenantId,p.outbox_action_id]);eventKind='blocked';}
        else {
          const attempt=Number((await db.$client.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2",[ctx.tenantId,p.outbox_action_id])).rows[0].n)+1;
          await db.$client.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[ctx.tenantId,p.outbox_action_id]);
          await db.$client.query("INSERT INTO app.action_attempt(id,tenant_id,action_id,attempt_number,outcome)VALUES($1,$2,$3,$4,'started')",[randomUUID(),ctx.tenantId,p.outbox_action_id,attempt]);
          execution={actionId:p.outbox_action_id,snapshot,jobId,attempt};eventKind='started';
        }
      }
      await this.event(db,ctx,actor,caseId,jobId,input.messageId,Number(p.message_revision)+1,input.commandId,requestHash,eventKind);
      await this.audit(db,actor,input.messageId,eventKind,input.commandId,requestHash);
    });
    // Deliberate post-commit adapter boundary. Only this closed deterministic fake is available.
    if(execution&&input.action==='advance')await this.finishFake(ctx,caseId,actor,input,execution);
    return this.read(ctx,caseId,actor);
  }

  private async finishFake(ctx:VerifiedTenantContext,caseId:string,actor:RecoveryMessageActor,input:Extract<RecoveryMessageCommand,{action:'advance'}>,execution:{actionId:string;snapshot:CanonicalRecoveryMessage;jobId:string;attempt:number}) {
    requireSyntheticEnvironment();
    const result=input.outcome; // No vendor transport, credentials, clock service or live adapter factory.
    await withTenant(this.pool,ctx,async db=>{
      await this.lock(db,ctx,caseId);
      await this.access(db,ctx,caseId,actor);
      const row=(await db.$client.query<any>("SELECT * FROM app.action_outbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[ctx.tenantId,execution.actionId])).rows[0];
      if(!row||row.status!=='executing')return;
      const authorized=await this.authorized(db,ctx,row.authorization_id,execution.snapshot);
      let currentMatches=false;try{currentMatches=(await this.current(db,ctx,caseId)).snapshot.contentHash===execution.snapshot.contentHash;}catch{currentMatches=false;}
      const status=!authorized||!currentMatches?'cancelled':result==='success'?'succeeded':result;
      if(status==='succeeded')await db.$client.query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,environment,real_external_actions)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo',0) ON CONFLICT(tenant_id,outbox_action_id) DO NOTHING`,[randomUUID(),ctx.tenantId,execution.jobId,caseId,input.messageId,execution.actionId,execution.snapshot.recipient,execution.snapshot.body,execution.snapshot.contentHash,execution.snapshot.attachmentHash]);
      await db.$client.query("UPDATE app.action_outbox SET status=$3,completed_at=CASE WHEN $3='succeeded' THEN clock_timestamp() END,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[ctx.tenantId,execution.actionId,status]);
      await db.$client.query("UPDATE app.action_attempt SET outcome=$4,provider_reference=$5,error_code=$6,finished_at=clock_timestamp() WHERE tenant_id=$1 AND action_id=$2 AND attempt_number=$3",[ctx.tenantId,execution.actionId,execution.attempt,status==='cancelled'?'failed':status,status==='succeeded'?`fake-recovery:${execution.actionId}`:null,status==='succeeded'?null:`FAKE_${status.toUpperCase()}`]);
      const revision=Number((await db.$client.query("SELECT max(revision) revision FROM app.recovery_message_event WHERE tenant_id=$1 AND message_id=$2",[ctx.tenantId,input.messageId])).rows[0].revision)+1;
      const completionId=randomUUID(),requestHash=hash({commandId:input.commandId,status});
      await this.event(db,ctx,actor,caseId,execution.jobId,input.messageId,revision,completionId,requestHash,status==='cancelled'?'blocked':status);
      await this.audit(db,actor,input.messageId,status,completionId,requestHash);
    });
  }

  private async current(db:TenantTransaction,ctx:VerifiedTenantContext,caseId:string) {
    const c=(await db.$client.query<any>(`SELECT c.*,q.claimed_net_pence,q.revision+(SELECT count(*) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id) case_revision,
     coalesce((SELECT sum(CASE event_type WHEN 'record_landing' THEN amount_pence WHEN 'reverse_landing' THEN -amount_pence WHEN 'write_off' THEN amount_pence ELSE 0 END) FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id),0) deductions
     FROM app.recovery_case c JOIN LATERAL(SELECT * FROM app.recovery_claim_revision q WHERE q.tenant_id=c.tenant_id AND q.case_id=c.id ORDER BY revision DESC LIMIT 1)q ON true WHERE c.tenant_id=$1 AND c.id=$2 AND c.synthetic=true AND c.environment='synthetic_demo'`,[ctx.tenantId,caseId])).rows[0];
    const p=(await db.$client.query<any>("SELECT * FROM app.evidence_pack_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision DESC LIMIT 1",[ctx.tenantId,caseId])).rows[0];
    if(!c||!p)throw new Error("RECOVERY_MESSAGE_SOURCES_REQUIRED");
    // Rebuild from current persisted sources. The stored bytes and both hashes must
    // match the repaired pack and its recorded attachment approval; a legacy flag
    // or a valid-looking manifest alone grants no authority.
    const sources = await loadEvidencePackSources(db,ctx.tenantId,caseId);
    const manifest = buildEvidenceManifest(caseId,c.job_id,sources.sources,sources.omissions);
    const artifact = renderStandalonePack(manifest,sources.sources);
    const approved = await db.$client.query("SELECT 1 FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND case_id=$2 AND pack_id=$3 AND manifest_hash=$4 AND content_hash=$5",[ctx.tenantId,caseId,p.pack_id,p.manifest_hash,p.content_hash]);
    if(sources.omissions.length || !p.artifact_text || !approved.rowCount ||
       !verifyStandalonePack(p.artifact_text).contentMatches ||
       canonicalManifest(manifest)!==p.canonical_manifest || manifestDigest(manifest)!==p.manifest_hash ||
       artifact!==p.artifact_text || sha256(p.artifact_text)!==p.content_hash) throw changed();
    return {packRevisionId:p.id,snapshot:buildCanonicalRecoveryMessage({caseId,jobId:c.job_id,caseType:c.case_type,caseRevision:Number(c.case_revision),amountPence:Number(c.claimed_net_pence)-Number(c.deductions),sourceRefs:c.source_refs,packId:p.pack_id,packRevision:Number(p.revision),manifestHash:p.manifest_hash,attachmentHash:p.content_hash})};
  }
  private async member(db:TenantTransaction,ctx:VerifiedTenantContext,membershipId:string) {
    const member=await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE",[ctx.tenantId,membershipId]);
    if(!member.rowCount)throw new Error("RECOVERY_MESSAGE_FORBIDDEN");
  }
  private async access(db:TenantTransaction,ctx:VerifiedTenantContext,caseId:string,actor:RecoveryMessageActor) {
    await this.member(db,ctx,actor.membershipId);
    const row=(await db.$client.query<{job_id:string}>("SELECT job_id FROM app.recovery_message_case_access WHERE tenant_id=$1 AND case_id=$2 AND session_id=$3 AND membership_id=$4",[ctx.tenantId,caseId,actor.sessionId,actor.membershipId])).rows[0];
    if(!row)throw new Error("RECOVERY_MESSAGE_FORBIDDEN");
    const archived=await db.$client.query("SELECT 1 FROM app.sandbox_run r JOIN app.sandbox_run_event e ON(e.tenant_id,e.run_id)=(r.tenant_id,r.id) WHERE r.tenant_id=$1 AND r.job_id=$2 AND e.kind='archived'",[ctx.tenantId,row.job_id]);
    if(archived.rowCount)throw new Error("RECOVERY_MESSAGE_FORBIDDEN");return row.job_id;
  }
  private async authorized(db:TenantTransaction,ctx:VerifiedTenantContext,id:string,snapshot:CanonicalRecoveryMessage) {
    return !!(await db.$client.query(`SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id) JOIN app.membership m ON(m.tenant_id,m.id)=(a.tenant_id,a.actor_membership_id) WHERE a.tenant_id=$1 AND a.id=$2 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND r.resolution='approved' AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND a.content_hash=$3 AND a.recipient=$4 AND a.amount_pence=$5 AND a.currency='GBP' AND a.policy_version=$6 AND a.aggregate_revision=$7 AND a.action_type=$8 FOR SHARE OF m`,[ctx.tenantId,id,snapshot.contentHash,snapshot.recipient,snapshot.amountPence,snapshot.policyVersion,snapshot.caseRevision,actionType])).rowCount;
  }
  private commandLock(db:TenantTransaction,ctx:VerifiedTenantContext,id:string){return db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[ctx.tenantId,`recovery-message-command:${id}`]);}
  private lock(db:TenantTransaction,ctx:VerifiedTenantContext,caseId:string){return db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[ctx.tenantId,caseId]);}
  private event(db:TenantTransaction,ctx:VerifiedTenantContext,actor:RecoveryMessageActor,caseId:string,jobId:string,messageId:string,revision:number,commandId:string,requestHash:string,kind:string){return db.$client.query("INSERT INTO app.recovery_message_event(id,tenant_id,job_id,case_id,message_id,revision,command_id,request_hash,kind,actor_membership_id,environment)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo')",[randomUUID(),ctx.tenantId,jobId,caseId,messageId,revision,commandId,requestHash,kind,actor.membershipId]);}
  private audit(db:TenantTransaction,actor:RecoveryMessageActor,messageId:string,event:string,commandId:string,requestHash:string){return appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:actor.actorRef,eventType:`recovery.message.${event}`,subjectType:"recovery_message",subjectRef:messageId,payload:{references:{commandId},hashes:{request:requestHash},classifications:{action:"commercial",environment:"operational"}}}]);}
}
