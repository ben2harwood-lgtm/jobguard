import { describe, expect, it } from "vitest";
import {
  appendInterimDraftRecord, assertInterimDocumentIssueAllowed, INTERIM_APPLICATIONS_ENABLED,
  InterimApplicationError, interimDraftIssueBlockers, reconcileInterimDraftBook,
  type InterimDraftBook, type InterimDraftRecord,
} from "./interim-applications.js";
import { MAX_MONEY_PENCE } from "./money.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = id(1), jobId = id(2), scope = id(3), variationScope = id(4);
const base = (n: number) => ({ id: id(n), tenantId, jobId });
const lines = (netPence: number) => [{ scopeItemId: scope, netPence }];
function empty(): InterimDraftBook {
  return { version: "interim.draft-book.v1", environment: "synthetic", tenantId, jobId, records: [] };
}
const schedule = () => ({
  ...base(10), version: "interim.schedule.v1" as const, revision: 1, previousScheduleId: null,
  baselineSnapshotId: id(5), approvalDecisionId: id(6), valuationDates: ["2026-10-31"], jurisdiction: "synthetic_england_wales", arrangement: "synthetic_staged",
  d06TemplateVersion: null, d02TaxPolicyVersion: null,
  lines: [{ id: id(7), scopeItemId: scope, commercialRevisionId: id(8), sourceDocumentId: id(5),
    kind: "baseline" as const, approvalDecisionId: null, netPence: 10000 }],
});
const application = (n = 20, amount = 6000) => ({
  ...base(n), version: "interim.application.v1" as const, applicationId: id(19), revision: 1,
  previousRevisionId: null, scheduleId: id(10), valuationDate: "2026-10-31", kind: "interim" as const, cumulativeValues: lines(amount),
});
const certification = (n = 30, amount = 5000, app = 20) => ({
  ...base(n), version: "interim.certification.v1" as const, applicationRevisionId: id(app),
  certificateReference: `synthetic-cert-${n}`, cumulativeValues: lines(amount),
});
const invoice = (n = 40, amount = 5000, cert = 30) => ({
  ...base(n), version: "interim.invoice-draft.v1" as const, certificationId: id(cert), lines: lines(amount), taxPence: 1000,
});
function append(book: InterimDraftBook, ...records: InterimDraftRecord[]): InterimDraftBook {
  return records.reduce((state, record) => appendInterimDraftRecord(state, record), book);
}
function invoiced() { return append(empty(), schedule(), application(), certification(), invoice()); }
function expectCode(run: () => unknown, code: string) {
  try { run(); throw new Error("Expected rejection"); }
  catch (error) { expect(error).toBeInstanceOf(InterimApplicationError); expect(error).toMatchObject({ code }); }
}

describe("M4-18 synthetic interim drafts", () => {
  it("keeps requested, certified, invoiced and gross cash separate", () => {
    const book = append(invoiced(), { ...base(50), version: "interim.synthetic-receipt.v1", invoiceId: id(40), amountPence: 2000 });
    expect(reconcileInterimDraftBook(book)).toMatchObject({
      netInvoiced: { pence: 5000 }, grossReceived: { pence: 2000 }, grossOutstanding: { pence: 4000 },
      lines: [{ scheduled: { pence: 10000 }, applied: { pence: 6000 }, certified: { pence: 5000 }, invoiced: { pence: 5000 }, invoiceable: { pence: 0 } }],
    });
  });
  it("blocks duplicate completed value even with a fresh invoice identity", () => {
    expectCode(() => append(invoiced(), invoice(41, 1)), "VALUE_LIMIT");
    expect(appendInterimDraftRecord(invoiced(), invoice()).records).toHaveLength(4);
    expectCode(() => append(invoiced(), { ...invoice(), taxPence: 999 }), "REPLAY_CONFLICT");
  });
  it("repeated applications and certificates create no extra invoiceable value", () => {
    const book = append(invoiced(), { ...application(21), applicationId: id(18) }, certification(31, 5000, 21));
    expectCode(() => append(book, invoice(41, 5000, 31)), "VALUE_LIMIT");
    expect(reconcileInterimDraftBook(book).priorApplicationRevisionIds).toEqual([id(20), id(21)]);
  });
  it("uses per-scope limits rather than borrowing headroom from unrelated scope", () => {
    const first = schedule();
    const book = append(empty(), {
      ...first, lines: [...first.lines, { ...first.lines[0]!, id: id(9), scopeItemId: variationScope, netPence: 10000 }],
    }, { ...application(), cumulativeValues: [...lines(5000), { scopeItemId: variationScope, netPence: 10000 }] },
    { ...certification(), cumulativeValues: [...lines(5000), { scopeItemId: variationScope, netPence: 10000 }] });
    expectCode(() => append(book, invoice(40, 6000)), "VALUE_LIMIT");
  });
  it("reconciles additions, omissions, credits and part payments to a final account without rewriting history", () => {
    const original = invoiced(), before = JSON.stringify(original);
    const originalSchedule = schedule();
    const updatedSchedule = {
      ...originalSchedule, ...base(11), revision: 2, previousScheduleId: id(10),
      lines: [...originalSchedule.lines,
        { id: id(60), scopeItemId: scope, commercialRevisionId: id(61), sourceDocumentId: id(62),
          kind: "approved_variation" as const, approvalDecisionId: id(63), netPence: -6000 },
        { id: id(64), scopeItemId: variationScope, commercialRevisionId: id(65), sourceDocumentId: id(66),
          kind: "approved_variation" as const, approvalDecisionId: id(67), netPence: 3000 }],
    };
    const finalValues = [...lines(4000), { scopeItemId: variationScope, netPence: 3000 }];
    let book = append(original,
      { ...base(50), version: "interim.synthetic-receipt.v1", invoiceId: id(40), amountPence: 2000 },
      updatedSchedule,
      { ...application(22), applicationId: id(23), scheduleId: id(11), kind: "final_account", cumulativeValues: finalValues },
      { ...certification(32, 0, 22), cumulativeValues: finalValues });
    expect(reconcileInterimDraftBook(book).lines).toMatchObject([
      { finalAccountRemaining: { pence: -1000 }, creditRequired: { pence: 1000 } },
      { finalAccountRemaining: { pence: 3000 }, invoiceable: { pence: 3000 } },
    ]);
    book = append(book,
      { ...base(70), version: "interim.credit-draft.v1", invoiceId: id(40), lines: lines(1000), taxPence: 200 },
      { ...invoice(41, 0, 32), lines: [{ scopeItemId: variationScope, netPence: 3000 }], taxPence: 600 });
    const result = reconcileInterimDraftBook(book);
    expect(result.netInvoiced.pence).toBe(7000);
    expect(result.lines.map(line => line.finalAccountRemaining?.pence)).toEqual([0, 0]);
    expect(result.grossReceived.pence).toBe(2000);
    expect(result.grossOutstanding.pence).toBe(6400);
    expect(JSON.stringify(original)).toBe(before);
    expect(book.records.slice(0, 4)).toEqual(original.records);
    expectCode(() => append(book, { ...invoice(42, 1, 32), taxPence: 0 }), "VALUE_LIMIT");
  });
  it("preserves immutable snapshots and accepts only the next linked application revision", () => {
    const book = append(empty(), schedule(), application());
    const input = { ...application(21, 7000), revision: 2, previousRevisionId: id(20) };
    const next = append(book, input);
    input.cumulativeValues[0]!.netPence = 1;
    expect(reconcileInterimDraftBook(next).lines[0]!.applied.pence).toBe(7000);
    expect(Object.isFrozen(next.records[0])).toBe(true);
    expect(Object.isFrozen(next.records)).toBe(true);
    expectCode(() => append(book, { ...application(22), revision: 3 }), "STALE_REVISION");
    expectCode(() => append(next, certification(31, 5000, 20)), "STALE_REVISION");
  });
  it("prevents rewriting baseline and approved history when changing a schedule", () => {
    const first = schedule(), book = append(empty(), first);
    expectCode(() => append(book, { ...first, ...base(11), revision: 2, previousScheduleId: id(10),
      lines: [{ ...first.lines[0]!, netPence: 9000 }] }), "INVALID_LINEAGE");
    expectCode(() => append(empty(), { ...first, lines: [{ ...first.lines[0]!, sourceDocumentId: id(999) }] }), "INVALID_LINEAGE");
    expectCode(() => append(empty(), { ...first, lines: [{ ...first.lines[0]!, kind: "approved_variation" }] }), "INVALID_LINEAGE");
  });
  it("rejects duplicated commercial sources and rewritten certificate references", () => {
    const first = schedule();
    const extra = { id: id(60), scopeItemId: variationScope, commercialRevisionId: id(61), sourceDocumentId: id(62),
      kind: "approved_variation" as const, approvalDecisionId: id(63), netPence: 1000 };
    expectCode(() => append(empty(), { ...first, lines: [...first.lines, extra, { ...extra, id: id(64) }] }), "DUPLICATE_LINE");
    expectCode(() => append(invoiced(), { ...certification(31), certificateReference: "synthetic-cert-30" }), "REPLAY_CONFLICT");
  });
  it("requires a new application and certification after an approved schedule revision", () => {
    const first = schedule(), book = append(invoiced(), { ...first, ...base(11), revision: 2, previousScheduleId: id(10) });
    expect(reconcileInterimDraftBook(book)).toMatchObject({ valuationPending: true, lines: [{ finalAccountRemaining: null, creditRequired: null }] });
    expectCode(() => append(book, invoice(41, 1)), "STALE_REVISION");
    expectCode(() => append(book, application(22)), "STALE_REVISION");
  });
  it("rejects missing source records and over-certification", () => {
    expectCode(() => append(empty(), invoice()), "STALE_REVISION");
    expectCode(() => append(empty(), { ...base(70), version: "interim.credit-draft.v1", invoiceId: id(40), lines: lines(1), taxPence: 0 }), "MISSING_SOURCE");
    expectCode(() => append(empty(), { ...base(50), version: "interim.synthetic-receipt.v1", invoiceId: id(40), amountPence: 1 }), "MISSING_SOURCE");
    expectCode(() => append(empty(), schedule(), application(), certification(30, 6001)), "VALUE_LIMIT");
    expectCode(() => append(empty(), schedule(), application(20, 10001)), "VALUE_LIMIT");
  });
  it("binds applications to the approved valuation schedule without deriving authority from a due date", () => {
    expectCode(() => append(empty(), schedule(), { ...application(), valuationDate: "2026-11-01" }), "INVALID_LINEAGE");
    expectCode(() => append(empty(), { ...schedule(), valuationDates: ["2026-10-31", "2026-10-31"] }), "INVALID_LINEAGE");
    expectCode(() => appendInterimDraftRecord(empty(), { ...schedule(), valuationDates: ["2026-02-30"] }), "INVALID_INPUT");
  });
  it("requires all cumulative lines explicitly, including omitted work at zero", () => {
    expectCode(() => append(empty(), schedule(), { ...application(), cumulativeValues: [{ scopeItemId: variationScope, netPence: 1 }] }), "INVALID_LINEAGE");
    expectCode(() => append(empty(), schedule(), { ...application(), cumulativeValues: [...lines(1), ...lines(1)] }), "DUPLICATE_LINE");
  });
  it("limits aggregate credits to each exact invoice and keeps overpaid cash unapplied", () => {
    const credit = { ...base(70), version: "interim.credit-draft.v1" as const, invoiceId: id(40), lines: lines(5000), taxPence: 1000 };
    const book = append(invoiced(), credit, { ...base(50), version: "interim.synthetic-receipt.v1", invoiceId: id(40), amountPence: 2000 });
    expect(reconcileInterimDraftBook(book)).toMatchObject({ grossOutstanding: { pence: 0 }, unappliedCash: { pence: 2000 } });
    expectCode(() => append(book, { ...credit, ...base(71), lines: lines(1), taxPence: 0 }), "VALUE_LIMIT");
    expectCode(() => append(invoiced(), { ...credit, taxPence: 1001 }), "VALUE_LIMIT");
    // A credit releases only its own net allocation, never a second full invoice.
    const partlyCredited = append(invoiced(), { ...credit, lines: lines(1000), taxPence: 200 });
    expectCode(() => append(partlyCredited, invoice(41, 1001)), "VALUE_LIMIT");
    expect(reconcileInterimDraftBook(append(partlyCredited, { ...invoice(41, 1000), taxPence: 200 })).netInvoiced.pence).toBe(5000);
  });
  it.each(["tenantId", "jobId"] as const)("rejects cross-context %s even in imported histories", field => {
    expectCode(() => append(empty(), { ...schedule(), [field]: id(99) }), "CONTEXT_MISMATCH");
    expectCode(() => reconcileInterimDraftBook({ ...invoiced(), [field]: id(99) }), "CONTEXT_MISMATCH");
  });
  it("rejects duplicate identities, unknown fields, malformed versions, live data and unsafe money", () => {
    expectCode(() => reconcileInterimDraftBook({ ...invoiced(), records: [schedule(), schedule()] }), "REPLAY_CONFLICT");
    expectCode(() => appendInterimDraftRecord(empty(), { ...schedule(), issued: true }), "INVALID_INPUT");
    expectCode(() => reconcileInterimDraftBook({ ...empty(), environment: "production" }), "INVALID_INPUT");
    expectCode(() => appendInterimDraftRecord(empty(), { ...schedule(), version: "interim.schedule.v2" }), "INVALID_INPUT");
    for (const n of [-1, 0.5, MAX_MONEY_PENCE + 1, Number.NaN]) {
      expectCode(() => appendInterimDraftRecord(append(empty(), schedule()), application(20, n)), "INVALID_INPUT");
    }
  });
  it("checks aggregate magnitude with integer intermediates", () => {
    const first = schedule();
    expect(() => append(empty(), { ...first, lines: [
      { ...first.lines[0]!, netPence: MAX_MONEY_PENCE },
      { ...first.lines[0]!, id: id(9), scopeItemId: variationScope, netPence: 1 },
    ] })).toThrow("Money result exceeds");
  });
  it("keeps unsupported setups as drafts with clear gates, even when approval version strings are supplied", () => {
    const unsupported = { ...schedule(), jurisdiction: "unsupported", arrangement: "unsupported" };
    expect(append(empty(), unsupported).records).toHaveLength(1);
    expect(interimDraftIssueBlockers(unsupported)).toEqual([
      "FEATURE_DISABLED", "D06_TEMPLATE_REQUIRED", "D02_TAX_RULES_REQUIRED", "UNSUPPORTED_ARRANGEMENT",
    ]);
    expect(interimDraftIssueBlockers({ ...schedule(), d06TemplateVersion: "claimed", d02TaxPolicyVersion: "claimed" })).toEqual(["FEATURE_DISABLED"]);
    expect(INTERIM_APPLICATIONS_ENABLED).toBe(false);
  });
  it.each(["timer", "suggestion", "human_decision"])("cannot issue a document via %s", () => {
    const before = JSON.stringify(invoiced());
    expectCode(() => assertInterimDocumentIssueAllowed(), "ISSUE_DISABLED");
    expect(JSON.stringify(invoiced())).toBe(before);
  });
});
