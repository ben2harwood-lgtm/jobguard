import { describe, expect, it } from "vitest";
import { contractorPermissionMatrix, contractorRoles } from "./contractor.js";
import { workOrderRowV1, validateWorkOrderRow, parseWorkOrderCsv, encodeWorkOrderCsv, matchWorkOrderLines, diffWorkOrderRevision, workOrderImportPermits, sorImportPermits, workOrderAuditPayloadV1, workOrderBatchAuditPayloadV1, workOrderContentFields, workOrderPartiesComplete, workOrderImportRequestV1, workOrderErrorCodes, workOrderHttpStatus } from "./work-order.js";
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
  it("permits the import to organisation.manage and data.import holders only, and the SoR import to contract.manage holders only (Ben, 9 Oct 2026, \"Existing roles\")", () => {
    const importers = ["owner", "admin", "finance"], sorImporters = ["owner", "admin", "commercial_manager"];
    for (const role of contractorRoles) {
      const grants = [{ role, scope: { kind: "tenant" as const, id } }];
      expect(workOrderImportPermits(grants, { tenantId: id })).toBe(importers.includes(role));
      expect(sorImportPermits(grants, { tenantId: id })).toBe(sorImporters.includes(role));
      expect(workOrderImportPermits(grants, { tenantId: other })).toBe(false);
      expect(sorImportPermits(grants, { tenantId: other })).toBe(false);
    }
    // Surveyor and every other role get no import; the permission matrix itself is untouched.
    expect(contractorPermissionMatrix.surveyor).not.toContain("organisation.manage");
    expect(contractorPermissionMatrix.surveyor).not.toContain("data.import");
    expect(workOrderImportPermits([], { tenantId: id })).toBe(false);
    expect(sorImportPermits([], { tenantId: id })).toBe(false);
    // Finance is tenant-wide by construction; a team-scoped admin does not cover the tenant.
    expect(workOrderImportPermits([{ role: "finance", scope: { kind: "team", id } }], { tenantId: id, teamId: id })).toBe(false);
    expect(workOrderImportPermits([{ role: "admin", scope: { kind: "team", id } }], { tenantId: other, teamId: id })).toBe(true);
    expect(workOrderImportPermits([{ role: "admin", scope: { kind: "team", id } }], { tenantId: other, teamId: other })).toBe(false);
  });
  it("hashes only the revisable fields: parties are bound once, a cancellation ignores its lines, assignee order does not matter", () => {
    const base = workOrderRowV1.parse(row);
    const fields = workOrderContentFields(base);
    expect(workOrderContentFields({ ...base, siteRevisionId: other, resident: { kind: "none", reason: "void_property" } })).toEqual(fields);
    expect(workOrderContentFields({ ...base, assignedMembershipIds: [], teamId: id })).not.toEqual(fields);
    const two = workOrderRowV1.parse({ ...row, teamId: id, assignedMembershipIds: [id, other] });
    expect(workOrderContentFields(two)).toEqual(workOrderContentFields({ ...two, assignedMembershipIds: [other, id] }));
    const cancelled = workOrderContentFields(workOrderRowV1.parse({ ...row, status: "cancelled", lines: [] }));
    expect(workOrderContentFields(workOrderRowV1.parse({ ...row, status: "cancelled" }))).toEqual(cancelled);
    expect(cancelled.lines).toEqual([]);
  });
  it("judges party completeness for a revision exactly as the CH-3b routine does for a new order", () => {
    const base = workOrderRowV1.parse(row);
    expect(workOrderPartiesComplete(base)).toBe(true);
    for (const field of ["clientId", "contractId", "siteRevisionId", "resident"] as const) expect(workOrderPartiesComplete({ ...base, [field]: null })).toBe(false);
    expect(workOrderPartiesComplete({ ...base, resident: { kind: "none" } })).toBe(false);
    expect(workOrderPartiesComplete({ ...base, resident: { kind: "contact", contact: { version: "resident-contact.v1", name: "Fictional Resident" } } })).toBe(false);
    expect(workOrderPartiesComplete({ ...base, resident: { kind: "contact", contact: { version: "resident-contact.v1", name: "Fictional Resident", phone: "0000123" } } })).toBe(true);
    expect(workOrderPartiesComplete({ ...base, resident: { kind: "contact", contact: { version: "resident-contact.v1", name: null, phone: "0000123" } } })).toBe(false);
  });
  it("refuses a due date before the issue date and a cancelled order without lines is fine", () => {
    expect(workOrderRowV1.safeParse({ ...row, issuedOn: "2026-10-08", dueOn: "2026-10-07" }).success).toBe(false);
    expect(workOrderRowV1.safeParse({ ...row, issuedOn: "2026-10-08", dueOn: "2026-10-08" }).success).toBe(true);
  });
  it("accepts a generated sample or a csv, strictly, and maps every typed error to one HTTP status", () => {
    const base = { version: "work-order-import-request.v1", environment: "synthetic_demo", commandId: id };
    expect(workOrderImportRequestV1.safeParse({ ...base, source: { kind: "generated", sample: "starter_orders" } }).success).toBe(true);
    expect(workOrderImportRequestV1.safeParse({ ...base, source: { kind: "generated", sample: "../etc/passwd" } }).success).toBe(false);
    expect(workOrderImportRequestV1.safeParse({ ...base, source: { kind: "csv", name: "orders.csv", csv: "x" } }).success).toBe(true);
    expect(workOrderImportRequestV1.safeParse({ ...base, tenantId: id, source: { kind: "generated", sample: "starter_orders" } }).success).toBe(false);
    for (const code of workOrderErrorCodes) expect([401, 403, 404, 409, 422, 503]).toContain(workOrderHttpStatus(code));
    expect(workOrderHttpStatus("TRACK_FORBIDDEN")).toBe(403);
    expect(workOrderHttpStatus("NOT_FOUND")).toBe(404);
  });
  it("audit allowlist cannot carry resident details or free text", () => {
    const payload = { references: { commandId: id, workOrderId: id, revisionId: id, environment: "synthetic_demo" }, hashes: { document: "a".repeat(64) }, classifications: { action: "operational" } };
    expect(workOrderAuditPayloadV1.safeParse(payload).success).toBe(true);
    expect(workOrderAuditPayloadV1.safeParse({ ...payload, resident: { name: "Fictional resident" } }).success).toBe(false);
    expect(workOrderAuditPayloadV1.safeParse({ ...payload, references: { ...payload.references, email: "fake@fictional.invalid" } }).success).toBe(false);
    const batch = { references: { commandId: id, batchId: id, environment: "synthetic_demo" }, hashes: { document: "a".repeat(64) }, classifications: { action: "operational" } };
    expect(workOrderBatchAuditPayloadV1.safeParse(batch).success).toBe(true);
    expect(workOrderBatchAuditPayloadV1.safeParse({ ...batch, references: { ...batch.references, reference: "WO-1" } }).success).toBe(false);
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
    expect(diffWorkOrderRevision({ ...previous, teamId: id, assignedMembershipIds: [id] }, { ...previous, teamId: other, assignedMembershipIds: [id, other], lines: [a] }).fields).toEqual(["teamId", "assignedMembershipIds"]);
    expect(diffWorkOrderRevision({ ...previous, teamId: id, assignedMembershipIds: [id, other] }, { ...previous, teamId: id, assignedMembershipIds: [other, id] }).fields).toEqual([]);
  });
});
