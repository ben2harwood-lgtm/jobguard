import { describe, expect, it } from "vitest";
import { EnterpriseFeeError, type EnterpriseFeeReferenceInput } from "@jobguard/core";
import { prepareEnterpriseFeeReference, validateEnterpriseFeeReference, bindEnterpriseFeeReference } from "./enterprise-fee.application.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (c = "a") => c.repeat(64);
function reference(): EnterpriseFeeReferenceInput {
  return { version: "enterprise-fee-reference-input.v1", statement: { version: "enterprise-statement.v1", tenantId: id(1),
    statementId: id(2), period: "2026-10", recordedCutoff: "2026-11-01T00:00:00Z", mode: "synthetic_demo", groups: [],
    agreements: [{ version: "enterprise-agreement.v1", id: "v1", tenantId: id(1), hash: hash(), effectiveFrom: "2026-01-01T00:00:00Z",
      rate: { version: "fee-rate.v1", policyVersion: "v1", numerator: "10", denominator: "100" }, basis: "on_payment",
      minimumCommitment: null, onboardingFee: null, volumeBands: null }],
    prior: [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 0, derivationId: null, contributions: [] }] },
    sources: [{ kind: "agreement", id: "v1", tenantId: id(1), jobId: null, hash: hash(), recordedAt: "2026-10-01T00:00:00.000001Z" }] };
}
describe("ENT-7 reference preparation only; no application composition or database writes", () => {
  it("E7-01 rejects forged authority and unsupported environment at its internal boundary", () => {
    expect(() => prepareEnterpriseFeeReference({ ...reference(), actorId: id(3) })).toThrow(EnterpriseFeeError);
    expect(() => prepareEnterpriseFeeReference({ ...reference(), statement: { ...reference().statement, feeGate: true } })).toThrow(EnterpriseFeeError);
    expect(() => prepareEnterpriseFeeReference({ ...reference(), statement: { ...reference().statement, mode: "production_billing" } })).toThrow(EnterpriseFeeError);
  });
  it("E7-10 canonical preparation hashes complete reference facts and returns immutable non-posting data", () => {
    const raw = reference(), a = prepareEnterpriseFeeReference(raw), b = prepareEnterpriseFeeReference(JSON.parse(JSON.stringify(raw)));
    expect(a).toEqual(b); expect(a.artifact).toMatchObject({ totalPence: 0, referenceOnly: true, postingAuthorized: false });
    expect(a.inputFactsHash).toMatch(/^[a-f0-9]{64}$/u); expect(a.statementHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(a.manifest.statement.agreements[0])).toBe(true);
    raw.statement.agreements[0]!.hash = hash("b");
    expect(a.manifest.statement.agreements[0]!.hash).toBe(hash());
    expect(validateEnterpriseFeeReference(a)).toEqual(a);
    expect(a).not.toHaveProperty("journal"); expect(a).not.toHaveProperty("decision");
  });
  it("E7-11 manifests preserve sub-millisecond recorded times in their hashes", () => {
    const a = prepareEnterpriseFeeReference(reference()), changed = reference();
    changed.sources[0]!.recordedAt = "2026-10-01T00:00:00.000002Z";
    expect(prepareEnterpriseFeeReference(changed).inputFactsHash).not.toBe(a.inputFactsHash);
  });
  it("E7-21 validation re-derives and rejects altered totals, trace sources and manifest bytes", () => {
    const a = prepareEnterpriseFeeReference(reference());
    const changed = structuredClone(a); changed.manifest.sources[0]!.hash = hash("b");
    expect(() => validateEnterpriseFeeReference(changed)).toThrow("STALE_FACTS");
    expect(() => validateEnterpriseFeeReference({ ...a, artifact: { ...a.artifact, totalPence: 1 } })).toThrow(EnterpriseFeeError);
    expect(() => validateEnterpriseFeeReference({ ...a, statementHash: hash("b") })).toThrow("STALE_FACTS");
    expect(() => validateEnterpriseFeeReference({ ...a, inputFactsHash: hash("b") })).toThrow("STALE_FACTS");
  });
  it("E7-12 exact binding retains signed section values, input hash, agreement hashes and expiry", () => {
    const a = prepareEnterpriseFeeReference(reference());
    const request = { version: "enterprise-fee-reference-binding.v1", revisionId: id(3), action: "invoice-simulation", expiresAt: "2026-11-15T00:00:00Z" };
    const bound = bindEnterpriseFeeReference(a, request);
    expect(bound.artifact).toMatchObject({ statementId: id(2), revisionId: id(3), statementHash: a.statementHash,
      inputFactsHash: a.inputFactsHash, totalPence: 0, sections: [{ agreementVersionId: "v1", agreementHash: hash(), feePence: 0 }], expiresAt: request.expiresAt });
    expect(bindEnterpriseFeeReference(a, { ...request, revisionId: id(4) }).artifactHash).not.toBe(bound.artifactHash);
    expect(bindEnterpriseFeeReference(a, { ...request, expiresAt: "2026-11-16T00:00:00Z" }).artifactHash).not.toBe(bound.artifactHash);
    expect(bound).not.toHaveProperty("authorization");
  });
});
