import { describe, expect, it } from "vitest";
import { enterprisePilotEvidenceV1, requireEnterpriseRealData, EnterpriseRealDataDeniedError } from "./enterprise-real-data.js";
import { requireApprovedDecision, PolicyGateDeniedError, type EnterpriseGate } from "./policy-gates.js";
const tenantId = "10000000-0000-4000-8000-000000000001";
const approval = { approvedBy: "fictional-founder", approvedAt: "2026-10-29T00:00:00Z", evidenceHash: "a".repeat(64) };
// All approval values below are fictional test DATA, never repository approval records.
const evidence = () => ({ version: "enterprise-pilot-evidence.v1", tenantId, agreementVersionId: tenantId, termsHash: "a".repeat(64),
  signedPilot: { termsHash: "a".repeat(64), agreementVersionId: tenantId, evidenceHash: "b".repeat(64) },
  signedDpaHash: "b".repeat(64), contractSetHash: "a".repeat(64), solicitorReview: approval, founderPilotApproval: approval,
  g1EvidenceHash: "c".repeat(64),
  d12: { id: "D12", policyVersion: "third_party_data_protection_policy_v4", status: "approved", approval },
  d16: { id: "D16", policyVersion: "enterprise_site_capture_policy_v1", status: "approved", approval },
});
describe("ENT-14 enterprise gate", () => {
  it.each(["enterprise_real_data", "enterprise_fee_posting", "enterprise_fee_collection", "enterprise_ai_prompts"] satisfies EnterpriseGate[])(
    "requires matching approved decisions in both live modes for %s", gate => {
      for (const mode of ["pilot_no_charge", "production_billing"] as const) {
        for (const status of ["proposed", "superseded"] as const)
          expect(() => requireApprovedDecision(mode, "D16", { id: "D16", policyVersion: "fixture", status }, gate)).toThrow(PolicyGateDeniedError);
        expect(() => requireApprovedDecision(mode, "D16", { id: "D12", policyVersion: "fixture", status: "approved" }, gate)).toThrow(PolicyGateDeniedError);
        expect(() => requireApprovedDecision(mode, "D16", { id: "D16", policyVersion: "fixture", status: "approved" }, gate)).not.toThrow();
      }
    });
  it("preserves existing no-charge small-builder and synthetic decision behavior", () => {
    const proposed = { id: "D04", policyVersion: "fixture", status: "proposed" } as const;
    expect(() => requireApprovedDecision("pilot_no_charge", "D04", proposed)).not.toThrow();
    expect(() => requireApprovedDecision("synthetic_demo", "D04", proposed, "enterprise_real_data")).not.toThrow();
  });
  it("binds fictional signature, review and dated founder evidence to exact versions", () => {
    expect(enterprisePilotEvidenceV1.safeParse(evidence()).success).toBe(true);
    const changed = evidence(); changed.termsHash = "d".repeat(64);
    expect(enterprisePilotEvidenceV1.safeParse(changed).success).toBe(false);
    const oldPolicy = evidence(); oldPolicy.d12.policyVersion = "third_party_data_protection_policy_v3";
    expect(enterprisePilotEvidenceV1.safeParse(oldPolicy).success).toBe(false);
    const oldVersion = evidence(); oldVersion.agreementVersionId = "10000000-0000-4000-8000-000000000002";
    expect(enterprisePilotEvidenceV1.safeParse(oldVersion).success).toBe(false);
  });
  it.each(["pilot_no_charge", "production_billing", "synthetic_demo", "provider_sandbox", "unknown"])(
    "keeps real data dark even with complete fictional evidence in %s", mode => {
      for (const input of [undefined, {}, evidence(), { ...evidence(), enabled: true }])
        expect(() => requireEnterpriseRealData(mode, tenantId, input)).toThrow(EnterpriseRealDataDeniedError);
      expect(() => requireEnterpriseRealData(mode, "10000000-0000-4000-8000-000000000002", evidence())).toThrow(EnterpriseRealDataDeniedError);
    });
  it("rejects missing or unapproved pilot evidence", () => {
    for (const key of Object.keys(evidence())) {
      const missing: Record<string, unknown> = evidence(); delete missing[key];
      expect(enterprisePilotEvidenceV1.safeParse(missing).success).toBe(false);
    }
    const proposed = evidence(); proposed.d16.status = "proposed";
    expect(enterprisePilotEvidenceV1.safeParse(proposed).success).toBe(false);
  });
});
