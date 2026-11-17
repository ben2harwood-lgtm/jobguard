import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { sha256 } from "./evidence-pack.js";
import {
  exactPence, exactPenceInputV1, exactPenceV1, parseExactPence, serializeExactPence,
  compareExactPence, sumExactPence, MAX_ALLOCATION_LINES, type ExactPence,
} from "./cumulative-fee.js";
import { allocateReceiptToLines, instantV1 } from "./receipt-allocation.js";
import { compareServerInstants } from "./enterprise-domain/contracts.js";

/** Independent data tools only. These functions establish no approval, match or execution authority. */
export const BILLING_SANDBOX_LABEL = "Practice sandbox — synthetic data; nothing is sent or charged";
const uuid = z.guid({ error: "Invalid uuid" }).transform(v => v.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const identity = z.string().min(1).max(200).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
const amount = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
const amountShape = { netPence: amount, vatPence: amount, grossPence: amount };
type Amounts = { netPence: number; vatPence: number; grossPence: number };
const validAmounts = (v: Amounts) => [v.netPence, v.vatPence, v.grossPence].every(Number.isSafeInteger) &&
  BigInt(v.netPence) + BigInt(v.vatPence) === BigInt(v.grossPence);
export const billingAmountsV1 = z.object(amountShape).strict().refine(validAmounts, "Net plus VAT must equal gross");
export const billingExportMatchV1 = z.object({ exportLineId: uuid, jobId: uuid, extraId: uuid,
  scopeItemId: uuid, revisionId: uuid, revisionHash: hash }).strict();
export const billingInvoiceLineV1 = z.object({ externalInvoiceLineId: identity,
  kind: z.enum(["original_order", "extra", "other"]), existedAt: instantV1,
  ...amountShape, match: billingExportMatchV1.nullable(),
}).strict().refine(validAmounts).refine(v => v.grossPence > 0, "Line ratio needs positive gross")
  .refine(v => (v.kind === "extra") === (v.match !== null), "Only extra lines require export matches");
export const billingCompositionV1 = z.object({ declared: billingAmountsV1,
  lines: z.array(billingInvoiceLineV1).min(1).max(MAX_ALLOCATION_LINES),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.lines.map(l => l.externalInvoiceLineId)).size !== v.lines.length ||
      new Set(v.lines.flatMap(l => l.match ? [l.match.exportLineId] : [])).size !== v.lines.filter(l => l.match).length) {
    ctx.addIssue({ code: "custom", message: "Duplicate invoice or export line identity" });
  }
  for (const key of ["netPence", "vatPence", "grossPence"] as const) {
    if (v.lines.every(l => Number.isSafeInteger(l[key])) && Number.isSafeInteger(v.declared[key]) &&
        v.lines.reduce((sum, l) => sum + BigInt(l[key]), 0n) !== BigInt(v.declared[key])) {
      ctx.addIssue({ code: "custom", message: "Composition does not equal declared totals" });
    }
  }
});
const signedFractionV1 = exactPenceV1.refine(value => {
  try { parseExactPence(value); return true; } catch { return false; }
});
const nonnegativeFractionInputV1 = exactPenceInputV1.refine(value => {
  try { return parseExactPence(value, exactPenceInputV1).numerator >= 0n; } catch { return false; }
});
const explicitShare = z.object({ lineId: identity, gross: nonnegativeFractionInputV1 }).strict();
const adjustment = z.object({ externalInvoiceLineId: identity, ...amountShape }).strict().refine(validAmounts);
export const billingStatusV1 = z.object({ version: z.literal("billing-status.v1"), clientContractId: uuid,
  source: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_.-]*$/u), sourceEventId: identity,
  invoiceNumber: identity, factType: z.enum(["invoiced", "credited", "paid", "payment_reversed", "rejected"]),
  effectiveAt: instantV1, remittanceReference: z.string().min(1).max(300).nullable(), reconciliationId: identity.nullable(),
  originalEventId: identity.nullable(), amount: billingAmountsV1, composition: billingCompositionV1.nullable(),
  explicit: z.array(explicitShare).max(MAX_ALLOCATION_LINES).nullable(), separateInvoice: z.boolean(),
  lineAdjustments: z.array(adjustment).max(MAX_ALLOCATION_LINES).prefault([]),
}).strict().superRefine((v, ctx) => {
  if ((v.factType !== "paid" && v.factType !== "payment_reversed" && (v.explicit !== null || v.separateInvoice)) ||
      (v.factType !== "credited" && v.factType !== "rejected" && v.lineAdjustments.length !== 0) ||
      (v.factType === "paid" && v.originalEventId !== null))
    ctx.addIssue({ code: "custom", message: "Fields do not apply to this fact type" });
  if (v.factType === "invoiced" && v.composition && canonical(v.amount) !== canonical(v.composition.declared))
    ctx.addIssue({ code: "custom", message: "Invoice totals differ from composition" });
  if (new Set(v.lineAdjustments.map(l => l.externalInvoiceLineId)).size !== v.lineAdjustments.length)
    ctx.addIssue({ code: "custom", message: "Duplicate adjustment line" });
  if (v.explicit && new Set(v.explicit.map(l => l.lineId)).size !== v.explicit.length)
    ctx.addIssue({ code: "custom", message: "Duplicate explicit share" });
  if (v.factType === "credited" && v.lineAdjustments.length) {
    for (const key of ["netPence", "vatPence", "grossPence"] as const) {
      if (v.lineAdjustments.every(l => Number.isSafeInteger(l[key])) && Number.isSafeInteger(v.amount[key]) &&
          v.lineAdjustments.reduce((n, l) => n + BigInt(l[key]), 0n) !== BigInt(v.amount[key]))
        ctx.addIssue({ code: "custom", message: "Credit detail differs from total" });
    }
  }
});
export type BillingStatus = z.infer<typeof billingStatusV1>;
const exportLineV1 = z.object({ jobId: uuid, extraId: uuid, scopeItemId: uuid, revisionId: uuid, revisionHash: hash,
  approvalBindingId: uuid, approvalSnapshotHash: hash, description: z.string().min(1).max(2000),
  quantity: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u).refine(v => /[1-9]/u.test(v)),
  unit: z.string().min(1).max(80), priceProvenance: z.enum(["server_sor", "human_confirmed"]),
  approvedNet: z.object({ pence: amount, currency: z.literal("GBP") }).strict(),
}).strict();
export const billingExportV1 = z.object({ version: z.literal("billing-export.v1"), clientContractId: uuid,
  lines: z.array(exportLineV1).min(1).max(MAX_ALLOCATION_LINES),
}).strict();
/** Intent representation only: no role, authorization lifetime or executable delivery is established here. */
export const billingDeliveryV1 = z.object({ version: z.literal("billing-delivery.v1"), batchId: uuid,
  channel: z.enum(["fake_download", "fake_sftp", "fake_api"]),
  destination: z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.invalid$/u), contentHash: hash,
}).strict();
export const billingReconcileV1 = z.object({ version: z.literal("billing-reconcile.v1"),
  action: z.enum(["inspect_fact", "inspect_delivery"]), id: uuid,
}).strict();
export const billingErrorV1 = z.object({ version: z.literal("billing-error.v1"),
  code: z.enum(["BILLING_INVALID", "BILLING_CONFLICT", "BILLING_POLICY_HELD", "BILLING_PREREQUISITE_REQUIRED"]),
}).strict();
export class BillingDataError extends Error {
  constructor(readonly code: z.infer<typeof billingErrorV1>["code"]) { super(code); this.name = "BillingDataError"; }
  toJSON(): z.infer<typeof billingErrorV1> { return { version: "billing-error.v1", code: this.code }; }
}
function invalid(): never { throw new BillingDataError("BILLING_INVALID"); }
function read<T>(schema: z.ZodType<T, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) return invalid();
  return result.data;
}
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => compareText(a, b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonicalInstant(value: string): string {
  // Preserve arbitrary subsecond precision; only the integral second passes through Date.
  const match = /^(.*T\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})$/u.exec(value);
  if (!match) return invalid();
  let seconds: string;
  try { seconds = new Date(`${match[1]}:${match[2] ?? "00"}${match[4]}`).toISOString().replace(/\.\d{3}Z$/u, ""); }
  catch { return invalid(); }
  const fraction = (match[3] ?? "").replace(/0+$/u, "");
  const result = `${seconds}${fraction ? `.${fraction}` : ""}Z`;
  return read(instantV1, result);
}
export function normalizeBillingStatus(raw: unknown) {
  const event = read(billingStatusV1, raw);
  event.effectiveAt = canonicalInstant(event.effectiveAt);
  if (event.composition) {
    for (const line of event.composition.lines) line.existedAt = canonicalInstant(line.existedAt);
    event.composition.lines.sort((a, b) => compareText(a.externalInvoiceLineId, b.externalInvoiceLineId));
  }
  event.explicit = event.explicit?.map(a => ({ ...a, gross: serializeExactPence(exactPence(BigInt(a.gross.numerator), BigInt(a.gross.denominator))) }))
    .sort((a, b) => compareText(a.lineId, b.lineId)) ?? null;
  event.lineAdjustments.sort((a, b) => compareText(a.externalInvoiceLineId, b.externalInvoiceLineId));
  const text = canonical(event);
  return freeze({ event, canonical: text, hash: sha256(text) });
}

export function stableBillingExportLineId(clientContractId: string, revisionId: string): string {
  const digest = sha256(canonical(["billing-export-line.v1", read(uuid, clientContractId), read(uuid, revisionId)]));
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-${["8", "9", "a", "b"][parseInt(digest[16]!, 16) % 4]}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
const csvCell = (value: string | number) => {
  const text = String(value);
  // Escape leading apostrophes too, so the CSV reader can restore source text exactly.
  const safe = /^[=+\-@']/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/gu, '""')}"`;
};
function csvRows(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  return `${header.join(",")}\r\n${rows.map(r => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
export function renderBillingExport(raw: unknown) {
  const input = read(billingExportV1, raw);
  if (new Set(input.lines.map(l => l.revisionId)).size !== input.lines.length ||
      new Set(input.lines.map(l => l.extraId)).size !== input.lines.length) return invalid();
  const lines = input.lines.map(l => ({ ...l, exportLineId: stableBillingExportLineId(input.clientContractId, l.revisionId) }))
    .sort((a, b) => compareText(a.exportLineId, b.exportLineId));
  const sum = lines.reduce((n, l) => n + BigInt(l.approvedNet.pence), 0n);
  if (sum > BigInt(MAX_MONEY_PENCE)) return invalid();
  const totalNet = moneyFromBigInt(sum);
  const json = canonical({ version: input.version, clientContractId: input.clientContractId,
    sandboxLabel: BILLING_SANDBOX_LABEL, lines, totalNet });
  const csv = csvRows(["version", "client_contract_id", "export_line_id", "job_id", "extra_id", "scope_item_id",
    "revision_id", "revision_hash", "approval_binding_id", "approval_snapshot_hash", "description", "quantity", "unit",
    "price_provenance", "approved_net_pence", "currency", "batch_total_net_pence", "sandbox_label"],
  lines.map(l => [input.version, input.clientContractId, l.exportLineId, l.jobId, l.extraId, l.scopeItemId, l.revisionId,
    l.revisionHash, l.approvalBindingId, l.approvalSnapshotHash, l.description, l.quantity, l.unit, l.priceProvenance,
    l.approvedNet.pence, "GBP", totalNet.pence, BILLING_SANDBOX_LABEL]));
  return freeze({ lines, totalNet, json, csv, byteLength: new TextEncoder().encode(csv).length,
    jsonHash: sha256(json), csvHash: sha256(csv) });
}

/** Recompute every frozen content binding; a supplied checksum alone does not validate an artifact. */
export function verifyBillingExportArtifact(immutableContent: string, expectedHash: string) {
  if (typeof immutableContent !== "string" || immutableContent.length > 5_000_000 ||
      !hash.safeParse(expectedHash).success || sha256(immutableContent) !== expectedHash) return invalid();
  let raw: unknown;
  try { raw = JSON.parse(immutableContent); } catch { return invalid(); }
  const frozenExportV1 = z.object({ version: z.literal("billing-export.v1"), clientContractId: uuid,
    sandboxLabel: z.literal(BILLING_SANDBOX_LABEL), totalNet: z.object({ pence: amount, currency: z.literal("GBP") }).strict(),
    lines: z.array(exportLineV1.extend({ exportLineId: uuid }).strict()).min(1).max(MAX_ALLOCATION_LINES),
  }).strict();
  const parsed = read(frozenExportV1, raw);
  const artifact = renderBillingExport({ version: parsed.version, clientContractId: parsed.clientContractId,
    lines: parsed.lines.map(({ exportLineId: _, ...line }) => line) });
  if (artifact.json !== immutableContent) return invalid();
  return artifact;
}

const STATUS_HEADERS = ["version", "source", "source_event_id", "client_contract_id", "invoice_number", "fact_type",
  "effective_at", "remittance_reference", "reconciliation_id", "original_event_id", "net_pence", "vat_pence", "gross_pence",
  "declared_net_pence", "declared_vat_pence", "declared_gross_pence", "explicit", "separate_invoice", "line_adjustments",
  "external_invoice_line_id", "line_kind", "line_existed_at", "line_net_pence", "line_vat_pence", "line_gross_pence",
  "export_line_id", "job_id", "extra_id", "scope_item_id", "revision_id", "revision_hash", "sandbox_label"] as const;
export function renderBillingCsv(events: readonly unknown[]): string {
  if (events.length === 0 || events.length > MAX_ALLOCATION_LINES) return invalid();
  const rows: (string | number)[][] = [];
  for (const raw of events) {
    const { event: e } = normalizeBillingStatus(raw);
    for (const l of e.composition?.lines ?? [null]) {
      rows.push([e.version, e.source, e.sourceEventId, e.clientContractId, e.invoiceNumber, e.factType, e.effectiveAt,
        e.remittanceReference ?? "", e.reconciliationId ?? "", e.originalEventId ?? "", e.amount.netPence,
        e.amount.vatPence, e.amount.grossPence, e.composition?.declared.netPence ?? "", e.composition?.declared.vatPence ?? "",
        e.composition?.declared.grossPence ?? "", canonical(e.explicit), String(e.separateInvoice), canonical(e.lineAdjustments),
        l?.externalInvoiceLineId ?? "", l?.kind ?? "", l?.existedAt ?? "", l?.netPence ?? "", l?.vatPence ?? "", l?.grossPence ?? "",
        l?.match?.exportLineId ?? "", l?.match?.jobId ?? "", l?.match?.extraId ?? "", l?.match?.scopeItemId ?? "",
        l?.match?.revisionId ?? "", l?.match?.revisionHash ?? "", BILLING_SANDBOX_LABEL]);
    }
  }
  if (rows.length > MAX_ALLOCATION_LINES) return invalid();
  return csvRows(STATUS_HEADERS, rows);
}
function readCsv(bytes: Uint8Array): string[][] {
  if (bytes.length === 0 || bytes.length > 5_000_000) return invalid();
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return invalid(); }
  if (text.includes("\u0000")) return invalid();
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  const endCell = () => { row.push(/^'[=+\-@']/u.test(cell) ? cell.slice(1) : cell); cell = ""; closed = false; };
  const endRow = () => { endCell(); rows.push(row); row = []; if (rows.length > MAX_ALLOCATION_LINES + 1) invalid(); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === ",") endCell();
    else if (c === "\n") endRow();
    else if (c === "\r") { if (text[++i] !== "\n") invalid(); endRow(); }
    else if (c === '"') { if (cell !== "" || closed) invalid(); quoted = true; }
    else { if (closed) invalid(); cell += c; }
  }
  if (quoted) return invalid();
  if (cell !== "" || closed || row.length) endRow();
  return rows;
}
export function parseBillingCsv(bytes: Uint8Array): readonly BillingStatus[] {
  const rows = readCsv(bytes);
  if (canonical(rows.shift()) !== canonical(STATUS_HEADERS) || rows.length === 0) return invalid();
  const events = new Map<string, { header: string; data: Record<string, unknown>; lines: unknown[] }>();
  const integer = (text: string) => /^(?:0|[1-9]\d*)$/u.test(text) && text.length <= 13 ? Number(text) : invalid();
  const json = (text: string): unknown => { try { return JSON.parse(text); } catch { return invalid(); } };
  for (const cells of rows) {
    if (cells.length !== STATUS_HEADERS.length) return invalid();
    const at = (key: typeof STATUS_HEADERS[number]) => cells[STATUS_HEADERS.indexOf(key)]!;
    if (at("sandbox_label") !== BILLING_SANDBOX_LABEL || !["true", "false"].includes(at("separate_invoice"))) return invalid();
    const declaredFields = [at("declared_net_pence"), at("declared_vat_pence"), at("declared_gross_pence")];
    const hasComposition = declaredFields.some(v => v !== "");
    if (hasComposition && declaredFields.some(v => v === "")) return invalid();
    const data = { version: at("version"), source: at("source"), sourceEventId: at("source_event_id"),
      clientContractId: at("client_contract_id"), invoiceNumber: at("invoice_number"), factType: at("fact_type"),
      effectiveAt: at("effective_at"), remittanceReference: at("remittance_reference") || null,
      reconciliationId: at("reconciliation_id") || null, originalEventId: at("original_event_id") || null,
      amount: { netPence: integer(at("net_pence")), vatPence: integer(at("vat_pence")), grossPence: integer(at("gross_pence")) },
      explicit: json(at("explicit")), separateInvoice: at("separate_invoice") === "true", lineAdjustments: json(at("line_adjustments")),
      composition: hasComposition ? { declared: { netPence: integer(declaredFields[0]!), vatPence: integer(declaredFields[1]!), grossPence: integer(declaredFields[2]!) } } : null };
    const key = canonical([data.source, data.sourceEventId]); const header = canonical(data);
    const current = events.get(key);
    if (current && current.header !== header) return invalid();
    const entry = current ?? { header, data, lines: [] as unknown[] }; events.set(key, entry);
    const lineCells = cells.slice(19, 31);
    if (!hasComposition) { if (lineCells.some(v => v !== "") || current) return invalid(); continue; }
    const matchFields = ["export_line_id", "job_id", "extra_id", "scope_item_id", "revision_id", "revision_hash"] as const;
    const matchValues = matchFields.map(at);
    const hasMatch = matchValues.some(v => v !== "");
    if (hasMatch && matchValues.some(v => v === "")) return invalid();
    entry.lines.push({ externalInvoiceLineId: at("external_invoice_line_id"), kind: at("line_kind"), existedAt: at("line_existed_at"),
      netPence: integer(at("line_net_pence")), vatPence: integer(at("line_vat_pence")), grossPence: integer(at("line_gross_pence")),
      match: hasMatch ? { exportLineId: at("export_line_id"), jobId: at("job_id"), extraId: at("extra_id"), scopeItemId: at("scope_item_id"), revisionId: at("revision_id"), revisionHash: at("revision_hash") } : null });
  }
  return freeze([...events.values()].map(e => normalizeBillingStatus({ ...e.data,
    composition: e.data.composition === null ? null : { ...e.data.composition as object, lines: e.lines } }).event));
}

const allocatedV1 = z.object({ lineId: identity, rule: z.enum(["explicit", "separate_invoice", "pro_rata"]),
  sourceRef: identity, gross: signedFractionV1, net: signedFractionV1, matchedExtraNet: signedFractionV1 }).strict();
export type BillingAllocation = z.infer<typeof allocatedV1>;
export const billingAllocationV1 = z.object({ version: z.literal("billing-allocation.v1"), invoice: billingStatusV1,
  sourceRef: identity, effectiveAt: instantV1, gross: nonnegativeFractionInputV1,
  outstanding: z.array(z.object({ lineId: identity, gross: nonnegativeFractionInputV1 }).strict()).max(MAX_ALLOCATION_LINES).nullable(),
  explicit: z.array(explicitShare).max(MAX_ALLOCATION_LINES).nullable(), separateInvoice: z.boolean(),
  direction: z.enum(["receipt", "reversal"]), original: z.array(allocatedV1).max(MAX_ALLOCATION_LINES).nullable(),
}).strict().refine(v => v.direction === "receipt" ? v.outstanding !== null && v.original === null :
  v.outstanding === null && v.original !== null, "Receipts require balances; reversals require remaining original allocations");
const fraction = (v: z.infer<typeof exactPenceV1>) => exactPence(BigInt(v.numerator), BigInt(v.denominator));
const zero = () => exactPence(0n);
const add = (a: ExactPence, b: ExactPence) => sumExactPence([a, b]);
const negate = (a: ExactPence) => exactPence(-a.numerator, a.denominator);
const subtract = (a: ExactPence, b: ExactPence) => add(a, negate(b));
const positive = (a: ExactPence) => a.numerator < 0n ? zero() : a;

/** Caller must supply the whole invoice and complete outstanding balances for receipts;
 * for reversal, supply the original movement's remaining allocations instead.
 * Pure arithmetic is not a persisted export-match check. Checked writers remain held.
 */
export function allocateBillingReceipt(raw: unknown): readonly BillingAllocation[] {
  const input = read(billingAllocationV1, raw);
  const invoice = normalizeBillingStatus(input.invoice).event;
  if (invoice.factType !== "invoiced" || !invoice.composition) throw new BillingDataError("BILLING_PREREQUISITE_REQUIRED");
  const lines = invoice.composition.lines;
  const original = new Map(input.original?.map(a => [a.lineId, a]));
  const outstanding = new Map(input.outstanding?.map(a => [a.lineId, a.gross]));
  if ((input.original && original.size !== input.original.length) || (input.outstanding && outstanding.size !== input.outstanding.length) ||
      [...original.keys(), ...outstanding.keys()].some(id => !lines.some(l => l.externalInvoiceLineId === id)) ||
      (input.outstanding && outstanding.size !== lines.length)) return invalid();
  if (input.original) {
    if (new Set(input.original.map(a => a.sourceRef)).size > 1) return invalid();
    for (const a of input.original) {
      const line = lines.find(l => l.externalInvoiceLineId === a.lineId)!;
      const gross = fraction(a.gross), net = fraction(a.net), contribution = fraction(a.matchedExtraNet);
      if (gross.numerator < 0n || net.numerator < 0n || gross.numerator * BigInt(line.netPence) * net.denominator !==
          net.numerator * BigInt(line.grossPence) * gross.denominator ||
          compareExactPence(contribution, line.match ? net : zero()) !== 0) return invalid();
    }
  }
  try {
    const result = allocateReceiptToLines({ version: "receipt-allocation.v1", sourceRef: input.sourceRef,
      receiptGross: input.gross, effectiveAt: input.effectiveAt, direction: input.direction, invoiceId: invoice.invoiceNumber,
      separateInvoiceId: input.separateInvoice ? invoice.invoiceNumber : null, explicit: input.explicit,
      lines: lines.map(l => ({ id: l.externalInvoiceLineId, invoiceId: invoice.invoiceNumber, existedAt: l.existedAt,
        netPence: l.netPence, grossPence: l.grossPence,
        outstandingGross: input.original ? original.get(l.externalInvoiceLineId)?.gross ?? serializeExactPence(zero()) :
          outstanding.get(l.externalInvoiceLineId)! })) });
    return freeze(result.map(a => ({ ...a, gross: serializeExactPence(a.gross), net: serializeExactPence(a.net),
      matchedExtraNet: serializeExactPence(lines.find(l => l.externalInvoiceLineId === a.lineId)!.match ? a.net : zero()) })));
  } catch { return invalid(); }
}

/** Narrow recomputation for one invoice with one established composition and distinct economic instants.
 * Inputs needing an undecided causal rule raise BILLING_POLICY_HELD; this is not a quarantine/release policy.
 * No source fact is mutated. Persisted derivations, recorded times, role checks and all writers remain held.
 */
function deriveUnambiguousBillingInput(raw: readonly unknown[]) {
  if (raw.length > MAX_ALLOCATION_LINES) return invalid();
  const unique = new Map<string, ReturnType<typeof normalizeBillingStatus>>();
  for (const item of raw) {
    const n = normalizeBillingStatus(item), key = canonical([n.event.source, n.event.sourceEventId]);
    if (unique.has(key) && unique.get(key)!.hash !== n.hash) throw new BillingDataError("BILLING_CONFLICT");
    unique.set(key, n);
  }
  const events = [...unique.values()].map(n => n.event);
  if (new Set(events.map(e => canonical([e.clientContractId, e.source, e.invoiceNumber]))).size > 1) return invalid();
  const invoices = events.filter(e => e.factType === "invoiced");
  if (invoices.length > 1) throw new BillingDataError("BILLING_POLICY_HELD");
  const invoice = invoices[0];
  type Hold = { sourceEventId: string; reason: "INVOICE_REQUIRED" | "COMPOSITION_REQUIRED" | "ORIGINAL_MOVEMENT_REQUIRED" | "MOVEMENT_IDENTITY_REQUIRED" | "LINE_DETAIL_REQUIRED" };
  const held: Hold[] = [];
  const noTotals = () => ({ billedNet: serializeExactPence(zero()), creditedNet: serializeExactPence(zero()),
    paidNet: serializeExactPence(zero()), paidGross: serializeExactPence(zero()), matchedExtraNet: serializeExactPence(zero()) });
  const empty = () => freeze({ lines: [], allocations: [], totals: noTotals(), held: events.map(e => ({ sourceEventId: e.sourceEventId,
    reason: invoice ? "COMPOSITION_REQUIRED" as const : "INVOICE_REQUIRED" as const })).sort((a, b) => compareText(a.sourceEventId, b.sourceEventId)) });
  if (!invoice?.composition) return empty();
  // An explicit reconciliation identity equates observations; event IDs/arrival order never settle money.
  const movements = new Map<string, { signature: string; event: BillingStatus; observations: string[] }>();
  const pending = events.filter(e => e !== invoice);
  const other: BillingStatus[] = [];
  for (const e of pending) {
    if (e.factType !== "paid" && e.factType !== "payment_reversed") { other.push(e); continue; }
    if (!e.reconciliationId) { held.push({ sourceEventId: e.sourceEventId, reason: "MOVEMENT_IDENTITY_REQUIRED" }); continue; }
    const signature = canonical({ ...e, sourceEventId: null, remittanceReference: null });
    const prior = movements.get(e.reconciliationId);
    if (prior && prior.signature !== signature) throw new BillingDataError("BILLING_CONFLICT");
    if (prior) prior.observations.push(e.sourceEventId);
    else movements.set(e.reconciliationId, { signature, event: e, observations: [e.sourceEventId] });
  }
  // Use the economic identity in derived references, not whichever transport observation arrived first.
  const ordered = [...other, ...[...movements.values()].map(m => ({ ...m.event, sourceEventId: m.event.reconciliationId! }))]
    .sort((a, b) => compareServerInstants(a.effectiveAt, b.effectiveAt));
  for (let i = 0; i < ordered.length; i++) {
    if (compareServerInstants(ordered[i]!.effectiveAt, invoice.effectiveAt) <= 0 ||
        (i > 0 && compareServerInstants(ordered[i - 1]!.effectiveAt, ordered[i]!.effectiveAt) === 0))
      throw new BillingDataError("BILLING_POLICY_HELD");
  }
  const lines = invoice.composition.lines.map(l => ({ lineId: l.externalInvoiceLineId, billedNet: exactPence(BigInt(l.netPence)),
    creditedNet: zero(), creditedGross: zero(), paidNet: zero(), paidGross: zero(), matchedExtraNet: zero(), rejected: false }));
  const allocations: { sourceRef: string; originalSourceRef: string | null; lines: readonly BillingAllocation[] }[] = [];
  const receipts = new Map<string, { event: BillingStatus; remaining: readonly BillingAllocation[] }>();
  for (const e of ordered) {
    if (e.composition && canonical(e.composition) !== canonical(invoice.composition)) throw new BillingDataError("BILLING_POLICY_HELD");
    if (e.factType === "credited" || e.factType === "rejected") {
      if (e.originalEventId !== invoice.sourceEventId || e.lineAdjustments.length === 0) {
        held.push({ sourceEventId: e.sourceEventId, reason: "LINE_DETAIL_REQUIRED" }); continue;
      }
      for (const detail of e.lineAdjustments) {
        const line = lines.find(l => l.lineId === detail.externalInvoiceLineId);
        const originalLine = invoice.composition.lines.find(l => l.externalInvoiceLineId === detail.externalInvoiceLineId);
        if (!line || !originalLine || compareServerInstants(originalLine.existedAt, e.effectiveAt) > 0) return invalid();
        if (e.factType === "rejected") { line.rejected = true; continue; }
        line.creditedNet = add(line.creditedNet, exactPence(BigInt(detail.netPence)));
        line.creditedGross = add(line.creditedGross, exactPence(BigInt(detail.grossPence)));
        const creditedVat = subtract(line.creditedGross, line.creditedNet);
        if (compareExactPence(line.creditedNet, line.billedNet) > 0 ||
            compareExactPence(line.creditedGross, exactPence(BigInt(originalLine.grossPence))) > 0 ||
            compareExactPence(creditedVat, exactPence(BigInt(originalLine.vatPence))) > 0) return invalid();
      }
      continue;
    }
    if (e.factType !== "paid" && e.factType !== "payment_reversed") return invalid();
    let original: { event: BillingStatus; remaining: readonly BillingAllocation[] } | undefined;
    if (e.factType === "payment_reversed") {
      original = e.originalEventId ? receipts.get(e.originalEventId) : undefined;
      if (!original) { held.push({ sourceEventId: e.sourceEventId, reason: "ORIGINAL_MOVEMENT_REQUIRED" }); continue; }
    }
    const allocated = allocateBillingReceipt({ version: "billing-allocation.v1", invoice, sourceRef: e.sourceEventId,
      effectiveAt: e.effectiveAt, gross: serializeExactPence(exactPence(BigInt(e.amount.grossPence))),
      outstanding: original ? null : lines.map((l, i) => ({ lineId: l.lineId,
        gross: serializeExactPence(positive(subtract(subtract(exactPence(BigInt(invoice.composition!.lines[i]!.grossPence)), l.creditedGross), l.paidGross))) })),
      explicit: e.explicit, separateInvoice: e.separateInvoice, direction: original ? "reversal" : "receipt",
      original: original?.remaining ?? null });
    allocations.push({ sourceRef: e.sourceEventId, originalSourceRef: original?.event.reconciliationId ?? null, lines: allocated });
    for (const a of allocated) {
      const line = lines.find(l => l.lineId === a.lineId)!;
      line.paidGross = add(line.paidGross, fraction(a.gross)); line.paidNet = add(line.paidNet, fraction(a.net));
      line.matchedExtraNet = add(line.matchedExtraNet, fraction(a.matchedExtraNet));
    }
    if (original) {
      original.remaining = original.remaining.map(a => {
        const reversed = allocated.find(b => b.lineId === a.lineId);
        return { ...a, gross: serializeExactPence(add(fraction(a.gross), reversed ? fraction(reversed.gross) : zero())),
          net: serializeExactPence(add(fraction(a.net), reversed ? fraction(reversed.net) : zero())),
          matchedExtraNet: serializeExactPence(add(fraction(a.matchedExtraNet), reversed ? fraction(reversed.matchedExtraNet) : zero())) };
      });
    } else {
      const remaining = { event: e, remaining: allocated };
      for (const observation of movements.get(e.reconciliationId!)!.observations) receipts.set(observation, remaining);
    }
  }
  const total = (key: "billedNet" | "creditedNet" | "paidNet" | "paidGross" | "matchedExtraNet") =>
    serializeExactPence(sumExactPence(lines.map(l => l[key])));
  const totals = { billedNet: total("billedNet"), creditedNet: total("creditedNet"), paidNet: total("paidNet"),
    paidGross: total("paidGross"), matchedExtraNet: total("matchedExtraNet") };
  return freeze({ lines: lines.map(l => ({ lineId: l.lineId, billedNet: serializeExactPence(l.billedNet),
    creditedNet: serializeExactPence(l.creditedNet), paidNet: serializeExactPence(l.paidNet), paidGross: serializeExactPence(l.paidGross),
    matchedExtraNet: serializeExactPence(l.matchedExtraNet), rejected: l.rejected })), allocations, totals,
    held: held.sort((a, b) => compareText(a.sourceEventId, b.sourceEventId)) });
}

export function deriveUnambiguousBilling(raw: readonly unknown[]) {
  try { return deriveUnambiguousBillingInput(raw); }
  catch (error) { if (error instanceof BillingDataError) throw error; return invalid(); }
}
