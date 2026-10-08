import { describe, expect, it } from "vitest";
import { activationTermsV1, isSmallJobV3, switchLiveV3 } from "./activation-v3.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = { version: "switch-live.v3", activationId: id(1), termsId: id(2), jobId: id(3), acceptedDocumentId: id(4), acceptedDocumentVersion: 1, acceptedDocumentHash: "a".repeat(64), expectedJobRevision: 1 };
const terms = { version: "job-activation-terms.v1", id: id(2), tenantId: id(5), jobId: id(3), activationId: id(1), baselineQuoteVersionId: id(4), acceptedNetPence: 100000, highestSentNetPence: 100000, smallJob: true, policyVersion: "reference_fee_policy_v3", commercialTrack: "small_builder", trialPlanContext: "none_recorded_pre_mon2a", activatedAt: "2026-10-08T18:00:00.000Z" };
describe("CH-1 immutable activation contracts", () => {
  it.each([[199999, 0, true], [200000, 0, false], [100000, 200000, false], [100000, 199999, true], [1880000, 1880000, false], [3000000, 3000000, false]])("classifies accepted %i and highest sent %i", (accepted, sent, small) => { expect(isSmallJobV3(accepted as number, sent as number)).toBe(small); });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, NaN, Infinity])("refuses invalid pence %s", value => { expect(() => isSmallJobV3(value, 0)).toThrow(); expect(() => isSmallJobV3(0, value)).toThrow(); });
  it("does not accept client-authored commercial terms", () => {
    expect(switchLiveV3.parse(request)).toEqual(request);
    for (const forged of [{ smallJob: true }, { policyVersion: "reference_fee_policy_v3" }, { commercialTrack: "contractor" }, { trialPlanContext: "none_recorded_pre_mon2a" }, { acceptedNetPence: 1 }, { tenantId: id(5) }]) expect(switchLiveV3.safeParse({ ...request, ...forged }).success).toBe(false);
  });
  it("records the closed coordinator context and validates derived classification", () => {
    expect(Object.isFrozen(activationTermsV1.parse(terms))).toBe(true);
    for (const change of [{ smallJob: false }, { trialPlanContext: null }, { trialPlanContext: "" }, { commercialTrack: "contractor" }, { policyVersion: "reference_fee_policy_v1" }, { acceptedNetPence: 1000000000001 }]) expect(activationTermsV1.safeParse({ ...terms, ...change }).success).toBe(false);
  });
});
