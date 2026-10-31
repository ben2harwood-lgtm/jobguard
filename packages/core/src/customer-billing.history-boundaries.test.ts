import { describe, expect, it } from "vitest";
import { projectInvoiceBalance } from "./customer-billing.js";

const REFUSAL = "INVALID_CUSTOMER_BALANCE_HISTORY";

describe("customer invoice history boundaries (fictional values)", () => {
  it("conserves debt when a one-penny credit is applied", () => {
    const view = projectInvoiceBalance({ totalPence: 10_000, creditPence: 1 });
    expect(view.credited.pence).toBe(1);
    expect(view.balance.pence).toBe(9_999);
    expect(view.allocated.pence + view.balance.pence).toBe(9_999);
    expect(view.status).toBe("unpaid");
  });

  it("conserves received money when a one-penny receipt is reversed", () => {
    const view = projectInvoiceBalance({ totalPence: 10_000, receiptPence: 10_000, reversedReceiptPence: 1 });
    expect(view.received.pence).toBe(9_999);
    expect(view.allocated.pence).toBe(9_999);
    expect(view.balance.pence).toBe(1);
    expect(view.unappliedCredit.pence).toBe(0);
    expect(view.status).toBe("partial");
  });

  it("accepts a credit equal to the original debt and a reversal equal to the money received", () => {
    const credited = projectInvoiceBalance({ totalPence: 500, creditPence: 500 });
    expect(credited.balance.pence).toBe(0);
    expect(credited.status).toBe("credited");
    const reversedAll = projectInvoiceBalance({ totalPence: 500, receiptPence: 500, reversedReceiptPence: 500 });
    expect(reversedAll.received.pence).toBe(0);
    expect(reversedAll.balance.pence).toBe(500);
    expect(reversedAll.status).toBe("unpaid");
  });

  it("keeps every penny: total = credited + allocated + balance, and net received = allocated + unapplied credit", () => {
    const view = projectInvoiceBalance({ totalPence: 1_000, creditPence: 1, receiptPence: 1_200, reversedReceiptPence: 1 });
    expect(view.credited.pence + view.allocated.pence + view.balance.pence).toBe(view.total.pence);
    expect(view.allocated.pence + view.unappliedCredit.pence).toBe(view.received.pence);
  });

  it("refuses a credit exceeding the original debt by one penny", () => {
    expect(() => projectInvoiceBalance({ totalPence: 10_000, creditPence: 10_001 })).toThrow(REFUSAL);
  });

  it("refuses a reversal exceeding the money received by one penny", () => {
    expect(() => projectInvoiceBalance({ totalPence: 10_000, receiptPence: 5_000, reversedReceiptPence: 5_001 })).toThrow(REFUSAL);
  });

  it("refuses a reversal when nothing was received", () => {
    expect(() => projectInvoiceBalance({ totalPence: 10_000, reversedReceiptPence: 1 })).toThrow(REFUSAL);
  });
});
