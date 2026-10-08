import { describe, expect, it } from "vitest";
import { contractorRoles } from "./contractor.js";
import { workOrderRowV1, validateWorkOrderRow, parseWorkOrderCsv, encodeWorkOrderCsv, matchWorkOrderLines, diffWorkOrderRevision, workOrderImportPermits, sorImportPermits, workOrderAuditPayloadV1 } from "./work-order.js";
const id = "11000000-0000-4000-8000-000000000001";
const other = "11000000-0000-4000-8000-000000000002";
const row = { version: "work-order-import.v1", clientId: id, contractId: id, workOrderReference: "Fictional-001", issuedOn: "2026-10-08", dueOn: null, priority: "routine", status: "ordered", expectedRevision: 0, siteRevisionId: id, resident: { kind: "none", reason: "void_property" }, teamId: null, assignedMembershipIds: [], lines: [{ clientLineReference: null, sorCode: "REPAIR", quantity: "1" }] };
describe("ENT-2 import boundaries (DW2, DW6)", () => {
  it("accepts the versioned row and leaves absent parties for the controlled CH-3b refusal", () => {
    expect(workOrderRowV1.safeParse(row).success).toBe(true);
    for (const field of ["clientId", "contractId", "siteRevisionId", "resident"]) {
      expect(workOrderRowV1.safeParse({ ...row, [field]: null }).success).toBe(true);
    }
  });
  it.each(["tenantId", "provenance", "statusOverride", "track", "origin", "price", "netPence"])("refuses client-supplied %s", field => {
    expect(validateWorkOrderRow({ ...row, [field]: "forged" })).toEqual({ ok: false, code: "INVALID_ROW" });
    expect(workOrderRowV1.safeParse({ ...row, lines: [{ ...row.lines[0], [field]: "forged" }] }).success).toBe(false);
  });
  it.each([["-1", "NEGATIVE_QUANTITY"], ["1.1234567", "QUANTITY_PRECISION"], ["1e2", "INVALID_QUANTITY"], ["01", "INVALID_QUANTITY"]])("types quantity %s as %s", (quantity, code) => {
    expect(validateWorkOrderRow({ ...row, lines: [{ ...row.lines[0], quantity }] })).toEqual({ ok: false, code });
  });
  it("refuses duplicate client line references, ambiguous assignments and unknown status", () => {
    expect(workOrderRowV1.safeParse({ ...row, lines: [{ ...row.lines[0], clientLineReference: "one" }, { ...row.lines[0], clientLineReference: "one" }] }).success).toBe(false);
    expect(workOrderRowV1.safeParse({ ...row, assignedMembershipIds: [id] }).success).toBe(false);
    expect(workOrderRowV1.safeParse({ ...row, status: "live" }).success).toBe(false);
    expect(workOrderRowV1.safeParse({ ...row, status: "cancelled", lines: [] }).success).toBe(true);
  });
  it("parses strict CSV with commas, quotes and embedded newlines; malformed records remain per-row failures", () => {
    const parsedRow = workOrderRowV1.parse({ ...row, workOrderReference: 'Fictional, "quoted"\norder' });
    const csv = encodeWorkOrderCsv([parsedRow, workOrderRowV1.parse(row)]);
    const result = parseWorkOrderCsv(csv);
    expect(result).toEqual([{ rowNumber: 2, input: parsedRow }, { rowNumber: 3, input: workOrderRowV1.parse(row) }]);
    expect(() => parseWorkOrderCsv(csv.replace("version,", "tenantId,"))).toThrow("INVALID_CSV_HEADER");
    expect(() => parseWorkOrderCsv(csv + '"unterminated')).toThrow("INVALID_CSV");
    const invalid = parseWorkOrderCsv(encodeWorkOrderCsv([workOrderRowV1.parse(row)]).replace('"[{', '"bad[{'));
    expect(invalid[0]).toEqual({ rowNumber: 2, error: "INVALID_ROW" });
  });
  it("permits only the issued roles, scoped against server targets", () => {
    for (const role of contractorRoles) {
      const grants = [{ role, scope: { kind: "tenant" as const, id } }];
      expect(workOrderImportPermits(grants, { tenantId: id })).toBe(["surveyor", "commercial_manager"].includes(role));
      expect(sorImportPermits(grants, { tenantId: id })).toBe(role === "commercial_manager");
      expect(workOrderImportPermits(grants, { tenantId: other })).toBe(false);
    }
    expect(workOrderImportPermits([], { tenantId: id })).toBe(false);
    expect(workOrderImportPermits([{ role: "surveyor", scope: { kind: "team", id } }], { tenantId: other, teamId: id })).toBe(true);
    expect(workOrderImportPermits([{ role: "surveyor", scope: { kind: "team", id } }], { tenantId: other, teamId: other })).toBe(false);
  });
  it("audit allowlist cannot carry resident details or free text", () => {
    const payload = { references: { commandId: id, workOrderId: id, revisionId: id, environment: "synthetic_demo" }, hashes: { document: "a".repeat(64) }, classifications: { action: "operational" } };
    expect(workOrderAuditPayloadV1.safeParse(payload).success).toBe(true);
    expect(workOrderAuditPayloadV1.safeParse({ ...payload, resident: { name: "Fictional resident" } }).success).toBe(false);
    expect(workOrderAuditPayloadV1.safeParse({ ...payload, references: { ...payload.references, email: "fake@fictional.invalid" } }).success).toBe(false);
  });
});
const line = (clientLineReference: string | null, sorCode: string, quantity: string, scopeItemId: string) => ({ clientLineReference, sorCode, quantity, scopeItemId, unit: "each", rate: { pence: 100, currency: "GBP" as const }, net: { pence: 100, currency: "GBP" as const }, origin: "client_instruction" as const });
describe("ENT-2 immutable revision derivation (DW3)", () => {
  it("preserves line-reference identity across positions and code+position identity without references", () => {
    const old = [line("A", "REPAIR", "1", id), line(null, "PAINT", "1", other)];
    const next = [line("A", "OTHER", "2", other), line(null, "PAINT", "1", id), line(null, "REPAIR", "1", id)];
    const mint = () => "11000000-0000-4000-8000-000000000003";
    expect(matchWorkOrderLines(old, next, mint).map(l => l.scopeItemId)).toEqual([id, other, mint()]);
    expect(old[0]?.quantity).toBe("1");
  });
  it("does not replace an identity through ambiguous references", () => {
    expect(() => matchWorkOrderLines([], [line("A", "REPAIR", "1", id), line("A", "REPAIR", "1", other)], () => id)).toThrow("DUPLICATE_LINE_REFERENCE");
  });
  it("records added, removed, changed and cancellation diffs without copying contacts", () => {
    const a = line("A", "REPAIR", "1", id), b = line("B", "PAINT", "1", other);
    const previous = { status: "ordered" as const, issuedOn: "2026-10-08", dueOn: null, priority: "routine" as const, lines: [a] };
    expect(diffWorkOrderRevision(previous, previous)).toEqual({ fields: [], added: [], removed: [], changed: [] });
    expect(diffWorkOrderRevision(previous, { ...previous, status: "cancelled", lines: [b] })).toEqual({ fields: ["status"], added: [other], removed: [id], changed: [] });
    expect(diffWorkOrderRevision(previous, { ...previous, lines: [{ ...a, quantity: "2" }] })).toEqual({ fields: [], added: [], removed: [], changed: [id] });
    expect(diffWorkOrderRevision({ ...previous, lines: [a, b] }, { ...previous, lines: [b, a] })).toEqual({ fields: [], added: [], removed: [], changed: [other, id] });
  });
});
