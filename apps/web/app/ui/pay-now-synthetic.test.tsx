import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CustomerInvoicePayNow, SyntheticPayNowPreview } from "./pay-now-synthetic";
const invoice = { version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo",
  tenantId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222",
  invoiceId: "33333333-3333-4333-8333-333333333333", revision: 1, builderAccount: "fake-builder-northside",
  balancePence: 100000, currency: "GBP", includesCatch: false, kind: "final" };
it("keeps the invoice feature dark", () => {
  expect(renderToStaticMarkup(<CustomerInvoicePayNow/>)).toBe("");
  expect(renderToStaticMarkup(<CustomerInvoicePayNow invoice={invoice}/>)).toBe("");
});
it("renders exactly the same customer screen, options and builder fees with or without a catch", () => {
  const withoutCatch = renderToStaticMarkup(<SyntheticPayNowPreview invoice={invoice}/>);
  expect(renderToStaticMarkup(<SyntheticPayNowPreview invoice={{ ...invoice, includesCatch: true }}/>)).toBe(withoutCatch);
  for (const label of ["Bank transfer", "Card", "Pay by bank", "No customer surcharge", "Builder fee preview", "No simulated payment recorded"]) {
    expect(withoutCatch).toContain(label);
  }
  expect(withoutCatch).not.toContain("https:");
  expect(withoutCatch.match(/<li /gu)).toHaveLength(3);
});
it.each(["deposit", "stage"])("labels the %s Direct Debit option as a stub", kind => {
  expect(renderToStaticMarkup(<SyntheticPayNowPreview invoice={{ ...invoice, kind }}/>)).toContain(`Preview ${kind} Direct Debit stub`);
});
