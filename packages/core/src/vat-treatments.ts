import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt, type Money } from "./money.js";
import { multiplyRatio } from "./rational.js";

/** M4-21 fixture calculations only. No command, invoice executor or M1 policy is changed. */
export const VAT_TREATMENTS_ENABLED = false as const;
export const VAT_SUPPORT_MATRIX_VERSION = "vat.support-matrix.dark.v1" as const;
export const VAT_FIXTURE_LABEL = "fixture, awaiting adviser approval" as const;
const treatment = z.enum(["standard_20", "zero", "reduced_5", "non_vat", "drc_20", "drc_5"]);
export type DarkVatTreatment = z.infer<typeof treatment>;
const matrixRow = (numerator: number, reverseCharge: boolean, wording: string) => Object.freeze({
  numerator, denominator: 100, reverseCharge, wording, approval: "not adviser-approved" as const,
  requiredFields: Object.freeze(["documentReference", "documentDate", "supplierReference", "customerReference",
    "eligibility", "net", "taxBasis", "vatToSupplier", "reverseChargeVat", "gross", "retained", "expectedCash"]),
});
export const VAT_SUPPORT_MATRIX = Object.freeze({
  standard_20: matrixRow(20, false, "Fixture standard-rated supply: VAT 20%."),
  zero: matrixRow(0, false, "Fixture zero-rated supply: VAT 0%; qualifying basis recorded."),
  reduced_5: matrixRow(5, false, "Fixture reduced-rated supply: VAT 5%; qualifying basis recorded."),
  non_vat: matrixRow(0, false, "Fixture supplier not VAT registered; no VAT charged."),
  drc_20: matrixRow(20, true, "Reverse charge: customer to account for VAT to HMRC."),
  drc_5: matrixRow(5, true, "Reverse charge: customer to account for VAT to HMRC."),
});
const id = z.guid().transform(value => value.toLowerCase());
const reference = z.string().trim().min(1).max(120);
const pence = z.number().int().min(0).max(MAX_MONEY_PENCE);
const eligibility = z.object({
  source: z.literal("human_fixture"), actorId: id, evidenceId: id,
  supplierVatRegistered: z.boolean(), supplierVatNumber: reference.nullable(),
  customerVatRegistered: z.boolean(), customerVatNumber: reference.nullable(),
  customerEndUser: z.boolean(), intermediarySupplier: z.boolean(),
  constructionReverseChargeInScope: z.boolean(), qualifyingBasisReference: reference,
}).strict();
const group = z.object({ treatment, eligibility, cumulativeNetPence: pence, retainedNetPence: pence }).strict();
const document = z.object({
  id, previousDocumentId: id.nullable(), kind: z.enum(["interim", "credit_note", "retention_release"]),
  documentReference: reference, documentDate: z.iso.date(),
  interimCertificationId: id, retentionProfileId: id, retentionReleaseId: id.nullable(),
  creditOfDocumentId: id.nullable(), groups: z.array(group).min(1).max(6),
}).strict();
export const vatTreatmentFixtureBookV1 = z.object({
  version: z.literal("vat.fixture-book.v1"), matrixVersion: z.literal(VAT_SUPPORT_MATRIX_VERSION),
  environment: z.literal("synthetic"), label: z.literal(VAT_FIXTURE_LABEL),
  tenantId: id, jobId: id, supplierReference: reference, customerReference: reference,
  // Both are unapproved calculation examples, never a choice of legal tax point.
  taxBasis: z.enum(["full_net", "net_after_retention"]),
  roundingVersion: z.literal("fixture_cumulative_group_half_up_v1"),
  documents: z.array(document).min(1).max(1000),
}).strict();
export type VatTreatmentFixtureBook = z.infer<typeof vatTreatmentFixtureBookV1>;
export type VatTreatmentErrorCode = "INVALID_INPUT" | "ELIGIBILITY_CONFLICT" | "INVALID_LINEAGE" | "VALUE_LIMIT" | "ISSUE_DISABLED";
export class VatTreatmentError extends Error {
  constructor(public readonly code: VatTreatmentErrorCode, message: string) { super(message); this.name = "VatTreatmentError"; }
}
function fail(code: VatTreatmentErrorCode, message: string): never { throw new VatTreatmentError(code, message); }
function checked(value: bigint): number {
  if (value < -BigInt(MAX_MONEY_PENCE) || value > BigInt(MAX_MONEY_PENCE)) fail("VALUE_LIMIT", "VAT fixture exceeds money limit");
  return Number(value);
}
function validateEligibility(item: z.infer<typeof group>) {
  const e = item.eligibility, code = item.treatment;
  if (e.supplierVatRegistered !== (code !== "non_vat")
    || e.supplierVatRegistered !== (e.supplierVatNumber !== null)
    || e.customerVatRegistered !== (e.customerVatNumber !== null)) {
    fail("ELIGIBILITY_CONFLICT", "Explicit registration and VAT number inputs conflict");
  }
  const reverse = VAT_SUPPORT_MATRIX[code].reverseCharge;
  if (reverse !== e.constructionReverseChargeInScope
    || (reverse && (!e.customerVatRegistered || e.customerEndUser || e.intermediarySupplier))) {
    fail("ELIGIBILITY_CONFLICT", "Explicit reverse charge eligibility inputs conflict");
  }
  if (item.retainedNetPence > item.cumulativeNetPence) fail("VALUE_LIMIT", "Retention exceeds net value");
}
const fields = ["net", "taxBasis", "vatToSupplier", "reverseChargeVat", "gross", "fullValueGross", "retained", "retainedVat", "expectedCash"] as const;
type Totals = Record<typeof fields[number], number>;
const emptyTotals = (): Totals => ({ net: 0, taxBasis: 0, vatToSupplier: 0, reverseChargeVat: 0, gross: 0, fullValueGross: 0, retained: 0, retainedVat: 0, expectedCash: 0 });
function amounts(item: z.infer<typeof group>, basis: VatTreatmentFixtureBook["taxBasis"]): Totals {
  const net = BigInt(item.cumulativeNetPence), retained = BigInt(item.retainedNetPence);
  const row = VAT_SUPPORT_MATRIX[item.treatment];
  const tax = (value: bigint) => multiplyRatio(value, BigInt(row.numerator), 100n, "half_up");
  const fullTax = tax(net), retainedVat = basis === "net_after_retention" ? fullTax - tax(net - retained) : 0n;
  const supplierVat = row.reverseCharge ? 0n : fullTax - retainedVat;
  const retainedSupplierVat = row.reverseCharge ? 0n : retainedVat;
  return {
    net: checked(net), taxBasis: checked(basis === "full_net" ? net : net - retained),
    vatToSupplier: checked(supplierVat), reverseChargeVat: checked(row.reverseCharge ? fullTax - retainedVat : 0n),
    gross: checked(net + supplierVat), fullValueGross: checked(net + (row.reverseCharge ? 0n : fullTax)), retained: checked(retained), retainedVat: checked(retainedSupplierVat),
    expectedCash: checked(net + supplierVat - retained),
  };
}
function combine(a: Totals, b: Totals, sign: bigint): Totals {
  const result = emptyTotals();
  for (const field of fields) result[field] = checked(BigInt(a[field]) + sign * BigInt(b[field]));
  return result;
}
function asMoney(values: Totals): Record<keyof Totals, Money> {
  return Object.fromEntries(fields.map(field => [field, moneyFromBigInt(BigInt(values[field]))])) as Record<keyof Totals, Money>;
}
function immutable<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(child => immutable(child)); Object.freeze(value);
  }
  return value;
}
/** A complete cumulative fixture history; no mutation, persistence, settlement or authority is created.
 * Credits reduce the immediately preceding cumulative snapshot. Arbitrary historic credit allocation is unsupported.
 */
export function reconcileVatTreatmentFixtures(input: unknown) {
  const parsed = vatTreatmentFixtureBookV1.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", "Missing or unsupported versioned VAT fixture input; no default treatment");
  const book = parsed.data;
  const ids = new Set<string>(), references = new Set<string>(), releases = new Set<string>();
  let previous: z.infer<typeof document> | undefined;
  let priorTotals = emptyTotals();
  const documents = book.documents.map(current => {
    if (ids.has(current.id) || references.has(current.documentReference)
      || current.previousDocumentId !== (previous?.id ?? null)) fail("INVALID_LINEAGE", "Duplicate or broken document history");
    ids.add(current.id); references.add(current.documentReference);
    if (current.kind === "credit_note" ? !previous || current.creditOfDocumentId !== previous.id : current.creditOfDocumentId !== null) {
      fail("INVALID_LINEAGE", "Credit must reference the preceding cumulative document");
    }
    if ((current.kind === "retention_release") !== (current.retentionReleaseId !== null)) fail("INVALID_LINEAGE", "Release needs explicit M4-20 lineage");
    if (current.retentionReleaseId !== null) {
      if (releases.has(current.retentionReleaseId)) fail("INVALID_LINEAGE", "Retention release identity already consumed");
      releases.add(current.retentionReleaseId);
    }
    if (previous && (current.retentionProfileId !== previous.retentionProfileId || current.groups.length !== previous.groups.length)) {
      fail("INVALID_LINEAGE", "Fixture history cannot change its profile or treatment groups");
    }
    const seen = new Set<string>();
    let totals = emptyTotals();
    const groups = current.groups.map(item => {
      validateEligibility(item);
      if (seen.has(item.treatment)) fail("INVALID_LINEAGE", "One cumulative group per tax code is required");
      seen.add(item.treatment);
      if (current.groups.some(other => other.eligibility.supplierVatNumber !== item.eligibility.supplierVatNumber
        || other.eligibility.customerVatNumber !== item.eligibility.customerVatNumber
        || other.eligibility.customerEndUser !== item.eligibility.customerEndUser
        || other.eligibility.intermediarySupplier !== item.eligibility.intermediarySupplier)) fail("ELIGIBILITY_CONFLICT", "Mixed groups have conflicting registration inputs");
      const prior = previous?.groups.find(other => other.treatment === item.treatment);
      if (previous && (!prior || JSON.stringify(prior.eligibility) !== JSON.stringify(item.eligibility))) {
        fail("INVALID_LINEAGE", "Credit/release must preserve original treatment and eligibility");
      }
      const netDelta = BigInt(item.cumulativeNetPence) - BigInt(prior?.cumulativeNetPence ?? 0);
      const retainedDelta = BigInt(item.retainedNetPence) - BigInt(prior?.retainedNetPence ?? 0);
      if ((current.kind === "interim" && (netDelta < 0n || retainedDelta < 0n))
        || (current.kind === "credit_note" && (netDelta > 0n || retainedDelta > 0n))
        || (current.kind === "retention_release" && (!prior || netDelta !== 0n || retainedDelta > 0n))) {
        fail("VALUE_LIMIT", "Document kind conflicts with cumulative net/retention movement");
      }
      const cumulative = amounts(item, book.taxBasis);
      totals = combine(totals, cumulative, 1n);
      const delta = combine(cumulative, prior ? amounts(prior, book.taxBasis) : emptyTotals(), -1n);
      if (current.kind === "credit_note" && delta.expectedCash > 0) fail("VALUE_LIMIT", "A credit group cannot release extra customer cash");
      return { treatment: item.treatment, wording: VAT_SUPPORT_MATRIX[item.treatment].wording, cumulative: asMoney(cumulative), delta: asMoney(delta) };
    });
    const delta = combine(totals, priorTotals, -1n);
    if (current.kind === "credit_note" && delta.expectedCash > 0) fail("VALUE_LIMIT", "Credit cannot increase expected customer cash");
    previous = current; priorTotals = totals;
    return { source: current, groups, cumulative: asMoney(totals), delta: asMoney(delta) };
  });
  return immutable({ matrixVersion: book.matrixVersion, tenantId: book.tenantId, jobId: book.jobId,
    supplierReference: book.supplierReference, customerReference: book.customerReference,
    taxBasis: book.taxBasis, roundingVersion: book.roundingVersion, label: VAT_FIXTURE_LABEL, approval: "not adviser-approved",
    issueBlockers: ["FEATURE_DISABLED", "D02_D06_ADVISER_APPROVAL_REQUIRED", "EXACT_DECISION_EXECUTOR_REQUIRED"], documents });
}
/** Caller-supplied flags, model output or approval claims cannot activate issue. */
export function assertVatTreatmentIssueAllowed(): never {
  return fail("ISSUE_DISABLED", "Expanded VAT treatments are fixtures awaiting adviser approval; real issue is disabled");
}
