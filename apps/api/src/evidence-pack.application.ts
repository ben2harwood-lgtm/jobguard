import { PracticeAccess } from "./practice-access.js";
import type { Pool } from "pg";
import { EvidencePackRepository, EvidencePackV3Repository, practiceMaterialPool } from "@jobguard/db";
import {
  evidencePackAttachmentCommand, evidencePackGenerationCommand, evidencePackIdV1, evidencePackInspectionQueryV1} from "./evidence-pack.contracts.js";

export class EvidencePackApplication {
  constructor(private readonly pool: Pool) {}

  private async authorize(sessionId: string | undefined, caseId: string) {
    const auth = await new PracticeAccess(this.pool, sessionId).case(caseId);
    return {ctx:auth.context, digest:auth.digest, v3:new EvidencePackV3Repository(this.pool), actorRef:`membership:${auth.membershipId}`,
      repo:new EvidencePackRepository(practiceMaterialPool(this.pool,auth.digest))};
  }

  async list(sessionId: string | undefined, caseId: string) {
    const { ctx, repo } = await this.authorize(sessionId, caseId);
    return {
      version: "evidence-pack-response.v1" as const, environment: "synthetic_demo" as const,
      realExternalActions: 0 as const, claim: "mapped, inspectable" as const,
      packs: await repo.list(ctx, evidencePackIdV1.parse(caseId))};
  }

  async listV3(sessionId: string | undefined, caseId: string) {
    const { ctx, digest, v3 } = await this.authorize(sessionId, caseId);
    return { version: "evidence-pack-response.v3" as const, environment: "synthetic_demo" as const,
      realExternalActions: 0, ...(await v3.read(ctx, caseId, digest)) };
  }

  async generate(sessionId: string | undefined, caseId: string, raw: unknown) {
    const { ctx, actorRef, repo, v3, digest } = await this.authorize(sessionId, caseId);
    const parsed = evidencePackGenerationCommand.parse(raw);
    if (parsed.version === "evidence-pack-command.v3") {
      await v3.request(ctx, caseId, digest, parsed);
      return this.listV3(sessionId, caseId);
    }
    const { version: _version, ...command } = parsed;
    await repo.generate(ctx, evidencePackIdV1.parse(caseId), command, actorRef);
    return this.list(sessionId, caseId);
  }

  async approveAttachment(sessionId: string | undefined, caseId: string, packId: string, raw: unknown) {
    const { ctx, actorRef, repo, v3, digest } = await this.authorize(sessionId, caseId);
    const parsed = evidencePackAttachmentCommand.parse(raw);
    if (parsed.version === "evidence-pack-attachment-approval.v3") {
      await v3.request(ctx, caseId, digest, { ...parsed, packId: evidencePackIdV1.parse(packId).toLowerCase() });
      return this.listV3(sessionId, caseId);
    }
    const { version: _version, ...command } = parsed;
    await repo.approveAttachment(ctx, evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId), command, actorRef);
    return this.list(sessionId, caseId);
  }

  async inspect(sessionId: string | undefined, caseId: string, packId: string, raw: unknown = {}) {
    const { ctx, repo, v3, digest } = await this.authorize(sessionId, caseId);
    const { scenario } = evidencePackInspectionQueryV1.parse(raw);
    try {
      return {
      ...(await repo.inspect(ctx, evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId), scenario)),
      version: "evidence-pack-inspection.v1" as const, environment: "synthetic_demo" as const, scenario};
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "EVIDENCE_PACK_NOT_FOUND") throw error;
      const result = await v3.inspect(ctx, caseId, digest, packId, scenario);
      if (!result) throw error;
      return { ...result, version: "evidence-pack-inspection.v3" as const, environment: "synthetic_demo" as const, scenario };
    }
  }

  async download(sessionId: string | undefined, caseId: string, packId: string) {
    const { ctx, repo, v3, digest } = await this.authorize(sessionId, caseId);
    try { return await repo.download(ctx, evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId)); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "EVIDENCE_PACK_NOT_FOUND") throw error;
      const artifact = await v3.download(ctx, caseId, digest, packId);
      if (!artifact) throw error;
      return artifact;
    }
  }
}
