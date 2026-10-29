import { describe, expect, it } from "vitest";
import { parseReceiptPounds, practiceReceiptRecordV1 } from "./customer-invoice.contracts.js";

describe("receipt fractional pounds", () => {
  it.each([
    ["0.1", 10],
    ["0.5", 50],
    ["1.2", 120],
    ["9999999999.9", 999_999_999_990],
    ["9999999999.99", 999_999_999_999],
  ] as const)("preserves %s as exactly %i pence through receipt validation", (input, expected) => {
    const amountPence = parseReceiptPounds(input);
    expect(amountPence).toBe(expected);
    expect(practiceReceiptRecordV1.parse({
      version: "practice-customer-receipt.record.v1",
      commandId: "20000000-0000-4000-8000-000000000002",
      invoiceId: "10000000-0000-4000-8000-000000000001",
      paidOn: "2026-09-19",
      amountPence,
      method: "bank_transfer",
      reference: "Fictional receipt",
    }).amountPence).toBe(expected);
  });
});
