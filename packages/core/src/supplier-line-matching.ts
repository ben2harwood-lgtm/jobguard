import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { divideRounded } from "./rational.js";
import { receiptQuantityMicros } from "./supplier-documents.js";
import { matchDigest } from "./supplier-matching.js";

const ref = z.string().trim().min(1).max(200);
const uuid = z.guid().transform(value => value.toLowerCase());
const quantity = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/u);
const positive = quantity.refine(value => !quantity.safeParse(value).success || receiptQuantityMicros(value) > 0n);
const pence = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const identity = {
  lineId: uuid, versionId: uuid, documentVersionId: uuid, sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  page: z.number().int().positive(), sku: ref, orderReference: ref, unit: ref,
  baseUnit: ref, unitsPerPack: positive.nullable(),
};
const orderV1 = z.object({ ...identity, quantity: positive, unitNetPence: pence,
  discountBps: z.number().int().min(0).max(10_000), rateVersionId: uuid,
  validFrom: z.iso.date(), validTo: z.iso.date(),
}).strict().refine(row => row.validFrom <= row.validTo);
const receiptV1 = z.object({ ...identity, acceptedQuantity: quantity }).strict();
const billV1 = z.object({ ...identity, kind: z.enum(["invoice", "credit"]), documentReference: ref,
  quantity: positive, netPence: pence, taxBasis: z.enum(["net", "gross", "unknown"]),
  supplyDate: z.iso.date(), creditsInvoiceVersionId: uuid.nullable(),
}).strict().refine(row => row.kind === "credit" ? row.creditsInvoiceVersionId !== null : row.creditsInvoiceVersionId === null);
export const supplierLineMatchInputV1 = z.object({
  version: z.literal("supplier-line-match-input.v1"), environment: z.literal("synthetic_demo"),
  tenantId: uuid, jobId: uuid, merchantId: uuid,
  orders: z.array(orderV1).max(500), receipts: z.array(receiptV1).max(500), bills: z.array(billV1).max(500),
  aliases: z.array(z.object({ alias: ref, sku: ref }).strict()).max(500),
  mappings: z.array(z.object({ sourceVersionId: uuid, orderVersionId: uuid, approvalRef: ref }).strict()).max(1000),
}).strict().superRefine((input, ctx) => {
  const rows = [...input.orders, ...input.receipts, ...input.bills];
  if (new Set(rows.map(row => row.versionId)).size !== rows.length || new Set(rows.map(row => row.lineId)).size !== rows.length)
    ctx.addIssue({ code: "custom", message: "Supply exactly one current immutable version per line" });
  const sources = new Set([...input.receipts, ...input.bills].map(row => row.versionId));
  const documents = new Map<string, string>();
  for (const row of rows) {
    const metadata = JSON.stringify([row.sourceHash, "kind" in row ? row.kind : "source",
      "documentReference" in row ? normalize(row.documentReference) : null]);
    if (documents.has(row.documentVersionId) && documents.get(row.documentVersionId) !== metadata)
      ctx.addIssue({ code: "custom", message: "Conflicting immutable document metadata" });
    documents.set(row.documentVersionId, metadata);
  }
  if (input.mappings.some(m => !sources.has(m.sourceVersionId) || !input.orders.some(o => o.versionId === m.orderVersionId)))
    ctx.addIssue({ code: "custom", message: "Mapping references absent source versions" });
});
export type SupplierLineMatchInput = z.infer<typeof supplierLineMatchInputV1>;
type Order = z.infer<typeof orderV1>;
type Source = z.infer<typeof receiptV1> | z.infer<typeof billV1>;
export type SupplierLineMatchIssue = { id: string; code: string; sourceVersionIds: string[] };
export type SupplierLineMatchGroup = {
  id: string; orderVersionId: string; receiptVersionIds: string[]; billVersionIds: string[];
  orderedQuantity: string | null; deliveredQuantity: string | null; billedQuantity: string | null;
  quantityScale: "1000000000000"; issues: SupplierLineMatchIssue[];
};
const normalize = (value: string) => value.trim().replace(/\s+/gu, " ").toUpperCase();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sorted = <T extends { versionId: string }>(rows: T[]) => [...rows].sort((a, b) => compare(a.versionId, b.versionId));
const packQuantity = (row: Source | Order, value: string) => row.unitsPerPack === null ? null
  : receiptQuantityMicros(value) * receiptQuantityMicros(row.unitsPerPack);

export class SupplierLineMatchError extends Error {
  constructor(readonly code: "INVALID_MATCH_INPUT") { super(code); this.name = "SupplierLineMatchError"; }
}

/** Pure proposals over server-scoped, human-confirmed synthetic facts. Never authorizes debt or fees. */
export function matchSupplierLines(raw: unknown) {
  const parsed = supplierLineMatchInputV1.safeParse(raw);
  if (!parsed.success) throw new SupplierLineMatchError("INVALID_MATCH_INPUT");
  const input = parsed.data;
  input.orders = sorted(input.orders); input.receipts = sorted(input.receipts); input.bills = sorted(input.bills);
  input.aliases.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  input.mappings.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  const scope = [input.version, input.tenantId, input.jobId, input.merchantId];
  const identify = (...parts: unknown[]) => matchDigest(JSON.stringify([...scope, ...parts]));
  const issue = (code: string, ids: string[]): SupplierLineMatchIssue => {
    const sourceVersionIds = [...ids].sort();
    return { id: identify(code, sourceVersionIds), code, sourceVersionIds };
  };
  const sku = (value: string): string | null => {
    const key = normalize(value), targets = new Set(input.aliases.filter(a => normalize(a.alias) === key).map(a => normalize(a.sku)));
    return targets.size > 1 ? null : [...targets][0] ?? key;
  };
  const unresolved: SupplierLineMatchIssue[] = [];
  const assigned = new Map<string, Source[]>();
  // A repeated document reference is a candidate duplicate, never additional debt.
  const allSources = [...input.receipts, ...input.bills];
  const duplicates = new Set(allSources.filter(source => allSources.some(other =>
    other.documentVersionId !== source.documentVersionId && (other.sourceHash === source.sourceHash
      || ("kind" in source && "kind" in other && other.kind === source.kind
        && normalize(other.documentReference) === normalize(source.documentReference))),
  )).map(source => source.versionId));
  for (const source of [...input.receipts, ...input.bills]) {
    if (duplicates.has(source.versionId)) { unresolved.push(issue("duplicate_document", [source.versionId])); continue; }
    const mappings = input.mappings.filter(m => m.sourceVersionId === source.versionId);
    const candidates = mappings.length ? input.orders.filter(o => mappings.some(m => m.orderVersionId === o.versionId))
      : input.orders.filter(o => normalize(o.orderReference) === normalize(source.orderReference)
        && sku(source.sku) !== null && sku(o.sku) !== null && sku(o.sku) === sku(source.sku));
    if (candidates.length !== 1) {
      unresolved.push(issue(candidates.length ? "ambiguous_order" : "unmatched_line", [source.versionId])); continue;
    }
    const order = candidates[0]!;
    if (source.baseUnit !== order.baseUnit || source.unitsPerPack === null || order.unitsPerPack === null) {
      unresolved.push(issue("missing_unit_conversion", [source.versionId, order.versionId])); continue;
    }
    assigned.set(order.versionId, [...(assigned.get(order.versionId) ?? []), source]);
  }
  const groups: SupplierLineMatchGroup[] = input.orders.map(order => {
    const sources = assigned.get(order.versionId) ?? [];
    const receipts = sources.filter((s): s is z.infer<typeof receiptV1> => "acceptedQuantity" in s);
    const bills = sources.filter((s): s is z.infer<typeof billV1> => "kind" in s);
    const issues: SupplierLineMatchIssue[] = [];
    const add = (code: string, ids: string[]) => issues.push(issue(code, ids));
    const ordered = packQuantity(order, order.quantity);
    const delivered = receipts.reduce((n, r) => n + packQuantity(r, r.acceptedQuantity)!, 0n);
    let billed = 0n;
    let invalidCredit = false;
    const credits = new Map<string, { quantity: bigint; net: bigint }>();
    for (const bill of bills) {
      const q = packQuantity(bill, bill.quantity)!;
      if (bill.kind === "credit") {
        const original = bills.find(b => b.kind === "invoice" && b.versionId === bill.creditsInvoiceVersionId);
        if (!original) { add("unlinked_credit", [bill.versionId]); invalidCredit = true; continue; }
        const total = credits.get(original.versionId) ?? { quantity: 0n, net: 0n };
        total.quantity += q; total.net += BigInt(bill.netPence); credits.set(original.versionId, total);
      }
      billed += bill.kind === "credit" ? -q : q;
      if (bill.taxBasis !== "net") { add("incomparable_tax_basis", [bill.versionId]); continue; }
      if (bill.supplyDate < order.validFrom || bill.supplyDate > order.validTo) {
        add("rate_outside_validity", [order.rateVersionId, bill.versionId]); continue;
      }
      const expected = divideRounded(q * BigInt(order.unitNetPence) * BigInt(10_000 - order.discountBps),
        receiptQuantityMicros(order.unitsPerPack!) * 1_000_000n * 10_000n, "half_even");
      // Checked conversion enforces the shared application limit before comparing net pence.
      if (moneyFromBigInt(expected).pence !== bill.netPence) add("net_price_variance", [order.versionId, bill.versionId]);
    }
    for (const [versionId, total] of credits) {
      const original = bills.find(b => b.versionId === versionId)!;
      if (total.quantity > packQuantity(original, original.quantity)! || total.net > BigInt(original.netPence)) {
        invalidCredit = true;
        add("credit_exceeds_invoice", [versionId, ...bills.filter(b => b.creditsInvoiceVersionId === versionId).map(b => b.versionId)]);
      }
    }
    if (!receipts.length) add("missing_receipt", [order.versionId]);
    if (!bills.some(b => b.kind === "invoice")) add("missing_invoice", [order.versionId]);
    // Any unresolved source could belong to this order: never publish partial sums as complete facts.
    const complete = unresolved.length === 0;
    if (ordered === null) add("missing_unit_conversion", [order.versionId]);
    else if (complete && receipts.length && delivered < ordered) add("short_delivery", [order.versionId, ...receipts.map(r => r.versionId)]);
    else if (complete && delivered > ordered) add("over_delivery", [order.versionId, ...receipts.map(r => r.versionId)]);
    if (complete && !invalidCredit && billed > delivered) add("billed_above_received", [order.versionId, ...bills.map(b => b.versionId), ...receipts.map(r => r.versionId)]);
    return { id: identify("group", order.versionId), orderVersionId: order.versionId,
      receiptVersionIds: receipts.map(r => r.versionId), billVersionIds: bills.map(b => b.versionId),
      orderedQuantity: ordered?.toString() ?? null, deliveredQuantity: complete ? delivered.toString() : null, billedQuantity: complete && !invalidCredit ? billed.toString() : null,
      quantityScale: "1000000000000", issues };
  });
  return { version: "supplier-line-match-result.v1" as const, environment: "synthetic_demo" as const,
    digest: identify(input), status: "proposal_requires_confirmation" as const, groups, unresolved };
}
