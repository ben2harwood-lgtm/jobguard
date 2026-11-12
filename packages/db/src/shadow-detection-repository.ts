import { z } from "zod";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { detectShadowObservations, groupShadowProposals, observationMustSurface, observationV1, reconcileFinalCheck, shadowProposalV1, shadowCaptureV1, shadowDetectionId, type DetectionGroup } from "@jobguard/core";
import { FinalCheckRepository, type FinalCheckManifest, type FinalCheckSourceResult } from "./final-check-repository.js";
import { decodePracticePhoto } from "./practice-photo-observation.js";
import { decodeFinalCheckSourceFixture } from "./job-source-fixtures.js";
import { readFinalCheckTypedText } from "./final-check-typed-text.js";
import { readPracticeStructuredSource } from "./final-check-practice-readers.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { finalCheckPersistenceErrorCodes, FinalCheckPersistenceError, type FinalCheckPersistenceErrorCode, type FinalCheckManifestView } from "./final-check-completion-repository.js";
const batchV1 = z.object({ version: z.literal("shadow-detection-batch.v1"), jobId: z.guid({ error: "Invalid uuid" }),
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
      // Persist every group before any firing acquires the audit head. The first
      // firing holds the job row until commit, fencing later same-job disclosure
      // and final-account locks; later firings reuse our already-held signal locks.
      for (const group of groups) await this.surface(db, context, group);
    }, "shadow-persist");
    return groups;
  }
  private async surface(db: TenantTransaction, context: VerifiedTenantContext, g: DetectionGroup): Promise<void> {
    for (const o of g.observations) {
      const firings = g.firings.filter(f => f.sourceRef === o.evidence.id);
      for (const f of firings) {
        const primary = (await db.$client.query<{ id: string }>("SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND work_id=$3 AND coalesced_into_signal_id IS NULL", [context.tenantId,o.jobId,g.primary.workId])).rows[0];
        if (!primary) throw new ShadowDetectionError("DETECTION_BINDING_MISMATCH");
        const firingId = shadowDetectionId([primary.id,f.rule,f.version,o.evidence.id]);
        await db.$client.query("SELECT app.surface_shadow_signal_early($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
          [context.tenantId,o.jobId,primary.id,firingId,shadowDetectionId([firingId,"decision"]),shadowDetectionId([firingId,"disclosure"]),f.rule,f.version,o.evidence.id,o.evidence.objectVersionId,JSON.stringify(o.facts)]);
      }
    }
  }
}

const uuid=z.string().uuid(), hash=z.string().regex(/^[a-f0-9]{64}$/u), policy=z.string().min(1).max(80);
const freezeInput=z.object({version:z.literal("final-check-manifest.v1"),jobId:uuid,manifestId:uuid,detectorVersion:policy,reconciliationVersion:policy}).strict();
const emptyInput=z.object({version:z.literal("final-check-empty-run.v1"),jobId:uuid,manifestId:uuid,runId:uuid,executionId:uuid}).strict();
const bindingInput=emptyInput.extend({version:z.literal("final-check-run.v1")}).strict();
const resultInput=z.object({version:z.literal("final-check-result-record.v1"),jobId:uuid,runId:uuid,resultId:uuid,signalId:uuid.nullable(),classificationId:uuid.nullable(),descriptor:z.union([z.object({version:z.literal("final-check-result.v1"),outcome:z.literal("zero_result")}).strict(),z.object({version:z.literal("final-check-result.v1"),signalId:uuid,classificationId:uuid,outcome:z.enum(["already_in_original_scope","builder_captured","already_on_final_account","duplicate_signal","not_enough_evidence","reveal"])}).strict()])}).strict();
const publicationInput=z.object({version:z.literal("final-check-publication.v1"),jobId:uuid,runId:uuid,checkId:uuid}).strict();
const attemptInput=z.object({version:z.literal("final-check-attempt.v1"),jobId:uuid,manifestId:uuid,sourceId:uuid,attemptId:uuid,executionId:uuid,stage:z.enum(["detection","reconciliation"]),processingVersion:policy,inputHash:hash,outcome:z.enum(["succeeded","failed","pending","invalidated"]),failureCode:z.string().min(1).max(80).nullable(),resultHash:hash.nullable(),resultSignalIds:z.array(uuid),evidenceId:uuid.nullable(),objectVersionId:z.string().min(1).max(1024).nullable(),sha256:hash.nullable(),sourceReceivedAt:z.string().datetime({offset:true}).nullable()}).strict();
const codes=new Set<string>(finalCheckPersistenceErrorCodes);
function typed(error:unknown):never { const message=(error as {message?:string}).message;if(message&&codes.has(message))throw new FinalCheckPersistenceError(message as FinalCheckPersistenceErrorCode);throw error; }
function parse<T>(schema:z.ZodType<T>,raw:unknown):T{const result=schema.safeParse(raw);if(!result.success)throw new FinalCheckPersistenceError("INVALID_FINAL_CHECK_INPUT");return result.data;}
/** Worker proof storage. Every invocation requires the existing stamped context; none is retained or reconstructed. */
export class FinalCheckCompletionRepository {
 constructor(private readonly pool:Pool){}
 async freeze(context:VerifiedTenantContext,raw:z.infer<typeof freezeInput>):Promise<FinalCheckManifestView>{
  const c=parse(freezeInput,raw);
  try{return await withTenant(this.pool,context,async db=>{
   const prior=(await db.$client.query("SELECT * FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[context.tenantId,c.jobId,c.manifestId])).rows[0];
   if(prior&&(prior.detector_version!==c.detectorVersion||prior.reconciliation_version!==c.reconciliationVersion))throw new FinalCheckPersistenceError("IDEMPOTENCY_PAYLOAD_CONFLICT");
   if(!prior)await db.$client.query(`INSERT INTO app.final_check_manifest(tenant_id,job_id,id,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5)`,[context.tenantId,c.jobId,c.manifestId,c.detectorVersion,c.reconciliationVersion]);
   const row=(await db.$client.query(`SELECT *,to_char(evidence_cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cutoff FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,c.jobId,c.manifestId])).rows[0];
   if(!row)throw new FinalCheckPersistenceError("FINAL_ACCOUNT_LOCK_REQUIRED");
   return {id:row.id,lockId:row.lock_id,cutoff:row.cutoff,sourceCount:row.source_count,inventoryHash:row.inventory_hash,detectorVersion:row.detector_version,reconciliationVersion:row.reconciliation_version};
  });}catch(error){return typed(error);}
 }
 async sources(context:VerifiedTenantContext,jobId:string,manifestId:string){
  parse(uuid,jobId);parse(uuid,manifestId);
  return withTenant(this.pool,context,async db=>(await db.$client.query(`SELECT id,upload_id,evidence_id,object_version_id,sha256,frozen_input_hash,adapter_version,to_char(source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') source_received_at FROM app.final_check_manifest_source WHERE tenant_id=$1 AND job_id=$2 AND manifest_id=$3 ORDER BY id`,[context.tenantId,jobId,manifestId])).rows);
 }
 async recordAttempt(context:VerifiedTenantContext,raw:z.infer<typeof attemptInput>){
  const c=parse(attemptInput,raw);
  try{await withTenant(this.pool,context,async db=>{await db.$client.query(`INSERT INTO app.shadow_final_check_source_attempt(tenant_id,job_id,manifest_id,source_id,id,execution_id,stage,version,input_hash,outcome,failure_code,result_hash,result_signal_ids,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::timestamptz)`,[context.tenantId,c.jobId,c.manifestId,c.sourceId,c.attemptId,c.executionId,c.stage,c.processingVersion,c.inputHash,c.outcome,c.failureCode,c.resultHash,c.resultSignalIds,c.evidenceId,c.objectVersionId,c.sha256,c.sourceReceivedAt]);});}catch(error){return typed(error);}
 }
 /** Explicit zero descriptor is allowed only for an independently server-inventoried empty manifest. */
 async bindEmptyRun(context:VerifiedTenantContext,raw:z.infer<typeof emptyInput>){
  const c=parse(emptyInput,raw);
  try{await withTenant(this.pool,context,async db=>{
   const m=(await db.$client.query("SELECT * FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[context.tenantId,c.jobId,c.manifestId])).rows[0];
   // C204: uploads excluded as rejected, quarantined or expired are recorded in the manifest but are not evidence; only the rest must be empty.
   const evidenceSources=m?Number((await db.$client.query("SELECT count(*)::int n FROM app.final_check_manifest_source WHERE tenant_id=$1 AND job_id=$2 AND manifest_id=$3 AND excluded_state IS NULL",[context.tenantId,c.jobId,c.manifestId])).rows[0].n):-1;
   if(!m||evidenceSources!==0)throw new FinalCheckPersistenceError("FINAL_CHECK_NOT_COMPLETE");
   const prior=(await db.$client.query("SELECT execution_id,manifest_id FROM app.shadow_final_check_run_binding WHERE tenant_id=$1 AND job_id=$2 AND run_id=$3",[context.tenantId,c.jobId,c.runId])).rows[0];
   if(prior){if(prior.execution_id!==c.executionId||prior.manifest_id!==c.manifestId)throw new FinalCheckPersistenceError("IDEMPOTENCY_PAYLOAD_CONFLICT");return;}
   await db.$client.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at,status) SELECT tenant_id,job_id,$4,reconciliation_version,evidence_cutoff_at,'completed' FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[context.tenantId,c.jobId,c.manifestId,c.runId]);
   await db.$client.query("INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,projection_version,result_descriptor) VALUES($1,$2,$3,$3,'final-check-result.v1',$4::jsonb)",[context.tenantId,c.jobId,c.runId,JSON.stringify({version:"final-check-result.v1",outcome:"zero_result"})]);
   await db.$client.query(`INSERT INTO app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) SELECT tenant_id,job_id,$4,id,lock_id,evidence_cutoff_at,$5,detector_version,reconciliation_version FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,c.jobId,c.manifestId,c.runId,c.executionId]);
  });}catch(error){return typed(error);}
 }
 /** Final-check orchestration supplies classifications first; this records only reconstructible result proof. */
 async recordResult(context:VerifiedTenantContext,raw:z.infer<typeof resultInput>){
  const c=parse(resultInput,raw);
  try{await withTenant(this.pool,context,async db=>{await db.$client.query("INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,signal_id,classification_id,projection_version,result_descriptor) VALUES($1,$2,$3,$4,$5,$6,'final-check-result.v1',$7::jsonb)",[context.tenantId,c.jobId,c.runId,c.resultId,c.signalId,c.classificationId,JSON.stringify(c.descriptor)]);});}catch(error){return typed(error);}
 }
 /** Bind an existing reconciliation run after source processing and result-proof persistence. */
 async bindRun(context:VerifiedTenantContext,raw:z.infer<typeof bindingInput>){
  const c=parse(bindingInput,raw);
  try{await withTenant(this.pool,context,async db=>{await db.$client.query(`INSERT INTO app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) SELECT tenant_id,job_id,$4,id,lock_id,evidence_cutoff_at,$5,detector_version,reconciliation_version FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,c.jobId,c.manifestId,c.runId,c.executionId]);});}catch(error){return typed(error);}
 }
 async publish(context:VerifiedTenantContext,raw:z.infer<typeof publicationInput>){
  const c=parse(publicationInput,raw);
  try{return await withTenant(this.pool,context,async db=>{
   // The certificate trigger rechecks qualified identity, stages, inventory and available results under locks.
   await db.$client.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,run_id,status) VALUES($1,$2,$4,$3,'completed')",[context.tenantId,c.jobId,c.runId,c.checkId]);
   return {checkId:c.checkId,runId:c.runId};
  });}catch(error){return typed(error);}
 }
}

/** SV-5 Q6 practice run (Ben, 28 Oct). Worker-only ports for FinalCheckWorker. Each frozen source is examined
 * honestly: verified diary/message originals through the bounded practice reader (runtime login), the
 * generated practice proof photo through a practice-only reader; verified readable typed text may yield
 * an examined zero. Other unsupported evidence never becomes a claimed zero result. Reconciliation is the same pure rule as the test harness. */
export function practiceFinalCheckPorts(shadowPool: Pool, runtimePool: Pool, practicePhotoSha256: string, drainagePhotoSha256?: string) {
  const repo = new FinalCheckRepository(shadowPool), sink = new ShadowDetectionRepository(shadowPool);
  const baselineCaptures = (context: VerifiedTenantContext, m: FinalCheckManifest) => m.comparisons.baseline.map(line => shadowCaptureV1.parse({ version: "shadow-capture.v1", tenantId: context.tenantId, jobId: m.comparisons.jobId, id: line.scope_item_id, scopeItemId: line.scope_item_id,
    revisionId: line.commercial_revision_id, serverRecordedAt: m.comparisons.baselineRecordedAt, valuePence: null, kind: "baseline", state: null, scopeArea: "job", description: line.description, recordedPhase: "pre_lock", aiStructured: false, sourceRef: String(line.id) }));
  async function sourceResult(context: VerifiedTenantContext, m: FinalCheckManifest, s: FinalCheckManifest["sources"][number]): Promise<FinalCheckSourceResult> {
    const signalIds = await withTenant(shadowPool, context, async db => (await db.$client.query<{ signal_id: string }>(`
      SELECT signal_id FROM app.shadow_signal_evidence
      WHERE tenant_id=$1 AND job_id=$2 AND evidence_id=$3 AND object_version_id=$4
        AND sha256=$5 AND source_received_at=$6::timestamptz
      ORDER BY signal_id`, [context.tenantId,m.comparisons.jobId,s.evidenceId,s.objectVersionId,s.sha256,s.receivedAt])).rows.map(row => row.signal_id));
    return { version: "final-check.source-result.v1", inputHash: s.inputHash, status: signalIds.length ? "detected" : "zero_result", failureCode: null, signalIds };
  }
  async function observe(context: VerifiedTenantContext, m: FinalCheckManifest, s: FinalCheckManifest["sources"][number]) {
    const base = { version: "observation.v1", tenantId: context.tenantId, jobId: m.comparisons.jobId,
      evidence: { id: s.evidenceId, objectVersionId: s.objectVersionId, sha256: s.sha256, serverReceivedAt: s.receivedAt } };
    const fixture = s.sha256 ? decodeFinalCheckSourceFixture(s.sourceKind,s.sha256) : null;
    if(fixture)return observationV1.parse({...base,kind:s.sourceKind==="completion_photo"?"completion_photo":"note_or_voice",...fixture});
    // The reviewed J3 drainage recipe uses the proof-stage certificate purpose.
    // Keep that exact hash/purpose pair; ordinary certificates are handled below.
    if (s.sourceKind !== "completion_photo" && !(s.sourceKind === "electrical_certificate" && drainagePhotoSha256 !== undefined && s.sha256 === drainagePhotoSha256)) return null;
    const photo = s.sha256 ? decodePracticePhoto(s.sha256, practicePhotoSha256, drainagePhotoSha256) : null;
    if (photo) return observationV1.parse({ ...base, kind: "completion_photo", ...photo });
    return null;
  }
  return {
    read: (context: VerifiedTenantContext, task: { jobId: string; manifestId: string }) => repo.manifest(context, task.jobId, task.manifestId),
    async process(context: VerifiedTenantContext, m: FinalCheckManifest, s: FinalCheckManifest["sources"][number]): Promise<FinalCheckSourceResult> {
      const structured = s.evidenceId === null && s.processable &&
        ["unlinked_supplier_version", "unlinked_supplier_document", "unlinked_purchase_order"].includes(s.sourceKind);
      const decoded = structured ? await readPracticeStructuredSource(runtimePool, context, m, s) : null;
      // Preserve the structured reader's typed refusal (including a changed
      // commercial track). A successful read still requires every frozen check
      // below; no authorization or other exception is caught or converted.
      if (structured && !decoded) return { version: "final-check.source-result.v1", inputHash: s.inputHash,
        status: "unsupported", failureCode: "UNSUPPORTED_SOURCE", signalIds: [] };
      {
        const frozenManifest = await repo.manifest(context, m.comparisons.jobId, m.id);
        const frozen = frozenManifest.sources.find(source => source.id === s.id);
        const { status: _status, ...binding } = s;
        const { status: _frozenStatus, ...frozenBinding } = frozen ?? s;
        if (!frozen || frozenManifest.hash !== m.hash || frozenManifest.cutoff !== m.cutoff || frozenManifest.lockId !== m.lockId ||
          frozenManifest.detectorVersion !== m.detectorVersion || frozenManifest.policyVersion !== m.policyVersion ||
          frozenManifest.comparisons.tenantId !== context.tenantId || JSON.stringify(frozenManifest.comparisons) !== JSON.stringify(m.comparisons) ||
          JSON.stringify(binding) !== JSON.stringify(frozenBinding))
          return { version: "final-check.source-result.v1", inputHash: s.inputHash, status: "unsupported", failureCode: "SOURCE_INVALID", signalIds: [] };
      }
      if (structured) {
        return { version: "final-check.source-result.v1", inputHash: s.inputHash,
          status: "zero_result", failureCode: null, signalIds: [] };
      }
      // The generated proof PNG is also used for certificates. Purpose comes
      // from the frozen verified evidence, never from a filename or hash alone.
      // The checked manifest above also admits company-owned synthetic jobs,
      // which have no practice digest. Authenticate it when one is present;
      // the same runtime/RLS source read and frozen binding apply to both paths.
      let includedCertificate;
      if (["completion_photo", "electrical_certificate"].includes(s.sourceKind)) {
        const verified = s.processable ? await withTenant(runtimePool, context, async db => (await db.$client.query<{ legacy_photo: boolean }>(`
          SELECT CASE WHEN j.practice_session_digest IS NOT NULL
            THEN NOT app.is_blank_practice_company(j.practice_session_digest::text)
            ELSE false END AS legacy_photo
          FROM app.evidence_object e
          JOIN app.evidence_upload u ON (u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
          JOIN app.job j ON (j.tenant_id,j.id)=(e.tenant_id,e.job_id)
          JOIN app.job_commercial_track tr ON (tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
          WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.id=$3 AND e.id=$4
            AND e.evidence_type=$5 AND e.object_version_id=$6 AND e.sha256=$7
            AND e.server_received_at=$8::timestamptz AND e.server_received_at<=$9::timestamptz
            AND to_jsonb(e)=$10::jsonb AND e.kind='original' AND e.server_verified_at IS NOT NULL
            AND u.state='verified' AND u.server_verified_at IS NOT NULL
            AND u.object_version_id=e.object_version_id AND u.expected_sha256=e.sha256
            AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
            AND current_database()='jobguard_synthetic_demo' AND tr.job_track='small_builder' AND tr.environment='synthetic_demo'
            AND j.provenance<>'imported'
            AND (j.practice_session_digest IS NULL OR EXISTS(
              SELECT 1 FROM app.authenticate_practice_session(j.practice_session_digest::text,j.tenant_id)))`,
        [context.tenantId,m.comparisons.jobId,s.evidenceId,s.sourceRef,s.sourceKind,s.objectVersionId,s.sha256,s.receivedAt,m.cutoff,JSON.stringify(s.input)])).rows[0]) : undefined;
        if (!verified) return { version: "final-check.source-result.v1", inputHash: s.inputHash, status: "unsupported", failureCode: "SOURCE_INVALID", signalIds: [] };
        if (s.sourceKind === "electrical_certificate" && (drainagePhotoSha256 === undefined || s.sha256 !== drainagePhotoSha256)) {
          if (s.sha256 !== practicePhotoSha256) return { version: "final-check.source-result.v1", inputHash: s.inputHash, status: "unsupported", failureCode: "UNSUPPORTED_SOURCE", signalIds: [] };
          const existing = await sourceResult(context, m, s);
          // Existing detections remain bound for every admitted source. Only a
          // verified non-blank practice session can select the legacy demo photo.
          if (existing.signalIds.length || verified.legacy_photo !== true) return existing;
          const photo = decodePracticePhoto(s.sha256, practicePhotoSha256)!;
          // Retain only the historical already-included proof recipe. A generic
          // certificate cannot create an extra merely because its PNG is shared.
          const inclusion = reconcileFinalCheck({ tenantId: context.tenantId, jobId: m.comparisons.jobId, signalId: s.id,
            description: photo.facts.description, scopeArea: "job", scopeItemId: null, coalescedIntoSignalId: null,
            hasEvidence: true, permanentExclusion: false }, { ...m.comparisons, captures: baselineCaptures(context, m) });
          if (inclusion.outcome !== "already_in_original_scope") return existing;
          includedCertificate = observationV1.parse({ version: "observation.v1", tenantId: context.tenantId, jobId: m.comparisons.jobId,
            kind: "completion_photo", ...photo, evidence: { id: s.evidenceId, objectVersionId: s.objectVersionId, sha256: s.sha256, serverReceivedAt: s.receivedAt } });
        }
      }
      let observation;
      if (s.sourceKind === "job_diary_text" || s.sourceKind === "customer_message_text") {
        const read = await readFinalCheckTypedText(runtimePool, context, m, s);
        if (read.status !== "proposal") return { version: "final-check.source-result.v1", inputHash: s.inputHash,
          status: read.status === "readable" ? "zero_result" : "unsupported", failureCode: read.status === "readable" ? null : "SOURCE_INVALID", signalIds: [] };
        observation = observationV1.parse({ version: "observation.v1", tenantId: context.tenantId, jobId: m.comparisons.jobId,
          kind: s.sourceKind === "job_diary_text" ? "note_or_voice" : "customer_request", ...read.proposal,
          evidence: { id: s.evidenceId, objectVersionId: s.objectVersionId, sha256: s.sha256, serverReceivedAt: s.receivedAt } });
      } else observation = includedCertificate ?? (s.processable ? await observe(context, m, s) : null);
      if (!observation || observationMustSurface(observation).firedRules.length)
        return { version: "final-check.source-result.v1", inputHash: s.inputHash, status: "unsupported", failureCode: s.processable ? "UNSUPPORTED_SOURCE" : "SOURCE_INVALID", signalIds: [] };
      const captures = m.comparisons.captures.map(c => shadowCaptureV1.parse(c));
      let observations = [observation];
      let ambiguousPrice = false;
      if (["job_diary_text", "customer_message_text"].includes(s.sourceKind)) {
        observations = [];
        // Re-read only frozen, verified originals. No amount or pronoun crosses
        // notes in the reader; here one work identity reconciles source estimates.
        for (const source of [...m.sources].sort((a,b) => a.id.localeCompare(b.id))) {
          if (!["job_diary_text", "customer_message_text"].includes(source.sourceKind)) continue;
          const read = await readFinalCheckTypedText(runtimePool, context, m, source);
          if (read.status !== "proposal" || read.proposal.facts.workReference !== observation.facts.workReference) continue;
          const candidate = observationV1.parse({ version: "observation.v1", tenantId: context.tenantId, jobId: m.comparisons.jobId,
            kind: source.sourceKind === "job_diary_text" ? "note_or_voice" : "customer_request", ...read.proposal,
            evidence: { id: source.evidenceId, objectVersionId: source.objectVersionId, sha256: source.sha256, serverReceivedAt: source.receivedAt } });
          if (observationMustSurface(candidate).firedRules.length) continue;
          ambiguousPrice ||= read.ambiguousPrice === true;
          observations.push(candidate);
        }
      }
      let proposals = detectShadowObservations(observations, captures, new Date().toISOString());
      if (["job_diary_text", "customer_message_text"].includes(s.sourceKind)) {
        const values = new Set(observations.flatMap(o => o.facts.estimatedValuePence === null ? [] : [o.facts.estimatedValuePence]));
        const estimate = !ambiguousPrice && values.size === 1 ? [...values][0]! : null;
        // Immutable existing provenance wins on retry/upgrade. Only new rows get
        // the reconciled estimate; no retrofitting historical signal amounts.
        const prior = await withTenant(shadowPool, context, async db => (await db.$client.query<{id:string;estimated_value_pence:string|null}>(
          "SELECT id,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=ANY($3::uuid[])",
          [context.tenantId,m.comparisons.jobId,proposals.map(p=>p.signalId)])).rows);
        proposals = proposals.map(p => {
          const existing = prior.find(row=>row.id===p.signalId);
          return { ...p, estimatedValuePence: existing ? existing.estimated_value_pence === null ? null : Number(existing.estimated_value_pence) : estimate };
        });
      }
      await sink.persist(context, { version: "shadow-detection-batch.v1", jobId: m.comparisons.jobId, observations, captures, proposals });
      return sourceResult(context, m, s);
    },
    record: (context: VerifiedTenantContext, m: FinalCheckManifest, s: FinalCheckManifest["sources"][number], result: FinalCheckSourceResult) => repo.record(context, m.comparisons.jobId, m.id, s.id, randomUUID(), result),
    async reconcile(context: VerifiedTenantContext, m: FinalCheckManifest) {
      if (m.result) return { runId: m.result.runId, lockId: m.result.lockId, zeroResult: m.result.zeroResult };
      const baseline = baselineCaptures(context, m);
      const locked = { ...m.comparisons, captures: [...m.comparisons.captures, ...baseline] };
      const classifications = m.signals.map(s => {
        const result = reconcileFinalCheck({ tenantId: context.tenantId, jobId: m.comparisons.jobId, signalId: s.signalId, description: s.description, scopeArea: "job", scopeItemId: s.scopeItemId,
          coalescedIntoSignalId: s.coalescedIntoSignalId, hasEvidence: s.evidenceIds.length > 0, permanentExclusion: s.permanentExclusion }, locked);
        return { signalId: s.signalId, expectedRevision: s.revision, ...result, comparisons: { ...result.comparisons, captureIds: m.comparisons.captures.map(c => shadowCaptureV1.parse(c).id) } };
      });
      return repo.reconcile(context, m.comparisons.jobId, m.id, classifications);
    },
  };
}
