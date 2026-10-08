import { z } from "zod";
import { contractorPermits, type ContractorGrant, type ContractorTarget } from "./contractor.js";
import { contractorResidentBoundaryV1 } from "./contractor-parties.js";
import { assertSorQuantity, SorPricingError, sorErrorCodes, sorMoneyV1, sorQuantityV1 } from "./sor-pricing.js";

const uuid = z.string().uuid();
export const workOrderErrorCodes = ["INVALID_ROW", "INVALID_CSV", "INVALID_CSV_HEADER", "DUPLICATE_LINE_REFERENCE", ...sorErrorCodes] as const;
export class WorkOrderError extends Error {
  constructor(readonly code: typeof workOrderErrorCodes[number]) { super(code); }
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
  if (value.status === "ordered" && value.lines.length === 0) context.addIssue({ code: "custom", path: ["lines"], message: "An order requires lines" });
  if (value.assignedMembershipIds.length && value.teamId === null) context.addIssue({ code: "custom", path: ["teamId"], message: "Assigned operatives require a team" });
  if (new Set(value.assignedMembershipIds).size !== value.assignedMembershipIds.length) context.addIssue({ code: "custom", path: ["assignedMembershipIds"], message: "Duplicate assignment" });
});
export type WorkOrderRow = z.infer<typeof workOrderRowV1>;
export function validateWorkOrderRow(raw: unknown): { ok: true; row: WorkOrderRow } | { ok: false; code: typeof workOrderErrorCodes[number] } {
  const parsed = workOrderRowV1.safeParse(raw);
  if (parsed.success) return { ok: true, row: parsed.data };
  // Only refine malformed quantities when the schema rejected quantity itself. A forged field never becomes accepted.
  const quantityIssue = parsed.error.issues.find(issue => issue.path[0] === "lines" && issue.path[2] === "quantity");
  if (quantityIssue && raw && typeof raw === "object") {
    const lines = (raw as { lines?: unknown }).lines;
    const index = quantityIssue.path[1];
    if (Array.isArray(lines) && typeof index === "number") {
      try { assertSorQuantity(lines[index]?.quantity); } catch (error) { if (error instanceof SorPricingError) return { ok: false, code: error.code }; }
    }
  }
  return { ok: false, code: "INVALID_ROW" };
}
/** These pure checks do not replace transactional membership/track/role checks or amend ENT-1's matrix. */
export function workOrderImportPermits(grants: readonly ContractorGrant[], target: ContractorTarget): boolean {
  return contractorPermits(grants.filter(g => g.role === "surveyor" || g.role === "commercial_manager"), "job.read", target);
}
export function sorImportPermits(grants: readonly ContractorGrant[], target: ContractorTarget): boolean {
  return contractorPermits(grants.filter(g => g.role === "commercial_manager"), "contract.manage", target);
}
export const workOrderPricedLineV1 = workOrderInputLineV1.extend({ scopeItemId: uuid, unit: z.string().min(1).max(40), rate: sorMoneyV1, net: sorMoneyV1, origin: z.literal("client_instruction") }).strict();
export type WorkOrderPricedLine = z.infer<typeof workOrderPricedLineV1>;
/** Reference wins; otherwise use code+position. Incoming identities are always replaced by a server identity. */
export function matchWorkOrderLines(previous: readonly WorkOrderPricedLine[], incoming: readonly WorkOrderPricedLine[], mint: () => string): WorkOrderPricedLine[] {
  const key = (line: WorkOrderPricedLine, position: number) => line.clientLineReference === null ? `position:${position}:${line.sorCode}` : `reference:${line.clientLineReference}`;
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
type RevisionForDiff = { status: "ordered" | "cancelled"; issuedOn: string; dueOn: string | null; priority: "routine" | "urgent" | "emergency"; lines: readonly WorkOrderPricedLine[] };
/** No resident contents, descriptions, prices or free text in diffs: revisions retain the authorized commercial values. */
export function diffWorkOrderRevision(previous: RevisionForDiff | null, next: RevisionForDiff) {
  const old = new Map(previous?.lines.map(line => [line.scopeItemId, line]) ?? []);
  const current = new Map(next.lines.map(line => [line.scopeItemId, line]));
  const equal = (a: WorkOrderPricedLine, b: WorkOrderPricedLine) => a.clientLineReference === b.clientLineReference && a.sorCode === b.sorCode && a.quantity === b.quantity && a.unit === b.unit && a.rate.pence === b.rate.pence && a.net.pence === b.net.pence && a.origin === b.origin;
  return {
    fields: (["status", "issuedOn", "dueOn", "priority"] as const).filter(field => !previous || previous[field] !== next[field]),
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
export function encodeWorkOrderCsv(rows: readonly WorkOrderRow[]): string {
  const quote = (value: string) => /[",\r\n]/u.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  return workOrderCsvColumns.join(",") + "\r\n" + rows.map(row => workOrderCsvColumns.map(column => {
    const value = row[column];
    return quote(value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));
  }).join(",")).join("\r\n") + "\r\n";
}
