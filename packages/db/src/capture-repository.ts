import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { jobRecordProposalV1, type JobRecordProposal } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export class CaptureConflictError extends Error { readonly code = "CAPTURE_ID_REUSED"; }
export type PersistCapture = { captureId: string; text: string; proposal: JobRecordProposal; promptVersion: string; schemaVersion: string; model: string };

export class CaptureRepository {
  constructor(private readonly pool: Pool) {}
  async persist(context: VerifiedTenantContext, input: PersistCapture) {
    const proposal = jobRecordProposalV1.parse(input.proposal);
    const bytes = Buffer.from(input.text, "utf8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    validateProposalReferences(proposal, input.captureId, input.text);
    return withTenant(this.pool, context, async (db) => {
      const existing = (await db.$client.query(`SELECT p.*,s.content_text FROM app.job_record_proposal p JOIN app.capture_source s ON (s.tenant_id,s.id)=(p.tenant_id,p.source_id) WHERE p.tenant_id=$1 AND p.capture_id=$2`, [context.tenantId,input.captureId])).rows[0];
      if (existing) {
        if (existing.source_sha256 !== hash) throw new CaptureConflictError("A capture id cannot be reused for different source data");
        return existing;
      }
      const jobId=randomUUID(), proposalId=randomUUID();
      await db.$client.query(`INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256) VALUES($1,$2,'text',$3,$4,$5)`,[input.captureId,context.tenantId,bytes,input.text,hash]);
      await db.$client.query(`INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,$3)`,[jobId,context.tenantId,proposal.title.value]);
      await db.$client.query(`INSERT INTO app.job_record_proposal(id,tenant_id,capture_id,job_id,source_id,source_version,source_sha256,prompt_version,schema_version,model,proposal) VALUES($1,$2,$3,$4,$3,1,$5,$6,$7,$8,$9)`,[proposalId,context.tenantId,input.captureId,jobId,hash,input.promptVersion,input.schemaVersion,input.model,proposal]);
      for (const [index,line] of proposal.lines.entries()) {
        const scopeId=randomUUID();
        await db.$client.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id) VALUES($1,$2,$3)`,[scopeId,context.tenantId,jobId]);
        await db.$client.query(`INSERT INTO app.proposal_line(id,tenant_id,job_id,scope_item_id,source_hash,source_reference,proposal_id,ordinal,proposed_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),context.tenantId,jobId,scopeId,hash,`${input.captureId}:v1`,proposalId,index+1,line]);
      }
      return { id:proposalId, capture_id:input.captureId, job_id:jobId, source_id:input.captureId, source_version:1, source_sha256:hash, proposal, content_text:input.text };
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
