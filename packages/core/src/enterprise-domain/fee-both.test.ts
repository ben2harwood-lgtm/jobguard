import { describe, expect, it } from "vitest";
import {
  allocateEnterpriseReceipt, deriveEnterpriseReferenceStatement, deriveEnterpriseStatement,
  EnterpriseDomainError, enterpriseRoles, feeBearing, qualifyingPrincipal, siteOriginated,
  type EnterpriseAgreement, type EnterpriseExtra, type EnterpriseGroup, type EnterpriseStatementInput,
} from "./index.js";
import { extra, group, id, hash, exact, approval, revision, grant, withKind, at } from "./origin.test.js";

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
// Normative literals from the issued order, independent of the implementation.
const cells = [
  { role: "operative", named: true, counts: true }, { role: "operative", named: false, counts: false },
  { role: "supervisor", named: true, counts: true }, { role: "supervisor", named: false, counts: true },
  { role: "surveyor", named: true, counts: true }, { role: "surveyor", named: false, counts: true },
  { role: "commercial_manager", named: true, counts: false }, { role: "commercial_manager", named: false, counts: false },
  { role: "finance", named: true, counts: false }, { role: "finance", named: false, counts: false },
  { role: "admin", named: true, counts: false }, { role: "admin", named: false, counts: false },
  { role: "owner", named: true, counts: false }, { role: "owner", named: false, counts: false },
  { role: "read_only", named: true, counts: false }, { role: "read_only", named: false, counts: false },
  { role: "client_approver", named: true, counts: false }, { role: "client_approver", named: false, counts: false },
  { role: "connector", named: true, counts: false }, { role: "connector", named: false, counts: false },
] as const;
const newCells = [
  { role: "surveyor", named: true }, { role: "surveyor", named: false }, { role: "supervisor", named: false },
] as const;
function mixedGroups(): EnterpriseGroup[] {
  return [
    feeCase(501, { role: "operative", named: true, net: 15000 }),
    feeCase(502, { role: "supervisor", named: true, net: 9995 }),
    feeCase(503, { role: "surveyor", named: true, net: 12345 }),
    { ...feeCase(504, { role: "supervisor", named: false, net: 24000, settled: exact(250000, "31") }), state: "part_paid" as const },
    feeCase(505, { role: "surveyor", named: false, net: 5 }),
    feeCase(506, { role: "operative", named: false, net: 20000 }),
    feeCase(507, { kind: "office_entry", role: "finance", named: true, net: 50000 }),
    feeCase(508, { kind: "client_instruction", role: "commercial_manager", named: true, net: 80000 }),
  ].map(e => group([e]));
}
function expectMixed(input: EnterpriseStatementInput): void {
  const s = section(input);
  expect(s).toMatchObject({ qualifyingPrincipal: { numerator: 1407695n, denominator: 31n },
    cumulativeFee: { pence: 4541, currency: "GBP" }, postingDelta: { pence: 4541, currency: "GBP" },
    kind: "proposal", postingAuthorized: false });
  expect(s.lines.map(l => l.extraId)).toEqual([id(501), id(502), id(503), id(504), id(505), id(506), id(507), id(508)]);
  expect(s.lines.map(l => l.fee.pence)).toEqual([1500, 1000, 1235, 806, 0, 0, 0, 0]);
  expect(s.lines.map(l => l.currentQualifyingPrincipal)).toEqual([
    { numerator: 15000n, denominator: 1n }, { numerator: 9995n, denominator: 1n },
    { numerator: 12345n, denominator: 1n }, { numerator: 250000n, denominator: 31n },
    { numerator: 5n, denominator: 1n }, { numerator: 0n, denominator: 1n },
    { numerator: 0n, denominator: 1n }, { numerator: 0n, denominator: 1n },
  ]);
  expect(s.lines.map(l => l.contributionChange)).toEqual([
    { numerator: 1500n, denominator: 1n }, { numerator: 1999n, denominator: 2n },
    { numerator: 2469n, denominator: 2n }, { numerator: 25000n, denominator: 31n },
    { numerator: 1n, denominator: 2n }, { numerator: 0n, denominator: 1n },
    { numerator: 0n, denominator: 1n }, { numerator: 0n, denominator: 1n },
  ]);
  expect(s.lines.reduce((sum, l) => sum + BigInt(l.fee.pence), 0n)).toBe(4541n);
}
const november = { period: "2026-11", recordedCutoff: "2026-12-01T00:00:00Z", inputFactsHash: hash("b") };
function prior(e: EnterpriseExtra, posted: number, principal: number): EnterpriseStatementInput["prior"] {
  return [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: posted, derivationId: id(101),
    contributions: [{ extraId: e.id, qualifyingPrincipal: exact(principal) }] }];
}

describe("FEE-BOTH-1: the fee counts a site extra logged by a surveyor, or by a supervisor not named on the job (founder, 12 Oct 2026)", () => {
  it.each(cells)("[FB-1] site_user / $role named=$named", ({ role, named, counts }) => {
    const e = feeCase(301, { role, named, net: 15000 }), g = group([e]);
    const q = counts ? { numerator: 15000n, denominator: 1n } : { numerator: 0n, denominator: 1n };
    const fee = counts ? 1500 : 0;
    expect(siteOriginated(g)).toBe(counts); expect(qualifyingPrincipal(g, { reference: true })).toEqual(q);
    expect(feeBearing(group([e], { mode: "production_billing", feeGate: true }))).toBe(counts);
    const s = section(statement([g]));
    expect(s.qualifyingPrincipal).toEqual(q); expect(s.cumulativeFee.pence).toBe(fee); expect(s.postingDelta.pence).toBe(fee);
    expect(s.kind).toBe(counts ? "proposal" : "zero_result"); expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.fee.pence).toBe(fee); expect(s.lines[0]!.originKind).toBe("site_user");
  });
  it("[FB-1] twenty cells cover each role twice, exactly five count", () => {
    expect(cells).toHaveLength(20); expect(cells).toHaveLength(enterpriseRoles.flatMap(role => [role, role]).length);
    for (const role of enterpriseRoles) for (const named of [true, false])
      expect(cells.filter(c => c.role === role && c.named === named)).toHaveLength(1);
    expect(cells.filter(c => c.counts)).toHaveLength(5);
  });
  it.each([
    { role: "surveyor", named: true, net: 12345, settled: exact(12345), q: { numerator: 12345n, denominator: 1n }, change: { numerator: 2469n, denominator: 2n }, fee: 1234 },
    { role: "surveyor", named: false, net: 9995, settled: exact(9995), q: { numerator: 9995n, denominator: 1n }, change: { numerator: 1999n, denominator: 2n }, fee: 1000 },
    { role: "supervisor", named: false, net: 24000, settled: exact(250000, "31"), q: { numerator: 250000n, denominator: 31n }, change: { numerator: 25000n, denominator: 31n }, fee: 806 },
  ] as const)("[FB-2] exact kernel / $role named=$named", row => {
    const e = feeCase(302, row); if (row.role === "supervisor") e.state = "part_paid";
    const s = section(statement([group([e])]));
    expect(s.qualifyingPrincipal).toEqual(row.q); expect(s.cumulativeFee.pence).toBe(row.fee);
    expect(s.postingDelta.pence).toBe(row.fee); expect(s.kind).toBe("proposal"); expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ currentQualifyingPrincipal: row.q, priorQualifyingPrincipal: { numerator: 0n, denominator: 1n },
      contributionChange: row.change, fee: { pence: row.fee, currency: "GBP" } });
  });
  it.each([
    { kind: "office_entry", role: "finance", named: true, site: false },
    { kind: "office_entry", role: "supervisor", named: true, site: false },
    { kind: "office_entry", role: "surveyor", named: true, site: false },
    { kind: "client_instruction", role: "commercial_manager", named: true, site: false },
    { kind: "client_instruction", role: "surveyor", named: true, site: false },
    { kind: "jobguard_surfaced_confirmed", role: "supervisor", named: true, site: true },
    { kind: "jobguard_surfaced_confirmed", role: "supervisor", named: false, site: true },
  ] as const)("[FB-3] unchanged kind / $kind $role named=$named", row => {
    const e = feeCase(303, { ...row, net: 15000 });
    expect(siteOriginated(group([e]))).toBe(row.site);
    expect(qualifyingPrincipal(group([e]), { reference: true })).toEqual(row.site ? { numerator: 15000n, denominator: 1n } : { numerator: 0n, denominator: 1n });
    expect(feeBearing(group([e], { mode: "production_billing", feeGate: true }))).toBe(row.site);
  });
  const exclusions: { name: string; site: boolean; apply: (g: EnterpriseGroup) => void }[] = [
    { name: "fully instructed", site: false, apply: g => { g.members[0]!.orderAtOrigin.coverage = "fully_instructed"; } },
    { name: "no note or verified photo", site: false, apply: g => { g.members[0]!.captureNote = null; } },
    { name: "resident not confirmed", site: false, apply: g => { g.members[0]!.residentCaptured = true; g.members[0]!.residentConfirmationHash = null; } },
    { name: "not exported or billed", site: true, apply: g => { const e = g.members[0]!; e.state = "approved"; e.exportLineId = null; e.exportedAt = null; e.billingFacts = []; } },
    { name: "unpaid", site: true, apply: g => { const e = g.members[0]!; e.state = "billed"; e.billingFacts = e.billingFacts.filter(f => f.kind !== "settled"); } },
    { name: "unresolved candidate", site: true, apply: g => { g.unresolvedCandidateIds = [id(90)]; } },
    { name: "missing approval", site: true, apply: g => { g.members[0]!.revision.approvals = []; } },
    { name: "withdrawn", site: true, apply: g => { g.members[0]!.state = "withdrawn"; } },
  ];
  for (const cell of newCells) it.each(exclusions)(`[FB-3] ${cell.role} named=${cell.named} / $name`, row => {
    const g = group([feeCase(304, { ...cell, net: 15000 })]);
    expect(qualifyingPrincipal(g, { reference: true })).toEqual({ numerator: 15000n, denominator: 1n });
    row.apply(g);
    expect(qualifyingPrincipal(g, { reference: true })).toEqual({ numerator: 0n, denominator: 1n });
    expect(feeBearing({ ...g, mode: "production_billing", feeGate: true })).toBe(false);
    expect(siteOriginated(g)).toBe(row.site);
  });
  it("[FB-3] incomplete receipt composition is refused", () => {
    const e = feeCase(305, { role: "surveyor", named: true, net: 15000 });
    const envelope = { version: "enterprise-receipt.v1", tenantId: e.tenantId, jobId: e.jobId, compositionComplete: true,
      receipt: { version: "receipt-allocation.v1", sourceRef: "generated-receipt", receiptGross: exact(18000), effectiveAt: at,
        direction: "receipt", invoiceId: "generated-invoice", separateInvoiceId: null, explicit: null,
        lines: [{ id: "extra", invoiceId: "generated-invoice", existedAt: "2026-10-01T00:00:00Z", outstandingGross: exact(18000), netPence: 15000, grossPence: 18000 }] },
      bindings: [{ lineId: "extra", extraId: e.id, exportLineId: e.exportLineId, revisionId: e.revision.id, revisionHash: e.revision.hash }],
      groups: [group([e])], original: null };
    expect(allocateEnterpriseReceipt(envelope)[0]!.net).toEqual({ numerator: 15000n, denominator: 1n });
    expectRefusal(() => allocateEnterpriseReceipt({ ...envelope, compositionComplete: false }), "INVALID_ALLOCATION");
  });
  it.each([
    { name: "a surveyor first, named operative canonical", first: { role: "surveyor", named: true }, canonical: { role: "operative", named: true }, q: { numerator: 15000n, denominator: 1n }, fee: 1500 },
    { name: "b unnamed operative first, surveyor canonical", first: { role: "operative", named: false }, canonical: { role: "surveyor", named: true }, q: { numerator: 0n, denominator: 1n }, fee: 0 },
    { name: "c office first, surveyor canonical", first: { kind: "office_entry", role: "finance", named: true }, canonical: { role: "surveyor", named: true }, q: { numerator: 0n, denominator: 1n }, fee: 0 },
  ] as const)("[FB-4] earliest origin / $name", row => {
    const first = feeCase(401, { ...row.first, net: 15000 }), canonical = feeCase(402, { ...row.canonical, net: 15000 });
    first.state = "duplicate"; first.duplicateOf = canonical.id; first.origin.serverRecordedAt = "2026-10-05T10:00:00Z";
    const g = group([first, canonical], { canonicalId: canonical.id }), s = section(statement([g]));
    expect(qualifyingPrincipal(g, { reference: true })).toEqual(row.q); expect(s.qualifyingPrincipal).toEqual(row.q);
    expect(s.cumulativeFee.pence).toBe(row.fee); expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ extraId: canonical.id, originExtraId: first.id, originRecordedAt: "2026-10-05T10:00:00Z", fee: { pence: row.fee, currency: "GBP" } });
  });
  it("[FB-4] d two canonical members are refused", () => {
    const g = group([feeCase(403, { role: "surveyor", named: true, net: 15000 }), feeCase(404, { role: "supervisor", named: false, net: 15000 })]);
    for (const action of [() => siteOriginated(g), () => qualifyingPrincipal(g, { reference: true }), () => section(statement([g]))])
      expectRefusal(action, "INVALID_DUPLICATE_GROUP");
  });
  it("[FB-5] mixed statement M matches all eight literal lines", () => { expectMixed(statement(mixedGroups())); });
  it("[FB-5] mixed statement M is stable reversed and rotated", () => {
    const groups = mixedGroups(); expectMixed(statement([...groups].reverse())); expectMixed(statement([...groups.slice(3), ...groups.slice(0, 3)]));
  });
  it("[FB-6] another extra's penny moves without changing its principal or the total", () => {
    const x = feeCase(601, { role: "operative", named: true, net: 15 }), y = feeCase(602, { role: "surveyor", named: true, net: 10 });
    const alone = section(statement([group([x])]));
    expect(alone.qualifyingPrincipal).toEqual({ numerator: 15n, denominator: 1n }); expect(alone.cumulativeFee.pence).toBe(2);
    expect(alone.lines[0]!.contributionChange).toEqual({ numerator: 3n, denominator: 2n }); expect(alone.lines[0]!.fee.pence).toBe(2);
    const both = section(statement([group([x]), group([y])]));
    expect(both.qualifyingPrincipal).toEqual({ numerator: 25n, denominator: 1n }); expect(both.cumulativeFee.pence).toBe(2);
    expect(both.postingDelta.pence).toBe(2); expect(both.lines.map(l => l.extraId)).toEqual([id(601), id(602)]);
    expect(both.lines.map(l => l.currentQualifyingPrincipal)).toEqual([{ numerator: 15n, denominator: 1n }, { numerator: 10n, denominator: 1n }]);
    expect(both.lines.map(l => l.contributionChange)).toEqual([{ numerator: 3n, denominator: 2n }, { numerator: 1n, denominator: 1n }]);
    expect(both.lines.map(l => l.fee.pence)).toEqual([1, 1]);
  });
  it("[FB-7] a surveyor credit preserves October and compensates November", () => {
    const e = feeCase(701, { role: "surveyor", named: true, net: 12345 }), input = statement([group([e])]);
    const october = deriveEnterpriseReferenceStatement(input);
    expect(october.sections[0]).toMatchObject({ cumulativeFee: { pence: 1234 }, kind: "proposal" });
    e.billingFacts.push({ ...e.billingFacts[0]!, kind: "credited", sourceRef: "fictional-full-credit", net: exact(12345),
      effectiveAt: "2026-10-20T00:00:00Z", recordedAt: "2026-11-02T00:00:00Z" }); e.state = "credited";
    expect(deriveEnterpriseReferenceStatement(input)).toEqual(october);
    const s = section(statement([group([e])], { ...november, prior: prior(e, 1234, 12345) }));
    expect(s).toMatchObject({ qualifyingPrincipal: { numerator: 0n, denominator: 1n }, cumulativeFee: { pence: 0 },
      postingDelta: { pence: -1234 }, kind: "linked_compensation", compensatesDerivationId: id(101), postingAuthorized: false });
    expect(s.lines).toHaveLength(1); expect(s.lines[0]!.fee.pence).toBe(-1234);
  });
  function reversedSupervisor(): EnterpriseExtra {
    const e = feeCase(702, { role: "supervisor", named: false, net: 24000 });
    e.billingFacts.push({ ...e.billingFacts[1]!, kind: "reversed", sourceRef: "fictional-partial-reversal",
      originalSourceRef: e.billingFacts[1]!.sourceRef, net: exact(-5000), recordedAt: "2026-11-02T00:00:00Z" });
    e.state = "part_paid"; return e;
  }
  it("[FB-7] b unnamed supervisor reversal produces linked compensation", () => {
    const e = reversedSupervisor(); expect(section(statement([group([e])])).cumulativeFee.pence).toBe(2400);
    const s = section(statement([group([e])], { ...november, prior: prior(e, 2400, 24000) }));
    expect(s).toMatchObject({ qualifyingPrincipal: { numerator: 19000n, denominator: 1n }, cumulativeFee: { pence: 1900 },
      postingDelta: { pence: -500 }, kind: "linked_compensation", compensatesDerivationId: id(101), postingAuthorized: false });
    expect(s.lines).toHaveLength(1); expect(s.lines[0]!.fee.pence).toBe(-500);
  });
  it("[FB-7] c compensation without its prior derivation is refused", () => {
    const e = reversedSupervisor(), previous = prior(e, 2400, 24000); previous[0]!.derivationId = null;
    expectRefusal(() => section(statement([group([e])], { ...november, prior: previous })), "COMPENSATION_LINK_REQUIRED");
  });
  it("[FB-7] d an older snapshot proposes only newly counted principal", () => {
    const x = feeCase(703, { role: "operative", named: true, net: 15000 }), c = feeCase(704, { role: "surveyor", named: true, net: 12345 });
    const s = section(statement([group([x]), group([c])], { ...november, prior: prior(x, 1500, 15000) }));
    expect(s).toMatchObject({ qualifyingPrincipal: { numerator: 27345n, denominator: 1n }, cumulativeFee: { pence: 2734 },
      postingDelta: { pence: 1234 }, kind: "proposal", postingAuthorized: false });
    expect(s.lines.map(l => l.extraId)).toEqual([id(703), id(704)]); expect(s.lines.map(l => l.fee.pence)).toEqual([0, 1234]);
  });
  it("[FB-8] replay is equal, inputs unchanged and results frozen", () => {
    const input = statement(mixedGroups()), before = structuredClone(input), result = deriveEnterpriseReferenceStatement(input);
    expect(deriveEnterpriseReferenceStatement(input)).toEqual(result); expect(input).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.sections)).toBe(true);
    for (const s of result.sections) {
      expect(Object.isFrozen(s)).toBe(true); expect(Object.isFrozen(s.lines)).toBe(true);
      for (const line of s.lines) expect(Object.isFrozen(line)).toBe(true);
    }
  });
  it.each(newCells)("[FB-9] real charging stays locked / $role named=$named", cell => {
    for (const mode of ["synthetic_demo", "pilot_no_charge", "production_billing"] as const) for (const feeGate of [false, true]) {
      const g = group([feeCase(801, { ...cell, net: 15000 })], { mode, feeGate }), input = statement([g], { mode, feeGate });
      const permitted = mode === "production_billing" && feeGate;
      const ordinary = deriveEnterpriseStatement(input), reference = deriveEnterpriseReferenceStatement(input);
      expect(ordinary.postingAuthorized).toBe(false); expect(ordinary.sections[0]!.postingAuthorized).toBe(false);
      expect(ordinary.referenceOnly).toBe(false); expect(ordinary.sections[0]!.cumulativeFee.pence).toBe(permitted ? 1500 : 0);
      expect(ordinary.label).toBe(mode === "pilot_no_charge" ? "Illustration — no charge" : "Non-posting derivation");
      expect(reference.postingAuthorized).toBe(false); expect(reference.sections[0]!.postingAuthorized).toBe(false);
      expect(reference.referenceOnly).toBe(true); expect(reference.sections[0]!.cumulativeFee.pence).toBe(1500);
      expect(reference.label).toBe(mode === "pilot_no_charge" ? "Illustration — no charge" : "Reference illustration — no charge");
      expect(feeBearing(g)).toBe(permitted);
    }
  });
});
