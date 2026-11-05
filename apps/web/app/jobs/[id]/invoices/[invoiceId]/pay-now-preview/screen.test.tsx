import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { payNowOptions } from "@jobguard/core";
import { StoredPayNowOptions } from "./screen";
const id = "11111111-1111-4111-8111-111111111111";
const invoice = { version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo", tenantId: id, jobId: id, invoiceId: id,
  revision: 1, balancePence: 10000, currency: "GBP", kind: "final", includesCatch: false, builderAccount: `fake-builder-${id}` };
it("renders identical wording, options and builder fees for server projections with or without a catch", () => {
  const render = (includesCatch: boolean) => renderToStaticMarkup(<StoredPayNowOptions view={{ version: "pay-now-preview.v1", synthetic: true, balancePence: 10000,
    options: payNowOptions({ ...invoice, includesCatch }), attempts: [] }} simulate={() => {}} />);
  const screen = render(false); expect(render(true)).toBe(screen);
  for (const text of ["Bank transfer", "Card", "Pay by bank", "No customer surcharge", "Builder fee preview", "min-height:44px"]) expect(screen).toContain(text);
  expect(screen.match(/<button /gu)).toHaveLength(3);
});
