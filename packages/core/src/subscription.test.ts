import { describe, expect, it } from "vitest";
import { getSubscriptionCatalogue, selectSubscriptionTerms, subscriptionCatalogueRowV1, subscriptionPlanChangeSelectionV1, SubscriptionError } from "./subscription.js";

const request = { version: "subscription-catalogue-request.v1", policyVersion: "subscription_pricing_policy_v4" };
const selection = { version: "subscription-terms-selection.v1", catalogueVersion: request.policyVersion, plan: "Solo", expectedRevision: 0, termsVersion: "synthetic-terms.v1" };
describe("MON-2A reference contracts", () => {
  it("M2A-01 contains only the exact proposed Solo and Builder v4 catalogue", () => {
    expect(getSubscriptionCatalogue(request)).toEqual([
      { schemaVersion: 1, policyVersion: request.policyVersion, status: "proposed", currency: "GBP", plan: "Solo", monthlyPence: 2900, annualPence: 29000, included: 4, extraPlacePence: 2000, extrasCap: 1, maximumPence: 4900 },
      { schemaVersion: 1, policyVersion: request.policyVersion, status: "proposed", currency: "GBP", plan: "Builder", monthlyPence: 6900, annualPence: 69000, included: 7, extraPlacePence: 2000, extrasCap: 5, maximumPence: 16900 },
    ]);
    expect(Object.isFrozen(getSubscriptionCatalogue(request)[0])).toBe(true);
  });
  it("M2A-01 refuses invalid catalogue versions, plans, values and overrides", () => {
    for (const input of [{ ...request, policyVersion: "v5" }, { ...request, monthlyPence: 1 }, { ...request, plan: "Firm" }, null]) {
      expect(() => getSubscriptionCatalogue(input)).toThrow(SubscriptionError);
    }
    const row = getSubscriptionCatalogue(request)[0]!;
    for (const change of [{ plan: "Contractor" }, { monthlyPence: 1 }, { annualPence: 2900 }, { maximumPence: 9999 }, { included: 5 }, { currency: "EUR" }, { status: "approved" }, { schemaVersion: 2 }]) {
      expect(subscriptionCatalogueRowV1.safeParse({ ...row, ...change }).success).toBe(false);
    }
  });
  it("M2A-09 validates only settled terms selection without accepting an agreement or authority fields", () => {
    expect(selectSubscriptionTerms(selection)).toMatchObject({ plan: "Solo", cadence: "monthly", expectedRevision: 0 });
    for (const change of [{ plan: "Firm" }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { termsVersion: "" }, { version: "v2" }, { catalogueVersion: "v3" }, { tenantId: "fictional" }, { actorId: "fictional" }, { role: "owner" }, { maximumPence: 1 }, { price: 1 }, { acceptedAt: "2026-10-01" }, { anchor: 31 }, { approved: true }]) {
      expect(() => selectSubscriptionTerms({ ...selection, ...change })).toThrow(SubscriptionError);
    }
  });
  it("M2A-09 validates settled change selection without effective dates or authority", () => {
    const change = { version: "subscription-plan-change-selection.v1", catalogueVersion: request.policyVersion, fromPlan: "Solo", toPlan: "Builder", expectedRevision: 1, termsVersion: "synthetic-terms.v1" };
    expect(subscriptionPlanChangeSelectionV1.safeParse(change).success).toBe(true);
    for (const fields of [{ toPlan: "Firm" },{ expectedRevision: -1 },{ effectiveDate: "2026-10-01" },{ approved: true },{ actorId: "fictional" },{ maximumPence: 16900 }]) expect(subscriptionPlanChangeSelectionV1.safeParse({ ...change,...fields }).success).toBe(false);
  });
  it("M2A-12 annual is never default, availability is off and caller cannot enable it", () => {
    expect(selectSubscriptionTerms(selection).cadence).toBe("monthly");
    expect(() => selectSubscriptionTerms({ ...selection, cadence: "annual" })).toThrowError("ANNUAL_SUBSCRIPTION_UNAVAILABLE");
    expect(() => selectSubscriptionTerms({ ...selection, annualAvailable: true })).toThrow(SubscriptionError);
  });
});
