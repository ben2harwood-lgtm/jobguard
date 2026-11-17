import { z } from "zod";
import type { Pool } from "pg";
import { groupShadowProposals, observationV1, shadowProposalV1, shadowCaptureV1, shadowDetectionId, type DetectionGroup } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
const batchV1 = z.object({ version: z.literal("shadow-detection-batch.v1"), jobId: z.string().uuid(),
  proposals: z.array(z.unknown()).max(1000), observations: z.array(z.unknown()).max(500), captures: z.array(z.unknown()).max(1000) }).strict();
export class ShadowDetectionError extends Error {
  constructor(readonly code: "INVALID_DETECTION_BATCH" | "DETECTION_BINDING_MISMATCH" | "DETECTION_REPLAY_CONFLICT") { super(code); }
}
/** Server-only; this pool's login holds jobguard_shadow only. No business-table reads. */
export class ShadowDetectionRepository {
  constructor(private readonly pool: Pool) {}
  async persist(context: VerifiedTenantContext, raw: unknown): Promise<readonly DetectionGroup[]> {
    const parsed = batchV1.safeParse(raw); if (!parsed.success) throw new ShadowDetectionError("INVALID_DETECTION_BATCH");
    const b = (()=>{try{return {...parsed.data,proposals:parsed.data.proposals.map(p=>shadowProposalV1.parse(p)),observations:parsed.data.observations.map(o=>observationV1.parse(o)),captures:parsed.data.captures.map(c=>shadowCaptureV1.parse(c))}}catch{throw new ShadowDetectionError("INVALID_DETECTION_BATCH")}})();
    if ([...b.proposals, ...b.observations, ...b.captures].some(o => o.tenantId !== context.tenantId || o.jobId !== b.jobId)) throw new ShadowDetectionError("DETECTION_BINDING_MISMATCH");
    const groups = groupShadowProposals(b.proposals, b.observations, b.captures);
    await withTenant(this.pool, context, async db => {
      // Serializes detection snapshots for this tenant/job, without any business-table privilege.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`shadow-detection:${context.tenantId}:${b.jobId}`]);
      for (const g of groups) {
        const candidates = [g.primary, ...g.duplicates];
        const existing = (await db.$client.query<{ id: string; state: string }>(
          "SELECT id,state FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND work_id=$3 AND coalesced_into_signal_id IS NULL ORDER BY id",
          [context.tenantId, b.jobId, g.primary.workId],
        )).rows;
        if (existing.length > 1) throw new ShadowDetectionError("DETECTION_REPLAY_CONFLICT");
        const primaryId = existing[0]?.id ?? g.primary.signalId;
        for (const s of candidates) {
          const inserted = await db.$client.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,estimated_value_pence,confidence_band,must_surface_now)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(tenant_id,id) DO NOTHING RETURNING id`,
          [s.tenantId,s.jobId,s.signalId,s.workId,s.signalType,s.detectorKind,s.detectorVersion,s.evidenceCutoffAt,s.description,s.estimatedValuePence,s.confidenceBand,g.firings.length>0]);
          if (!inserted.rowCount) {
            const prior = (await db.$client.query(`SELECT work_id,detector_kind,detector_version,description,estimated_value_pence,confidence_band FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3`, [context.tenantId,b.jobId,s.signalId])).rows[0];
            if (!prior || prior.work_id !== s.workId || prior.detector_kind !== s.detectorKind || prior.detector_version !== s.detectorVersion || prior.description !== s.description ||
              (prior.estimated_value_pence === null ? null : Number(prior.estimated_value_pence)) !== s.estimatedValuePence || prior.confidence_band !== s.confidenceBand)
              throw new ShadowDetectionError("DETECTION_REPLAY_CONFLICT");
          }
        }
        for (const s of candidates) for (const e of s.evidence) {
          for (const signalId of new Set([s.signalId, primaryId])) await db.$client.query(`INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [e.tenantId,e.jobId,signalId,e.evidenceId,e.objectVersionId,e.sha256,e.sourceReceivedAt]);
          for (const reason of s.ineligibility) await db.$client.query(`INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [s.tenantId,s.jobId,shadowDetectionId([s.signalId,reason.reason,reason.sourceRef]),s.signalId,reason.reason,reason.sourceRef]);
        }
        for (const s of candidates) {
          if (s.signalId === primaryId) {
            const reference = g.match.references[0]?.id ?? null;
            // A pre-lock match is an exclusion marker on the held proposal. Final-check transitions belong to SV-5.
            await db.$client.query(`UPDATE app.shadow_commercial_signal SET state='held_for_final_check',revision=revision+1,
              outcome=$4,matched_scope_item_id=$5,matched_variation_id=$6
              WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND state IN('candidate','held_for_final_check')
              AND (state<>'held_for_final_check' OR outcome IS DISTINCT FROM $4 OR matched_scope_item_id IS DISTINCT FROM $5 OR matched_variation_id IS DISTINCT FROM $6)`,
              [context.tenantId,b.jobId,s.signalId,g.match.outcome === "unmatched" ? null : g.match.outcome,
                g.match.outcome === "already_in_original_scope" ? reference : null,g.match.outcome === "builder_captured" ? reference : null]);
          } else await db.$client.query(`UPDATE app.shadow_commercial_signal SET state='reconciled',outcome='duplicate_signal',coalesced_into_signal_id=$4,revision=revision+1
            WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND state IN('candidate','held_for_final_check') AND coalesced_into_signal_id IS NULL`, [context.tenantId,b.jobId,s.signalId,primaryId]);
        }
      }
    });
    // Every firing is its own atomic controlled transaction; no business lock after an audit-head lock.
    for (const group of groups) await this.surface(context, group);
    return groups;
  }
  private async surface(context: VerifiedTenantContext, g: DetectionGroup): Promise<void> {
    for (const o of g.observations) {
      const firings = g.firings.filter(f => f.sourceRef === o.evidence.id);
      for (const f of firings) await withTenant(this.pool, context, async db => {
        const primary = (await db.$client.query<{ id: string }>("SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND work_id=$3 AND coalesced_into_signal_id IS NULL", [context.tenantId,o.jobId,g.primary.workId])).rows[0];
        if (!primary) throw new ShadowDetectionError("DETECTION_BINDING_MISMATCH");
        const firingId = shadowDetectionId([primary.id,f.rule,f.version,o.evidence.id]);
        await db.$client.query("SELECT app.surface_shadow_signal_early($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
          [context.tenantId,o.jobId,primary.id,firingId,shadowDetectionId([firingId,"decision"]),shadowDetectionId([firingId,"disclosure"]),f.rule,f.version,o.evidence.id,o.evidence.objectVersionId,JSON.stringify(o.facts)]);
      });
    }
  }
}
