import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BillingView, contractorBillingReadV1, exactPounds } from "./contractor-billing";

vi.stubGlobal("React", React);

const p = (numerator: string, denominator = "1") => ({ numerator, denominator });
const read = {
  version: "contractor-billing-projection.v1",
  exports: [{ id: "batch-0001-aaaa", artifact: { lines: [{}, {}], totalNet: { pence: 80000, currency: "GBP" } }, jsonHash: "j", csvHash: "c", csv: "x" }],
  invoices: [{ source: "client-erp", invoiceNumber: "INV-7", runId: "r", projection: {
    lines: [{ lineId: "L1", billedNet: p("50000"), creditedNet: p("0"), paidNet: p("2500000", "31"), paidGross: p("0"), matchedExtraNet: p("0"), rejected: false }],
    totals: { billedNet: p("50000"), creditedNet: p("0"), paidNet: p("2500000", "31"), paidGross: p("0"), matchedExtraNet: p("0") },
    allocations: [], held: [{ sourceEventId: "evt-9", reason: "COMPOSITION_REQUIRED" }] } }],
  quarantine: [{ fact_id: "fact-0001-bbbb", reason: "INVOICE_REQUIRED" }],
  deliveries: [{ id: "d1", batch_id: "batch-0001-aaaa", status: "succeeded", adapter: "fake_download" }],
  reconciliation: {
    approvedNotExported: [{ extraId: "extra-0001", net: p("12000") }],
    unbilledExports: [{ exportLineId: "line-0002", net: p("30000"), alertDays: 30, overdue: true }],
    billedDifferences: [], credits: [], rejections: [], excessPayment: [], unmatchedFacts: [],
    totals: { approvedNotExported: p("12000"), unbilledExports: p("30000"), billedDifference: p("0"), credits: p("0"), rejections: p("0"), excessPayment: p("0") },
  },
};

describe("ENT-6 billing and reconciliation screen", () => {
  it("shows whole pence as pounds and keeps fractional allocations exact", () => {
    expect(exactPounds(p("8064516", "100"))).toBe("8064516/100 pence");
    expect(exactPounds(p("250000", "2"))).toBe("£1,250.00");
    expect(exactPounds(p("-505"))).toBe("−£5.05");
    expect(exactPounds(p("2500000", "31"))).toBe("2500000/31 pence");
  });
  it("refuses a response that is not the billing projection", () => {
    expect(contractorBillingReadV1.safeParse({ ...read, version: "other" }).success).toBe(false);
    expect(contractorBillingReadV1.safeParse({ ...read, reconciliation: { ...read.reconciliation, totals: {} } }).success).toBe(false);
  });
  it("renders reconciliation totals, exports, invoices, holds and quarantine from the projection", () => {
    const html = renderToStaticMarkup(createElement(BillingView, { jobId: "job-1", view: contractorBillingReadV1.parse(read) }));
    expect(html).toContain("Approved, not yet exported: £120.00 (1)");
    expect(html).toContain("Exported, not yet billed: £300.00 (1)");
    expect(html).toContain("overdue (30 days)");
    expect(html).toContain("2 lines · net £800.00");
    expect(html).toContain("Download: succeeded.");
    expect(html).toContain(`href="/api/contractor/jobs/job-1/billing/download?batchId=batch-0001-aaaa"`);
    expect(html).toContain("2500000/31 pence");
    expect(html).toContain("evt-9 (COMPOSITION_REQUIRED)");
    expect(html).toContain("INVOICE_REQUIRED");
  });
  it("offers no download until a download delivery has succeeded", () => {
    const pending = { ...read, deliveries: [{ ...read.deliveries[0]!, status: "outcome_unknown" }] };
    const html = renderToStaticMarkup(createElement(BillingView, { jobId: "job-1", view: contractorBillingReadV1.parse(pending) }));
    expect(html).toContain("Download: outcome_unknown.");
    expect(html).not.toContain("Download CSV");
  });
});
