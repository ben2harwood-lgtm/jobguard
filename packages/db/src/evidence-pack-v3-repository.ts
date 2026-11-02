import type { Pool } from "pg";
import { z } from "zod";
import { assembleEvidencePackV3, verifyStandalonePackV3, standaloneEvidencePackV3, renderStandalonePackV3 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const id = z.string().uuid().transform(v => v.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const generation = z.object({ version: z.literal("evidence-pack-command.v3"), commandId: id,
  format: z.literal("TEXT"), expectedVisibleSourceRevision: hash }).strict();
const approval = z.object({ version: z.literal("evidence-pack-attachment-approval.v3"), commandId: id,
  packId: id, expectedManifestHash: hash, expectedContentHash: hash }).strict();
const stored = z.object({ id, artifactText: z.string(), manifestHash: hash, contentHash: hash,
  createdAt: z.string(), attachmentApprovalRecorded: z.boolean() }).strict();
const view = z.object({ visibleSourceRevision: hash,
  requests: z.array(z.object({ commandId: id, finished: z.boolean() }).strict()), packs: z.array(stored) }).strict();

/** Runtime capability: no worker pool, shadow read, direct INSERT or supplied source payload. */
export class EvidencePackV3Repository {
  constructor(private readonly pool: Pool) {}
  async read(context: VerifiedTenantContext, caseId: string, digest: string) {
    const result = await withTenant(this.pool, context, async tx => view.parse((await tx.$client.query(
      "SELECT app.read_evidence_pack_v3($1,$2,$3) result", [context.tenantId, id.parse(caseId), hash.parse(digest)],
    )).rows[0]?.result));
    return { ...result, packs: result.packs.map(p => {
      const report = verifyStandalonePackV3(p.artifactText);
      const envelope = standaloneEvidencePackV3.parse(JSON.parse(p.artifactText));
      if (report.manifestHash !== p.manifestHash || report.artifactHash !== p.contentHash || !report.contentMatches) throw new Error("EVIDENCE_PACK_CONTENT_MISMATCH");
      return { ...p, ...report, manifest: envelope.manifest, sources: envelope.sources };
    }) };
  }
  async request(context: VerifiedTenantContext, caseId: string, digest: string, raw: unknown) {
    const command = z.discriminatedUnion("version", [generation, approval]).parse(raw);
    await withTenant(this.pool, context, async tx => {
      await tx.$client.query("SELECT app.request_evidence_pack_v3($1,$2,$3,$4::jsonb)",
        [context.tenantId, id.parse(caseId), hash.parse(digest), JSON.stringify(command)]);
    });
  }
  async download(context: VerifiedTenantContext, caseId: string, digest: string, packId: string) {
    const pack = (await this.read(context, caseId, digest)).packs.find(p => p.id === id.parse(packId));
    return pack?.artifactText;
  }
  async inspect(context: VerifiedTenantContext, caseId: string, digest: string, packId: string, scenario = "intact") {
    const text = await this.download(context, caseId, digest, packId);
    if (!text) return undefined;
    const envelope = standaloneEvidencePackV3.parse(JSON.parse(text));
    let sources = envelope.sources;
    if (scenario === "missing") sources = sources.slice(1);
    if (scenario === "tampered") sources = sources.map((s, i) => i ? s : { ...s, content: s.content + " changed" });
    if (scenario === "wrong-version") sources = sources.map((s, i) => i ? s : { ...s, sourceVersion: s.sourceVersion + "-wrong" });
    const artifactText = renderStandalonePackV3(envelope.manifest, sources);
    return { ...verifyStandalonePackV3(artifactText), artifactText };
  }
}

/** Worker-only database capability. finish SQL rechecks the inventory after all lock waits. */
export class EvidencePackV3WorkerRepository {
  constructor(private readonly pool: Pool) {}
  async prepare(context: VerifiedTenantContext, commandId: string) {
    return withTenant(this.pool, context, async tx => z.object({ command: z.record(z.string(), z.unknown()), visibleRevision: hash, material: z.unknown() }).strict().parse(
      (await tx.$client.query("SELECT app.prepare_evidence_pack_v3($1,$2) result", [context.tenantId, id.parse(commandId)])).rows[0]?.result));
  }
  async finish(context: VerifiedTenantContext, commandId: string, raw: unknown) {
    const pack = assembleEvidencePackV3(raw);
    await withTenant(this.pool, context, async tx => {
      await tx.$client.query("SELECT app.finish_evidence_pack_v3($1,$2,$3::jsonb,$4,$5)",
        [context.tenantId, id.parse(commandId), JSON.stringify(pack.material), pack.artifactText, pack.manifestHash]);
    });
  }
  async completeMustSurface(context: VerifiedTenantContext, commandId: string, visibleRevision: string) {
    await withTenant(this.pool, context, async tx => {
      await tx.$client.query("SELECT app.complete_evidence_pack_v3_check($1,$2,$3)", [context.tenantId, id.parse(commandId), hash.parse(visibleRevision)]);
    });
  }
}
