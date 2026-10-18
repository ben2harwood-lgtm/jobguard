import { describe, expect, it } from "vitest";
import { getSubscriptionCatalogue } from "./subscription.js";
import { evaluatePlanEntitlement, planEntitlementCapacity, planEntitlementFeatures, requirePlanEntitlement } from "./plan-entitlements.js";

const small = (plan = "Solo") => ({ version: "plan-entitlement-facts.v1", track: "small_builder", plan, catalogueVersion: "subscription_pricing_policy_v4" });
const contractor = { version: "plan-entitlement-facts.v1", track: "contractor", agreementAuthority: "held" };
const gates = { version: "plan-entitlement-enablement.v1", environment: "synthetic_demo", enabled: [...planEntitlementFeatures] };
const shared = ["watchdog", "final_check", "invoices", "recovery_cases", "pay_now", "accounting_export"] as const;
const contractorOnly = ["operative_roles", "site_origin_capture", "approval_chains", "work_orders", "sso"] as const;

describe("MON-8 pure entitlements", () => {
  it("MON8-A01 Solo and Builder have identical feature decisions", () => {
    for (const enabled of [[], [...planEntitlementFeatures]]) for (const feature of planEntitlementFeatures) {
      expect(evaluatePlanEntitlement(small("Solo"), feature, { ...gates, enabled })).toEqual(evaluatePlanEntitlement(small("Builder"), feature, { ...gates, enabled }));
    }
    for (const feature of shared) expect(evaluatePlanEntitlement(small(), feature, gates)).toMatchObject({ entitlement: "included", executable: true, reason: "available" });
  });
  it("MON8-A02 capacity reuses MON-2A catalogue with proposed provenance, without calculating a charge", () => {
    for (const row of getSubscriptionCatalogue({ version: "subscription-catalogue-request.v1", policyVersion: "subscription_pricing_policy_v4" })) {
      expect(planEntitlementCapacity(small(row.plan))).toEqual({ version: "plan-entitlement-capacity.v1", plan: row.plan, catalogueVersion: row.policyVersion, catalogueStatus: row.status, included: row.included, extrasCap: row.extrasCap, maximumPence: row.maximumPence });
      expect(Object.isFrozen(planEntitlementCapacity(small(row.plan)))).toBe(true);
    }
    expect(planEntitlementCapacity(contractor)).toBeNull();
  });
  it("MON8-A05 unknown versions, withdrawn plans and malformed authority facts fail with typed errors", () => {
    for (const facts of [null, {}, { ...small(), version: "v2" }, small("Firm"), small("Contractor"), { ...small(), catalogueVersion: "v3" }, { ...small(), plan: undefined }, { ...contractor, agreementAuthority: "approved" }, { ...small(), track: "unknown" }]) {
      expect(() => evaluatePlanEntitlement(facts, "invoices", gates)).toThrowError("INVALID_ENTITLEMENT_INPUT");
    }
    expect(() => evaluatePlanEntitlement(small(), "expanded_billing", gates)).toThrowError("INVALID_ENTITLEMENT_INPUT");
  });
  it("MON8-A06 MON8-A07 small-builder operative and site-origin capabilities are excluded on both plans", () => {
    for (const plan of ["Solo", "Builder"]) for (const feature of contractorOnly) {
      expect(evaluatePlanEntitlement(small(plan), feature, gates)).toMatchObject({ entitlement: "excluded", executable: false, reason: "track_forbidden" });
      expect(() => requirePlanEntitlement(small(plan), feature, gates)).toThrowError("ENTITLEMENT_FORBIDDEN");
    }
  });
  it("MON8-A08 contractor capability authority remains held; a plan or synthetic reference cannot grant it", () => {
    for (const feature of planEntitlementFeatures) expect(evaluatePlanEntitlement(contractor, feature, gates)).toMatchObject({ executable: false });
    for (const feature of contractorOnly) expect(evaluatePlanEntitlement(contractor, feature, gates)).toMatchObject({ entitlement: "held", reason: "agreement_authority_held" });
    for (const field of ["plan", "agreementReference", "clientContract", "onboardingAnswer"]) expect(() => evaluatePlanEntitlement({ ...contractor, [field]: "Builder" }, "work_orders", gates)).toThrowError("INVALID_ENTITLEMENT_INPUT");
  });
  it("MON8-A09 synthetic configuration cannot enable a live capability", () => {
    for (const environment of ["production", "pilot_no_charge", "provider_sandbox"]) expect(() => evaluatePlanEntitlement(small(), "invoices", { ...gates, environment })).toThrowError("INVALID_ENTITLEMENT_INPUT");
  });
  it("MON8-A18 entitlement cannot enable an unfinished or gated feature", () => {
    for (const feature of shared) {
      expect(evaluatePlanEntitlement(small(), feature, { ...gates, enabled: [] })).toMatchObject({ entitlement: "included", executable: false, reason: "feature_disabled" });
      expect(() => requirePlanEntitlement(small(), feature, { ...gates, enabled: [] })).toThrowError("ENTITLEMENT_UNAVAILABLE");
    }
    expect(() => evaluatePlanEntitlement(small(), "invoices", { ...gates, enabled: ["invoices", "invoices"] })).toThrowError("INVALID_ENTITLEMENT_INPUT");
    expect(() => evaluatePlanEntitlement(small(), "invoices", { ...gates, enabled: ["expanded_billing"] })).toThrowError("INVALID_ENTITLEMENT_INPUT");
  });
  it("MON8-A17 MON8-A22 strict inputs exclude hidden facts and commercial writes; repeated decisions are immutable", () => {
    for (const field of ["hiddenSignals", "findings", "fee", "settled", "trial", "payment", "maximumPence", "role"]) expect(() => evaluatePlanEntitlement({ ...small(), [field]: true }, "invoices", gates)).toThrowError("INVALID_ENTITLEMENT_INPUT");
    const before = JSON.stringify({ facts: small(), gates });
    const first = requirePlanEntitlement(small(), "invoices", gates);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual(requirePlanEntitlement(small(), "invoices", gates));
    expect(JSON.stringify({ facts: small(), gates })).toBe(before);
  });
});
