import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { assertPayNowLiveAllowed, PAY_NOW_ENABLED, payNowOptions } from "./pay-now-synthetic.js";

const invoice = { version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo",
  tenantId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222",
  invoiceId: "33333333-3333-4333-8333-333333333333", revision: 1, builderAccount: "fake-builder-northside",
  balancePence: 100000, currency: "GBP", includesCatch: false, kind: "final" };
describe("MON-6 synthetic invoice options", () => {
  it("bounds the fee over every size below and around the cap and the maximum magnitude", () => {
    for (const amount of [...Array.from({ length: 201000 }, (_, i) => i + 1), MAX_MONEY_PENCE]) {
      for (const option of payNowOptions({ ...invoice, balancePence: amount })) {
        if (option.builderFee.pence < 0 || option.builderFee.pence > Math.min(600, amount)
          || option.customerTotal.pence !== amount || option.customerSurcharge.pence !== 0) {
          throw new Error(`Invalid fee/surcharge at ${amount}`);
        }
      }
    }
  });
  it("rounds exact card fees half-even and caps rather than wrapping large amounts", () => {
    const cardFee = (balancePence: number) => payNowOptions({ ...invoice, balancePence })[1]!.builderFee.pence;
    expect(cardFee(500)).toBe(2); expect(cardFee(1500)).toBe(4);
    expect(cardFee(200000)).toBe(600); expect(cardFee(MAX_MONEY_PENCE)).toBe(600);
  });
  it("offers bank transfer equally and has no dependency on catch provenance", () => {
    const options = payNowOptions(invoice);
    expect(options.map(option => option.rail)).toEqual(["bank_transfer", "card", "pay_by_bank"]);
    expect(options).toEqual(payNowOptions({ ...invoice, includesCatch: true }));
    expect(options[0]!.builderFee.pence).toBe(0);
    expect(options.every(option => option.feePayer === "builder" && option.destinationAccount === invoice.builderAccount)).toBe(true);
  });
  it("fails closed for production, provider destinations, supplied fees and invalid money", () => {
    for (const change of [{ environment: "production" }, { builderAccount: "jobguard-platform" }, { builderFee: 0 },
      { currency: "EUR" }, ...[-1, 0, 0.5, NaN, Infinity, MAX_MONEY_PENCE + 1].map(balancePence => ({ balancePence }))]) {
      expect(() => payNowOptions({ ...invoice, ...change })).toThrow("INVALID_INPUT");
    }
    expect(PAY_NOW_ENABLED).toBe(false);
    expect(() => assertPayNowLiveAllowed()).toThrow("PAY_NOW_DISABLED");
  });
});
