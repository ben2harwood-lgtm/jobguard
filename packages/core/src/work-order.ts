import { z } from "zod";
import { contractorPermits, type ContractorGrant, type ContractorTarget } from "./contractor.js";
import { contractorResidentBoundaryV1 } from "./contractor-parties.js";
import { assertSorQuantity, SorPricingError, sorMoneyV1, sorQuantityV1 } from "./sor-pricing.js";

const uuid = z.string().uuid();
/** Typed codes a single row can be refused with; each is stored in that row's receipt. */
export const workOrderRowErrorCodes = ["INVALID_ROW", "DUPLICATE_LINE_REFERENCE", "INVALID_QUANTITY", "NEGATIVE_QUANTITY", "QUANTITY_PRECISION", "INVALID_ADJUSTMENT", "NEGATIVE_MULTIPLIER", "MONEY_OUT_OF_RANGE", "SOR_VERSION_NOT_FOUND", "AMBIGUOUS_SOR_VERSION", "UNKNOWN_SOR_CODE", "CONTRACTOR_PARTIES_REQUIRED", "PARTY_NOT_FOUND", "CUSTOMER_TYPE_MISMATCH", "NOT_FOUND", "STALE_REVISION", "PARTY_CHANGE_REFUSED", "ASSIGNMENT_INVALID", "ORDER_NOT_FOUND"] as const;
export type WorkOrderRowErrorCode = typeof workOrderRowErrorCodes[number];
/** Whole-request refusals: nothing was imported. */
export const workOrderErrorCodes = [...workOrderRowErrorCodes, "UNAUTHENTICATED", "MODE_FORBIDDEN", "TRACK_FORBIDDEN", "INVALID_COMMAND", "INVALID_CSV", "INVALID_CSV_HEADER", "COMMAND_CONFLICT", "UPLOAD_NOT_ALLOWED", "DATABASE_UNAVAILABLE"] as const;
export type WorkOrderErrorCode = typeof workOrderErrorCodes[number];
export class WorkOrderError extends Error {
  constructor(readonly code: WorkOrderErrorCode) { super(code); }
}
export function isWorkOrderRowErrorCode(code: unknown): code is WorkOrderRowErrorCode {
  return typeof code === "string" && (workOrderRowErrorCodes as readonly string[]).includes(code);
}
export const workOrderInputLineV1 = z.object({ clientLineReference: z.string().trim().min(1).max(80).nullable(), sorCode: z.string().trim().min(1).max(80), quantity: sorQuantityV1 }).strict();
/** Absent parties deliberately reach the CH-3b routine; present malformed values fail this boundary. */
export const workOrderRowV1 = z.object({
  version: z.literal("work-order-import.v1"), clientId: uuid.nullish(), contractId: uuid.nullish(),
  workOrderReference: z.string().trim().min(1).max(100), issuedOn: z.string().date(), dueOn: z.string().date().nullable(),
  priority: z.enum(["routine", "urgent", "emergency"]), status: z.enum(["ordered", "cancelled"]), expectedRevision: z.number().int().nonnegative().max(2147483646),
  siteRevisionId: uuid.nullish(), resident: contractorResidentBoundaryV1.nullish(), teamId: uuid.nullable(),
  assignedMembershipIds: z.array(uuid).max(100), lines: z.array(workOrderInputLineV1).max(1000),
}).strict().superRefine((value, context) => {
  const references = new Set<string>();
  value.lines.forEach((line, index) => {
    if (line.clientLineReference !== null) {
      if (references.has(line.clientLineReference)) context.addIssue({ code: "custom", path: ["lines", index, "clientLineReference"], message: "Duplicate client line reference" });
      references.add(line.clientLineReference);
    }
  });
  if (value.dueOn !== null && value.dueOn < value.issuedOn) context.addIssue({ code: "custom", path: ["dueOn"], message: "Due date precedes issue date" });
  if (value.status === "ordered" && value.lines.length === 0) context.addIssue({ code: "custom", path: ["lines"], message: "An order requires lines" });
  if (value.assignedMembershipIds.length && value.teamId === null) context.addIssue({ code: "custom", path: ["teamId"], message: "Assigned operatives require a team" });
  if (new Set(value.assignedMembershipIds).size !== value.assignedMembershipIds.length) context.addIssue({ code: "custom", path: ["assignedMembershipIds"], message: "Duplicate assignment" });
});
export type WorkOrderRow = z.infer<typeof workOrderRowV1>;
export function validateWorkOrderRow(raw: unknown): { ok: true; row: WorkOrderRow } | { ok: false; code: WorkOrderRowErrorCode } {
  const parsed = workOrderRowV1.safeParse(raw);
  if (parsed.success) return { ok: true, row: parsed.data };
  // Only refine malformed quantities when the schema rejected quantity itself. A forged field never becomes accepted.
  const quantityIssue = parsed.error.issues.find(issue => issue.path[0] === "lines" && issue.path[2] === "quantity");
  if (quantityIssue && raw && typeof raw === "object") {
    const lines = (raw as { lines?: unknown }).lines;
    const index = quantityIssue.path[1];
    if (Array.isArray(lines) && typeof index === "number") {
      try { assertSorQuantity(lines[index]?.quantity); } catch (error) { if (error instanceof SorPricingError && isWorkOrderRowErrorCode(error.code)) return { ok: false, code: error.code }; }
    }
  }
  return { ok: false, code: "INVALID_ROW" };
}
/**
 * Ben, 9 Oct 2026 (card jobguard-ent-2-import-roles-2026-10-08, "Existing roles"): a work-order import is run by a member holding
 * organisation.manage (owner, admin) or data.import (finance) - exactly the predicate CH-3b's app.bind_contractor_parties enforces - and a
 * schedule-of-rates version import by a member holding contract.manage (owner, admin, commercial_manager). No role gains a permission.
 * These pure checks mirror, and never replace, the transactional membership/track/role checks in PostgreSQL.
 */
export function workOrderImportPermits(grants: readonly ContractorGrant[], target: ContractorTarget): boolean {
  return contractorPermits(grants, "organisation.manage", target) || contractorPermits(grants, "data.import", target);
}
export function sorImportPermits(grants: readonly ContractorGrant[], target: ContractorTarget): boolean {
  return contractorPermits(grants, "contract.manage", target);
}
export const workOrderPricedLineV1 = workOrderInputLineV1.extend({ scopeItemId: uuid, unit: z.string().min(1).max(40), rate: sorMoneyV1, net: sorMoneyV1, origin: z.literal("client_instruction") }).strict();
export type WorkOrderPricedLine = z.infer<typeof workOrderPricedLineV1>;
/** Reference wins; otherwise use code+position. Incoming identities are always replaced by a server identity. */
export function matchWorkOrderLines(previous: readonly WorkOrderPricedLine[], incoming: readonly Omit<WorkOrderPricedLine, "scopeItemId" | "origin">[], mint: () => string): WorkOrderPricedLine[] {
  const key = (line: Pick<WorkOrderPricedLine, "clientLineReference" | "sorCode">, position: number) => line.clientLineReference === null ? `position:${position}:${line.sorCode}` : `reference:${line.clientLineReference}`;
  const identities = new Map<string, string>();
  for (const [index, line] of previous.entries()) {
    if (identities.has(key(line, index))) throw new WorkOrderError("DUPLICATE_LINE_REFERENCE");
    identities.set(key(line, index), line.scopeItemId);
  }
  const seen = new Set<string>();
  return incoming.map((line, index) => {
    const identity = key(line, index);
    if (seen.has(identity)) throw new WorkOrderError("DUPLICATE_LINE_REFERENCE");
    seen.add(identity);
    return workOrderPricedLineV1.parse({ ...line, scopeItemId: identities.get(identity) ?? mint(), origin: "client_instruction" });
  });
}
type RevisionForDiff = { status: "ordered" | "cancelled"; issuedOn: string; dueOn: string | null; priority: "routine" | "urgent" | "emergency"; teamId?: string | null; assignedMembershipIds?: readonly string[]; lines: readonly WorkOrderPricedLine[] };
/** No resident contents, descriptions, prices or free text in diffs: revisions retain the authorized commercial values. */
export function diffWorkOrderRevision(previous: RevisionForDiff | null, next: RevisionForDiff) {
  const old = new Map(previous?.lines.map(line => [line.scopeItemId, line]) ?? []);
  const current = new Map(next.lines.map(line => [line.scopeItemId, line]));
  const equal = (a: WorkOrderPricedLine, b: WorkOrderPricedLine) => a.clientLineReference === b.clientLineReference && a.sorCode === b.sorCode && a.quantity === b.quantity && a.unit === b.unit && a.rate.pence === b.rate.pence && a.net.pence === b.net.pence && a.origin === b.origin;
  return {
    fields: [
      ...(["status", "issuedOn", "dueOn", "priority"] as const).filter(field => !previous || previous[field] !== next[field]),
      ...((previous?.teamId ?? null) !== (next.teamId ?? null) ? ["teamId"] : []),
      ...([...(previous?.assignedMembershipIds ?? [])].sort().join() !== [...(next.assignedMembershipIds ?? [])].sort().join() ? ["assignedMembershipIds"] : []),
    ],
    added: next.lines.filter(line => !old.has(line.scopeItemId)).map(line => line.scopeItemId),
    removed: (previous?.lines ?? []).filter(line => !current.has(line.scopeItemId)).map(line => line.scopeItemId),
    changed: next.lines.filter((line, index) => old.has(line.scopeItemId) && (!equal(old.get(line.scopeItemId)!, line) || previous!.lines[index]?.scopeItemId !== line.scopeItemId)).map(line => line.scopeItemId),
  };
}
export const workOrderAuditPayloadV1 = z.object({
  references: z.object({ commandId: uuid, workOrderId: uuid, revisionId: uuid, environment: z.literal("synthetic_demo") }).strict(),
  hashes: z.object({ document: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  classifications: z.object({ action: z.literal("operational") }).strict(),
}).strict();

/** One audit event per import file: identifiers and the file hash only. */
export const workOrderBatchAuditPayloadV1 = z.object({
  references: z.object({ commandId: uuid, batchId: uuid, environment: z.literal("synthetic_demo") }).strict(),
  hashes: z.object({ document: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  classifications: z.object({ action: z.literal("operational") }).strict(),
}).strict();
export const sorVersionAuditPayloadV1 = z.object({
  references: z.object({ commandId: uuid, versionId: uuid, scheduleId: uuid, environment: z.literal("synthetic_demo") }).strict(),
  hashes: z.object({ document: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  classifications: z.object({ action: z.literal("operational") }).strict(),
}).strict();

export const workOrderCsvColumns = ["version", "clientId", "contractId", "workOrderReference", "issuedOn", "dueOn", "priority", "status", "expectedRevision", "siteRevisionId", "resident", "teamId", "assignedMembershipIds", "lines"] as const;
export type WorkOrderCsvRecord = { rowNumber: number; input: unknown; error?: never } | { rowNumber: number; error: "INVALID_ROW"; input?: never };
/** RFC 4180 quoting; one CSV record is one order. Nested, versioned values use JSON cells. Bound before allocation. */
export function parseWorkOrderCsv(csv: string): WorkOrderCsvRecord[] {
  if (typeof csv !== "string" || csv.length > 16_000_000) throw new WorkOrderError("INVALID_CSV");
  const records: string[][] = [];
  let record: string[] = [], cell = "", quoted = false, afterQuote = false;
  const endCell = () => { record.push(cell); cell = ""; afterQuote = false; };
  const endRecord = () => { endCell(); records.push(record); record = []; if (records.length > 10001) throw new WorkOrderError("INVALID_CSV"); };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (quoted) {
      if (c === '"') {
        if (csv[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else cell += c;
    } else if (c === ",") endCell();
    else if (c === "\n" || c === "\r") { if (c === "\r" && csv[i + 1] === "\n") i++; endRecord(); }
    else if (c === '"' && cell === "" && !afterQuote) quoted = true;
    else { if (afterQuote || c === '"') throw new WorkOrderError("INVALID_CSV"); cell += c; }
  }
  if (quoted) throw new WorkOrderError("INVALID_CSV");
  if (cell || record.length || afterQuote) endRecord();
  const header = records.shift();
  if (!header || header.length !== workOrderCsvColumns.length || header.some((column, index) => column !== workOrderCsvColumns[index])) throw new WorkOrderError("INVALID_CSV_HEADER");
  return records.map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== header.length) return { rowNumber, error: "INVALID_ROW" };
    const row: Record<string, unknown> = {};
    try {
      workOrderCsvColumns.forEach((column, position) => {
        const value = cells[position]!;
        if (["resident", "assignedMembershipIds", "lines"].includes(column)) row[column] = value === "" && column === "resident" ? null : JSON.parse(value);
        else if (column === "expectedRevision") {
          if (!/^(?:0|[1-9]\d{0,9})$/u.test(value)) throw new WorkOrderError("INVALID_ROW");
          row[column] = Number(value);
        } else row[column] = value === "" && ["clientId", "contractId", "siteRevisionId", "dueOn", "teamId"].includes(column) ? null : value;
      });
      return { rowNumber, input: row };
    } catch { return { rowNumber, error: "INVALID_ROW" }; }
  });
}
/** Takes plain records so a generated fixture can also encode a deliberately malformed row. */
export function encodeWorkOrderCsv(rows: readonly Readonly<Record<string, unknown>>[]): string {
  const quote = (value: string) => /[",\r\n]/u.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  return workOrderCsvColumns.join(",") + "\r\n" + rows.map(row => workOrderCsvColumns.map(column => {
    const value = row[column];
    return quote(value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));
  }).join(",")).join("\r\n") + "\r\n";
}

/** The fields whose change makes a row a new revision. Parties (client, contract, site, resident) are bound once per job by CH-3b and are not revisable here. */
export function workOrderContentFields(row: WorkOrderRow) {
  return {
    status: row.status, issuedOn: row.issuedOn, dueOn: row.dueOn, priority: row.priority, teamId: row.teamId, assignedMembershipIds: [...row.assignedMembershipIds].sort(),
    // A cancellation keeps the order's last lines; whatever lines a cancelling row carries are not part of the revision.
    lines: row.status === "cancelled" ? [] : row.lines.map(line => ({ clientLineReference: line.clientLineReference, sorCode: line.sorCode, quantity: line.quantity })),
  };
}
/** Missing site, client, contract or resident contact/reason: refused by the CH-3b routine for a new order, and by this check for a revision. */
export function workOrderPartiesComplete(row: WorkOrderRow): boolean {
  const resident = row.resident;
  if (!row.clientId || !row.contractId || !row.siteRevisionId || !resident) return false;
  if (resident.kind === "none") return !!resident.reason;
  const contact = resident.contact;
  return !!contact && !!contact.name && !!(contact.phone || contact.email);
}

export const workOrderSampleIds = ["starter_orders", "orders_with_errors", "revised_orders"] as const;
export type WorkOrderSampleId = typeof workOrderSampleIds[number];
export const workOrderSampleCatalogV1: readonly Readonly<{ id: WorkOrderSampleId; label: string; description: string }>[] = [
  { id: "starter_orders", label: "Starter orders (5 orders)", description: "Five clean fictional orders for the generated housing association. Import this first." },
  { id: "orders_with_errors", label: "Orders with problems (6 rows)", description: "Two good orders and four rows that each show a typed error: unknown code, too many decimals, missing site, quantity below zero." },
  { id: "revised_orders", label: "Revised orders (changes to the starter orders)", description: "Changes two starter orders, cancels one and repeats one unchanged. Import the starter orders first." },
];
const uuidValue = z.string().uuid();
export const workOrderImportRequestV1 = z.object({
  version: z.literal("work-order-import-request.v1"), environment: z.literal("synthetic_demo"), commandId: uuidValue,
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("csv"), name: z.string().trim().min(1).max(120), csv: z.string().max(16_000_000) }).strict(),
    z.object({ kind: z.literal("generated"), sample: z.enum(workOrderSampleIds) }).strict(),
  ]),
}).strict();
export type WorkOrderImportRequest = z.infer<typeof workOrderImportRequestV1>;
export const workOrderReceiptV1 = z.object({
  rowNumber: z.number().int().min(2), outcome: z.enum(["created", "revised", "unchanged", "rejected"]), errorCode: z.string().regex(/^[A-Z_]{3,60}$/u).nullable(),
  reference: z.string().min(1).max(100).nullable(), workOrderId: uuidValue.nullable(), revisionId: uuidValue.nullable(),
}).strict();
export type WorkOrderReceipt = z.infer<typeof workOrderReceiptV1>;
export const workOrderImportResultV1 = z.object({
  version: z.literal("work-order-import-result.v1"), environment: z.literal("synthetic_demo"), batchId: uuidValue, commandId: uuidValue, replayed: z.boolean(),
  source: z.object({ name: z.string(), kind: z.enum(["generated", "csv"]), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  counts: z.object({ rows: z.number().int().nonnegative(), created: z.number().int().nonnegative(), revised: z.number().int().nonnegative(), unchanged: z.number().int().nonnegative(), rejected: z.number().int().nonnegative() }).strict(),
  rows: z.array(workOrderReceiptV1), realExternalActions: z.literal(0),
}).strict();
export type WorkOrderImportResult = z.infer<typeof workOrderImportResultV1>;
export const workOrderOverviewV1 = z.object({
  version: z.literal("work-order-overview.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0),
  samples: z.array(z.object({ id: z.enum(workOrderSampleIds), label: z.string(), description: z.string() }).strict()),
  batches: z.array(z.object({ id: uuidValue, sourceName: z.string(), sourceKind: z.enum(["generated", "csv"]), counts: workOrderImportResultV1.shape.counts, createdAt: z.string() }).strict()),
  orders: z.array(z.object({ id: uuidValue, reference: z.string(), jobId: uuidValue, jobStatus: z.string(), clientName: z.string(), status: z.enum(["ordered", "cancelled"]), revision: z.number().int().positive(), priority: z.enum(["routine", "urgent", "emergency"]), issuedOn: z.string(), netTotalPence: z.number().int().nonnegative() }).strict()),
}).strict();
export const workOrderBatchDetailV1 = workOrderImportResultV1.omit({ replayed: true }).extend({ version: z.literal("work-order-batch.v1"), createdAt: z.string() }).strict();
export const workOrderLineViewV1 = z.object({ position: z.number().int().nonnegative(), scopeItemId: uuidValue, clientLineReference: z.string().nullable(), sorCode: z.string(), unit: z.string(), quantity: z.string(), ratePence: z.number().int().nonnegative(), netPence: z.number().int().nonnegative(), origin: z.literal("client_instruction") }).strict();
export const workOrderRevisionsV1 = z.object({
  version: z.literal("work-order-revisions.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0),
  workOrderId: uuidValue, reference: z.string(), jobId: uuidValue, jobStatus: z.string(), currentRevision: z.number().int().positive(),
  revisions: z.array(z.object({
    id: uuidValue, revision: z.number().int().positive(), status: z.enum(["ordered", "cancelled"]), issuedOn: z.string(), dueOn: z.string().nullable(), priority: z.enum(["routine", "urgent", "emergency"]),
    netTotalPence: z.number().int().nonnegative(), batchId: uuidValue, rowNumber: z.number().int().min(2), createdAt: z.string(),
    diff: z.object({ fields: z.array(z.string()), added: z.array(uuidValue), removed: z.array(uuidValue), changed: z.array(uuidValue) }).strict(),
    lines: z.array(workOrderLineViewV1),
  }).strict()),
}).strict();
export const jobAssignmentsV1 = z.object({
  version: z.literal("job-assignments.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), jobId: uuidValue, workOrderId: uuidValue.nullable(),
  team: z.object({ id: uuidValue, name: z.string() }).strict().nullable(), operatives: z.array(z.object({ membershipId: uuidValue }).strict()),
}).strict();
export const jobSiteVisitsV1 = z.object({
  version: z.literal("job-site-visits.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), jobId: uuidValue,
  visits: z.array(z.object({ id: uuidValue, membershipId: uuidValue, startedAt: z.string(), completedAt: z.string().nullable() }).strict()),
}).strict();
export const workOrderFailureV1 = z.object({ version: z.literal("work-order-error.v1"), code: z.enum(workOrderErrorCodes), recoverable: z.boolean() }).strict();
export function workOrderHttpStatus(code: WorkOrderErrorCode): number {
  return code === "UNAUTHENTICATED" ? 401 : code === "NOT_FOUND" ? 404 : code === "MODE_FORBIDDEN" || code === "TRACK_FORBIDDEN" || code === "UPLOAD_NOT_ALLOWED" ? 403
    : code === "COMMAND_CONFLICT" || code === "STALE_REVISION" ? 409 : code === "DATABASE_UNAVAILABLE" ? 503 : 422;
}
