import { z } from "zod";
import type { Pool } from "pg";
import { observationV1, parseObservation, shadowCaptureV1, type Observation, type ShadowCapture } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
const readV1 = z.object({ version: z.literal("shadow-observation-read.v1"), jobId: z.string().uuid() }).strict();
export class ShadowObservationReadError extends Error {
  constructor(readonly code: "INVALID_OBSERVATION_READ" | "OBSERVATION_JOB_UNAVAILABLE" | "TERMS_RELATION_UNAVAILABLE" | "TERMS_NOT_ACCEPTED" | "SOURCE_NOT_FINALIZED" | "DETECTION_LOCKED_JOB") { super(code); }
}
/** Synthetic structured captions/facts only. Never read the separate evaluation labels. */
export interface ObservationSourcePort {
  decode(source: Readonly<{ tenantId:string;jobId:string;kind: Observation["kind"]; evidenceId: string; objectVersionId: string; sha256: string; text: string | null }>): Promise<Readonly<{ text: string; facts: Observation["facts"]; citations: Observation["citations"] }> | null>;
}
/** Fixture input is supplied explicitly by the worker composition, not read from a builder request. */
export class FixtureObservationSources implements ObservationSourcePort {
  private readonly observations: readonly Observation[];
  constructor(raw: readonly unknown[]) { this.observations = raw.map(parseObservation); }
  async decode(source: Parameters<ObservationSourcePort["decode"]>[0]) {
    const o = this.observations.find(o => o.tenantId===source.tenantId && o.jobId===source.jobId && o.kind === source.kind && o.evidence.id === source.evidenceId && o.evidence.objectVersionId === source.objectVersionId && o.evidence.sha256 === source.sha256);
    return o ? { text: o.text, facts: o.facts, citations: o.citations } : null;
  }
}
/** Ordinary runtime login + RLS only. This reader never issues a shadow statement. */
export class ShadowObservationReader {
  constructor(private readonly pool: Pool, private readonly sources: ObservationSourcePort) {}
  async assertTermsRelation(): Promise<void> {
    const exists = (await this.pool.query<{ available: boolean }>("SELECT to_regclass('app.final_check_terms_acceptance') IS NOT NULL AS available")).rows[0]?.available;
    if (!exists) throw new ShadowObservationReadError("TERMS_RELATION_UNAVAILABLE");
  }
  async hasAcceptedTerms(context: VerifiedTenantContext): Promise<boolean> {
    // SV-4 owns this append-only record. An absent relation is a startup error, never a permissive fallback.
    await this.assertTermsRelation();
    return withTenant(this.pool, context, async db => (await db.$client.query("SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=$1 LIMIT 1", [context.tenantId])).rowCount === 1);
  }
  async read(context: VerifiedTenantContext, raw: unknown): Promise<{ observations: readonly Observation[]; captures: readonly ShadowCapture[] }> {
    const parsed = readV1.safeParse(raw); if (!parsed.success) throw new ShadowObservationReadError("INVALID_OBSERVATION_READ");
    const jobId = parsed.data.jobId;
    return withTenant(this.pool, context, async db => {
      const job = (await db.$client.query<{ id: string }>("SELECT j.id FROM app.job j JOIN app.job_commercial_track t ON (t.tenant_id,t.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=$1 AND j.id=$2 AND j.status='live' AND j.provenance='system_generated_quote' AND t.job_track='small_builder' AND t.environment='synthetic_demo'", [context.tenantId,jobId])).rows[0];
      if (!job) throw new ShadowObservationReadError("OBSERVATION_JOB_UNAVAILABLE");
      const locksAvailable=(await db.$client.query<{available:boolean}>("SELECT to_regclass('app.final_account_lock') IS NOT NULL AS available")).rows[0]?.available;
      if(locksAvailable && (await db.$client.query("SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[context.tenantId,jobId])).rowCount)
        throw new ShadowObservationReadError("DETECTION_LOCKED_JOB");
      // Read all merged sources using qualified relationships. A source without an immutable finalized object stays unprocessed.
      const evidence = (await db.$client.query<{ id: string; object_version_id: string; sha256: string; received: string; evidence_type: string; text: string | null }>(`
        SELECT e.id,e.object_version_id,e.sha256,to_char(e.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') received,e.evidence_type,
          c.content_text AS text
        FROM app.evidence_object e
        LEFT JOIN app.capture_source c ON c.tenant_id=e.tenant_id AND c.sha256=e.sha256
          AND EXISTS(SELECT 1 FROM app.job_record_proposal p WHERE p.tenant_id=c.tenant_id AND p.job_id=e.job_id AND p.source_id=c.id)
        WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.kind='original' AND e.server_verified_at IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
        ORDER BY e.id`, [context.tenantId,jobId])).rows;
      const supplier = (await db.$client.query<{ content_hash: string }>(`SELECT DISTINCT v.content_hash FROM app.supplier_document_version v
        JOIN app.supplier_fact_proposal p ON (p.tenant_id,p.job_id,p.document_version_id)=(v.tenant_id,v.job_id,v.id)
        WHERE v.tenant_id=$1 AND v.job_id=$2`, [context.tenantId,jobId])).rows;
      // The merged order's authority hash is an approval-artifact hash, not evidence bytes.
      // Read the records, but hold the order adapter until it has an explicit immutable evidence binding.
      await db.$client.query("SELECT id,draft_id,authority_hash FROM app.purchase_order_revision WHERE tenant_id=$1 AND job_id=$2", [context.tenantId,jobId]);
      const observations: Observation[] = [];
      for (const e of evidence) {
        const kind = supplier.some(s => s.content_hash === e.sha256) ? "supplier_line"
          : ["completion_photo", "site_photo"].includes(e.evidence_type) ? "completion_photo"
          : e.text !== null ? "note_or_voice" : null;
        if (!kind) continue;
        const source = await this.sources.decode({ tenantId:context.tenantId,jobId,kind, evidenceId: e.id, objectVersionId: e.object_version_id, sha256: e.sha256, text: e.text });
        if (!source) continue;
        observations.push(observationV1.parse({ version: "observation.v1", tenantId: context.tenantId, jobId, kind,
          evidence: { id: e.id, objectVersionId: e.object_version_id, sha256: e.sha256, serverReceivedAt: e.received }, ...source, facts:{...source.facts,scopeArea:"job"} }));
      }
      // Scope area is not persisted in the merged source tables. The synthetic adapter uses the conservative job-wide area.
      const baseline = (await db.$client.query(`SELECT l.scope_item_id,l.scope_revision_id,l.description,
        to_char(q.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') recorded
        FROM app.job j JOIN app.quote_document_version q ON (q.tenant_id,q.job_id,q.id)=(j.tenant_id,j.id,j.baseline_quote_version_id)
        JOIN app.quote_line l ON (l.tenant_id,l.job_id,l.quote_revision_id)=(q.tenant_id,q.job_id,q.quote_revision_id)
        WHERE j.tenant_id=$1 AND j.id=$2 AND l.included=true`, [context.tenantId,jobId])).rows;
      const extras = (await db.$client.query(`SELECT v.id,v.scope_item_id,coalesce(v.current_revision_id,v.id) revision_id,v.description,
        CASE WHEN w.id IS NOT NULL THEN 'withdrawn' ELSE v.state END state,v.origin,
        to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') recorded
        FROM app.variation v LEFT JOIN app.variation_withdrawal w ON w.tenant_id=v.tenant_id AND w.variation_id=v.id
        WHERE v.tenant_id=$1 AND v.job_id=$2 AND v.origin IN('builder_logged','final_review')`, [context.tenantId,jobId])).rows;
      const captures = [...baseline.map(r => shadowCaptureV1.parse({ version: "shadow-capture.v1",tenantId:context.tenantId,jobId,id:r.scope_item_id,scopeItemId:r.scope_item_id,revisionId:r.scope_revision_id,
        serverRecordedAt:r.recorded,valuePence:null,kind:"baseline",state:null,scopeArea:"job",description:r.description,recordedPhase:"pre_lock",aiStructured:false,sourceRef:r.scope_item_id })),
        ...extras.map(r => shadowCaptureV1.parse({ version: "shadow-capture.v1",tenantId:context.tenantId,jobId,id:r.id,scopeItemId:r.scope_item_id,revisionId:r.revision_id,
          serverRecordedAt:r.recorded,valuePence:null,kind:r.origin === "final_review" ? "final_review" : "log_extra",state:r.origin === "final_review" ? null : r.state,scopeArea:"job",description:r.description,recordedPhase:"pre_lock",aiStructured:false,sourceRef:r.id }))];
      return { observations, captures };
    });
  }
}
