import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { formatSimulationFeeStatement, simulationFeeStatementDocumentV1 } from "./simulation-fee-statement.js";

const id = "10000000-0000-4000-8000-000000000001";
const gbp = (pence: number) => ({ pence, currency: "GBP" });
const fixture = () => ({
  version: "simulation-fee-statement-document.v1", statementId: id, number: "DEMO-FEE-000001",
  environment: "synthetic_demo", policyVersion: "reference_fee_policy_v3",
  qualifyingPrincipal: { numerator: "282000", denominator: "1" },
  cumulativeFeePrincipal: gbp(28200), documentPrincipal: gbp(28200),
  postingHistory: [{ journalId: id, principal: gbp(3200) },
    { journalId: "10000000-0000-4000-8000-000000000002", principal: gbp(25000) }],
  original: null as null | { statementId: string; documentHash: string },
  settlementHistory: { state: "integration_unavailable", dependency: "M4-12-S" },
  warning: "Simulation statement — proposed policy, principal only; not a tax invoice or real amount due",
  vatLabel: "VAT not calculated",
  sandboxLabel: "Practice sandbox — synthetic data; nothing is sent or charged",
});

describe("simulation statement independent representation (not issuance)", () => {
  it("preserves supplied Q/F and documentary £32/£250 history without adding it to £282", () => {
    const input = fixture();
    const result = formatSimulationFeeStatement(input);
    expect(JSON.parse(result.canonicalJson)).toEqual(input);
    expect(result.document.cumulativeFeePrincipal.pence).toBe(28200);
    // Formatting must not derive entitlement, even from deliberately inconsistent reference facts.
    expect(formatSimulationFeeStatement({ ...input, cumulativeFeePrincipal: gbp(123) }).document.cumulativeFeePrincipal.pence).toBe(123);
    expect(input).toEqual(fixture());
  });
  it("has deterministic canonical UTF-8 bytes, separate SHA-256 metadata and exact labels", async () => {
    const input = fixture();
    const result = formatSimulationFeeStatement(input);
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    expect(formatSimulationFeeStatement(reordered).canonicalJson).toBe(result.canonicalJson);
    expect(Object.keys(JSON.parse(result.canonicalJson))).toEqual(Object.keys(input).sort());
    expect(Object.keys(JSON.parse(result.canonicalJson).documentPrincipal)).toEqual(["currency", "pence"]);
    expect(new TextDecoder().decode(result.bytes)).toBe(result.canonicalJson);
    expect(result.byteLength).toBe(new TextEncoder().encode(result.canonicalJson).byteLength);
    expect(result.documentHash).toBe(Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", result.bytes)), byte => byte.toString(16).padStart(2, "0")).join(""));
    expect(result.canonicalJson).not.toContain('"documentHash":');
    expect(result.canonicalJson).toContain(input.warning);
    expect(result.canonicalJson).toContain(input.vatLabel);
    expect(result.canonicalJson).toContain(input.sandboxLabel);
    expect(Object.keys(result.document.settlementHistory).sort()).toEqual(["dependency", "state"]);
    expect(result.canonicalJson).toBe(formatSimulationFeeStatement(JSON.parse(result.canonicalJson)).canonicalJson);
  });
  it("preserves unreduced exact fractions and signed correction/history facts without changing the original", () => {
    const original = formatSimulationFeeStatement(fixture());
    const correction = formatSimulationFeeStatement({ ...fixture(), number: "example-correction-number",
      qualifyingPrincipal: { numerator: "64000", denominator: "2" }, cumulativeFeePrincipal: gbp(3200),
      documentPrincipal: gbp(-25000), original: { statementId: id, documentHash: original.documentHash },
      postingHistory: [...fixture().postingHistory, { journalId: id, principal: gbp(-25000) }] });
    expect(correction.document.qualifyingPrincipal).toEqual({ numerator: "64000", denominator: "2" });
    expect(correction.document.documentPrincipal.pence).toBe(-25000);
    expect(correction.document.cumulativeFeePrincipal.pence).toBe(3200);
    expect(formatSimulationFeeStatement(fixture())).toEqual(original);
    expect(correction.documentHash).not.toBe(original.documentHash);
  });
  it.each(["tenantId", "actorId", "mode", "price", "paid", "collected", "outstanding", "refundDue",
    "tax", "base", "cap", "creditUsed", "subscriptionOffset", "sourceManifest", "approval", "documentHash"])("rejects unknown/prohibited claim %s", key => {
    expect(() => formatSimulationFeeStatement({ ...fixture(), [key]: id })).toThrow("INVALID_SIMULATION_FEE_STATEMENT");
  });
  it.each([
    { version: "simulation-fee-statement-document.v2" }, { policyVersion: "reference_fee_policy_v1" },
    { environment: "production" }, { number: "x".repeat(81) }, { statementId: "bad" }, { number: "" }, { warning: "due" },
    { vatLabel: "VAT zero" }, { sandboxLabel: "real" },
    { original: { statementId: "bad", documentHash: "a".repeat(64) } },
    { original: { statementId: id, documentHash: "z".repeat(64) } },
    { original: { statementId: id, documentHash: "a".repeat(64), extra: true } },
    { settlementHistory: { state: "settled", dependency: "M4-12-S" } },
    { settlementHistory: { state: "integration_unavailable", dependency: "invented" } },
    { settlementHistory: { state: "integration_unavailable", dependency: "M4-12-S", paid: 0 } },
    { postingHistory: [{ journalId: "bad", principal: gbp(1) }] },
    { postingHistory: [{ journalId: id, principal: gbp(1), extra: true }] },
  ])("refuses malformed nested/version/label representation %#", patch => {
    expect(simulationFeeStatementDocumentV1.safeParse({ ...fixture(), ...patch }).success).toBe(false);
  });
  it.each([Number.MAX_SAFE_INTEGER, MAX_MONEY_PENCE + 1, -MAX_MONEY_PENCE - 1, 0.1, NaN, Infinity])("rejects unsafe Money %s", pence => {
    for (const key of ["cumulativeFeePrincipal", "documentPrincipal"]) {
      expect(() => formatSimulationFeeStatement({ ...fixture(), [key]: gbp(pence) })).toThrow();
    }
    expect(() => formatSimulationFeeStatement({ ...fixture(), postingHistory: [{ journalId: id, principal: gbp(pence) }] })).toThrow();
  });
  it.each([{ pence: 1, currency: "USD" }, { ...gbp(1), extra: true }])("rejects Money shape %#", value => {
    expect(() => formatSimulationFeeStatement({ ...fixture(), documentPrincipal: value })).toThrow();
  });
  it("allows signed Money at both magnitude limits but no negative cumulative principal", () => {
    for (const pence of [-MAX_MONEY_PENCE, MAX_MONEY_PENCE]) {
      expect(formatSimulationFeeStatement({ ...fixture(), documentPrincipal: gbp(pence) }).document.documentPrincipal.pence).toBe(pence);
    }
    expect(() => formatSimulationFeeStatement({ ...fixture(), cumulativeFeePrincipal: gbp(-1) })).toThrow();
  });
  it("rejects oversized history and bounds exact-rational input work", () => {
    expect(() => formatSimulationFeeStatement({ ...fixture(), postingHistory: Array.from({ length: 10_001 }, () => ({ journalId: id, principal: gbp(0) })) })).toThrow();
    expect(() => formatSimulationFeeStatement({ ...fixture(), qualifyingPrincipal: { numerator: "1".repeat(300_000), denominator: "1" } })).toThrow();
  });
  it.each([
    { numerator: "1", denominator: "0" }, { numerator: "1", denominator: "-1" },
    { numerator: "1.1", denominator: "1" }, { numerator: "-1", denominator: "1" },
    { numerator: String(MAX_MONEY_PENCE + 1), denominator: "1" },
    { numerator: "1", denominator: "1", extra: true },
  ])("rejects invalid or out-of-range Q %#", qualifyingPrincipal => {
    expect(() => formatSimulationFeeStatement({ ...fixture(), qualifyingPrincipal })).toThrow("INVALID_SIMULATION_FEE_STATEMENT");
  });
});
