import { describe, expect, it } from "vitest";
import { parseReleaseWithSecurityFindings, securityFindingsV1Schema } from "./release-inventory.js";

// Fictional format fixtures only; no real reviewer, approval or assessment.
const release = {
  version: "release-record.v1", id: "fixture:release", commit: "a".repeat(40),
  environment: "production_billing", phase: "bounded_smoke", track: "small-builder",
  tenantIds: ["11111111-1111-4111-8111-111111111111"], jurisdictions: ["fixture:jurisdiction"],
  enabledRailIds: ["success_fee_stripe"], policies: [],
  gates: [{ id: "G4-S", status: "approved", approver: "fixture:approver", approvedAt: "2026-10-30T12:00:00Z", evidence: "fixture:gate" }],
  consentEvidence: "fixture:consent", sandboxAcceptanceEvidence: "fixture:sandbox",
  rollbackDisablePlan: "fixture:disable", retroactivePilotBilling: false,
};
const finding = () => ({
  id: "fixture:finding", severity: "high", affected: { featureId: null, railIds: ["success_fee_stripe"] },
  ownerRole: "fixture:security-owner", remediationEvidence: [] as string[],
  retest: { result: "pending", evidence: [] as string[], reviewer: { kind: "agent", independent: false } },
  status: "open",
});
const register = (row: unknown = finding()) => ({ version: "security-findings.v1", findings: [row] });

describe("M5-12 findings release gate", () => {
  it.each(["high", "critical"])("blocks only the affected rail for %s severity", severity => {
    const row = { ...finding(), severity };
    expect(() => parseReleaseWithSecurityFindings(release, register(row))).toThrow(/fixture:finding blocks success_fee_stripe/u);
    expect(() => parseReleaseWithSecurityFindings({ ...release, enabledRailIds: ["subscription_stripe"] }, register(row))).not.toThrow();
  });

  it.each(["open", "in_remediation", "awaiting_retest"])("keeps %s high findings blocking, including feature findings", status => {
    const row = finding();
    row.status = status;
    const raw = { ...row, affected: { ...row.affected, featureId: "fixture:fee-feature" } };
    expect(() => parseReleaseWithSecurityFindings(release, register(raw))).toThrow(/Unresolved high-impact/u);
  });

  it("requires remediation and a passing evidenced retest to close", () => {
    const row = finding();
    row.status = "closed";
    expect(() => securityFindingsV1Schema.parse(register(row))).toThrow();
    row.remediationEvidence = ["fixture:fix"];
    expect(() => securityFindingsV1Schema.parse(register(row))).toThrow();
    row.retest.result = "passed";
    expect(() => securityFindingsV1Schema.parse(register(row))).toThrow();
    row.retest.evidence = ["fixture:retest"];
    expect(() => parseReleaseWithSecurityFindings(release, register(row))).not.toThrow();
    row.retest.result = "failed";
    expect(() => parseReleaseWithSecurityFindings(release, register(row))).toThrow();
  });

  it("cannot label an agent review independent or a human review by adding a field", () => {
    const row = finding();
    expect(() => securityFindingsV1Schema.parse(register({ ...row, retest: { ...row.retest, reviewer: { kind: "agent", independent: true } } }))).toThrow();
    expect(() => securityFindingsV1Schema.parse(register({ ...row, retest: { ...row.retest, reviewer: { ...row.retest.reviewer, human: true } } }))).toThrow();
    expect(() => securityFindingsV1Schema.parse(register({ ...row, retest: { ...row.retest, reviewer: { kind: "human", independent: true } } }))).not.toThrow();
  });

  it("accepts empty, low and medium registers without mutating input", () => {
    const before = structuredClone(release);
    for (const findings of [[], [{ ...finding(), severity: "low" }], [{ ...finding(), severity: "medium" }]]) {
      const raw = { version: "security-findings.v1", findings };
      const original = structuredClone(raw);
      expect(parseReleaseWithSecurityFindings(release, raw)).toEqual(before);
      expect(raw).toEqual(original);
    }
    expect(release).toEqual(before);
  });

  it("fails closed on malformed registers, duplicate IDs and unknown targets", () => {
    const row = finding();
    for (const raw of [undefined, {}, { ...register(), extra: true },
      { ...register(), findings: [row, row] }, register({ ...row, ownerRole: " " }),
      register({ ...row, affected: { featureId: null, railIds: [] } }),
      register({ ...row, affected: { featureId: null, railIds: ["toString"] } }),
      register({ ...row, status: "accepted_risk" }), register({ ...row, remediationEvidence: [" "] })]) {
      expect(() => parseReleaseWithSecurityFindings(release, raw)).toThrow();
    }
    expect(() => parseReleaseWithSecurityFindings({ ...release, extra: true }, { version: "security-findings.v1", findings: [] })).toThrow();
  });
});
