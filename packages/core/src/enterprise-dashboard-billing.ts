import { billingStatusV1, deriveUnambiguousBilling, normalizeBillingStatus } from "./contractor-billing.js";
import { exactPence, parseExactPence, serializeExactPence, sumExactPence, type ExactPence } from "./cumulative-fee.js";
import { divideRounded } from "./rational.js";
import { moneyFromBigInt } from "./money.js";
import { dashboardParse, dashboardFactsV1, dashboardQueryV1, projectEnterpriseDashboard, dashboardCanonical, EnterpriseDashboardError, dashboardFreeze, dashboardCompareText } from "./enterprise-dashboard.js";
import { sha256 } from "./evidence-pack.js";
import { compareServerInstants } from "./enterprise-domain/contracts.js";

type Binding = { jobId: string; canonicalExtraId: string };
type Contribution = { stage: "billed" | "paid"; jobId: string; extraIds: string[]; sourceIds: string[]; exactPence: ReturnType<typeof serializeExactPence> };
const method = { version: "enterprise-dashboard-billing-method.v1", text: "Synthetic supplied-fact report. ENT-6 derives complete invoice composition, linked credits and exact receipt/reversal allocation; only supplied canonical authorized extra matches contribute. Billed count and paid count mean distinct extras with positive respective net balance. Exact fractions conserve drill-down; display rounds the aggregate once half-even. Held facts remain explicit. No production billing read or fee derivation is enabled." };
function billingTotals(contributions: Contribution[]) {
  const total = (stage: Contribution["stage"]) => {
    const rows = contributions.filter(c => c.stage === stage);
    const exact: ExactPence = sumExactPence(rows.map(c => parseExactPence(c.exactPence)));
    return { count: new Set(rows.flatMap(c => c.extraIds)).size, known: moneyFromBigInt(divideRounded(exact.numerator, exact.denominator, "half_even")), exactPence: serializeExactPence(exact) };
  };
  return { billed: total("billed"), paid: total("paid") };
}
/** Pure supplied-fact projection only. ENT-6 owns composition, credits and receipt allocation; ENT-9 never reimplements them.
 * Runtime billed/paid reads stay HELD. A caller must supply the complete authorized invoice families at its snapshot.
 */
export function projectDashboardBilling(invoices: readonly (readonly unknown[])[], authorizedExtras: ReadonlyMap<string, Binding>) {
  const contributions: Contribution[] = [], held: { sourceEventId: string; reason: string }[] = [];
  const seenInvoices = new Set<string>(), seenExports = new Set<string>();
  const normalized = invoices.map(raw => raw.map(e => normalizeBillingStatus(dashboardParse(billingStatusV1, e)).event)
    .sort((a, b) => dashboardCompareText(`${a.source}/${a.sourceEventId}`, `${b.source}/${b.sourceEventId}`))).sort((a, b) => dashboardCompareText(dashboardCanonical(a), dashboardCanonical(b)));
  for (const events of normalized) {
    const invoice = events.find(e => e.factType === "invoiced");
    if (invoice) {
      const key = `${invoice.clientContractId}/${invoice.source}/${invoice.invoiceNumber}`;
      if (seenInvoices.has(key)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
      seenInvoices.add(key);
    }
    const derived = deriveUnambiguousBilling(events);
    held.push(...derived.held);
    if (!invoice?.composition) continue;
    for (const line of invoice.composition.lines) {
      if (!line.match) continue;
      const match = line.match, binding = authorizedExtras.get(match.extraId);
      if (!binding) continue;
      if (binding.jobId !== match.jobId || binding.canonicalExtraId !== match.extraId || seenExports.has(match.exportLineId)) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
      seenExports.add(match.exportLineId);
      const value = derived.lines.find(l => l.lineId === line.externalInvoiceLineId);
      if (!value) throw new EnterpriseDashboardError("DASHBOARD_INVALID");
      const billed = parseExactPence(value.billedNet), credit = parseExactPence(value.creditedNet);
      const remaining = exactPence(billed.numerator * credit.denominator - credit.numerator * billed.denominator, billed.denominator * credit.denominator);
      const paid = parseExactPence(value.matchedExtraNet);
      for (const [stage, exact] of [["billed", remaining], ["paid", paid]] as const) {
        if (exact.numerator <= 0n || value.rejected) continue;
        contributions.push({ stage, jobId: match.jobId, extraIds: [match.extraId], sourceIds: [...new Set([match.exportLineId, match.revisionId, invoice.sourceEventId,
          ...events.map(e => e.sourceEventId), ...derived.allocations.filter(a => a.lines.some(l => l.lineId === line.externalInvoiceLineId)).map(a => a.sourceRef)])].sort(dashboardCompareText), exactPence: serializeExactPence(exact) });
      }
    }
  }
  contributions.sort((a, b) => dashboardCompareText(`${a.stage}/${a.extraIds[0]}/${a.sourceIds.join("/")}`, `${b.stage}/${b.extraIds[0]}/${b.sourceIds.join("/")}`));
  const result = { version: "enterprise-dashboard-billing.v1", method: { ...method, hash: sha256(dashboardCanonical(method)) },
    inputHash: sha256(dashboardCanonical({ invoices: normalized, authorizedExtras: [...authorizedExtras].map(([id, b]) => [id, { jobId: b.jobId, canonicalExtraId: b.canonicalExtraId }] as const).sort(([a], [b]) => dashboardCompareText(a, b)), method })),
    complete: held.length === 0, held: held.sort((a, b) => dashboardCompareText(`${a.sourceEventId}/${a.reason}`, `${b.sourceEventId}/${b.reason}`)), contributions, totals: billingTotals(contributions) };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}

/** Composes the reference billing projector with the same dimension/period intersection as the captured/approved report. */
export function projectDashboardBillingByDimension(rawFacts: unknown, rawQuery: unknown, invoices: readonly (readonly unknown[])[]) {
  const facts = dashboardParse(dashboardFactsV1, rawFacts), query = dashboardParse(dashboardQueryV1, rawQuery), capture = projectEnterpriseDashboard(facts, query);
  for (const family of invoices) for (const raw of family) if (compareServerInstants(dashboardParse(billingStatusV1, raw).effectiveAt, facts.cutoff) > 0)
    throw new EnterpriseDashboardError("DASHBOARD_INVALID");
  const selected = new Set(capture.contributions.filter(c => c.stage === "captured").flatMap(c => c.extraIds));
  const extras = new Map(facts.extras.filter(e => selected.has(e.extraId)).map(e => [e.extraId, e]));
  const billing = projectDashboardBilling(invoices, extras);
  const grouped = new Map<string | null, Contribution[]>();
  for (const c of billing.contributions) {
    const e = extras.get(c.extraIds[0]!)!;
    const key = query.dimension === "period" ? `${query.from}/${query.until}` : e.dimensions[query.dimension];
    const rows = grouped.get(key) ?? []; rows.push(c); grouped.set(key, rows);
  }
  const groups = [...grouped].sort(([a], [b]) => dashboardCompareText(a ?? "", b ?? "")).map(([id, contributions]) => ({ id, contributions, totals: billingTotals(contributions) }));
  const { outputHash: billingOutputHash, ...fields } = billing;
  const result = { ...fields, billingOutputHash, inputHash: sha256(dashboardCanonical({ capture: capture.inputHash, billing: billing.inputHash })),
    captureMethod: capture.method, groups: groups.slice(query.offset, query.offset + query.limit), groupCount: groups.length };
  return dashboardFreeze({ ...result, outputHash: sha256(dashboardCanonical(result)) });
}
