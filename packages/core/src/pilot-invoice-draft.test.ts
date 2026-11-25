import { describe, expect, it } from "vitest";
import { pilotDraftChecklistV1, pilotDraftStatements, pilotDraftTotals, pilotDraftCsv, pilotDraftHtml, PILOT_DRAFT_WARNING, type PilotInvoiceDraft } from "./pilot-invoice-draft.js";
const checklist = { ...Object.fromEntries(Object.keys(pilotDraftStatements).map(key => [key, true])), vatNumber: "GB 123 4567 89" };
describe("builder draft", () => {
  it("rejects every unknown, missing or unsupported statement, including changed extras", () => {
    expect(pilotDraftChecklistV1.parse(checklist).vatNumber).toBe("GB123456789");
    for (const key of Object.keys(pilotDraftStatements)) {
      for (const value of [false, undefined, "unknown"]) expect(pilotDraftChecklistV1.safeParse({ ...checklist, [key]: value }).success).toBe(false);
    }
    for (const vatNumber of ["", "unknown", "123", "GB12345678X"]) expect(pilotDraftChecklistV1.safeParse({ ...checklist, vatNumber }).success).toBe(false);
  });
  it("uses exact candidate group VAT and agrees in printable and CSV exports", () => {
    const lines = [{ description: '<script>bad()</script>, "work"', netPence: 1003, quantity: "1", unit: "job", unitRatePence: 1003 }];
    const totals = pilotDraftTotals(lines);
    expect(totals).toMatchObject({ netPence: 1003, candidateVatPence: 201, grossPence: 1204 });
    const draft: PilotInvoiceDraft = { version: "pilot-invoice-draft.v1", warning: PILOT_DRAFT_WARNING, jobId: "fictional",
      binding: "a".repeat(64), sourceHash: "b".repeat(64), accountRevision: 1, previewedAt: "2026-11-25T12:00:00Z",
      builder: { name: "Builder", address: [] }, customer: { name: "Homeowner", address: [] }, site: ["Work site"],
      vatNumber: "GB123456789", lines, ...totals };
    const csv = pilotDraftCsv(draft), html = pilotDraftHtml(draft);
    for (const output of [csv, html]) {
      for (const value of [PILOT_DRAFT_WARNING, "10.03", "2.01", "12.04", "Missing", "not an issue or delivery date"]) expect(output).toContain(value);
      expect(output).not.toContain("paid");
    }
    expect(html).not.toContain("<script>");
    expect(csv).toContain('""work""');
  });
  it("refuses negative credits and unsafe money", () => {
    for (const netPence of [-1, Number.MAX_SAFE_INTEGER + 1]) expect(() => pilotDraftTotals([
      { description: "Work", netPence, quantity: null, unit: null, unitRatePence: null },
    ])).toThrow();
  });
});
