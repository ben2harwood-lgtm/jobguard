import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { MerchantOrder } from "./merchant-order";
const state = vi.hoisted(() => ({ preview: null as unknown }));
vi.mock("react", async load => { const actual = await load<typeof import("react")>(); return { ...actual, useState: (value: unknown) => actual.useState(value === null ? state.preview : value) }; });
afterEach(() => { state.preview = null; });
it("never promises availability before an order has been read", () => {
  const html = renderToStaticMarkup(React.createElement(MerchantOrder, { jobId: "practice" }));
  expect(html).toContain("Stock: unknown"); expect(html).toContain("Lead time: unknown");
  expect(html).toContain("no order is really sent"); expect(html).not.toContain("Confirm this exact");
});
it("shows the cited above-rate finding and exact authority before confirmation, with zero prevention fee", () => {
  state.preview = { contentHash: "a".repeat(64), amountPence: 25000,
    order: { recipient: "fictional.invalid", deliveryDate: "2026-11-04", line: { skuId: "sku", quantity: "10", unit: "each", unitPricePence: 2500,
      rateId: "cited-rate", rateVersion: 3, agreedPricePence: 20000, rateUnit: "box", packQuantity: "10", taxBasis: "net" } }, finding: { aboveAgreedRate: true } };
  const html = renderToStaticMarkup(React.createElement(MerchantOrder, { jobId: "practice" }));
  for (const text of ["Above agreed rate", "cited-rate", "version 3", "£200.00 per box", "10 each", "£250.00", "fee £0.00", "a".repeat(64), "separate owner assertion", "Stock: unknown", "Lead time: unknown"])
    expect(html).toContain(text);
  expect(html.indexOf("cited-rate")).toBeLessThan(html.indexOf("Confirm this exact practice order"));
});
