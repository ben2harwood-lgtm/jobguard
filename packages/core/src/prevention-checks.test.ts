import { describe, expect, it } from "vitest";
import {
  evaluatePreventionFact, preventionResultV1, preventionCommandV1,
  preventionCompanyEligible, preventionFactStale, PREVENTION_SOURCES, PREVENTION_STALENESS_REFERENCE,
} from "./prevention-checks.js";

const evaluatedAt = "2026-10-07T13:00:00.000Z";
describe("MON-7a cited synthetic prevention facts", () => {
  for (const kind of Object.keys(PREVENTION_SOURCES) as Array<keyof typeof PREVENTION_SOURCES>) {
    const source = PREVENTION_SOURCES[kind];
    const input = { kind, source, retrievedAt: "2026-10-07T12:00:00.000Z", observedAt: "2026-10-07T12:00:00.000Z", fact: "no_record" as const, evaluatedAt };
    it(`${kind} requires source identity and a retrieval date`, () => {
      const result = evaluatePreventionFact(input);
      expect(result.status).toBe("clear");
      expect(preventionResultV1.safeParse({ ...result, source: undefined }).success).toBe(false);
      expect(preventionResultV1.safeParse({ ...result, retrievedAt: undefined }).success).toBe(false);
      expect(preventionResultV1.safeParse({ ...result, source: { id: "forged", name: "forged" } }).success).toBe(false);
    });
    it(`${kind} stale, missing and future facts are unknown even if negative`, () => {
      for (const fields of [{ observedAt: "2026-09-01T00:00:00.000Z" }, { fact: null }, { observedAt: null }, { observedAt: "2026-10-08T00:00:00.000Z" }, { retrievedAt: "2026-10-08T00:00:00.000Z" }]) {
        const result = evaluatePreventionFact({ ...input, ...fields });
        expect(result.status).toBe("unknown");
        expect(preventionResultV1.safeParse({ ...result, status: "clear" }).success).toBe(false);
      }
    });
    it(`${kind} uses the recorded source maximum age inclusively`, () => {
      const age = PREVENTION_STALENESS_REFERENCE.maximumAgeMinutes[source.id];
      const observedAt = new Date(Date.parse(evaluatedAt) - age * 60_000).toISOString();
      expect(evaluatePreventionFact({ ...input, observedAt }).status).toBe("clear");
      expect(evaluatePreventionFact({ ...input, observedAt: new Date(Date.parse(observedAt) - 1).toISOString() }).status).toBe("unknown");
    });
  }
  it("refuses every type except business with a valid company number", () => {
    for (const type of ["person", "landlord_or_agent", "insurer", "main_contractor", "housing_association", "local_authority"]) {
      expect(preventionCompanyEligible({ type, companyNumber: "ZZ000001" })).toBe(false);
    }
    for (const companyNumber of [undefined, "", "123", "zz000001"]) expect(preventionCompanyEligible({ type: "business", companyNumber })).toBe(false);
    expect(preventionCompanyEligible({ type: "business", companyNumber: "ZZ000001" })).toBe(true);
  });
  it("strict commands reject client eligibility and tenant claims", () => {
    const command = { version: "prevention-command.v1", commandId: "11111111-1111-4111-8111-111111111111", action: "property", expectedBindingId: "22222222-2222-4222-8222-222222222222", scenarioNow: evaluatedAt, fixture: "mixed" };
    expect(preventionCommandV1.safeParse(command).success).toBe(true);
    for (const field of ["customerType", "isIndividual", "tenantId", "companyNumber"]) expect(preventionCommandV1.safeParse({ ...command, [field]: "forged" }).success).toBe(false);
  });
  it("the pure staleness predicate uses the supplied policy and fails closed for an unlisted source", () => {
    const policy = { version: "prevention-staleness-reference.v1" as const, referenceOnly: true as const, maximumAgeMinutes: { "fixture.v1": 60 } };
    expect(preventionFactStale("fixture.v1", "2026-10-07T12:00:00.000Z", evaluatedAt, policy)).toBe(false);
    expect(preventionFactStale("fixture.v1", "2026-10-07T12:00:00.000Z", evaluatedAt, { ...policy, maximumAgeMinutes: { "fixture.v1": 59 } })).toBe(true);
    expect(preventionFactStale("unlisted", "2026-10-07T12:00:00.000Z", evaluatedAt, policy)).toBe(true);
  });
});
