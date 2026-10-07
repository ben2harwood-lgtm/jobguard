import type { Pool } from "pg";
import {
  DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, EvidencePackRepository,
  verifiedTenantContextFromMembership, withTenant,
} from "@jobguard/db";
import {
  evidencePackApprovalCommandV1, evidencePackCommandV1, evidencePackIdV1, evidencePackInspectionQueryV1,
} from "./evidence-pack.contracts.js";

const context = () => verifiedTenantContextFromMembership({
  identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID,
} as Parameters<typeof verifiedTenantContextFromMembership>[0]);

export class EvidencePackApplication {
  private readonly repo: EvidencePackRepository;
  constructor(private readonly pool: Pool) { this.repo = new EvidencePackRepository(pool); }

  private async authorize(sessionId: string | undefined) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_MODE_REQUIRED");
    if (!evidencePackIdV1.safeParse(sessionId).success) throw new Error("UNAUTHENTICATED");
    const member = await withTenant(this.pool, context(), async db => (await db.$client.query<{ id: string }>(
      `SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3
       AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,
      [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID],
    )).rows[0]);
    if (!member) throw new Error("FORBIDDEN");
    return `membership:${member.id}`;
  }

  async list(sessionId: string | undefined, caseId: string) {
    await this.authorize(sessionId);
    return {
      version: "evidence-pack-response.v1" as const, environment: "synthetic_demo" as const,
      realExternalActions: 0 as const, claim: "mapped, inspectable" as const,
      packs: await this.repo.list(context(), evidencePackIdV1.parse(caseId)),
    };
  }

  async generate(sessionId: string | undefined, caseId: string, raw: unknown) {
    const actorRef = await this.authorize(sessionId);
    const { version: _version, ...command } = evidencePackCommandV1.parse(raw);
    await this.repo.generate(context(), evidencePackIdV1.parse(caseId), command, actorRef);
    return this.list(sessionId, caseId);
  }

  async approveAttachment(sessionId: string | undefined, caseId: string, packId: string, raw: unknown) {
    const actorRef = await this.authorize(sessionId);
    const { version: _version, ...command } = evidencePackApprovalCommandV1.parse(raw);
    await this.repo.approveAttachment(context(), evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId), command, actorRef);
    return this.list(sessionId, caseId);
  }

  async inspect(sessionId: string | undefined, caseId: string, packId: string, raw: unknown = {}) {
    await this.authorize(sessionId);
    const { scenario } = evidencePackInspectionQueryV1.parse(raw);
    return {
      ...(await this.repo.inspect(context(), evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId), scenario)),
      version: "evidence-pack-inspection.v1" as const, environment: "synthetic_demo" as const, scenario,
    };
  }

  async download(sessionId: string | undefined, caseId: string, packId: string) {
    await this.authorize(sessionId);
    return this.repo.download(context(), evidencePackIdV1.parse(caseId), evidencePackIdV1.parse(packId));
  }
}
