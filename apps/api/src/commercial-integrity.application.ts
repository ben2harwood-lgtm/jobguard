import type { Pool } from "pg";
import { CommercialIntegrityApplicationRepository } from "@jobguard/db";
import { COMMERCIAL_INTEGRITY_DEMO_PROFILE, assertCommercialIntegrityEnvironment, evaluateCommercialIntegrity,
  type CommercialIntegrityFindingKind } from "@jobguard/core";
import { PracticeAccess } from "./practice-access.js";
import { integrityReviewV1 } from "./commercial-integrity.contracts.js";
export const SCENARIO_NOW = Date.parse("2026-04-09T10:00:00.000Z");
// Stable public keys survive a change in which other advisory checks apply.
const findingOrdinal: Record<CommercialIntegrityFindingKind, number> = {
  won_never_switched_live: 0, accepted_value_variance: 1, live_job_activity_gap: 2, recovery_settled_outside_app: 3,
};
export class CommercialIntegrityApplication {
  private readonly access: PracticeAccess;
  private readonly repository: CommercialIntegrityApplicationRepository;
  constructor(pool: Pool, sessionId?: string, private readonly environment = process.env.JOBGUARD_ENV ?? "production") {
    this.access = new PracticeAccess(pool, sessionId);
    this.repository = new CommercialIntegrityApplicationRepository(pool);
  }
  async view(jobId: string) {
    assertCommercialIntegrityEnvironment(this.environment);
    const practice = await this.access.job(jobId);
    const saved = await this.repository.read(practice.context, jobId);
    const result = evaluateCommercialIntegrity(saved.facts, COMMERCIAL_INTEGRITY_DEMO_PROFILE, SCENARIO_NOW);
    return {
      version: "commercial-integrity-view.v1", environment: "synthetic_demo",
      decisionRecord: { id: "D11", status: "proposed", href: "docs/decisions/d11-commercial-integrity-anti-gaming.md", approvalEvidence: null },
      profile: { ...COMMERCIAL_INTEGRITY_DEMO_PROFILE, label: "Example thresholds — not a judgement or billing rule" },
      evaluatedAt: new Date(SCENARIO_NOW).toISOString(), acceptedCapPence: saved.acceptedCapPence, capBasisPence: saved.capBasisPence,
      findings: result.findings.map(finding => {
        const key = `${finding.kind}:${findingOrdinal[finding.kind]}`;
        return { ...finding, key, dismissed: saved.feedback.some(x => x.findingKey === key) };
      }), feedback: saved.feedback,
    };
  }
  async review(jobId: string, raw: unknown) {
    assertCommercialIntegrityEnvironment(this.environment);
    const practice = await this.access.job(jobId), input = integrityReviewV1.parse(raw);
    await this.repository.review(practice.context, practice.membershipId, jobId, input, practice.digest);
    return this.view(jobId);
  }
}
