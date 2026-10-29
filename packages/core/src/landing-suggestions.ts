import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { compareReceiptInstants, instantV1 } from "./receipt-allocation.js";
import { recoveryCaseStateFullV1, recoveryEventAllowedFrom } from "./recovery-case.js";

const id = z.guid();
const pence = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const positive = pence.refine(value => value > 0);
const date = z.iso.date();
const scope = { tenantId: id, jobId: id };
/** Internal facts assembled under the authenticated tenant transaction, never an HTTP command. */
export const landingSuggestionFactsV1 = z.object({
  version: z.literal("landing-suggestion-facts.v1"), environment: z.literal("synthetic_demo"), ...scope,
  hasFinalizedProof: z.boolean(),
  receipts: z.array(z.object({
    ...scope, paymentId: id, invoiceId: id, movementId: id, movementIdentity: z.string().min(1).max(300), finalAccountRevisionId: id,
    invoiceNetPence: positive, invoiceGrossPence: positive, availablePence: pence,
    settledAt: instantV1, paidOn: date, issuedOn: date, counterparties: z.array(z.string().min(1)),
    held: z.boolean(), reversed: z.boolean(),
  }).strict()).max(10_000),
  cases: z.array(z.object({
    ...scope, caseId: id, revision: z.number().int().safe().positive(), state: recoveryCaseStateFullV1,
    sourceRefs: z.array(z.string()), counterparty: z.string(), createdAt: instantV1,
    remainingNetPence: pence, evidencedRemainingNetPence: pence, eligibilityApproved: z.boolean(),
  }).strict()).max(10_000),
}).strict();
export type LandingSuggestionFacts = z.infer<typeof landingSuggestionFactsV1>;
export const landingSuggestionV1 = z.object({
  caseId: id, paymentId: id, expectedCaseRevision: z.number().int().safe().positive(),
  grossPence: positive, eligibleNetPence: positive, taxPence: pence,
  ambiguous: z.boolean(), requiresHumanReview: z.literal(true),
}).strict();
export type LandingSuggestion = z.infer<typeof landingSuggestionV1>;
const normalize = (value: string) => value.trim().replace(/\s+/gu, " ").toLowerCase();
const gcd = (left: bigint, right: bigint): bigint => right === 0n ? left : gcd(right, left % right);

/** Suggestions have no authority. Reuse the existing review/approve writer for every confirmation. */
export function suggestLandingAllocations(raw: unknown): LandingSuggestion[] {
  const facts = landingSuggestionFactsV1.parse(raw);
  if (!facts.hasFinalizedProof) return [];
  const sameScope = (row: { tenantId: string; jobId: string }) => row.tenantId === facts.tenantId && row.jobId === facts.jobId;
  const receipts = facts.receipts.filter(sameScope);
  const cases = facts.cases.filter(sameScope).filter((item, index, all) =>
    all.findIndex(other => other.caseId === item.caseId) === index
      && !all.some(other => other.caseId === item.caseId && JSON.stringify(other) !== JSON.stringify(item)));
  const proposals: LandingSuggestion[] = [];
  const seen = new Set<string>();
  for (const receipt of receipts) {
    // Identical replays add nothing. Conflicting representations or two payment IDs
    // for one movement require reconciliation; never manufacture extra cash.
    const key = JSON.stringify(receipt);
    if (seen.has(key)) continue;
    seen.add(key);
    if (receipts.some(other => (other.movementIdentity === receipt.movementIdentity || other.paymentId === receipt.paymentId)
      && JSON.stringify(other) !== key)
      || receipt.held || receipt.reversed || receipt.availablePence === 0
      || receipt.paidOn < receipt.issuedOn || receipt.invoiceNetPence > receipt.invoiceGrossPence
      || receipt.counterparties.length !== 1) continue;
    for (const item of cases) {
      if (!item.eligibilityApproved || !recoveryEventAllowedFrom(item.state, "record_landing")
        || !item.sourceRefs.includes(receipt.invoiceId) || !normalize(item.counterparty)
        || normalize(item.counterparty) !== normalize(receipt.counterparties[0]!)
        || compareReceiptInstants(item.createdAt, receipt.settledAt) > 0) continue;
      // The existing case writer requires integral gross/net/tax splits. Take the
      // largest exact ratio multiple within BOTH limits, without rounding deemed net.
      const net = BigInt(receipt.invoiceNetPence), gross = BigInt(receipt.invoiceGrossPence);
      const divisor = gcd(net, gross), netUnit = net / divisor, grossUnit = gross / divisor;
      const cashUnits = BigInt(receipt.availablePence) / grossUnit;
      const claimUnits = BigInt(Math.min(item.remainingNetPence, item.evidencedRemainingNetPence)) / netUnit;
      const units = cashUnits < claimUnits ? cashUnits : claimUnits;
      if (units === 0n) continue;
      proposals.push({ caseId: item.caseId, paymentId: receipt.paymentId, expectedCaseRevision: item.revision,
        grossPence: Number(units * grossUnit), eligibleNetPence: Number(units * netUnit),
        taxPence: Number(units * (grossUnit - netUnit)), ambiguous: false, requiresHumanReview: true });
    }
  }
  const paymentCounts = new Map<string, number>(), caseCounts = new Map<string, number>();
  for (const row of proposals) {
    paymentCounts.set(row.paymentId, (paymentCounts.get(row.paymentId) ?? 0) + 1);
    caseCounts.set(row.caseId, (caseCounts.get(row.caseId) ?? 0) + 1);
  }
  return proposals.sort((a, b) => a.paymentId.localeCompare(b.paymentId) || a.caseId.localeCompare(b.caseId))
    .map(row => ({ ...row, ambiguous: paymentCounts.get(row.paymentId)! > 1 || caseCounts.get(row.caseId)! > 1 }));
}
