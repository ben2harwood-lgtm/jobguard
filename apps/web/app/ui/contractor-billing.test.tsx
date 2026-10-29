import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BillingView, billingLineState, advanceCommand, contractorBillingReadV1, deliveryCommand, exactPounds, exportCommand, importCommand } from "./contractor-billing";

vi.stubGlobal("React", React);

const p = (numerator: string, denominator = "1") => ({ numerator, denominator });
const read = {
  version: "contractor-billing-projection.v1",
  // Shape returned by BillingApplication.read (exports flattened, no CSV body).
  exports: [{ id: "batch-0001-aaaa", jsonHash: "j", csvHash: "c", lines: [{}, {}], totalNet: { pence: 80000, currency: "GBP" } }],
  invoices: [{ source: "client-erp", invoiceNumber: "INV-7", runId: "r", projection: {
    lines: [{ lineId: "L1", billedNet: p("50000"), creditedNet: p("0"), paidNet: p("2500000", "31"), paidGross: p("0"), matchedExtraNet: p("0"), rejected: false }],
    totals: { billedNet: p("50000"), creditedNet: p("0"), paidNet: p("2500000", "31"), paidGross: p("0"), matchedExtraNet: p("0") },
    allocations: [], held: [{ sourceEventId: "evt-9", reason: "COMPOSITION_REQUIRED" }] } }],
  quarantine: [{ fact_id: "fact-0001-bbbb", reason: "INVOICE_REQUIRED" }],
  deliveries: [{ id: "d1", batch_id: "batch-0001-aaaa", outbox_action_id: "box-1", status: "succeeded", adapter: "fake_download" }],
  clientContractIds: ["contract-1"],
  reconciliation: {
    approvedNotExported: [{ extraId: "extra-0001", net: p("12000") }],
    unbilledExports: [{ exportLineId: "line-0002", net: p("30000"), alertDays: 30, overdue: true }],
    billedDifferences: [], credits: [], rejections: [], excessPayment: [], unmatchedFacts: [],
    totals: { approvedNotExported: p("12000"), unbilledExports: p("30000"), billedDifference: p("0"), credits: p("0"), rejections: p("0"), excessPayment: p("0") },
  },
};

describe("ENT-6 billing and reconciliation screen", () => {
  it("labels the status format separately from its option text", () => {
    const html = renderToStaticMarkup(createElement(BillingView, { jobId: "job-1", view: contractorBillingReadV1.parse(read), send: () => undefined }));
    expect(html).toContain('<label for="billing-status-format">Format</label>');
    expect(html).toContain('<select id="billing-status-format">');
  });
  it("keeps the status data label separate from the textarea contents for repeated imports", () => {
    const html = renderToStaticMarkup(createElement(BillingView, { jobId: "job-1", view: contractorBillingReadV1.parse(read), send: () => undefined }));
    expect(html).toContain('<label for="billing-status-data">Status data</label>');
    expect(html).toContain('<textarea id="billing-status-data" rows="6">');
  });
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
  it("builds each action as one exact versioned command", () => {
    expect(exportCommand("contract-1", "cmd-1")).toEqual({ action: "export", body: { version: "billing-finalise.v1", commandId: "cmd-1", clientContractId: "contract-1" } });
    expect(importCommand("csv", "a,b\n1,2", "cmd-2").body).toEqual({ version: "billing-import-request.v1", commandId: "cmd-2", input: { version: "billing-import.v1", transport: "csv", csv: "a,b\n1,2" } });
    expect(importCommand("json", '{"version":"billing-status.v1"}', "cmd-3").body).toMatchObject({ input: { transport: "api", events: [{ version: "billing-status.v1" }] } });
    expect(importCommand("json", "[1,2]", "cmd-4").body).toMatchObject({ input: { events: [1, 2] } });
    expect(() => importCommand("json", "not json", "cmd-5")).toThrow();
    // Approval binds the batch's exact JSON content hash and expires.
    expect(deliveryCommand({ id: "batch-1", jsonHash: "h".repeat(64) }, "fake_sftp", "client.invalid", "cmd-6", new Date("2026-10-28T10:00:00Z")).body).toEqual({
      version: "billing-approve-delivery.v1", commandId: "cmd-6", batchId: "batch-1", channel: "fake_sftp", destination: "client.invalid",
      contentHash: "h".repeat(64), expiresAt: "2026-10-28T10:15:00.000Z" });
  });
  it("retries only a retryable delivery and only reconciles an unknown outcome", () => {
    expect(advanceCommand({ outbox_action_id: "box-1", status: "retryable" })?.body).toEqual({ version: "billing-advance-delivery.v1", outboxActionId: "box-1", action: "execute" });
    expect(advanceCommand({ outbox_action_id: "box-1", status: "outcome_unknown" })?.body).toEqual({ version: "billing-advance-delivery.v1", outboxActionId: "box-1", action: "reconcile" });
    for (const status of ["succeeded", "pending", "executing", "failed"]) expect(advanceCommand({ outbox_action_id: "box-1", status })).toBeNull();
  });
  it("shows the action controls only when the screen can send, and the right delivery follow-up", () => {
    const view = contractorBillingReadV1.parse({ ...read, deliveries: [{ ...read.deliveries[0]!, status: "outcome_unknown" }] });
    expect(renderToStaticMarkup(createElement(BillingView, { jobId: "job-1", view }))).not.toContain("Export approved extras");
    const html = renderToStaticMarkup(createElement(BillingView, { jobId: "job-1", view, send: () => undefined }));
    expect(html).toContain("Export approved extras");
    expect(html).toContain("Approve delivery");
    expect(html).toContain("Import status");
    expect(html).toContain("Check Download delivery outcome");
    expect(html).not.toContain("delivery again");
    const none = renderToStaticMarkup(createElement(BillingView, { jobId: "job-1", view: { ...view, clientContractIds: [] }, send: () => undefined }));
    expect(none).toContain("This job has no client contract to export to.");
  });
});

it("ENT-11b derives billed, part-paid and paid from exact balances, preserving credits and reversals", () => {
  const line = { lineId: "extra", billedNet: p("100"), creditedNet: p("0"), paidNet: p("0"), rejected: false };
  expect(billingLineState(line)).toBe("Billed");
  expect(billingLineState({ ...line, paidNet: p("299", "3") })).toBe("Part-paid");
  expect(billingLineState({ ...line, paidNet: p("300", "3") })).toBe("Paid");
  expect(billingLineState({ ...line, paidNet: p("50"), creditedNet: p("50") })).toBe("Paid");
  expect(billingLineState({ ...line, creditedNet: p("100") })).toBe("Credited");
  expect(billingLineState({ ...line, rejected: true, paidNet: p("100") })).toBe("Rejected");
  expect(billingLineState({ ...line, paidNet: p("-1") })).toBe("Billed");
});
