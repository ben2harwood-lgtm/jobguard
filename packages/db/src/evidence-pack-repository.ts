import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  buildEvidenceManifest, canonicalManifest, manifestDigest, parseStandalonePack,
  renderStandalonePack, sha256, verifyStandalonePack, type EvidenceSource,
} from '@jobguard/core';
import { appendAuditBatch } from './audit.js';
import { loadEvidencePackSources } from './evidence-pack-sources.js';
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from './tenant-context.js';

const generateInput = z.object({ commandId: z.string().uuid(), format: z.literal('TEXT').default('TEXT') }).strict();
const approvalInput = z.object({ commandId: z.string().uuid(), expectedManifestHash: z.string().regex(/^[a-f0-9]{64}$/), expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const scenarioInput = z.enum(['intact', 'missing', 'tampered', 'wrong-version', 'checkpoint']);
export type EvidencePackScenario = z.infer<typeof scenarioInput>;
export type EvidencePackView = {
  id: string; revision: number; caseId: string; jobId: string;
  manifest: ReturnType<typeof buildEvidenceManifest>; manifestHash: string; contentHash: string;
  format: 'TEXT'; sources: EvidenceSource[]; omissions: string[]; findings: string[];
  contentMatches: boolean; complete: boolean; attachmentApprovalValid: boolean;
  attachmentApprovalRecorded: boolean; createdAt: string;
};
type PackRow = {
  pack_id: string; revision: number; case_id: string; job_id: string; canonical_manifest: string;
  manifest_hash: string; content_hash: string; sources: EvidenceSource[]; source_omissions: string[];
  artifact_text: string | null; request_hash: string | null; subject_hash: string; created_at: Date;
};
export class EvidencePackError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'EvidencePackError'; }
}
function fail(code: string): never { throw new EvidencePackError(code); }
const actorSchema = z.string().min(1).max(200);

export class EvidencePackRepository {
  constructor(private readonly pool: Pool) {}

  private async lock(db: TenantTransaction, tenantId: string, caseId: string, commandId: string) {
    // Command identity is tenant-wide; take this before the case lock on every command.
    await db.$client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [tenantId, `pack-command:${commandId}`]);
    await db.$client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [tenantId, caseId]);
  }

  private async rows(db: TenantTransaction, tenantId: string, caseId: string) {
    return (await db.$client.query<PackRow>('SELECT * FROM app.evidence_pack_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision', [tenantId, caseId])).rows;
  }

  private async current(db: TenantTransaction, tenantId: string, caseId: string) {
    const { jobId, sources, omissions } = await loadEvidencePackSources(db, tenantId, caseId);
    const manifest = buildEvidenceManifest(caseId, jobId, sources, omissions);
    const artifact = renderStandalonePack(manifest, sources);
    return { jobId, sources, omissions, manifest, artifact, manifestHash: manifestDigest(manifest), contentHash: sha256(artifact) };
  }

  private integrity(row: PackRow) {
    let envelope: ReturnType<typeof parseStandalonePack> | undefined;
    try { if (row.artifact_text) envelope = parseStandalonePack(row.artifact_text); } catch { /* Incomplete legacy/corrupt artifact stays held. */ }
    const valid = !!envelope && !!row.artifact_text && sha256(row.artifact_text) === row.content_hash &&
      manifestDigest(envelope.manifest) === row.manifest_hash && canonicalManifest(envelope.manifest) === row.canonical_manifest &&
      canonicalManifest(buildEvidenceManifest(row.case_id, row.job_id, row.sources, row.source_omissions)) === row.canonical_manifest;
    return { envelope, valid };
  }

  async list(ctx: VerifiedTenantContext, caseId: string): Promise<EvidencePackView[]> {
    z.string().uuid().parse(caseId);
    return withTenant(this.pool, ctx, async db => {
      const rows = await this.rows(db, ctx.tenantId, caseId);
      if (!rows.length) return [];
      const approvals = (await db.$client.query<{ pack_id: string; manifest_hash: string; content_hash: string }>(
        'SELECT pack_id,manifest_hash,content_hash FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND case_id=$2', [ctx.tenantId, caseId],
      )).rows;
      // A changed source invalidates authority even before someone rebuilds the pack.
      let current: Awaited<ReturnType<EvidencePackRepository['current']>> | undefined;
      try { current = await this.current(db, ctx.tenantId, caseId); }
      catch (error) { if (!(error instanceof Error) || !error.message.startsWith('EVIDENCE_PACK_')) throw error; }
      return rows.map(row => {
        const integrity = this.integrity(row);
        const manifest = integrity.envelope?.manifest ?? JSON.parse(row.canonical_manifest) as EvidencePackView['manifest'];
        const sources = integrity.envelope?.sources ?? row.sources;
        const check = integrity.envelope ? verifyStandalonePack(row.artifact_text!) : { findings: ['Missing original source'], contentMatches: false, complete: false };
        const findings: string[] = [...check.findings];
        const digestsMatch = integrity.valid;
        if (!digestsMatch && !findings.includes('Content hash mismatch')) findings.push('Content hash mismatch');
        const approval = approvals.find(value => value.pack_id === row.pack_id && value.manifest_hash === row.manifest_hash && value.content_hash === row.content_hash);
        return {
          id: row.pack_id, revision: Number(row.revision), caseId: row.case_id, jobId: row.job_id,
          manifest, manifestHash: row.manifest_hash, contentHash: row.content_hash, format: 'TEXT' as const,
          sources, omissions: manifest.omissions ?? [], findings,
          contentMatches: digestsMatch && check.contentMatches, complete: digestsMatch && check.complete,
          attachmentApprovalRecorded: !!approval,
          attachmentApprovalValid: !!approval && current?.manifestHash === approval.manifest_hash && current?.contentHash === approval.content_hash && current.omissions.length === 0 && digestsMatch,
          createdAt: new Date(row.created_at).toISOString(),
        };
      });
    });
  }

  async generate(ctx: VerifiedTenantContext, caseId: string, raw: { commandId: string; format?: 'TEXT' }, actorRef: string) {
    z.string().uuid().parse(caseId); const input = generateInput.parse(raw); actorSchema.parse(actorRef);
    const requestHash = sha256(JSON.stringify({ action: 'generate', caseId, ...input, actorRef }));
    const packId = await withTenant(this.pool, ctx, async db => {
      await this.lock(db, ctx.tenantId, caseId, input.commandId);
      if ((await db.$client.query('SELECT 1 FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND command_id=$2', [ctx.tenantId, input.commandId])).rowCount) fail('EVIDENCE_PACK_COMMAND_CONFLICT');
      const replay = (await db.$client.query<PackRow>('SELECT * FROM app.evidence_pack_revision WHERE tenant_id=$1 AND command_id=$2', [ctx.tenantId, input.commandId])).rows[0];
      if (replay) {
        if (replay.request_hash !== requestHash) fail('EVIDENCE_PACK_COMMAND_CONFLICT');
        return replay.pack_id;
      }
      const current = await this.current(db, ctx.tenantId, caseId);
      const previous = (await this.rows(db, ctx.tenantId, caseId)).at(-1);
      const revision = Number(previous?.revision ?? 0) + 1, id = randomUUID();
      await db.$client.query('INSERT INTO app.evidence_pack(id,tenant_id,job_id,case_id) VALUES($1,$2,$3,$4)', [id, ctx.tenantId, current.jobId, caseId]);
      await db.$client.query(`INSERT INTO app.evidence_pack_revision
        (id,tenant_id,job_id,case_id,pack_id,revision,command_id,canonical_manifest,manifest_hash,content_hash,sources,format,actor_ref,subject_hash,previous_hash,artifact_text,request_hash,source_omissions)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'TEXT',$12,$13,$14,$15,$16,$17)`,
      [randomUUID(), ctx.tenantId, current.jobId, caseId, id, revision, input.commandId, canonicalManifest(current.manifest), current.manifestHash, current.contentHash, JSON.stringify(current.sources), actorRef, sha256(`${current.manifestHash}:${current.contentHash}`), previous?.subject_hash ?? null, current.artifact, requestHash, JSON.stringify(current.omissions)]);
      await appendAuditBatch(db, [{ id: randomUUID(), version: 'audit.v1', actorRef, eventType: 'evidence_pack.generated', subjectType: 'evidence_pack', subjectRef: id,
        payload: { references: { caseId, jobId: current.jobId, revision: String(revision) }, hashes: { manifest: current.manifestHash, content: current.contentHash }, classifications: { evidence: 'operational' } } }]);
      return id;
    });
    return (await this.list(ctx, caseId)).find(row => row.id === packId) ?? fail('EVIDENCE_PACK_NOT_FOUND');
  }

  async approveAttachment(ctx: VerifiedTenantContext, caseId: string, packId: string, raw: z.input<typeof approvalInput>, actorRef: string) {
    z.string().uuid().parse(caseId); z.string().uuid().parse(packId); actorSchema.parse(actorRef);
    const input = approvalInput.parse(raw), requestHash = sha256(JSON.stringify({ action: 'approve_attachment', caseId, packId, ...input, actorRef }));
    await withTenant(this.pool, ctx, async db => {
      await this.lock(db, ctx.tenantId, caseId, input.commandId);
      if ((await db.$client.query('SELECT 1 FROM app.evidence_pack_revision WHERE tenant_id=$1 AND command_id=$2', [ctx.tenantId, input.commandId])).rowCount) fail('EVIDENCE_PACK_COMMAND_CONFLICT');
      const replay = (await db.$client.query<{ request_hash: string }>('SELECT request_hash FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND command_id=$2', [ctx.tenantId, input.commandId])).rows[0];
      if (replay) { if (replay.request_hash !== requestHash) fail('EVIDENCE_PACK_COMMAND_CONFLICT'); return; }
      const pack = (await this.rows(db, ctx.tenantId, caseId)).find(row => row.pack_id === packId);
      if (!pack) fail('EVIDENCE_PACK_NOT_FOUND');
      const current = await this.current(db, ctx.tenantId, caseId);
      if (!pack.artifact_text || !this.integrity(pack).valid || current.omissions.length || !verifyStandalonePack(pack.artifact_text).contentMatches ||
          pack.manifest_hash !== input.expectedManifestHash || pack.content_hash !== input.expectedContentHash ||
          current.manifestHash !== pack.manifest_hash || current.contentHash !== pack.content_hash) fail('EVIDENCE_PACK_STALE_APPROVAL');
      await db.$client.query(`INSERT INTO app.evidence_pack_attachment_approval(id,tenant_id,job_id,case_id,pack_id,command_id,request_hash,manifest_hash,content_hash,actor_ref)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [randomUUID(), ctx.tenantId, pack.job_id, caseId, packId, input.commandId, requestHash, pack.manifest_hash, pack.content_hash, actorRef]);
      await appendAuditBatch(db, [{ id: randomUUID(), version: 'audit.v1', actorRef, eventType: 'evidence_pack.attachment_approved', subjectType: 'evidence_pack', subjectRef: packId,
        payload: { references: { caseId, jobId: pack.job_id }, hashes: { manifest: pack.manifest_hash, content: pack.content_hash }, classifications: { evidence: 'operational' } } }]);
    });
    return (await this.list(ctx, caseId)).find(row => row.id === packId) ?? fail('EVIDENCE_PACK_NOT_FOUND');
  }

  async download(ctx: VerifiedTenantContext, caseId: string, packId: string) {
    z.string().uuid().parse(caseId); z.string().uuid().parse(packId);
    return withTenant(this.pool, ctx, async db => {
      const pack = (await this.rows(db, ctx.tenantId, caseId)).find(row => row.pack_id === packId);
      if (!pack) return fail('EVIDENCE_PACK_NOT_FOUND');
      if (!pack.artifact_text) return fail('EVIDENCE_PACK_REBUILD_REQUIRED');
      if (!this.integrity(pack).valid) return fail('EVIDENCE_PACK_CONTENT_MISMATCH');
      return pack.artifact_text;
    });
  }

  async inspect(ctx: VerifiedTenantContext, caseId: string, packId: string, rawScenario: EvidencePackScenario = 'intact') {
    const scenario = scenarioInput.parse(rawScenario);
    const original = await this.download(ctx, caseId, packId);
    const envelope = parseStandalonePack(original);
    // Explicitly synthetic fault specimens. Stored source facts and packs are never mutated.
    let sources = envelope.sources;
    if (scenario === 'missing') sources = sources.slice(1);
    if (scenario === 'tampered') sources = sources.map((source, i) => i ? source : { ...source, content: `${source.content} changed` });
    if (scenario === 'wrong-version') sources = sources.map((source, i) => i ? source : { ...source, version: source.version + 1 });
    const artifactText = renderStandalonePack(envelope.manifest, sources);
    return { ...verifyStandalonePack(artifactText), artifactText, scenario, environment: 'synthetic_demo' as const };
  }
}
