import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt, type Money } from "./money.js";
import { projectInvoiceBalance } from "./customer-billing.js";

/** M4-18 is a synthetic, in-memory draft model. No route, worker, provider or runtime grant enables it.
 * Approval IDs are fixture lineage references, not verified authority. This module cannot promote
 * draft records into commercial documents; a future command boundary must load approved sources.
 */
export const INTERIM_APPLICATIONS_ENABLED = false as const;
export const INTERIM_APPLICATION_WATERMARK = "SYNTHETIC DRAFT - NOT FOR ISSUE" as const;
const id = z.guid().transform(value => value.toLowerCase());
const pence = z.number().int().min(0).max(MAX_MONEY_PENCE);
const signedPence = z.number().int().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE);
const revision = z.number().int().positive().max(2147483647);
const context = { id, tenantId: id, jobId: id };
const valueLine = z.object({ scopeItemId: id, netPence: pence }).strict();
const values = z.array(valueLine).min(1).max(10000);
const scheduleLine = z.object({
  id, scopeItemId: id, commercialRevisionId: id, sourceDocumentId: id,
  kind: z.enum(["baseline", "approved_variation"]), approvalDecisionId: id.nullable(), netPence: signedPence,
}).strict();

export const interimScheduleV1 = z.object({
  ...context, version: z.literal("interim.schedule.v1"), revision,
  previousScheduleId: id.nullable(), baselineSnapshotId: id, approvalDecisionId: id,
  valuationDates: z.array(z.iso.date()).min(1).max(1000),
  jurisdiction: z.string().trim().min(1).max(120), arrangement: z.string().trim().min(1).max(120),
  d06TemplateVersion: z.string().trim().min(1).max(120).nullable(),
  d02TaxPolicyVersion: z.string().trim().min(1).max(120).nullable(),
  lines: z.array(scheduleLine).min(1).max(10000),
}).strict();
export const interimApplicationV1 = z.object({
  ...context, version: z.literal("interim.application.v1"), applicationId: id, revision,
  previousRevisionId: id.nullable(), scheduleId: id, valuationDate: z.iso.date(), kind: z.enum(["interim", "final_account"]),
  cumulativeValues: values,
}).strict();
export const interimCertificationV1 = z.object({
  ...context, version: z.literal("interim.certification.v1"), applicationRevisionId: id,
  certificateReference: z.string().trim().min(1).max(120), cumulativeValues: values,
}).strict();
export const interimInvoiceDraftV1 = z.object({
  ...context, version: z.literal("interim.invoice-draft.v1"), certificationId: id,
  lines: values, taxPence: pence,
}).strict();
export const interimCreditDraftV1 = z.object({
  ...context, version: z.literal("interim.credit-draft.v1"), invoiceId: id,
  lines: values, taxPence: pence,
}).strict();
export const interimReceiptV1 = z.object({
  ...context, version: z.literal("interim.synthetic-receipt.v1"), invoiceId: id, amountPence: pence,
}).strict();
export const interimRecordV1 = z.discriminatedUnion("version", [
  interimScheduleV1, interimApplicationV1, interimCertificationV1,
  interimInvoiceDraftV1, interimCreditDraftV1, interimReceiptV1,
]);
export const interimDraftBookV1 = z.object({
  version: z.literal("interim.draft-book.v1"), environment: z.literal("synthetic"), tenantId: id, jobId: id,
  records: z.array(interimRecordV1).max(10000),
}).strict();
export type InterimDraftBook = z.infer<typeof interimDraftBookV1>;
export type InterimDraftRecord = z.infer<typeof interimRecordV1>;
type Schedule = z.infer<typeof interimScheduleV1>;
type Application = z.infer<typeof interimApplicationV1>;
type Certification = z.infer<typeof interimCertificationV1>;
type Invoice = z.infer<typeof interimInvoiceDraftV1>;
type ValueLine = z.infer<typeof valueLine>;
export type InterimErrorCode = "INVALID_INPUT" | "CONTEXT_MISMATCH" | "REPLAY_CONFLICT" | "MISSING_SOURCE"
  | "STALE_REVISION" | "INVALID_LINEAGE" | "VALUE_LIMIT" | "DUPLICATE_LINE" | "ISSUE_DISABLED";
export class InterimApplicationError extends Error {
  constructor(public readonly code: InterimErrorCode, message: string) {
    super(message);
    this.name = "InterimApplicationError";
  }
}
function fail(code: InterimErrorCode, message: string): never { throw new InterimApplicationError(code, message); }
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) fail("INVALID_INPUT", "Invalid versioned interim draft input");
  return result.data;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const sum = (amounts: Iterable<number>): Money => moneyFromBigInt([...amounts].reduce((total, n) => total + BigInt(n), 0n));
function lineMap(lines: readonly ValueLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (map.has(line.scopeItemId)) fail("DUPLICATE_LINE", "Each scope identity must appear once in a valuation");
    map.set(line.scopeItemId, line.netPence);
  }
  return map;
}
function scheduleValues(schedule: Schedule): Map<string, number> {
  if (new Set(schedule.valuationDates).size !== schedule.valuationDates.length) {
    fail("INVALID_LINEAGE", "Contract schedule contains duplicate valuation dates");
  }
  const map = new Map<string, number>();
  const ids = new Set<string>();
  const baselineScopes = new Set<string>();
  const sources = new Set<string>();
  for (const line of schedule.lines) {
    if (ids.has(line.id)) fail("DUPLICATE_LINE", "Duplicate schedule source identity");
    ids.add(line.id);
    const source = JSON.stringify([line.kind, line.sourceDocumentId, line.commercialRevisionId, line.scopeItemId]);
    if (sources.has(source)) fail("DUPLICATE_LINE", "The same commercial source cannot enter a schedule twice");
    sources.add(source);
    if (line.kind === "baseline") {
      if (line.approvalDecisionId !== null || line.netPence < 0 || baselineScopes.has(line.scopeItemId)
        || line.sourceDocumentId !== schedule.baselineSnapshotId) fail("INVALID_LINEAGE", "Invalid accepted baseline lineage");
      baselineScopes.add(line.scopeItemId);
    } else if (line.approvalDecisionId === null) fail("INVALID_LINEAGE", "A schedule adjustment needs exact approved variation lineage");
    map.set(line.scopeItemId, sum([map.get(line.scopeItemId) ?? 0, line.netPence]).pence);
  }
  if (baselineScopes.size === 0) fail("INVALID_LINEAGE", "An accepted baseline is required");
  if ([...map.values()].some(n => n < 0)) fail("VALUE_LIMIT", "Omitted work exceeds the scheduled scope value");
  sum(map.values());
  return map;
}
function boundedValues(lines: ValueLine[], ceiling: Map<string, number>): Map<string, number> {
  const map = lineMap(lines);
  // Complete snapshots avoid silently carrying an omitted or missing line forward.
  if (map.size !== ceiling.size || [...ceiling.keys()].some(key => !map.has(key))) {
    fail("INVALID_LINEAGE", "A cumulative valuation must cover every scheduled scope identity, including zero values");
  }
  for (const [key, amount] of map) if (amount > (ceiling.get(key) ?? 0)) fail("VALUE_LIMIT", "Cumulative value exceeds its approved source");
  sum(map.values());
  return map;
}
type Projection = {
  schedule: Schedule | undefined; application: Application | undefined; certification: Certification | undefined;
  scheduled: Map<string, number>; applied: Map<string, number>; certified: Map<string, number>;
  invoiced: Map<string, number>; invoices: Map<string, Invoice>;
  credits: Map<string, Map<string, number>>; creditedTax: Map<string, number>; receipts: Map<string, number>;
};
function project(records: InterimDraftRecord[]): Projection {
  const state: Projection = {
    schedule: undefined, application: undefined, certification: undefined,
    scheduled: new Map(), applied: new Map(), certified: new Map(), invoiced: new Map(),
    invoices: new Map(), credits: new Map(), creditedTax: new Map(), receipts: new Map(),
  };
  const applications = new Map<string, Application>();
  const certificates = new Set<string>();
  for (const record of records) {
    switch (record.version) {
      case "interim.schedule.v1": {
        const previous = state.schedule;
        if (record.revision !== (previous?.revision ?? 0) + 1 || record.previousScheduleId !== (previous?.id ?? null)) {
          fail("STALE_REVISION", "Schedule revisions must extend the current schedule");
        }
        if (previous && (record.baselineSnapshotId !== previous.baselineSnapshotId
          || record.lines.length < previous.lines.length
          || previous.lines.some((line, i) => JSON.stringify(line) !== JSON.stringify(record.lines[i]))
          || record.lines.slice(previous.lines.length).some(line => line.kind !== "approved_variation"))) {
          fail("INVALID_LINEAGE", "Earlier schedule sources cannot be rewritten; append approved adjustments");
        }
        state.scheduled = scheduleValues(record);
        state.schedule = record;
        state.application = undefined;
        state.certification = undefined;
        state.applied = new Map(); state.certified = new Map();
        break;
      }
      case "interim.application.v1": {
        if (!state.schedule || record.scheduleId !== state.schedule.id) fail("STALE_REVISION", "Use the current approved schedule");
        if (!state.schedule.valuationDates.includes(record.valuationDate)) fail("INVALID_LINEAGE", "Application date is absent from the approved contract schedule");
        const previous = applications.get(record.applicationId);
        if (record.revision !== (previous?.revision ?? 0) + 1 || record.previousRevisionId !== (previous?.id ?? null)
          || (previous && previous.kind !== record.kind)) fail("STALE_REVISION", "Application revisions must extend their own immutable history");
        state.applied = boundedValues(record.cumulativeValues, state.scheduled);
        applications.set(record.applicationId, record);
        state.application = record;
        state.certification = undefined; state.certified = new Map();
        break;
      }
      case "interim.certification.v1": {
        if (certificates.has(record.certificateReference)) fail("REPLAY_CONFLICT", "A certificate reference cannot be rewritten under another identity");
        certificates.add(record.certificateReference);
        if (!state.application || record.applicationRevisionId !== state.application.id) fail("STALE_REVISION", "Certification must reference the current application revision");
        state.certified = boundedValues(record.cumulativeValues, state.applied);
        state.certification = record;
        break;
      }
      case "interim.invoice-draft.v1": {
        if (!state.certification || record.certificationId !== state.certification.id) fail("STALE_REVISION", "Draft invoice needs the current separate certification");
        const lines = lineMap(record.lines);
        if (sum(lines.values()).pence === 0) fail("VALUE_LIMIT", "A draft invoice must consume completed net value");
        for (const [key, amount] of lines) {
          if (!state.certified.has(key)) fail("INVALID_LINEAGE", "Invoice scope is absent from the certification");
          const cumulative = sum([state.invoiced.get(key) ?? 0, amount]).pence;
          if (cumulative > (state.certified.get(key) ?? 0)) fail("VALUE_LIMIT", "The same completed value cannot be invoiced twice");
          state.invoiced.set(key, cumulative);
        }
        sum([sum(lines.values()).pence, record.taxPence]);
        state.invoices.set(record.id, record);
        break;
      }
      case "interim.credit-draft.v1": {
        const invoice = state.invoices.get(record.invoiceId);
        if (!invoice) fail("MISSING_SOURCE", "Credit must reference an earlier invoice draft");
        const original = lineMap(invoice.lines), credits = state.credits.get(invoice.id) ?? new Map<string, number>();
        for (const [key, amount] of lineMap(record.lines)) {
          const credited = sum([credits.get(key) ?? 0, amount]).pence;
          if (!original.has(key) || credited > (original.get(key) ?? 0)) fail("VALUE_LIMIT", "Credit exceeds the referenced invoice line");
          credits.set(key, credited);
          state.invoiced.set(key, sum([state.invoiced.get(key) ?? 0, -amount]).pence);
        }
        const tax = sum([state.creditedTax.get(invoice.id) ?? 0, record.taxPence]).pence;
        if (tax > invoice.taxPence) fail("VALUE_LIMIT", "Tax credit exceeds the referenced invoice tax");
        state.credits.set(invoice.id, credits); state.creditedTax.set(invoice.id, tax);
        break;
      }
      case "interim.synthetic-receipt.v1": {
        if (!state.invoices.has(record.invoiceId)) fail("MISSING_SOURCE", "Receipt must reference a separate invoice draft");
        state.receipts.set(record.invoiceId, sum([state.receipts.get(record.invoiceId) ?? 0, record.amountPence]).pence);
        break;
      }
    }
  }
  return state;
}

/** Validates the whole imported synthetic history, including context, replay identity and value limits. */
function validatedBook(input: unknown): InterimDraftBook {
  const book = parse(interimDraftBookV1, input);
  const ids = new Set<string>();
  for (const record of book.records) {
    if (record.tenantId !== book.tenantId || record.jobId !== book.jobId) fail("CONTEXT_MISMATCH", "Record belongs to another tenant or job");
    if (ids.has(record.id)) fail("REPLAY_CONFLICT", "Duplicate record identity in history");
    ids.add(record.id);
  }
  project(book.records);
  return book;
}

/** Append-only copies, never amendments to earlier documents. Identical record retries are no-ops. */
export function appendInterimDraftRecord(bookInput: unknown, recordInput: unknown): InterimDraftBook {
  const book = validatedBook(bookInput), record = parse(interimRecordV1, recordInput);
  const prior = book.records.find(item => item.id === record.id);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(record)) fail("REPLAY_CONFLICT", "Record identity reused with different content");
    return freeze(book);
  }
  return freeze(validatedBook({ ...book, records: [...book.records, record] }));
}

export type InterimDraftBlocker = "FEATURE_DISABLED" | "D06_TEMPLATE_REQUIRED" | "D02_TAX_RULES_REQUIRED" | "UNSUPPORTED_ARRANGEMENT";
export function interimDraftIssueBlockers(scheduleInput: unknown): readonly InterimDraftBlocker[] {
  const schedule = parse(interimScheduleV1, scheduleInput);
  const blockers: InterimDraftBlocker[] = ["FEATURE_DISABLED"];
  if (!schedule.d06TemplateVersion) blockers.push("D06_TEMPLATE_REQUIRED");
  if (!schedule.d02TaxPolicyVersion) blockers.push("D02_TAX_RULES_REQUIRED");
  // A synthetic reference shape, not a professional template approval or production allowlist.
  if (schedule.arrangement !== "synthetic_staged" || schedule.jurisdiction !== "synthetic_england_wales") blockers.push("UNSUPPORTED_ARRANGEMENT");
  return Object.freeze(blockers);
}

/** Fail closed even for a timer, suggestion or claimed approval. Future real issue needs its own exact Decision executor. */
export function assertInterimDocumentIssueAllowed(): never {
  return fail("ISSUE_DISABLED", "Interim documents are synthetic drafts only; D06/D02 approval and an exact Decision execution path are not implemented");
}

/** Net construction value and gross cash are deliberately separate; tax is explicit synthetic input, never inferred. */
export function reconcileInterimDraftBook(input: unknown) {
  const book = validatedBook(input), state = project(book.records);
  const lines = [...state.scheduled].map(([scopeItemId, scheduled]) => {
    const applied = state.applied.get(scopeItemId) ?? 0, certified = state.certified.get(scopeItemId) ?? 0;
    const invoiced = state.invoiced.get(scopeItemId) ?? 0;
    return {
      scopeItemId, scheduled: sum([scheduled]), applied: sum([applied]), certified: sum([certified]), invoiced: sum([invoiced]),
      invoiceable: sum([Math.max(0, certified - invoiced)]),
      finalAccountRemaining: state.application ? sum([applied, -invoiced]) : null,
      creditRequired: state.application ? sum([Math.max(0, invoiced - applied)]) : null,
    };
  });
  const balances = [...state.invoices.values()].map(invoice => ({
    invoiceId: invoice.id,
    ...projectInvoiceBalance({
      totalPence: sum([sum(invoice.lines.map(line => line.netPence)).pence, invoice.taxPence]).pence,
      creditPence: sum([sum(state.credits.get(invoice.id)?.values() ?? []).pence, state.creditedTax.get(invoice.id) ?? 0]).pence,
      receiptPence: state.receipts.get(invoice.id) ?? 0,
    }),
  }));
  return freeze({
    version: "interim.reconciliation.v1" as const, watermark: INTERIM_APPLICATION_WATERMARK,
    scheduleId: state.schedule?.id ?? null, applicationRevisionId: state.application?.id ?? null,
    certificationId: state.certification?.id ?? null,
    valuationPending: state.application === undefined, lines, invoiceBalances: balances,
    priorApplicationRevisionIds: book.records.filter(record => record.version === "interim.application.v1").map(record => record.id),
    netInvoiced: sum(state.invoiced.values()), grossReceived: sum(state.receipts.values()),
    grossOutstanding: sum(balances.map(balance => balance.balance.pence)),
    unappliedCash: sum(balances.map(balance => balance.unappliedCredit.pence)),
    issueBlockers: state.schedule ? interimDraftIssueBlockers(state.schedule) : ["FEATURE_DISABLED" as const],
  });
}
