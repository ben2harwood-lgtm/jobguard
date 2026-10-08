import { describe, expect, it } from "vitest";
import {
  evaluatePreventionFact, preventionResultV1, preventionCommandV1,
  preventionCompanyEligible, preventionCompanyEligibleAtLatest, preventionFactStale, PREVENTION_SOURCES, PREVENTION_STALENESS_REFERENCE,
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
  it("fails closed unless the pinned customer revision is the latest one and the latest is eligible", () => {
    const business = { type: "business", companyNumber: "ZZ000001" }, person = { type: "person", companyNumber: "ZZ000001" };
    expect(preventionCompanyEligibleAtLatest("rev-1", { revisionId: "rev-1", customer: business })).toBe(true);
    // The builder re-recorded the same customer as a person after the check: the pinned revision is stale and the latest is ineligible.
    expect(preventionCompanyEligibleAtLatest("rev-1", { revisionId: "rev-2", customer: person })).toBe(false);
    // A later revision that would itself be eligible still refuses until the job is re-bound to it.
    expect(preventionCompanyEligibleAtLatest("rev-1", { revisionId: "rev-2", customer: business })).toBe(false);
    // The pinned revision is the latest but is not eligible, or no latest revision can be read.
    expect(preventionCompanyEligibleAtLatest("rev-1", { revisionId: "rev-1", customer: person })).toBe(false);
    expect(preventionCompanyEligibleAtLatest("rev-1", { revisionId: "rev-1", customer: { type: "business" } })).toBe(false);
    expect(preventionCompanyEligibleAtLatest("rev-1", null)).toBe(false);
  });
  it("caps scenarioNow at millisecond precision so TypeScript and PostgreSQL evaluate the same instant", () => {
    const command = { version: "prevention-command.v1", commandId: "11111111-1111-4111-8111-111111111111", action: "property", expectedBindingId: "22222222-2222-4222-8222-222222222222", fixture: "fresh" };
    const parse = (scenarioNow: string) => { const parsed = preventionCommandV1.safeParse({ ...command, scenarioNow }); expect(parsed.success).toBe(true); return parsed.success ? parsed.data.scenarioNow : ""; };
    expect(parse("2026-10-07T15:00:00.0004Z")).toBe("2026-10-07T15:00:00.000Z");
    expect(parse("2026-10-07T15:00:00.000999Z")).toBe("2026-10-07T15:00:00.000Z");
    expect(parse("2026-10-07T15:00:00Z")).toBe("2026-10-07T15:00:00.000Z");
    expect(parse("2026-10-07T15:00:00.123Z")).toBe("2026-10-07T15:00:00.123Z");
    expect(parse(parse("2026-10-07T15:00:00.1239Z"))).toBe("2026-10-07T15:00:00.123Z");
    // The sub-millisecond command and its capped twin evaluate identically at the flood boundary (observed exactly 180 minutes earlier).
    const flood = PREVENTION_SOURCES.flood, observedAt = "2026-10-07T12:00:00.000Z";
    const at = (evaluatedAt: string) => evaluatePreventionFact({ kind: "flood", source: flood, retrievedAt: observedAt, observedAt, fact: "no_record", evaluatedAt });
    expect(at(parse("2026-10-07T15:00:00.0004Z"))).toEqual(at("2026-10-07T15:00:00.000Z"));
    expect(at(parse("2026-10-07T15:00:00.0004Z")).status).toBe("clear");
    expect(at(parse("2026-10-07T15:00:00.0014Z")).status).toBe("unknown");
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
