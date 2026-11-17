import { describe, expect, it } from "vitest";
import { practiceReceiptRecordV1 } from "./customer-invoice.contracts.js";

const receipt = {
  version: "practice-customer-receipt.record.v1",
  commandId: "20000000-0000-4000-8000-000000000002",
  invoiceId: "10000000-0000-4000-8000-000000000001",
  paidOn: "2026-09-19",
  amountPence: 100,
  method: "bank_transfer",
  reference: "Fictional receipt",
};

describe("receipt money representation", () => {
  it.each([1, 10, 100, 999_999_999_999, 1_000_000_000_000])(
    "preserves valid integer pence %i without conversion",
    (amountPence) => {
      expect(practiceReceiptRecordV1.parse({ ...receipt, amountPence }).amountPence).toBe(amountPence);
    },
  );

  it.each([
    ["decimal string", "100"],
    ["exponent string", "1e2"],
    ["fraction string", "0.01"],
    ["empty string", ""],
    ["true", true],
    ["false", false],
    ["null", null],
    ["undefined", undefined],
    ["empty array", []],
    ["numeric array", [100]],
    ["string array", ["100"]],
    ["object", {}],
    ["money-shaped object", { pence: 100, currency: "GBP" }],
    ["NaN", NaN],
    ["positive infinity", Infinity],
    ["negative infinity", -Infinity],
    ["negative integer", -1],
    ["negative fraction", -0.1],
    ["zero", 0],
    ["fractional pence", 1.1],
    ["above application limit", 1_000_000_000_001],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ] as const)("rejects %s without coercion", (_label, amountPence) => {
    expect(practiceReceiptRecordV1.safeParse({ ...receipt, amountPence }).success).toBe(false);
  });
});
