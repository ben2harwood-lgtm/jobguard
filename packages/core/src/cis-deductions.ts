import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { multiplyRatio } from "./rational.js";
import { vatTreatmentFixtureBookV1, reconcileVatTreatmentFixtures } from "./vat-treatments.js";
import { retentionBookV1, reconcileRetentionBook } from "./retention-balances.js";

export const CIS_ENABLED = false as const;
export const CIS_FIXTURE_LABEL = "fixture, awaiting adviser approval" as const;
export const CIS_POLICY_VERSION = "cis.materials-only.cumulative-half-up.dark.v1" as const;
export const CIS_STATUS_MATRIX = Object.freeze({ gross_payment: 0, registered: 20, unregistered: 30 });
const id = z.guid().transform(value => value.toLowerCase());
const reference = z.string().trim().min(1).max(120);
const pence = z.number().int().min(0).max(MAX_MONEY_PENCE);
const context = { id, tenantId: id, jobId: id };
export const cisVerificationFixtureV1 = z.object({
  ...context, version: z.literal("cis.verification-fixture.v1"),
  contractorReference: reference, subcontractorReference: reference,
  status: z.enum(["gross_payment", "registered", "unregistered"]),
  evidenceId: id, evidenceReference: reference, recordedBy: id,
  validFrom: z.iso.date(), validThrough: z.iso.date(),
}).strict();
const payment = z.object({
  ...context, version: z.literal("cis.payment-fixture.v1"),
  paymentReference: reference, paymentDate: z.iso.date(), evidenceId: id,
  cashPence: pence, reversalOfPaymentId: id.nullable(),
}).strict();
const statement = z.object({
  ...context, version: z.literal("cis.statement-fixture.v1"), previousStatementId: id.nullable(),
  kind: z.enum(["payment", "correction"]), correctionOfStatementId: id.nullable(),
  documentReference: reference, documentDate: z.iso.date(), taxMonthEnd: z.iso.date(),
  humanApproval: z.object({ actorId: id, decisionId: id, sourceCalculationReference: reference }).strict(),
  verificationId: id, vatDocumentId: id, retentionProfileId: id,
  cumulativePaidNetPence: pence, cumulativeDirectMaterialsPence: pence,
  materialsEvidenceId: id, cumulativePaidVatPence: pence,
  paymentRecordIds: z.array(id).max(1000),
}).strict();
export const cisFixtureBookV1 = z.object({
  version: z.literal("cis.fixture-book.v1"), environment: z.literal("synthetic"), label: z.literal(CIS_FIXTURE_LABEL),
  policyVersion: z.literal(CIS_POLICY_VERSION), tenantId: id, jobId: id,
  direction: z.enum(["customer_receipt", "subcontractor_payment"]),
  contractorReference: reference, subcontractorReference: reference,
  vatBook: vatTreatmentFixtureBookV1, retentionBook: retentionBookV1,
  verifications: z.array(cisVerificationFixtureV1).min(1).max(1000),
  payments: z.array(payment).max(1000), statements: z.array(statement).min(1).max(1000),
}).strict();
export type CisFixtureBook = z.infer<typeof cisFixtureBookV1>;
export type CisFixtureStatement = z.infer<typeof statement>;
export type CisErrorCode = "INVALID_INPUT" | "CONTEXT_MISMATCH" | "MISSING_SOURCE" | "STALE_VERIFICATION"
  | "INVALID_LINEAGE" | "REPLAY_CONFLICT" | "VALUE_LIMIT" | "ISSUE_DISABLED";
export class CisDeductionError extends Error {
  constructor(public readonly code: CisErrorCode, message: string) { super(message); this.name = "CisDeductionError"; }
}
function fail(code: CisErrorCode, message: string): never { throw new CisDeductionError(code, message); }
function checked(value: bigint) {
  if (value < -BigInt(MAX_MONEY_PENCE) || value > BigInt(MAX_MONEY_PENCE)) fail("VALUE_LIMIT", "CIS fixture exceeds money limit");
  return moneyFromBigInt(value);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(child => freeze(child)); Object.freeze(value); }
  return value;
}
function sources(book: CisFixtureBook) {
  const ids = new Set<string>();
  for (const record of [...book.verifications, ...book.payments, ...book.statements]) {
    if (record.tenantId !== book.tenantId || record.jobId !== book.jobId) fail("CONTEXT_MISMATCH", "CIS source belongs to another tenant or job");
    if (ids.has(record.id)) fail("REPLAY_CONFLICT", "Duplicate CIS source identity");
    ids.add(record.id);
  }
  for (const source of [book.vatBook, book.retentionBook]) {
    if (source.tenantId !== book.tenantId || source.jobId !== book.jobId) fail("CONTEXT_MISMATCH", "VAT/retention context mismatch");
  }
  // In this fixture supplier means subcontractor, customer means contractor, for either cash direction.
  if (book.vatBook.supplierReference !== book.subcontractorReference || book.vatBook.customerReference !== book.contractorReference) {
    fail("CONTEXT_MISMATCH", "VAT parties do not match CIS parties");
  }
  for (const verification of book.verifications) {
    if (verification.contractorReference !== book.contractorReference || verification.subcontractorReference !== book.subcontractorReference) {
      fail("CONTEXT_MISMATCH", "Verification belongs to different parties");
    }
    if (verification.validFrom > verification.validThrough) fail("STALE_VERIFICATION", "Invalid explicit fixture validity interval");
  }
  const vat = reconcileVatTreatmentFixtures(book.vatBook), retention = reconcileRetentionBook(book.retentionBook);
  const latest = vat.documents[vat.documents.length - 1]!;
  if (latest.cumulative.retained.pence !== retention.remaining.netPence
    || latest.cumulative.retainedVat.pence !== retention.remaining.taxPence) fail("VALUE_LIMIT", "VAT and retention balances do not reconcile");
  return vat;
}

/** Pure cumulative fictional statements; no status lookup, evidence verification, posting or issue. */
export function reconcileCisFixtures(input: unknown) {
  const parsed = cisFixtureBookV1.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", "Missing or unsupported CIS inputs; status and rate are never inferred");
  const book = parsed.data, vat = sources(book);
  const verifications = new Map(book.verifications.map(item => [item.id, item]));
  const payments = new Map(book.payments.map(item => [item.id, item]));
  const used = new Set<string>(), references = new Set<string>(), paymentReferences = new Set<string>();
  const reversed = new Map<string, bigint>();
  let previous: CisFixtureStatement | undefined, previousVatIndex = -1;
  let priorBase = 0n, priorDeduction = 0n, priorExpected = 0n, cash = 0n;
  for (const item of book.payments) {
    if (paymentReferences.has(item.paymentReference)) fail("REPLAY_CONFLICT", "Duplicate payment business reference");
    paymentReferences.add(item.paymentReference);
  }
  const statements = book.statements.map(current => {
    if (current.previousStatementId !== (previous?.id ?? null) || references.has(current.documentReference)
      || (previous && current.documentDate < previous.documentDate)) fail("INVALID_LINEAGE", "Broken or duplicate statement history");
    references.add(current.documentReference);
    if (current.kind === "correction" ? !previous || current.correctionOfStatementId !== previous.id : current.correctionOfStatementId !== null) {
      fail("INVALID_LINEAGE", "Correction must append against the preceding statement");
    }
    if (previous && current.verificationId !== previous.verificationId) fail("INVALID_LINEAGE", "Status changes require a separately reviewed policy; cannot recalculate historic payments");
    const verification = verifications.get(current.verificationId);
    if (!verification) fail("MISSING_SOURCE", "Statement requires an explicit evidenced status record");
    const validOn = (date: string) => date >= verification.validFrom && date <= verification.validThrough;
    if (!validOn(current.documentDate)) fail("STALE_VERIFICATION", "Status is missing, future or stale for statement date");
    if (current.taxMonthEnd < current.documentDate) fail("INVALID_INPUT", "Fixture tax month must include statement date");
    const vatIndex = vat.documents.findIndex(item => item.source.id === current.vatDocumentId);
    const source = vat.documents[vatIndex];
    const profile = book.retentionBook.records.find(item => item.version === "retention.profile.v1" && item.id === current.retentionProfileId);
    if (!source || !profile || source.source.retentionProfileId !== profile.id || vatIndex < previousVatIndex
      || source.source.documentDate > current.documentDate) fail("MISSING_SOURCE", "Missing, future or out-of-order VAT/retention source");
    if (source.source.retentionReleaseId !== null && !book.retentionBook.records.some(item =>
      item.version === "retention.release.v1" && item.id === source.source.retentionReleaseId)) {
      fail("MISSING_SOURCE", "VAT release requires its M4-20 release record");
    }
    const net = BigInt(current.cumulativePaidNetPence), materials = BigInt(current.cumulativeDirectMaterialsPence);
    const paidVat = BigInt(current.cumulativePaidVatPence), base = net - materials;
    if (materials > net || net > BigInt(source.cumulative.net.pence) - BigInt(source.cumulative.retained.pence)
      || paidVat > BigInt(source.cumulative.vatToSupplier.pence)) fail("VALUE_LIMIT", "Paid components exceed separate VAT/retention source limits");
    if (previous && current.kind !== "correction" && (net < BigInt(previous.cumulativePaidNetPence)
      || materials < BigInt(previous.cumulativeDirectMaterialsPence) || paidVat < BigInt(previous.cumulativePaidVatPence) || base < priorBase)) {
      fail("INVALID_LINEAGE", "Reducing an earlier paid calculation requires a correction");
    }
    const deduction = multiplyRatio(base, BigInt(CIS_STATUS_MATRIX[verification.status]), 100n, "half_up");
    const expected = net + paidVat - deduction;
    const invoiceExpected = BigInt(source.cumulative.expectedCash.pence) - deduction;
    for (const paymentId of current.paymentRecordIds) {
      const item = payments.get(paymentId);
      if (!item) fail("MISSING_SOURCE", "Statement references an absent payment record");
      if (used.has(paymentId)) fail("REPLAY_CONFLICT", "Payment record already reconciled");
      if (!validOn(item.paymentDate) || item.paymentDate > current.documentDate) fail("STALE_VERIFICATION", "Payment has no applicable status evidence at its date");
      if (item.cashPence === 0) fail("VALUE_LIMIT", "Zero cash is not a payment record");
      if (item.reversalOfPaymentId !== null) {
        const original = payments.get(item.reversalOfPaymentId);
        if (!original || !used.has(original.id) || original.reversalOfPaymentId !== null || original.paymentDate > item.paymentDate) {
          fail("INVALID_LINEAGE", "Cash reversal must reference an earlier reconciled original payment");
        }
        const total = (reversed.get(original.id) ?? 0n) + BigInt(item.cashPence);
        if (total > BigInt(original.cashPence)) fail("VALUE_LIMIT", "Cash reversal exceeds original payment");
        reversed.set(original.id, total); cash -= BigInt(item.cashPence);
      } else cash += BigInt(item.cashPence);
      checked(cash); used.add(paymentId);
    }
    const delta = { deduction: checked(deduction - priorDeduction), expectedCash: checked(expected - priorExpected) };
    previous = current; previousVatIndex = vatIndex; priorBase = base; priorDeduction = deduction; priorExpected = expected;
    return { source: current, verification, vatSource: source, retentionProfile: profile,
      policyVersion: book.policyVersion, vatMatrixVersion: vat.matrixVersion, vatRoundingVersion: vat.roundingVersion,
      rateNumerator: CIS_STATUS_MATRIX[verification.status], rateDenominator: 100,
      invoiceNet: source.cumulative.net, vatToSupplier: source.cumulative.vatToSupplier,
      reverseChargeVat: source.cumulative.reverseChargeVat, retention: source.cumulative.retained,
      deferredRetainedVat: source.cumulative.retainedVat, invoiceGross: source.cumulative.gross,
      paidNet: checked(net), directMaterials: checked(materials), paidVat: checked(paidVat),
      deductionBase: checked(base), cisDeduction: checked(deduction), expectedCash: checked(expected), actualCash: checked(cash),
      unpaidCash: checked(expected > cash ? expected - cash : 0n), refundDue: checked(cash > expected ? cash - expected : 0n),
      invoiceExpectedCash: checked(invoiceExpected),
      invoiceUnpaidCash: checked(invoiceExpected > cash ? invoiceExpected - cash : 0n),
      invoiceRefundDue: checked(cash > invoiceExpected ? cash - invoiceExpected : 0n),
      unallocatedInvoiceVat: checked(BigInt(source.cumulative.vatToSupplier.pence) - paidVat),
      unallocatedInvoiceNet: checked(BigInt(source.cumulative.net.pence) - BigInt(source.cumulative.retained.pence) - net),
      feeEligibleRecovery: checked(0n), delta };
  });
  if (used.size !== payments.size) fail("MISSING_SOURCE", "Every supplied payment must reconcile to a statement");
  return freeze({ version: "cis.reconciliation.dark.v1", label: CIS_FIXTURE_LABEL, approval: "not adviser-approved",
    tenantId: book.tenantId, jobId: book.jobId, direction: book.direction, policyVersion: book.policyVersion,
    issueBlockers: ["FEATURE_DISABLED", "D02_D06_ADVISER_APPROVAL_REQUIRED", "EXACT_DECISION_EXECUTOR_REQUIRED"], statements });
}

/** An exact retry is harmless; a changed record under the same identity is refused. */
export function appendCisFixtureStatement(input: unknown, statementInput: unknown): CisFixtureBook {
  reconcileCisFixtures(input);
  const book = cisFixtureBookV1.parse(input), parsed = statement.safeParse(statementInput);
  if (!parsed.success) fail("INVALID_INPUT", "Invalid versioned CIS statement");
  const previous = book.statements.find(item => item.id === parsed.data.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(parsed.data)) fail("REPLAY_CONFLICT", "Statement identity cannot rewrite historic calculations");
    return freeze(book);
  }
  const next = { ...book, statements: [...book.statements, parsed.data] };
  reconcileCisFixtures(next); return freeze(next);
}
export function assertCisIssueAllowed(): never { return fail("ISSUE_DISABLED", "CIS real calculation, document issue and statutory returns are disabled"); }
