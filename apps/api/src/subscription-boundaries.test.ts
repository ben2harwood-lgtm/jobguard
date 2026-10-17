import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { subscriptionCatalogueQueryV1, subscriptionOnboardingAssessmentV1 } from "./subscription.contracts.js";
const query = { version: "subscription-catalogue-query.v1", policyVersion: "subscription_pricing_policy_v4" };
describe("MON-2A held-route contracts", () => {
  it("M2A-01 catalogue query is versioned and strict; unknown versions and caller money refuse", () => {
    expect(subscriptionCatalogueQueryV1.safeParse(query).success).toBe(true);
    for (const change of [{ version: "v2" },{ policyVersion: "v3" },{ monthlyPence: 1 },{ maximumPence: 1 },{ tenantId: "fictional" },{ role: "owner" }]) expect(subscriptionCatalogueQueryV1.safeParse({ ...query,...change }).success).toBe(false);
  });
  it("M2A-19 onboarding contracts accept settled answers and reject missing or authority fields", () => {
    const input = { version: "subscription-onboarding-input.v1", usualJobs: 7, siteStaffCapture: false };
    expect(subscriptionOnboardingAssessmentV1.safeParse(input).success).toBe(true);
    for (const change of [{ usualJobs: -1 },{ usualJobs: 1.5 },{ siteStaffCapture: "yes" },{ actorId: "fictional" },{ approved: true },{ serverTime: "2026-10-01" }]) expect(subscriptionOnboardingAssessmentV1.safeParse({ ...input,...change }).success).toBe(false);
    expect(subscriptionOnboardingAssessmentV1.safeParse({ ...input, siteStaffCapture: undefined }).success).toBe(false);
  });
  it("M2A-30 M2A-34 this module exposes schemas only, with no route or context constructor", () => {
    const source = readFileSync(new URL("./subscription.contracts.ts",import.meta.url),"utf8");
    expect(source).not.toMatch(/@(?:Controller|Get|Post)|VerifiedTenantContext|authenticate|Pool|Dispatcher|fetch\s*\(/u);
    expect([...source.matchAll(/from\s+["']([^"']+)["']/gu)].map(m => m[1])).toEqual(["zod"]);
  });
});
