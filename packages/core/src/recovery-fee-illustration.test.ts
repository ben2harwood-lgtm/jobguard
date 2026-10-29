import { describe, expect, it, vi } from "vitest";
import * as exactMoney from "./cumulative-fee.js";
import { attributionPredicates } from "./shadow-domain/attribution.js";
import { recoveryFeeIllustrationInputV1, recoveryFeeIllustrationOutputV1, deriveRecoveryFeeIllustration, RecoveryFeeIllustrationError } from "./recovery-fee-illustration.js";
import { mapRecoveryReceiptToLines, sumRecoveryDeemedNet, type RecoveryReceiptFacts } from "./recovery-allocation.js";
import { MAX_MONEY_PENCE } from "./money.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3), lineId: id(4), lockId: id(5) };
const kinds = ["evidence", "disclosure", "baseline_manifest", "capture_manifest", "locked_bill_manifest", "reveal", "disposition", "invoice_line", "line_allocation", "line_reversal"] as const;
const fixture = () => ({
  version: "recovery-attribution-revision.v1", ...binding, caseId: id(6), environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
  assessmentId: id(7), revision: 1, previousAssessmentId: null, caseRevision: 1, sourceRevision: "sources.1", sourceHash: "a".repeat(64),
  sourceManifest: kinds.map((kind, i) => ({ kind, sourceId: id(20 + i), sourceVersion: "1", sourceHash: "b".repeat(64), tenantId: binding.tenantId, jobId: binding.jobId })),
  completeManifests: ["baseline_manifest", "capture_manifest", "locked_bill_manifest"].map((kind, i) => ({ kind, sourceId: id(22 + i), lockId: binding.lockId, status: "completed", itemIds: [], itemCount: 0 })),
  facts: { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, revisionId: id(7), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map((predicate, i) => [predicate, { version: "shadow-fact.v1", ...binding, predicate, holds: true, sourceRef: id(20 + i) }])) },
  remainingPrincipal: { numerator: "80000", denominator: "1" }, assessmentOutcome: "eligible_for_review", reasonCodes: [] as string[],
  attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", policyBundleRef: "recovery-fee-illustration.synthetic-policy.v1",
  assessedBy: { kind: "membership", actorRef: id(8) }, serverRecordedAt: "2026-10-23T12:00:00Z",
});

const wire = (numerator: string, denominator = "1") => ({ numerator, denominator });
const rawInput = (numerator = "80000", denominator = "1") => {
  const assessment = { ...fixture(), remainingPrincipal: wire(numerator, denominator) };
  const source = { version: "qualifying-recovery-source.v1", ...binding, caseId: id(6), category: "missed_variation_final_account",
    environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0, assessmentId: id(7), assessmentRevision: 1,
    reviewId: id(10), reviewAuthorizationId: id(11), sourceRevision: "sources.1", sourceHash: "a".repeat(64),
    lineAllocationIds: [id(28)], exactRemainingPrincipal: wire(numerator, denominator),
    attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3",
    policyBundleRef: "recovery-fee-illustration.synthetic-policy.v1" };
  return { version: "recovery-fee-illustration-input.v1", environment: "synthetic_demo", ...{ tenantId: binding.tenantId, jobId: binding.jobId, lockId: binding.lockId },
    policyBundleRef: source.policyBundleRef,
    sources: [{ caseId: id(6), workId: binding.workId, lineId: binding.lineId, assessment,
      qualification: { version: "current-attribution-qualification.v1", environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
        latestAssessmentId: id(7), currentSourceRevision: "sources.1", state: "qualified", source, reasonCodes: [] } }],
    captures: [{ captureId: id(60), tenantId: binding.tenantId, jobId: binding.jobId, lockId: binding.lockId, sourceRevision: "capture.1", sourceHash: "c".repeat(64), exactNet: wire("360000") }] };
};
// Generate a second independent current work/assessment without borrowing another leaf's fixtures.
const independentEntry = (q = "10") => {
  let text = JSON.stringify(rawInput(q).sources[0]!);
  for (const n of [3, 4, 6, 7, 10, 11, ...Array.from({ length: 10 }, (_, i) => 20 + i)])
    text = text.replaceAll(id(n), id(n + 100));
  return JSON.parse(text) as ReturnType<typeof rawInput>["sources"][number];
};
const derive = (raw: unknown) => deriveRecoveryFeeIllustration(recoveryFeeIllustrationInputV1.parse(raw));
describe("SV6-05 pure illustration", () => {
  it("S6-05-A F1-F8 exact authoritative remaining Q and cumulative F", () => {
    for (const [fixtureId, q, d, f] of [
      ["F1", "80000", "1", 8000], ["F2-first", "40000", "1", 4000], ["F2-final", "80000", "1", 8000],
      ["F3", "60000", "1", 6000], ["F4", "2000000", "43", 4651], ["F4b", "80000", "1", 8000],
      ["F5", "40000", "1", 4000], ["F7", "80000", "1", 8000],
    ] as const) {
      const result = derive(rawInput(q, d));
      expect(result.exactQualifyingPrincipal, fixtureId).toEqual(wire(q, d));
      expect(result.cumulativeFee, fixtureId).toEqual({ pence: f, currency: "GBP" });
    }
    for (const fixtureId of ["F6", "F8"]) {
      const raw = rawInput(); raw.sources = [];
      expect(derive(raw).exactQualifyingPrincipal, fixtureId).toEqual(wire("0"));
      expect(derive(raw).cumulativeFee.pence, fixtureId).toBe(0);
    }
    const original = rawInput(); const bytes = JSON.stringify(original);
    const previous = derive(original); const current = derive(rawInput("60000"));
    expect(JSON.stringify(original)).toBe(bytes);
    expect(Object.isFrozen(previous)).toBe(true); expect(Object.isFrozen(previous.display)).toBe(true);
    expect(previous.cumulativeFee.pence).toBe(8000); expect(current.cumulativeFee.pence).toBe(6000);
    expect(current).not.toHaveProperty("postingDelta");
  });
  it("S6-05-B split and combined histories have equal final facts; F9 half-even and bounded rationals", () => {
    const combined = rawInput(); combined.sources[0]!.qualification.source.lineAllocationIds.push(id(80));
    combined.sources[0]!.assessment.sourceManifest.push({ ...combined.sources[0]!.assessment.sourceManifest[8]!, sourceId: id(80) });
    expect(derive(combined).cumulativeFee).toEqual(derive(rawInput()).cumulativeFee);
    const twoWorks = rawInput("5"); twoWorks.sources.push(independentEntry());
    expect(derive(twoWorks).exactQualifyingPrincipal).toEqual(wire("15"));
    expect(derive(twoWorks).cumulativeFee.pence).toBe(2); // Round the sum once: 0 + 1 would be wrong.
    expect(derive({ ...twoWorks, sources: [...twoWorks.sources].reverse() }).cumulativeFee.pence).toBe(2);
    for (const [q, fee] of [["5", 0], ["15", 2], ["25", 2], ["35", 4]] as const)
      expect(derive(rawInput(q)).cumulativeFee.pence).toBe(fee);
    for (const [q, d] of [["-1", "1"], ["01", "1"], ["1", "0"], ["1", "-1"], ["1.5", "1"], [String(MAX_MONEY_PENCE + 1), "1"]])
      expect(() => derive(rawInput(q, d))).toThrow();
    const negativeCapture = rawInput(); negativeCapture.captures[0]!.exactNet = wire("-1");
    expect(() => derive(negativeCapture)).toThrow(RecoveryFeeIllustrationError);
    const overflow = rawInput(); overflow.captures[0]!.exactNet = wire(String(MAX_MONEY_PENCE));
    overflow.captures.push({ ...overflow.captures[0]!, captureId: id(61), exactNet: wire("1") });
    expect(() => derive(overflow)).toThrow(RecoveryFeeIllustrationError);
  });
  it("r1 preserves maximum principal and refuses aggregate over-maximum principal", () => {
    expect(derive(rawInput(String(MAX_MONEY_PENCE))).cumulativeFee.pence).toBe(MAX_MONEY_PENCE / 10);
    const over = rawInput(String(MAX_MONEY_PENCE)); over.sources.push(independentEntry("1"));
    expect(() => derive(over)).toThrow(RecoveryFeeIllustrationError);
  });
  it("S6-05-C F12/F13 captured is fee-free, remainder is separate, F23 never offsets", () => {
    const result = derive(rawInput());
    expect(result.exactCapturedFeeFreeNet).toEqual(wire("360000"));
    expect(result.capturedFee.pence).toBe(0); expect(result.cumulativeFee.pence).toBe(8000);
    expect(result.exactYoursBeforeVatAndTax).toEqual(wire("72000"));
    expect(result.display.yoursBeforeVatAndTax).toEqual({ pence: 72000, currency: "GBP" });
    expect(() => derive({ ...rawInput(), subscriptionOffset: 6900 })).toThrow();
    const capturedOnly = rawInput(); capturedOnly.sources = [];
    expect(derive(capturedOnly).cumulativeFee.pence).toBe(0);
  });
  it("S6-05-D rejects duplicate source aliases, reviews, allocation lineage and captures", () => {
    const raw = rawInput(); raw.sources.push(structuredClone(raw.sources[0]!));
    expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    const captures = rawInput(); captures.captures.push(structuredClone(captures.captures[0]!));
    expect(() => derive(captures)).toThrow(RecoveryFeeIllustrationError);
    for (const aliasKind of ["allocation", "work", "assessment", "review"]) {
      const alias = rawInput(); const second = independentEntry();
      if (aliasKind === "allocation") {
        second.qualification.source.lineAllocationIds = [id(28)];
        second.assessment.sourceManifest.push({ ...second.assessment.sourceManifest[8]!, sourceId: id(28) });
      }
      if (aliasKind === "work") {
        const changed = JSON.stringify(second).replaceAll(id(103), id(3));
        Object.assign(second, JSON.parse(changed));
      }
      if (aliasKind === "assessment") {
        const changed = JSON.stringify(second).replaceAll(id(107), id(7));
        Object.assign(second, JSON.parse(changed));
      }
      if (aliasKind === "review") second.qualification.source.reviewId = id(10);
      alias.sources.push(second);
      expect(() => derive(alias), aliasKind).toThrow(RecoveryFeeIllustrationError);
    }
    const duplicateAllocation = rawInput(); duplicateAllocation.sources[0]!.qualification.source.lineAllocationIds.push(id(28));
    expect(() => derive(duplicateAllocation)).toThrow();
  });
  it.each(["allocation", "work", "assessment", "review", "capture"] as const)("r1 refuses case-variant duplicate %s IDs", kind => {
    // Letter-bearing UUIDs are essential: the original numeric fixture cannot vary in case.
    const raw = JSON.parse(JSON.stringify(rawInput()).replaceAll("10000000", "abcdefab")) as ReturnType<typeof rawInput>;
    const original = raw.sources[0]!;
    const firstId = kind === "allocation" ? original.qualification.source.lineAllocationIds[0]!
      : kind === "work" ? original.workId : kind === "assessment" ? original.assessment.assessmentId
      : kind === "review" ? original.qualification.source.reviewId : raw.captures[0]!.captureId;
    expect(firstId.toUpperCase()).not.toBe(firstId);
    expect(derive(raw).cumulativeFee.pence).toBe(8000);
    if (kind === "capture") {
      raw.captures.push({ ...raw.captures[0]!, captureId: firstId.toUpperCase() });
    } else {
      let second = independentEntry("80000");
      const secondId = kind === "allocation" ? second.qualification.source.lineAllocationIds[0]!
        : kind === "work" ? second.workId : kind === "assessment" ? second.assessment.assessmentId : second.qualification.source.reviewId;
      second = JSON.parse(JSON.stringify(second).replaceAll(secondId, firstId.toUpperCase())) as typeof second;
      raw.sources.push(second);
    }
    // In particular, one £800 allocation cannot become Q £1,600 / F £160.
    expect(recoveryFeeIllustrationInputV1.safeParse(raw).success).toBe(false);
    expect(() => deriveRecoveryFeeIllustration(raw as never)).toThrow(RecoveryFeeIllustrationError);
  });
  it.each(["tenantId", "jobId", "lockId"] as const)("r1 rejects noncanonical %s in empty envelope and capture scope", field => {
    const raw = JSON.parse(JSON.stringify(rawInput()).replaceAll("10000000", "abcdefab")) as ReturnType<typeof rawInput>;
    raw.sources = []; raw.captures = [];
    expect(derive(raw).cumulativeFee.pence).toBe(0);
    expect(() => deriveRecoveryFeeIllustration({ ...raw, [field]: raw[field].toUpperCase() } as never)).toThrow(RecoveryFeeIllustrationError);
    const captureOnly = JSON.parse(JSON.stringify(rawInput()).replaceAll("10000000", "abcdefab")) as ReturnType<typeof rawInput>;
    captureOnly.sources = [];
    captureOnly.captures[0]![field] = captureOnly[field].toUpperCase();
    expect(() => deriveRecoveryFeeIllustration(captureOnly as never)).toThrow(RecoveryFeeIllustrationError);
  });
  it.each(["caseId", "workId", "lineId"] as const)("r1 rejects noncanonical source selector %s", field => {
    const raw = JSON.parse(JSON.stringify(rawInput()).replaceAll("10000000", "abcdefab")) as ReturnType<typeof rawInput>;
    raw.sources[0]![field] = raw.sources[0]![field].toUpperCase();
    expect(recoveryFeeIllustrationInputV1.safeParse(raw).success).toBe(false);
    expect(() => deriveRecoveryFeeIllustration(raw as never)).toThrow(RecoveryFeeIllustrationError);
  });
  it("r1 refuses uppercase at every nested UUID ID boundary, including authorization and manifest IDs", () => {
    const raw = JSON.parse(JSON.stringify(rawInput()).replaceAll("10000000", "abcdefab")) as ReturnType<typeof rawInput>;
    const paths: (string | number)[][] = [];
    const visit = (value: unknown, path: (string | number)[] = []) => {
      if (typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        const next = [...path, Array.isArray(value) ? Number(key) : key];
        if (key.endsWith("Id") && typeof child === "string") paths.push(next);
        else if (key.endsWith("Ids") && Array.isArray(child)) child.forEach((_, i) => paths.push([...next, i]));
        else visit(child, next);
      }
    };
    visit(raw);
    expect(paths.length).toBeGreaterThan(80);
    for (const path of paths) {
      const changed = structuredClone(raw);
      let target: unknown = changed;
      for (const key of path.slice(0, -1)) target = (target as Record<string | number, unknown>)[key];
      const record = target as Record<string | number, string>, key = path.at(-1)!;
      record[key] = record[key]!.toUpperCase();
      expect(() => recoveryFeeIllustrationInputV1.parse(changed), path.join(".")).toThrow();
      expect(() => deriveRecoveryFeeIllustration(changed as never), path.join(".")).toThrow(RecoveryFeeIllustrationError);
    }
  });
  it.each(["tenantId", "jobId", "lockId"] as const)("r1 source scope guard rejects mismatched %s without captures", field => {
    const raw = rawInput(); raw.captures = [];
    expect(derive(raw).cumulativeFee.pence).toBe(8000);
    raw[field] = id(99);
    // Both embedded records remain individually valid; only this leaf's scope guard can reject.
    expect(recoveryFeeIllustrationInputV1.safeParse(raw).success).toBe(true);
    expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
  });
  it.each(["tenantId", "jobId", "lockId"] as const)("r1 checks source and assessment %s independently without captures", field => {
    for (const side of ["source", "assessment"] as const) {
      const raw = rawInput(); raw.captures = [];
      const entry = raw.sources[0]!;
      if (side === "source") entry.qualification.source[field] = id(99);
      else entry.assessment = JSON.parse(JSON.stringify(entry.assessment).replaceAll(raw[field], id(99))) as typeof entry.assessment;
      expect(recoveryFeeIllustrationInputV1.safeParse(raw).success, side).toBe(true);
      expect(() => derive(raw), side).toThrow(RecoveryFeeIllustrationError);
    }
  });
  it("S6-05-D checks every envelope binding and source watermark", () => {
    for (const field of ["tenantId", "jobId", "lockId"] as const) {
      expect(() => derive({ ...rawInput(), [field]: id(99) })).toThrow(RecoveryFeeIllustrationError);
      const raw = rawInput(); raw.captures[0]![field] = id(99);
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    for (const field of ["caseId", "workId", "lineId"] as const) {
      const raw = rawInput(); raw.sources[0]![field] = id(99);
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    for (const patch of [{ sourceHash: "d".repeat(64) }, { assessmentRevision: 2 }, { exactRemainingPrincipal: wire("1") }, { policyBundleRef: "other" }]) {
      const raw = rawInput(); Object.assign(raw.sources[0]!.qualification.source, patch);
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    const missingLine = rawInput(); missingLine.sources[0]!.qualification.source.lineAllocationIds = [id(88)];
    expect(() => derive(missingLine)).toThrow(RecoveryFeeIllustrationError);
    for (const patch of [{ currentSourceRevision: "sources.2" }, { latestAssessmentId: id(99) }]) {
      const raw = rawInput(); Object.assign(raw.sources[0]!.qualification, patch); expect(() => derive(raw)).toThrow();
    }
  });
  it("S6-05-E every false predicate, disputed or invalidated proof refuses a positive illustration", () => {
    for (const predicate of attributionPredicates) {
      const raw = rawInput(); raw.sources[0]!.assessment.facts.facts[predicate]!.holds = false;
      raw.sources[0]!.assessment.assessmentOutcome = "excluded"; raw.sources[0]!.assessment.reasonCodes = [predicate];
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    const invalidated = rawInput();
    invalidated.sources[0]!.assessment.facts.facts.evidence_received_before_lock!.holds = false;
    invalidated.sources[0]!.assessment.assessmentOutcome = "excluded";
    invalidated.sources[0]!.assessment.reasonCodes = ["evidence_invalidated"];
    expect(() => derive(invalidated)).toThrow(RecoveryFeeIllustrationError);
    for (const reason of ["attribution_disputed", "disclosed_before_lock", "evidence_after_lock", "pre_adoption_evidence"]) {
      const raw = rawInput();
      Object.assign(raw.sources[0]!.assessment.facts, { exclusions: [{ version: "shadow-ineligibility.v1", reason, sourceRef: id(20), at: "2026-10-23T12:00:00Z", disclosureRoute: null }] });
      raw.sources[0]!.assessment.assessmentOutcome = "excluded"; raw.sources[0]!.assessment.reasonCodes = [reason];
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    for (const state of ["held", "excluded", "unreviewed", "not_assessed"]) {
      const raw = rawInput(); Object.assign(raw.sources[0]!.qualification, { state, source: null, reasonCodes: ["held"] });
      expect(() => derive(raw)).toThrow(RecoveryFeeIllustrationError);
    }
    const raw = rawInput(); raw.sources = [];
    expect(derive(raw).productionEnabled).toBe(false); expect(derive(raw).realExternalActions).toBe(0);
    expect(() => derive({ ...rawInput(), environment: "production" })).toThrow();
    expect(() => deriveRecoveryFeeIllustration({} as never)).toThrow(RecoveryFeeIllustrationError);
  });
  it("S6-05-F safest Q4/Q5/Q9: hide fractional display and comparison, bind exact policy, no tax or posting", () => {
    const fractional = derive(rawInput("2000000", "43"));
    expect(fractional.display.qualifyingPrincipal).toBeNull(); expect(fractional.display.yoursBeforeVatAndTax).toBeNull();
    expect(fractional.exactYoursBeforeVatAndTax).toEqual(wire("1800007", "43"));
    expect(fractional.label).toBe("Illustration — proposed policy; principal only");
    expect(fractional.notice).toBe("Practice sandbox — synthetic data; nothing is sent or charged");
    expect(fractional.taxStatus).toBe("VAT not calculated");
    expect(recoveryFeeIllustrationOutputV1.safeParse({ ...fractional, productionEnabled: true }).success).toBe(false);
    for (const key of ["base", "cap", "creditUsed", "subscriptionOffset", "tax", "postedJ", "priorIllustration", "postingDelta"]) {
      expect(fractional).not.toHaveProperty(key);
      expect(() => derive({ ...rawInput(), [key]: 1 })).toThrow();
    }
    expect(() => derive({ ...rawInput(), policyBundleRef: "unapproved" })).toThrow();
    expect(recoveryFeeIllustrationOutputV1.safeParse({ ...fractional, tax: 1 }).success).toBe(false);
  });
});

// Build-ahead pure checks only: persisted SV6-08 and SV6-09 figures remain dependency-bound.
describe("SV6-08/09 saved attribution consumption", () => {
  it("SV6-08 coalesced work and assessment history cannot duplicate principal", () => {
    const original = rawInput();
    const entry = original.sources[0]!;
    // Several tenant/job-bound citations for the same canonical work are not more principal.
    for (const n of [70, 71, 72]) entry.assessment.sourceManifest.push({
      ...entry.assessment.sourceManifest[0]!, sourceId: id(n), sourceHash: "d".repeat(64),
    });
    const first = derive(original);
    expect(first.exactQualifyingPrincipal).toEqual(wire("80000"));
    expect(first.cumulativeFee.pence).toBe(8000);
    expect(first.sourceReferences).toHaveLength(1);
    const firstBytes = JSON.stringify(first), originalBytes = JSON.stringify(original);

    // A new reviewed revision replaces the contribution. It is never added to its predecessor.
    const revised = independentEntry("60000");
    Object.assign(revised, JSON.parse(JSON.stringify(revised)
      .replaceAll(id(103), id(3)).replaceAll(id(104), id(4)).replaceAll(id(106), id(6))));
    revised.assessment.revision = 2;
    // Fixture inference starts with null; the wire schema validates the real predecessor below.
    const assessment = { ...revised.assessment, previousAssessmentId: id(7), sourceRevision: "sources.2" };
    const qualification = { ...revised.qualification, currentSourceRevision: "sources.2", source: {
      ...revised.qualification.source, assessmentRevision: 2, sourceRevision: "sources.2",
    } };
    const current = { ...revised, assessment, qualification };
    const latest = derive({ ...original, sources: [current] });
    expect(latest.exactQualifyingPrincipal).toEqual(wire("60000"));
    expect(latest.cumulativeFee.pence).toBe(6000);
    expect(latest.sourceReferences.map(s => s.assessmentId)).toEqual([id(107)]);
    for (const sources of [[entry, current], [current, entry]])
      expect(() => derive({ ...original, sources })).toThrow(RecoveryFeeIllustrationError);
    expect(JSON.stringify(first)).toBe(firstBytes);
    expect(JSON.stringify(original)).toBe(originalBytes);

    // Each independent uniqueness guard matters even with otherwise distinct current records.
    for (const kind of ["assessment", "review", "allocation"] as const) {
      const other = independentEntry();
      if (kind === "assessment") Object.assign(other, JSON.parse(JSON.stringify(other).replaceAll(id(107), id(7))));
      if (kind === "review") other.qualification.source.reviewId = id(10);
      if (kind === "allocation") {
        other.qualification.source.lineAllocationIds = [id(28)];
        other.assessment.sourceManifest.push({ ...other.assessment.sourceManifest[8]!, sourceId: id(28) });
      }
      expect(() => derive({ ...original, sources: [entry, other] }), kind).toThrow(RecoveryFeeIllustrationError);
    }
    // A separate canonical work really does contribute, so blanket rejection cannot pass.
    expect(derive({ ...original, sources: [entry, independentEntry("60000")] }).exactQualifyingPrincipal)
      .toEqual(wire("140000"));
  });

  it("SV6-09 illustration consumes saved allocations without reallocating or rounding them", () => {
    // Deliberately unreduced saved F4 rational: parsing/consumption preserves its two strings.
    const raw = rawInput("4000000", "86");
    const source = raw.sources[0]!.qualification.source;
    source.lineAllocationIds.push(id(80));
    raw.sources[0]!.assessment.sourceManifest.push({
      ...raw.sources[0]!.assessment.sourceManifest[8]!, sourceId: id(80),
    });
    const bytes = JSON.stringify(raw);
    const parsed = recoveryFeeIllustrationInputV1.parse(raw);
    expect(parsed.sources[0]!.qualification).toMatchObject({ source: {
      exactRemainingPrincipal: wire("4000000", "86"), lineAllocationIds: [id(28), id(80)],
    } });
    const sum = vi.spyOn(exactMoney, "sumExactPence");
    try {
      const output = deriveRecoveryFeeIllustration(parsed);
      expect(sum.mock.calls.some(([values]) => values.length === 1 &&
        values[0]!.numerator === 4000000n && values[0]!.denominator === 86n)).toBe(true);
      expect(output.exactQualifyingPrincipal).toEqual(wire("2000000", "43"));
      expect(output.cumulativeFee.pence).toBe(4651);
      expect(output.display.qualifyingPrincipal).toBeNull();
      expect(output.sourceReferences[0]!.lineAllocationIds).toEqual([id(28), id(80)]);
      expect(JSON.stringify(raw)).toBe(bytes);
      expect(parsed.sources[0]!.assessment.remainingPrincipal).toEqual(wire("4000000", "86"));
    } finally { sum.mockRestore(); }

    const mismatch = rawInput("2000000", "43");
    mismatch.sources[0]!.qualification.source.exactRemainingPrincipal = wire("2000001", "43");
    expect(() => derive(mismatch)).toThrow(RecoveryFeeIllustrationError);
    const missing = rawInput();
    missing.sources[0]!.qualification.source.lineAllocationIds = [id(90)];
    expect(() => derive(missing)).toThrow(RecoveryFeeIllustrationError);
    const noProof = rawInput(); noProof.sources[0]!.qualification.source.lineAllocationIds = [];
    expect(() => derive(noProof)).toThrow();
  });
});

describe("SV6-11-17 pure acceptance", () => {
  it("SV6-11 cumulative exact principal is rounded once", () => {
    // Owner-supplied current exact values only: no raw receipt allocation in this lane.
    const f4 = rawInput("2000000", "43");
    const before = JSON.stringify(f4);
    const result = derive(f4);
    expect(result.exactQualifyingPrincipal).toEqual(wire("2000000", "43"));
    expect(result.cumulativeFee).toEqual({ pence: 4651, currency: "GBP" });
    expect(JSON.stringify(f4)).toBe(before);

    // Same work, two saved allocation references, same current cumulative Q as one receipt.
    const split = rawInput("2000000", "43");
    split.sources[0]!.qualification.source.lineAllocationIds.push(id(80));
    split.sources[0]!.assessment.sourceManifest.push({ ...split.sources[0]!.assessment.sourceManifest[8]!, sourceId: id(80) });
    expect(derive(split).exactQualifyingPrincipal).toEqual(result.exactQualifyingPrincipal);
    expect(derive(split).cumulativeFee).toEqual(result.cumulativeFee);
    expect(derive(split).sourceReferences[0]!.lineAllocationIds).toEqual([id(28), id(80)]);

    // Independent current contributions also sum exactly before the single rounding step.
    const pieces = rawInput("1000000", "43");
    const second = independentEntry("1000000");
    second.assessment.remainingPrincipal = wire("1000000", "43");
    second.qualification.source.exactRemainingPrincipal = wire("1000000", "43");
    pieces.sources.push(second);
    expect(derive(pieces).exactQualifyingPrincipal).toEqual(result.exactQualifyingPrincipal);
    expect(derive(pieces).cumulativeFee).toEqual(result.cumulativeFee); // per-piece rounding would be 4652p
    expect(derive({ ...pieces, sources: [...pieces.sources].reverse() }).cumulativeFee).toEqual(result.cumulativeFee);
    const smallPieces = rawInput("5"); smallPieces.sources.push(independentEntry("10"));
    expect(derive(smallPieces).cumulativeFee).toEqual(derive(rawInput("15")).cumulativeFee);
    const twoFivePence = rawInput("5"); twoFivePence.sources.push(independentEntry("5"));
    expect(derive(twoFivePence).exactQualifyingPrincipal).toEqual(wire("10"));
    expect(derive(twoFivePence).cumulativeFee.pence).toBe(1);
    expect(["5", "15", "25"].map(q => derive(rawInput(q)).cumulativeFee.pence)).toEqual([0, 2, 2]);
  });

  it("SV6-17 v3 has no cap credit or subscription offset", () => {
    // Literal expected fees straddle the old £79 credit and exceed its example cap.
    for (const [q, fee] of [["5", 0], ["100", 10], ["79000", 7900], ["80000", 8000], ["1000000", 100000]] as const) {
      const result = derive(rawInput(q));
      expect(result.cumulativeFee).toEqual({ pence: fee, currency: "GBP" });
      expect(result.exactQualifyingPrincipal).toEqual(wire(q));
      for (const field of ["cap", "base", "baseFee", "planCredit", "creditUsed", "subscriptionOffset", "settledPlanPrincipal"])
        expect(result).not.toHaveProperty(field);
    }
    const empty = rawInput(); empty.sources = []; empty.captures = [];
    expect(derive(empty).cumulativeFee.pence).toBe(0);
    // Every legacy/offset input is refused, even when zero: never accepted and ignored.
    for (const field of ["cap", "base", "baseFee", "planCredit", "creditUsed", "subscriptionOffset", "settledPlanPrincipal", "acceptedNet"]) {
      for (const value of [0, 6900, 7900]) {
        const raw = { ...rawInput(), [field]: value };
        expect(recoveryFeeIllustrationInputV1.safeParse(raw).success, field).toBe(false);
        expect(() => deriveRecoveryFeeIllustration(raw as never), field).toThrow(RecoveryFeeIllustrationError);
      }
      expect(recoveryFeeIllustrationOutputV1.safeParse({ ...derive(rawInput()), [field]: 0 }).success, field).toBe(false);
    }
    const captures = rawInput(); captures.captures[0]!.exactNet = wire("1000000");
    expect(derive(captures).cumulativeFee.pence).toBe(8000);
    // The unchanged merged fee.test.ts / fee-what-if.test.ts exercise v1 separately.
  });
});

// Pure synthetic fixtures only: these are not persisted commands or settlement proof.
// Exercise the existing owner kernel; the illustration consumes its exact results unchanged.
const allocationFixture = (): RecoveryReceiptFacts => ({
  version: "recovery-receipt-facts.v1", environment: "synthetic_demo", direction: "receipt", compositionComplete: true,
  receipt: { id: id(90), invoiceId: id(91), gross: wire("2400000"), effectiveAt: "2026-10-23T12:00:00Z", sourceRef: "synthetic-receipt.1" },
  lines: [
    { id: id(92), invoiceId: id(91), existedAt: "2026-10-20T12:00:00Z", outstandingGross: wire("4032000"), netPence: 3360000, grossPence: 4032000 },
    { id: binding.lineId, invoiceId: id(91), existedAt: "2026-10-22T12:00:00Z", outstandingGross: wire("96000"), netPence: 80000, grossPence: 96000 },
  ], explicit: null, separateInvoice: null,
});
const illustrateAllocatedCatch = (rows: ReturnType<typeof mapRecoveryReceiptToLines>) => {
  const q = sumRecoveryDeemedNet(rows, [binding.lineId]);
  const raw = rawInput(q.numerator, q.denominator);
  // An authoritative empty qualification inventory is assumed ONLY in this pure fixture.
  // Real callers must prove completeness; zero is not a missing-proof fallback.
  if (q.numerator === "0") raw.sources = [];
  return derive(raw);
};
describe("SV6-12/16 pure dependency-bound scenarios", () => {
  it("SV6-12 F5 deposit", () => {
    const deposit = allocationFixture();
    deposit.receipt.gross = wire("1200000");
    deposit.receipt.effectiveAt = "2026-10-21T12:00:00Z"; // Before catch existence/lock.
    const bytes = JSON.stringify(deposit);
    const deposited = mapRecoveryReceiptToLines(deposit);
    expect(deposited.map(row => row.lineId)).toEqual([id(92)]);
    expect(sumRecoveryDeemedNet(deposited, [binding.lineId])).toEqual(wire("0"));
    expect(illustrateAllocatedCatch(deposited).cumulativeFee.pence).toBe(0);
    const later = allocationFixture();
    later.receipt.gross = wire("1464000");
    later.lines[0]!.outstandingGross = wire("2832000");
    const rows = mapRecoveryReceiptToLines(later), savedBytes = JSON.stringify(rows);
    expect(rows.find(row => row.lineId === binding.lineId)).toMatchObject({ rule: "pro_rata", gross: wire("48000"), net: wire("40000") });
    const result = illustrateAllocatedCatch(rows);
    expect(result.exactQualifyingPrincipal).toEqual(wire("40000"));
    expect(result.cumulativeFee.pence).toBe(4000);
    expect(JSON.stringify(rows)).toBe(savedBytes);
    expect(JSON.stringify(deposit)).toBe(bytes);
  });
  it("SV6-12 F6 explicit non catch", () => {
    const facts = allocationFixture();
    facts.explicit = { sourceRef: "synthetic-remittance.non-catch.1", shares: [{ lineId: id(92), gross: wire("2400000") }] };
    const bytes = JSON.stringify(facts), rows = mapRecoveryReceiptToLines(facts);
    expect(rows).toEqual([{ lineId: id(92), rule: "explicit", sourceRef: "synthetic-remittance.non-catch.1", gross: wire("2400000"), net: wire("2000000") }]);
    const result = illustrateAllocatedCatch(rows);
    expect(result.exactQualifyingPrincipal).toEqual(wire("0"));
    expect(result.cumulativeFee.pence).toBe(0);
    expect(JSON.stringify(facts)).toBe(bytes);
    // Negative control: same receipt without remittance uses the existing pro-rata rule.
    facts.explicit = null;
    expect(illustrateAllocatedCatch(mapRecoveryReceiptToLines(facts)).exactQualifyingPrincipal).toEqual(wire("2000000", "43"));
  });
  it("SV6-12 F7 separate invoice", () => {
    const facts = allocationFixture();
    facts.receipt.invoiceId = id(93); facts.receipt.gross = wire("96000");
    facts.lines[1]!.invoiceId = id(93);
    facts.separateInvoice = { invoiceId: id(93), sourceRef: "synthetic-separate-invoice.1" };
    const bytes = JSON.stringify(facts), rows = mapRecoveryReceiptToLines(facts);
    expect(rows).toEqual([{ lineId: binding.lineId, rule: "separate_invoice", sourceRef: "synthetic-separate-invoice.1", gross: wire("96000"), net: wire("80000") }]);
    const result = illustrateAllocatedCatch(rows);
    expect(result.exactQualifyingPrincipal).toEqual(wire("80000"));
    expect(result.cumulativeFee.pence).toBe(8000);
    expect(facts.lines[0]!.outstandingGross).toEqual(wire("4032000"));
    expect(JSON.stringify(facts)).toBe(bytes);
    // The unrelated main invoice's balance cannot affect the catch invoice.
    facts.lines[0]!.outstandingGross = wire("1");
    expect(illustrateAllocatedCatch(mapRecoveryReceiptToLines(facts))).toEqual(result);
  });
  it("SV6-16 shadow 30000 separates captures from paid catches", () => {
    const raw = rawInput("50000"); raw.sources.push(independentEntry("30000"));
    raw.captures[0]!.exactNet = wire("320000");
    raw.captures.push({ ...raw.captures[0]!, captureId: id(61), sourceRevision: "final-review.1", exactNet: wire("40000") });
    const bytes = JSON.stringify(raw), result = derive(raw);
    expect(result.exactQualifyingPrincipal).toEqual(wire("80000"));
    expect(result.cumulativeFee).toEqual({ pence: 8000, currency: "GBP" });
    expect(result.exactYoursBeforeVatAndTax).toEqual(wire("72000"));
    expect(result.exactCapturedFeeFreeNet).toEqual(wire("360000"));
    expect(result.capturedFee).toEqual({ pence: 0, currency: "GBP" });
    expect(result.display).toEqual({ qualifyingPrincipal: { pence: 80000, currency: "GBP" }, capturedFeeFreeNet: { pence: 360000, currency: "GBP" }, yoursBeforeVatAndTax: { pence: 72000, currency: "GBP" } });
    expect(result.label).toBe("Illustration — proposed policy; principal only");
    expect(result.productionEnabled).toBe(false); expect(result.realExternalActions).toBe(0);
    expect(result).not.toHaveProperty("found"); expect(result).not.toHaveProperty("postingDelta");
    expect(JSON.stringify(raw)).toBe(bytes);
    const capturesOnly = { ...raw, sources: [] };
    expect(derive(capturesOnly).cumulativeFee.pence).toBe(0);
    expect(derive(capturesOnly).exactCapturedFeeFreeNet).toEqual(wire("360000"));
    // Billed but unpaid is not a qualified source. Never infer settlement from billing.
    const unpaid = structuredClone(raw);
    unpaid.sources[1]!.assessment.facts.facts.customer_payment_settled_and_allocated_to_that_line!.holds = false;
    expect(() => deriveRecoveryFeeIllustration(unpaid as never)).toThrow(RecoveryFeeIllustrationError);
    const missing = structuredClone(raw);
    delete (missing.sources[1]!.assessment.facts.facts as Record<string, unknown>).customer_payment_settled_and_allocated_to_that_line;
    expect(() => deriveRecoveryFeeIllustration(missing as never)).toThrow(RecoveryFeeIllustrationError);
    for (const field of ["tenantId", "jobId", "lockId"] as const) {
      const foreign = structuredClone(raw); foreign.captures[1]![field] = id(99);
      expect(() => derive(foreign)).toThrow(RecoveryFeeIllustrationError);
    }
  });
});
it("#356 distinct work items cannot consume the same invoice line",()=>{
 const raw=rawInput("50000"),other=independentEntry("30000");
 other.lineId=raw.sources[0]!.lineId;
 other.assessment.lineId=other.lineId;other.assessment.facts.lineId=other.lineId;
 for(const fact of Object.values(other.assessment.facts.facts))fact.lineId=other.lineId;
 other.qualification.source.lineId=other.lineId;
 raw.sources.push(other);
 expect(()=>derive(raw)).toThrow(RecoveryFeeIllustrationError);
});
