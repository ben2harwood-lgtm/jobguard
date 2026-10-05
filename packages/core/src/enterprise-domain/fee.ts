import { z } from "zod";
import { allocateMoney } from "../allocation.js";
import { money, moneyFromBigInt, type Money } from "../money.js";
import { calculateCumulativeFee, exactPence, parseExactPence, serializeExactPence, sumExactPence, multiplyExactPence, compareExactPence, addExactPence, MAX_EXACT_PENCE_DIGITS, type ExactPence } from "../cumulative-fee.js";
import { allocateReceiptToLines, type ReceiptLineAllocation } from "../receipt-allocation.js";
import { enterpriseReceiptV1, enterpriseStatementV1, compareServerInstants, readEnterprise, refuse, EnterpriseDomainError, type EnterpriseAgreement, type EnterpriseExtra } from "./contracts.js";
import { assertDuplicateGroup, effectiveOrigin, qualifyingPrincipal } from "./origin.js";

function checked<T>(fn: () => T): T {
  try { return fn(); } catch (error) {
    if (error instanceof EnterpriseDomainError) throw error;
    if (error instanceof Error && error.message === "COMPENSATION_LINK_REQUIRED") return refuse("COMPENSATION_LINK_REQUIRED");
    return refuse("MONEY_LIMIT");
  }
}
export type EnterpriseReceiptAllocation = ReceiptLineAllocation & Readonly<{ extraId: string | null; originalSourceRef: string | null }>;
/** Quarantined/incomplete composition never reaches SH-1. Non-extra lines remain in its denominator. */
export function allocateEnterpriseReceipt(raw: unknown): readonly EnterpriseReceiptAllocation[] {
  const input = readEnterprise(enterpriseReceiptV1, raw, "INVALID_ALLOCATION");
  return checked(() => {
    const { receipt } = input, bindings = new Map(input.bindings.map(b => [b.lineId, b]));
    if (bindings.size !== input.bindings.length || bindings.size !== receipt.lines.length || receipt.lines.some(l => !bindings.has(l.id))) return refuse("INVALID_ALLOCATION");
    const extras = new Map<string, typeof input.groups[number]["members"][number]>();
    const exportOwners = new Map<string, string>();
    for (const g of input.groups) {
      if (g.tenantId !== input.tenantId || g.jobId !== input.jobId) return refuse("INVALID_ALLOCATION");
      assertDuplicateGroup(g); const e = g.members.find(m => m.id === g.canonicalId)!;
      if (extras.has(e.id)) return refuse("INVALID_ALLOCATION"); extras.set(e.id, e);
      if (e.exportLineId !== null) { if (exportOwners.has(e.exportLineId)) return refuse("INVALID_ALLOCATION"); exportOwners.set(e.exportLineId, e.id); }
    }
    for (const binding of input.bindings) {
      if (binding.extraId === null) {
        if (binding.exportLineId !== null || binding.revisionId !== null || binding.revisionHash !== null) return refuse("INVALID_ALLOCATION");
      } else {
        const e = extras.get(binding.extraId);
        if (!e || e.exportLineId === null || e.exportedAt === null || e.exportLineId !== binding.exportLineId || e.revision.id !== binding.revisionId || e.revision.hash !== binding.revisionHash) return refuse("INVALID_ALLOCATION");
      }
    }
    if (receipt.direction === "reversal") {
      const original = input.original;
      if (!original || original.sourceRef !== original.receipt.sourceRef || original.receipt.direction !== "receipt" || original.sourceRef === receipt.sourceRef ||
        compareServerInstants(receipt.effectiveAt, original.receipt.effectiveAt) !== 0 || receipt.invoiceId !== original.receipt.invoiceId) return refuse("INVALID_ALLOCATION");
      const originallySettled = new Map(allocateReceiptToLines(original.receipt).map(l => [l.lineId, l]));
      const remaining = new Map(original.remainingGross.map(l => [l.lineId, parseExactPence(l.gross)]));
      if (remaining.size !== original.remainingGross.length || receipt.lines.length !== original.receipt.lines.length || remaining.size !== receipt.lines.length) return refuse("INVALID_ALLOCATION");
      for (const l of receipt.lines) {
        const prior = original.receipt.lines.find(p => p.id === l.id), balance = remaining.get(l.id), allocated = originallySettled.get(l.id)?.gross ?? exactPence(0n);
        if (!prior || !balance || l.netPence !== prior.netPence || l.grossPence !== prior.grossPence || l.invoiceId !== prior.invoiceId || compareServerInstants(l.existedAt, prior.existedAt) !== 0 ||
          balance.numerator < 0n || compareExactPence(balance, allocated) > 0 || compareExactPence(balance, parseExactPence(l.outstandingGross)) !== 0) return refuse("INVALID_ALLOCATION");
      }
    } else if (input.original !== null) return refuse("INVALID_ALLOCATION");
    let allocation: readonly ReceiptLineAllocation[];
    try { allocation = allocateReceiptToLines(receipt); } catch { return refuse("INVALID_ALLOCATION"); }
    return Object.freeze(allocation.map(l => Object.freeze({ ...l, extraId: bindings.get(l.lineId)!.extraId, originalSourceRef: input.original?.sourceRef ?? null })));
  });
}
export type EnterpriseStatementLine = Readonly<{ extraId: string; contributionChange: ExactPence; fee: Money }>;
const changeV1 = z.array(z.object({ extraId: z.string().uuid(), change: z.object({ numerator: z.bigint(), denominator: z.bigint().positive() }).strict() }).strict()).max(10000);
/** Same-sign apportionment delegates to allocateMoney; mixed signs use signed floors of exact changes. */
export function statementLines(deltaPence: number, supplied: readonly Readonly<{ extraId: string; change: ExactPence }>[]): readonly EnterpriseStatementLine[] {
  return checked(() => {
    const changes = readEnterprise(changeV1, supplied, "INVALID_STATEMENT").sort((a, b) => a.extraId < b.extraId ? -1 : a.extraId > b.extraId ? 1 : 0);
    const delta = money(deltaPence);
    if (new Set(changes.map(c => c.extraId)).size !== changes.length) return refuse("INVALID_STATEMENT");
    for (const c of changes) parseExactPence(serializeExactPence(c.change));
    if (changes.length === 0) { if (delta.pence !== 0) return refuse("INVALID_STATEMENT"); return Object.freeze([]); }
    const nonzero = changes.filter(c => c.change.numerator !== 0n);
    if (nonzero.length === 0) {
      if (delta.pence !== 0) return refuse("INVALID_STATEMENT");
      return Object.freeze(changes.map(c => Object.freeze({ extraId: c.extraId, contributionChange: c.change, fee: money(0) })));
    }
    const uniformPositive = changes.every(c => c.change.numerator >= 0n), uniformNegative = changes.every(c => c.change.numerator <= 0n);
    let allocated: ReadonlyMap<string, Money>;
    if ((uniformPositive && delta.pence >= 0) || (uniformNegative && delta.pence <= 0)) {
      // Reuse SH-1 reduction to obtain a bounded LCM, then use the generic penny allocator.
      let denominator = 1n;
      const limit = 10n ** BigInt(MAX_EXACT_PENCE_DIGITS);
      for (const c of changes) {
        denominator *= exactPence(denominator, c.change.denominator).denominator;
        if (denominator >= limit) return refuse("MONEY_LIMIT");
      }
      allocated = allocateMoney(delta, changes.map(c => {
        const weight = c.change.numerator * (denominator / c.change.denominator);
        return { id: c.extraId, weight: weight < 0n ? -weight : weight };
      }));
    } else allocated = apportionMixed(delta.pence, changes);
    const output = changes.map(c => Object.freeze({ extraId: c.extraId, contributionChange: c.change, fee: allocated.get(c.extraId)! }));
    if (output.reduce((sum, l) => sum + BigInt(l.fee.pence), 0n) !== BigInt(delta.pence)) return refuse("INVALID_STATEMENT");
    return Object.freeze(output);
  });
}
function apportionMixed(delta: number, changes: readonly { extraId: string; change: ExactPence }[]): ReadonlyMap<string, Money> {
  const rows = changes.map(c => {
    let floor = c.change.numerator / c.change.denominator;
    if (c.change.numerator < 0n && c.change.numerator % c.change.denominator !== 0n) floor -= 1n;
    return { id: c.extraId, floor, remainder: exactPence(c.change.numerator - floor * c.change.denominator, c.change.denominator) };
  });
  let remaining = BigInt(delta) - rows.reduce((s, r) => s + r.floor, 0n);
  // Two cumulative half-even totals can differ from the exact change by one penny.
  // In particular, 1.5 -> 2.5 rounds 2 -> 2: integer mixed changes need a -1p carry.
  if (remaining < -1n || remaining > BigInt(rows.length)) return refuse("INVALID_STATEMENT");
  if (remaining < 0n) {
    const lowest = [...rows].sort((a, b) => compareExactPence(a.remainder, b.remainder) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!;
    lowest.floor -= 1n;
    remaining += 1n;
  }
  const ranked = [...rows].sort((a, b) => -compareExactPence(a.remainder, b.remainder) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of ranked) { if (remaining === 0n) break; row.floor += 1n; remaining -= 1n; }
  return new Map(rows.map(r => [r.id, moneyFromBigInt(r.floor)]));
}
export type EnterpriseDerivedStatementLine = EnterpriseStatementLine & Readonly<{
  currentQualifyingPrincipal: ExactPence; priorQualifyingPrincipal: ExactPence; qualifyingChange: ExactPence;
  originExtraId: string | null; originKind: EnterpriseExtra["origin"]["origin"]["kind"] | null; originRecordedAt: string | null;
  orderRevisionId: string | null; revisionId: string | null; exportLineId: string | null;
  approvalReferences: readonly Readonly<{ actorId: string; revisionId: string; hash: string; ruleVersion: string; serverRecordedAt: string }>[];
  billingReferences: readonly Readonly<{ sourceRef: string; invoiceId: string; invoiceLineId: string; allocationRule: EnterpriseExtra["billingFacts"][number]["allocationRule"]; originalSourceRef: string | null; recordedAt: string; effectiveAt: string; net: EnterpriseExtra["billingFacts"][number]["net"] }>[];
}>;
export type EnterpriseFeeSection = Readonly<{
  agreementVersionId: string; period: string; inputFactsHash: string; recordedCutoff: string; qualifyingPrincipal: ExactPence;
  cumulativeFee: Money; postingDelta: Money; lines: readonly EnterpriseDerivedStatementLine[];
  priorNetPostedFee: Money; priorDerivationId: string | null;
  kind: "proposal" | "linked_compensation" | "zero_result"; compensatesDerivationId: string | null; postingAuthorized: false;
}>;
export type EnterpriseFeeDerivation = Readonly<{
  version: "enterprise-derivation.v1"; tenantId: string; statementId: string; referenceOnly: boolean; label: string;
  sections: readonly EnterpriseFeeSection[]; postingAuthorized: false;
}>;
function agreementAt(agreements: readonly EnterpriseAgreement[], at: string): EnterpriseAgreement {
  const eligible = agreements.filter(a => compareServerInstants(a.effectiveFrom, at) <= 0).sort((a, b) => compareServerInstants(b.effectiveFrom, a.effectiveFrom));
  if (!eligible[0]) return refuse("AGREEMENT_VERSION_MISMATCH"); return eligible[0];
}
function derive(raw: unknown, referenceOnly: boolean): EnterpriseFeeDerivation {
  const input = readEnterprise(enterpriseStatementV1, raw, "INVALID_STATEMENT");
  return checked(() => {
    const versions = new Map(input.agreements.map(a => [a.id, a]));
    if (versions.size !== input.agreements.length || input.agreements.some(a => a.tenantId !== input.tenantId || a.rate.policyVersion !== a.id) ||
      input.agreements.some((a, index) => input.agreements.slice(index + 1).some(b => compareServerInstants(a.effectiveFrom, b.effectiveFrom) === 0)) ||
      new Set(input.prior.map(p => p.agreementVersionId)).size !== input.prior.length) return refuse("AGREEMENT_VERSION_MISMATCH");
    const rows = new Map<string, { extraId: string; q: ExactPence }[]>(), seen = new Set<string>();
    const exportOwners = new Set<string>(), billedOwners = new Map<string, string>();
    for (const g of input.groups) {
      if (g.tenantId !== input.tenantId) return refuse("INVALID_STATEMENT"); assertDuplicateGroup(g);
      for (const e of g.members) { if (seen.has(e.id)) return refuse("INVALID_DUPLICATE_GROUP"); seen.add(e.id); }
      const canonical = g.members.find(e => e.id === g.canonicalId)!;
      if (canonical.exportLineId !== null) { if (exportOwners.has(canonical.exportLineId)) return refuse("INVALID_ALLOCATION"); exportOwners.add(canonical.exportLineId); }
      for (const f of canonical.billingFacts) {
        const key = JSON.stringify([f.invoiceId, f.invoiceLineId]), owner = billedOwners.get(key);
        if (owner !== undefined && owner !== canonical.id) return refuse("INVALID_ALLOCATION"); billedOwners.set(key, canonical.id);
      }
      const origin = effectiveOrigin(g);
      if (compareServerInstants(origin.origin.serverRecordedAt, input.recordedCutoff) >= 0) return refuse("INVALID_STATEMENT");
      const agreement = agreementAt(input.agreements, origin.origin.serverRecordedAt);
      if (agreement.id !== g.agreementVersionId) return refuse("AGREEMENT_VERSION_MISMATCH");
      const q = qualifyingPrincipal(g, { reference: referenceOnly, recordedCutoff: input.recordedCutoff });
      const permitted = referenceOnly || (input.mode === "production_billing" && input.feeGate);
      const list = rows.get(agreement.id) ?? []; list.push({ extraId: g.canonicalId, q: permitted ? q : exactPence(0n) }); rows.set(agreement.id, list);
    }
    for (const p of input.prior) {
      if (!versions.has(p.agreementVersionId) || p.priorPolicyVersion !== p.agreementVersionId) return refuse("AGREEMENT_VERSION_MISMATCH");
      if (!rows.has(p.agreementVersionId)) rows.set(p.agreementVersionId, []);
    }
    const sections: EnterpriseFeeSection[] = [];
    for (const [version, groups] of [...rows.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      const agreement = versions.get(version)!, prior = input.prior.find(p => p.agreementVersionId === version);
      const cumulative = sumExactPence(groups.map(g => g.q)); parseExactPence(serializeExactPence(cumulative));
      const priorQ = new Map((prior?.contributions ?? []).map(c => [c.extraId, parseExactPence(c.qualifyingPrincipal)]));
      if (priorQ.size !== (prior?.contributions.length ?? 0)) return refuse("INVALID_STATEMENT");
      if ([...priorQ.values()].some(q => q.numerator < 0n)) return refuse("INVALID_STATEMENT");
      // Prior net postings include all compensations; validate their supplied cumulative contribution snapshot.
      const previous = calculateCumulativeFee({ version: "cumulative-fee.v1", rate: agreement.rate, cumulativeQualifyingPrincipal: serializeExactPence(sumExactPence([...priorQ.values()])),
        priorNetPostedPence: 0, priorPolicyVersion: version, compensatesDerivationId: null });
      if (previous.cumulativeFee.pence !== (prior?.priorNetPostedPence ?? 0)) return refuse("INVALID_STATEMENT");
      const kernel = calculateCumulativeFee({ version: "cumulative-fee.v1", rate: agreement.rate, cumulativeQualifyingPrincipal: serializeExactPence(cumulative),
        priorNetPostedPence: prior?.priorNetPostedPence ?? 0, priorPolicyVersion: prior?.priorPolicyVersion ?? version, compensatesDerivationId: prior?.derivationId ?? null });
      const rate = exactPence(BigInt(agreement.rate.numerator), BigInt(agreement.rate.denominator));
      const current = new Map(groups.map(g => [g.extraId, g.q]));
      const changes = [...new Set([...current.keys(), ...priorQ.keys()])].map(extraId => {
        const old = priorQ.get(extraId) ?? exactPence(0n);
        return { extraId, change: multiplyExactPence(addExactPence(current.get(extraId) ?? exactPence(0n), exactPence(-old.numerator, old.denominator)), rate) };
      });
      const lines: readonly EnterpriseDerivedStatementLine[] = Object.freeze(statementLines(kernel.postingDelta.pence, changes).map(line => {
        const g = input.groups.find(g => g.agreementVersionId === version && g.canonicalId === line.extraId);
        const member = g?.members.find(e => e.id === g.canonicalId), origin = g ? effectiveOrigin(g) : undefined;
        const canonical = member && compareServerInstants(member.revision.serverRecordedAt, input.recordedCutoff) < 0 ? member : undefined;
        const currentQ = current.get(line.extraId) ?? exactPence(0n), previousQ = priorQ.get(line.extraId) ?? exactPence(0n);
        return Object.freeze({ ...line, currentQualifyingPrincipal: currentQ, priorQualifyingPrincipal: previousQ,
          qualifyingChange: addExactPence(currentQ, exactPence(-previousQ.numerator, previousQ.denominator)),
          originExtraId: origin?.id ?? null, originKind: origin?.origin.origin.kind ?? null, originRecordedAt: origin?.origin.serverRecordedAt ?? null,
          orderRevisionId: origin?.orderAtOrigin.revisionId ?? null, revisionId: canonical?.revision.id ?? null,
          exportLineId: canonical?.exportedAt && compareServerInstants(canonical.exportedAt, input.recordedCutoff) < 0 ? canonical.exportLineId : null,
          approvalReferences: Object.freeze((canonical?.revision.approvals ?? []).filter(a => compareServerInstants(a.serverRecordedAt, input.recordedCutoff) < 0).map(a => Object.freeze({ actorId: a.actorId, revisionId: a.revisionId, hash: a.hash, ruleVersion: a.ruleVersion, serverRecordedAt: a.serverRecordedAt }))),
          billingReferences: Object.freeze((canonical?.billingFacts ?? []).filter(f => compareServerInstants(f.recordedAt, input.recordedCutoff) < 0).map(f => Object.freeze({
            sourceRef: f.sourceRef, invoiceId: f.invoiceId, invoiceLineId: f.invoiceLineId, allocationRule: f.allocationRule, originalSourceRef: f.originalSourceRef, recordedAt: f.recordedAt, effectiveAt: f.effectiveAt, net: Object.freeze({ ...f.net }),
          }))),
        });
      }));
      sections.push(Object.freeze({ agreementVersionId: version, period: input.period, inputFactsHash: input.inputFactsHash, recordedCutoff: input.recordedCutoff,
        qualifyingPrincipal: cumulative, cumulativeFee: kernel.cumulativeFee, postingDelta: kernel.postingDelta, lines,
        priorNetPostedFee: money(prior?.priorNetPostedPence ?? 0), priorDerivationId: prior?.derivationId ?? null,
        kind: kernel.postingDelta.pence > 0 ? "proposal" : kernel.postingDelta.pence < 0 ? "linked_compensation" : "zero_result", compensatesDerivationId: kernel.compensatesDerivationId, postingAuthorized: false }));
    }
    return Object.freeze({ version: "enterprise-derivation.v1", tenantId: input.tenantId, statementId: input.statementId, referenceOnly,
      label: input.mode === "pilot_no_charge" ? "Illustration — no charge" : referenceOnly ? "Reference illustration — no charge" : "Non-posting derivation", sections: Object.freeze(sections), postingAuthorized: false });
  });
}
/** Production eligibility assertion only. Never approval, activation, invoice or journal. */
export function deriveEnterpriseStatement(raw: unknown): EnterpriseFeeDerivation { return derive(raw, false); }
/** Generated-fixture/reference arithmetic: never actual fee entitlement, including in pilot mode. */
export function deriveEnterpriseReferenceStatement(raw: unknown): EnterpriseFeeDerivation { return derive(raw, true); }
