import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { deepgramTranscriptSourceV1, jobRecordProposalV1, type JobRecordProposal } from "@jobguard/core";
import { SpeechAudioError } from "./speech-audio.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export class CaptureConflictError extends Error { readonly code = "CAPTURE_ID_REUSED"; }
export type PersistCapture = { practiceSessionDigest?: string; captureId: string; text: string; sourceKind?: "text"|"browser_local_transcript"; acquisition?: Record<string,unknown>|null; proposal: JobRecordProposal; promptVersion: string; schemaVersion: string; model: string };

export class CaptureRepository {
  constructor(private readonly pool: Pool) {}
  async persist(context: VerifiedTenantContext, input: PersistCapture) {
    const proposal = jobRecordProposalV1.parse(input.proposal);
    const bytes = Buffer.from(input.text, "utf8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    validateProposalReferences(proposal, input.captureId, input.text);
    return withTenant(this.pool, context, async (db) => {
      if (input.practiceSessionDigest) {
        const auth = (await db.$client.query("SELECT * FROM app.authenticate_practice_session($1)", [input.practiceSessionDigest])).rows[0];
        if (!auth || auth.tenant_id !== context.tenantId) throw new Error("UNAUTHENTICATED");
      }
      // Serialize the tenant/capture identity before looking for a prior result, including
      // the absent-row case. This business lock precedes all inserts and any audit work.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1::uuid::text),hashtext('capture:' || $2::uuid::text))", [context.tenantId, input.captureId]);
      const existing = (await db.$client.query(`SELECT p.*,s.content_text,s.kind AS source_kind,
        s.acquisition_metadata IS NOT DISTINCT FROM $3::jsonb AS acquisition_matches,
        p.proposal = $4::jsonb AS proposal_matches
        FROM app.job_record_proposal p JOIN app.capture_source s ON (s.tenant_id,s.id)=(p.tenant_id,p.source_id)
        WHERE p.tenant_id=$1 AND p.capture_id=$2`, [context.tenantId,input.captureId,input.acquisition??null,proposal])).rows[0];
      if (existing) {
        if (input.practiceSessionDigest) {
          const owner = (await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 AND practice_session_digest=$3", [context.tenantId,existing.job_id,input.practiceSessionDigest])).rows[0];
          if (!owner) throw new Error("NOT_FOUND");
        }
        if (existing.source_sha256 !== hash || existing.content_text !== input.text ||
          existing.source_kind !== (input.sourceKind??"text") || !existing.acquisition_matches ||
          !existing.proposal_matches || existing.prompt_version !== input.promptVersion ||
          existing.schema_version !== input.schemaVersion || existing.model !== input.model) {
          throw new CaptureConflictError("A capture id cannot be reused for different source data");
        }
        return existing;
      }
      const jobId=randomUUID(), proposalId=randomUUID();
      await db.$client.query(`INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256,acquisition_metadata,audio_byte_length) VALUES($1,$2,$3,$4,$5,$6,$7,0)`,[input.captureId,context.tenantId,input.sourceKind??"text",bytes,input.text,hash,input.acquisition??null]);
      await db.$client.query(`INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,$3,$4,$5)`,[jobId,context.tenantId,proposal.title.value,input.practiceSessionDigest??null,input.practiceSessionDigest?"capture":null]);
      await db.$client.query(`INSERT INTO app.job_record_proposal(id,tenant_id,capture_id,job_id,source_id,source_version,source_sha256,prompt_version,schema_version,model,proposal) VALUES($1,$2,$3,$4,$3,1,$5,$6,$7,$8,$9)`,[proposalId,context.tenantId,input.captureId,jobId,hash,input.promptVersion,input.schemaVersion,input.model,proposal]);
      for (const [index,line] of proposal.lines.entries()) {
        const scopeId=randomUUID();
        await db.$client.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id) VALUES($1,$2,$3)`,[scopeId,context.tenantId,jobId]);
        await db.$client.query(`INSERT INTO app.proposal_line(id,tenant_id,job_id,scope_item_id,source_hash,source_reference,proposal_id,ordinal,proposed_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),context.tenantId,jobId,scopeId,hash,`${input.captureId}:v1`,proposalId,index+1,line]);
      }
      return { id:proposalId, capture_id:input.captureId, job_id:jobId, source_id:input.captureId, source_version:1, source_sha256:hash, proposal, content_text:input.text };
    });
  }

  /** Dark fixture intake keeps the evidence's existing job. It stores a labelled
   * source only, never a second job, canonical scope, approval or commercial fact. */
  async persistSpeechFixtureSource(context: VerifiedTenantContext, captureId: string, raw: unknown) {
    const source = deepgramTranscriptSourceV1.parse(raw);
    const a = source.acquisition;
    const bytes = Buffer.from(source.text, "utf8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    return withTenant(this.pool, context, async db => {
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1::uuid::text),hashtext('capture:' || $2::uuid::text))", [context.tenantId,captureId]);
      const evidence = (await db.$client.query(`SELECT e.id FROM app.evidence_object e
        JOIN app.evidence_upload u ON (u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
        WHERE e.tenant_id=$1 AND e.id=$2 AND e.job_id=$3 AND e.kind='original'
        AND e.evidence_type='synthetic_speech_audio' AND e.content_type='audio/wav'
        AND e.object_version_id=$4 AND e.sha256=$5 AND e.byte_length=$6
        AND u.state='verified' AND u.object_version_id=e.object_version_id`,
        [context.tenantId,a.evidenceId,a.evidenceJobId,a.objectVersionId,a.sourceSha256,a.audioByteLength])).rows[0];
      if (!evidence) throw new SpeechAudioError();
      const existing = (await db.$client.query(`SELECT kind,sha256,audio_byte_length,
        acquisition_metadata IS NOT DISTINCT FROM $3::jsonb AS acquisition_matches
        FROM app.capture_source WHERE tenant_id=$1 AND id=$2`,[context.tenantId,captureId,a])).rows[0];
      if (existing) {
        if (existing.kind !== source.kind || existing.sha256 !== hash || existing.audio_byte_length !== a.audioByteLength || !existing.acquisition_matches)
          throw new CaptureConflictError("A capture id cannot be reused for different source data");
      } else {
        await db.$client.query(`INSERT INTO app.capture_source
          (id,tenant_id,kind,content_bytes,content_text,sha256,acquisition_metadata,audio_byte_length)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[captureId,context.tenantId,source.kind,bytes,source.text,hash,a,a.audioByteLength]);
      }
      return { sourceId:captureId, jobId:a.evidenceJobId, source };
    });
  }

  async readByJob(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async (db) => {
      const proposal=(await db.$client.query(`SELECT p.id,p.job_id,p.capture_id,p.proposal,s.content_text,s.kind AS source_kind,s.acquisition_metadata,s.audio_byte_length,p.source_version,j.status FROM app.job_record_proposal p JOIN app.capture_source s ON (s.tenant_id,s.id)=(p.tenant_id,p.source_id) JOIN app.job j ON (j.tenant_id,j.id)=(p.tenant_id,p.job_id) WHERE p.tenant_id=$1 AND p.job_id=$2`,[context.tenantId,jobId])).rows[0];
      if(!proposal) return null;
      const lines=(await db.$client.query(`SELECT id,scope_item_id,proposed_data,source_reference FROM app.proposal_line WHERE tenant_id=$1 AND job_id=$2 AND proposal_id=$3 ORDER BY ordinal`,[context.tenantId,jobId,proposal.id])).rows;
      return {...proposal,lines};
    });
  }
}

function validateProposalReferences(value: unknown, sourceId: string, source: string): void {
  if (!value || typeof value !== "object") return;
  const record=value as Record<string,unknown>;
  if (record.kind === "extracted") {
    const span=record.span as {sourceId:string;sourceVersion:number;start:number;end:number};
    if (span.sourceId!==sourceId || span.sourceVersion!==1 || span.start<0 || span.start>=span.end || span.end>source.length) throw new Error("INVALID_SOURCE_REFERENCE");
  }
  for (const child of Object.values(record)) Array.isArray(child) ? child.forEach((item)=>validateProposalReferences(item,sourceId,source)) : validateProposalReferences(child,sourceId,source);
}
