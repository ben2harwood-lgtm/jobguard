import { z } from "zod";
import { supplierLineMatchInputV1, matchSupplierLines } from "./supplier-line-matching.js";
import { matchDigest } from "./supplier-matching.js";
import { receiptQuantityMicros } from "./supplier-documents.js";
import { divideRounded } from "./rational.js";
import { moneyFromBigInt } from "./money.js";

export const lineDiscrepancyInputV1 = z.object({
  version: z.literal("line-discrepancy-input.v1"), snapshotId: z.guid(),
  correctionRevision: z.number().int().nonnegative().max(2_147_483_647),
  facts: supplierLineMatchInputV1,
}).strict();
const ruleRevision = "confirmed-line-discrepancy.v1";
const comparableIssues = new Set(["net_price_variance", "short_delivery", "over_delivery", "billed_above_received"]);

/** A proposal over the repository's confirmed current facts, never commercial authority.
 * Compare net invoice amounts, including linked credits, with the agreed net
 * rate and accepted quantities. Round expected money once per source line, as M2-4 does. */
export function evaluateLineDiscrepancies(raw: unknown) {
  const input = lineDiscrepancyInputV1.parse(raw), facts = input.facts;
  const matches = matchSupplierLines(facts);
  const decisions = matches.groups.flatMap(group => {
    if (matches.unresolved.length || group.deliveredQuantity === null || group.billedQuantity === null
      || group.issues.some(issue => !comparableIssues.has(issue.code))) return [];
    const order = facts.orders.find(row => row.versionId === group.orderVersionId)!;
    const bills = facts.bills.filter(row => group.billVersionIds.includes(row.versionId))
      .sort((a, b) => a.versionId.localeCompare(b.versionId));
    const rateNumerator = BigInt(order.unitNetPence) * BigInt(10_000 - order.discountBps);
    const rateDenominator = receiptQuantityMicros(order.unitsPerPack!) * 1_000_000n * 10_000n;
    const terms = bills.map(bill => {
      const baseQuantity = receiptQuantityMicros(bill.quantity) * receiptQuantityMicros(bill.unitsPerPack!);
      const expected = divideRounded(baseQuantity * rateNumerator, rateDenominator, "half_even");
      return { lineId: bill.lineId, versionId: bill.versionId, kind: bill.kind,
        baseQuantity: baseQuantity.toString(), netPence: bill.netPence,
        expectedNetPence: moneyFromBigInt(expected).pence,
        calculation: `${baseQuantity} × ${rateNumerator} / ${rateDenominator} (half_even)` };
    });
    const signedSum = (field: "netPence" | "expectedNetPence") => terms.reduce((n, term) =>
      n + (term.kind === "credit" ? -1n : 1n) * BigInt(term[field]), 0n);
    const billed = BigInt(group.billedQuantity), accepted = BigInt(group.deliveredQuantity);
    const excess = billed > accepted ? billed - accepted : 0n;
    const quantityPence = divideRounded(excess * rateNumerator, rateDenominator, "half_even");
    const net = signedSum("netPence"), expected = signedSum("expectedNetPence");
    // A lower price offsets quantity exposure; never add positive components while
    // ignoring a corresponding credit/discount. Do not count the same units twice.
    const variance = net - expected + quantityPence;
    if (variance <= 0n) return [];
    const citation = (row: typeof order | typeof facts.receipts[number] | typeof facts.bills[number]) => ({
      lineId: row.lineId, versionId: row.versionId, documentVersionId: row.documentVersionId,
      sourceHash: row.sourceHash, page: row.page,
    });
    return [{ id: matchDigest(JSON.stringify([ruleRevision, input.snapshotId, input.correctionRevision, matches.digest, group.id])),
      kind: "Decision" as const, status: "proposed" as const, ruleRevision,
      snapshotId: input.snapshotId, correctionRevision: input.correctionRevision, matchDigest: matches.digest,
      groupId: group.id, exposure: "unclassified" as const, paymentStatus: "unknown" as const, billable: false as const,
      amount: moneyFromBigInt(variance),
      agreedRate: { citation: citation(order), rateVersionId: order.rateVersionId,
        unitNetPence: order.unitNetPence, discountBps: order.discountBps, unitsPerPack: order.unitsPerPack,
        validFrom: order.validFrom, validTo: order.validTo },
      invoices: bills.map(citation), receipts: facts.receipts.filter(row => group.receiptVersionIds.includes(row.versionId))
        .sort((a, b) => a.versionId.localeCompare(b.versionId)).map(citation),
      quantities: { ordered: group.orderedQuantity, accepted: group.deliveredQuantity,
        billed: group.billedQuantity, scale: group.quantityScale, baseUnit: order.baseUnit },
      arithmetic: { terms, netPence: moneyFromBigInt(net).pence, expectedNetPence: moneyFromBigInt(expected).pence,
        quantityPence: moneyFromBigInt(quantityPence).pence,
        calculation: `${net} − ${expected} + ${quantityPence} = ${variance} pence net`,
        quantityCalculation: `max(0, ${billed} − ${accepted}) × ${rateNumerator} / ${rateDenominator} (half_even)` },
      claimSent: false as const, cashLandedPence: 0 as const, feePence: 0 as const }];
  });
  return { version: "line-discrepancy-result.v1" as const, environment: "synthetic_demo" as const,
    snapshotId: input.snapshotId, correctionRevision: input.correctionRevision, ruleRevision, decisions };
}
