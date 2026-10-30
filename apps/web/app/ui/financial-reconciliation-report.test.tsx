import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { reportFixture } from "../../e2e/helpers/reconciliation-report";
import { reconciliationReportResponseV1 } from "../lib/financial-reconciliation-report";
import { ReconciliationReportView } from "./financial-reconciliation-report";
it("keeps gross, fees, refunds, VAT and payout distinct and exposes no edit controls", () => {
 const value = reconciliationReportResponseV1.parse(reportFixture());
 const html = renderToStaticMarkup(<ReconciliationReportView value={value} />);
 for (const [key, amount] of [["grossCharged", "120.00"], ["providerFees", "3.00"], ["netPayout", "90.00"], ["vat", "20.00"], ["refunds", "10.00"], ["outstandingClearing", "17.00"]]) {
  expect(html).toContain(`data-testid="reconciliation-${key}">£${amount}`);
 }
 expect(html).toContain("Net payout is not gross recovered money");
 expect(html).toContain("OUTSTANDING CLEARING"); expect(html).toContain("MISSING OR DUPLICATE JOURNAL");
 expect(html).toContain("separate approval path"); expect(html).not.toMatch(/<(button|input|textarea|form|select)\b/u);
});
it("retains signed discrepancies and does not treat an empty queue as verified recovery", () => {
 const value = reconciliationReportResponseV1.parse(reportFixture()); value.report.balances.outstandingClearing = { pence: -100, currency: "GBP" }; value.report.queue = [];
 const html = renderToStaticMarkup(<ReconciliationReportView value={value} />);
 expect(html).toContain("−£1.00"); expect(html).toContain("No unexplained differences in this reference run.");
 expect(html).toContain("Source verification is unavailable");
});
it("rejects fractional money, production flags and injected response fields", () => {
 const value = reportFixture();
 for (const raw of [{ ...value, approved: true }, { ...value, report: { ...value.report, productionEnabled: true } },
  { ...value, report: { ...value.report, balances: { ...value.report.balances, netPayout: { pence: 0.1, currency: "GBP" } } } }]) {
  expect(reconciliationReportResponseV1.safeParse(raw).success).toBe(false);
 }
});
