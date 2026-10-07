import { PracticeAccess } from "./practice-access.js";
import type { Pool } from "pg";
import { EvidencePackRepository, practiceMaterialPool } from "@jobguard/db";
import {
  evidencePackApprovalCommandV1, evidencePackCommandV1, evidencePackIdV1, evidencePackInspectionQueryV1} from "./evidence-pack.contracts.js";

export class EvidencePackApplication {
  private readonly repo: EvidencePackRepository;
  constructor(private readonly pool: Pool) { this.repo = new EvidencePackRepository(pool); }

  private async authorize(sessionId: string | undefined, caseId: string) {
    const auth = await new PracticeAccess(this.pool, sessionId).case(caseId);
    return {ctx:auth.context, actorRef:`membership:${auth.membershipId}`,digest:auth.digest};
  }

  async list(sessionId: string | undefined, caseId: string) {
    const { ctx } = await this.authorize(sessionId, caseId);
    return {
      version: "evidence-pack-response.v1" as const, environment: "synthetic_demo" as const,
      realExternalActions: 0 as const, claim: "mapped, inspectable" as const,
      packs: await this.repo.list(ctx, evidencePackIdV1.parse(caseId))};
  }

  async generate(sessionId: string | undefined, caseId: string, raw: unknown) {
    const { ctx, actorRef, digest } = await this.authorize(sessionId, caseId);
    const { version: _version, ...command } = evidencePackCommandV1.parse(raw);
    await new EvidencePackRepository(practiceMaterialPool(this.pool,digest)).generate(ctx, evidencePackIdV1.parse(caseId), command, actorRef);
    return this.list(sessionId, caseId);
  }

  async approveAttachment(sessionId: string | undefined, caseId: string, packId: string, raw: unknown) {
    const { ctx, actorRef } = await this.authorize(sessionId, caseId);
    const { version: _version, ...command } = evidencePackApprovalCommandV1.parse(raw);
    await this.repo.approveAttachment(ctx, evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId), command, actorRef);
    return this.list(sessionId, caseId);
  }

  async inspect(sessionId: string | undefined, caseId: string, packId: string, raw: unknown = {}) {
    const { ctx } = await this.authorize(sessionId, caseId);
    const { scenario } = evidencePackInspectionQueryV1.parse(raw);
    return {
      ...(await this.repo.inspect(ctx, evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId), scenario)),
      version: "evidence-pack-inspection.v1" as const, environment: "synthetic_demo" as const, scenario};
  }

  async download(sessionId: string | undefined, caseId: string, packId: string) {
    const { ctx } = await this.authorize(sessionId, caseId);
    return this.repo.download(ctx, evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId));
  }
}
