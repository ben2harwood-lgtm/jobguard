import { describe, expect, it } from "vitest";
import {
  deriveEnterpriseReferenceStatement, statementLines, EnterpriseDomainError,
  type EnterpriseAgreement, type EnterpriseExtra, type EnterpriseGroup, type EnterpriseStatementInput,
} from "./index.js";
import { extra, group, id, hash, exact, approval, revision, grant, withKind } from "./origin.test.js";
import { exactPence } from "../cumulative-fee.js";

type Role = EnterpriseExtra["raisingCommand"]["role"];
type FeeCase = { kind?: "site_user" | "office_entry" | "client_instruction" | "jobguard_surfaced_confirmed";
  role: Role; named: boolean; net: number; settled?: ReturnType<typeof exact> };
function feeCase(n: number, { kind = "site_user", role, named, net, settled }: FeeCase): EnterpriseExtra {
  const e = kind === "site_user" ? extra() : withKind(kind, "contractor");
  e.id = id(n); e.origin.variationId = e.id;
  e.origin.raisingRole = role; e.raisingCommand.role = role;
  e.raisingCommand.grant = grant(role, { membershipId: e.origin.raisingMembershipId });
  e.raisingCommand.assigned = named;
  e.revision = revision({ netPence: net, approvals: [approval({ netPence: net })] });
  // Identifier offset only; monetary values are supplied exact fixture facts.
  e.exportLineId = id(n + 200);
  e.billingFacts = e.billingFacts.map(f => ({ ...f, exportLineId: e.exportLineId!,
    invoiceLineId: `fictional-line-${n}`, net: f.kind === "settled" ? settled ?? exact(net) : exact(net) }));
  return e;
}
const agreement: EnterpriseAgreement = { version: "enterprise-agreement.v1", id: "v1", tenantId: id(20), hash: hash(),
  effectiveFrom: "2026-01-01T00:00:00Z", rate: { version: "fee-rate.v1", policyVersion: "v1", numerator: "10", denominator: "100" },
  basis: "on_payment", minimumCommitment: null, onboardingFee: null, volumeBands: null };
function statement(groups: EnterpriseGroup[], patch: Partial<EnterpriseStatementInput> = {}): EnterpriseStatementInput {
  return { version: "enterprise-statement.v1", tenantId: id(20), period: "2026-10", statementId: id(100), inputFactsHash: hash(),
    recordedCutoff: "2026-11-01T00:00:00Z", mode: "synthetic_demo", feeGate: false, groups, agreements: [agreement],
    prior: [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 0, derivationId: null, contributions: [] }], ...patch };
}
const section = (input: EnterpriseStatementInput) => deriveEnterpriseReferenceStatement(input).sections[0]!;
function expectRefusal(action: () => unknown, code: EnterpriseDomainError["code"]): void {
  let error: unknown;
  try { action(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(EnterpriseDomainError); expect(error).toHaveProperty("code", code);
}
function prior(e: EnterpriseExtra, posted: number, principal: number): EnterpriseStatementInput["prior"] {
  return [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: posted, derivationId: id(101),
    contributions: [{ extraId: e.id, qualifyingPrincipal: exact(principal) }] }];
}

describe("FEE-PINS-1: existing fee-statement corners", () => {
  it("[FP-1] prior figures that do not reproduce the prior posted fee are refused", () => {
    const e = feeCase(901, { role: "operative", named: true, net: 15 });
    expectRefusal(() => section(statement([group([e])], { prior: [{ agreementVersionId: "v1", priorPolicyVersion: "v1",
      priorNetPostedPence: 0, derivationId: null, contributions: [{ extraId: e.id, qualifyingPrincipal: exact(15) }] }] })), "INVALID_STATEMENT");
  });
  it("[FP-1] a non-zero change with no changed extra is refused; cancelling changes move the lines", () => {
    expectRefusal(() => statementLines(2, [{ extraId: id(1), change: exactPence(0n) }, { extraId: id(8), change: exactPence(0n) }]), "INVALID_STATEMENT");
    expect(statementLines(0, [{ extraId: id(1), change: exactPence(1n) }, { extraId: id(8), change: exactPence(-1n) }]).map(l => l.fee.pence)).toEqual([1, -1]);
  });

  it("[FP-2] a rising statement with one falling line is a proposal that records its prior statement and is not a compensation", () => {
    const a = feeCase(911, { role: "operative", named: true, net: 15000 }), b = feeCase(912, { role: "operative", named: true, net: 10000 });
    a.billingFacts.push({ ...a.billingFacts[0]!, kind: "credited", sourceRef: "fictional-credit", net: exact(5000) });
    const s = section(statement([group([a]), group([b])], { prior: prior(a, 1500, 15000) }));
    expect(s).toMatchObject({ postingDelta: { pence: 500 }, kind: "proposal", compensatesDerivationId: null, priorDerivationId: id(101) });
    expect(s.lines.map(l => l.fee.pence)).toEqual([-500, 1000]);
  });

  const credited = (recordedAt: string, effectiveAt: string) => {
    const e = feeCase(921, { role: "surveyor", named: true, net: 12345 });
    e.billingFacts.push({ ...e.billingFacts[0]!, kind: "credited", sourceRef: "fictional-full-credit", net: exact(12345), recordedAt, effectiveAt });
    return section(statement([group([e])]));
  };
  it("[FP-3] a fact recorded exactly at the cut-off waits for the next statement; one instant earlier it counts", () => {
    expect(credited("2026-11-01T00:00:00Z", "2026-10-20T00:00:00Z").cumulativeFee.pence).toBe(1234);
    expect(credited("2026-10-31T23:59:59.999999999Z", "2026-10-20T00:00:00Z").cumulativeFee.pence).toBe(0);
  });
  it("[FP-3] the recorded time alone decides: a credit recorded before the cut-off but dated after it counts now", () => {
    expect(credited("2026-10-30T00:00:00Z", "2026-11-02T00:00:00Z")).toMatchObject({ qualifyingPrincipal: { numerator: 0n, denominator: 1n }, kind: "zero_result" });
  });
  it("[FP-3] a cut-off given as a bare date is refused", () => {
    expectRefusal(() => section(statement([group([feeCase(922, { role: "surveyor", named: true, net: 12345 })])], { recordedCutoff: "2026-11-01" })), "INVALID_STATEMENT");
  });
});
