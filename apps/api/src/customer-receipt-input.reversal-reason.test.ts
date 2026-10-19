import { describe, expect, it } from "vitest";
import { practiceReceiptReverseV1 } from "./customer-invoice.contracts.js";

const reverse = {
  version: "practice-customer-receipt.reverse.v1",
  commandId: "20000000-0000-4000-8000-000000000002",
  invoiceId: "10000000-0000-4000-8000-000000000001",
  paymentId: "30000000-0000-4000-8000-000000000003",
  reason: "Fictional correction",
};

describe("receipt reversal reason boundaries", () => {
  it.each([
    ["minimum", "abc"],
    ["ordinary reason", "Fictional  correction"],
    ["maximum", "x".repeat(240)],
  ])("accepts the exact %s and normalizes its padded form", (_label, reason) => {
    expect(practiceReceiptReverseV1.parse({ ...reverse, reason }).reason).toBe(reason);
    expect(
      practiceReceiptReverseV1.parse({ ...reverse, reason: ` \t${reason}\n ` }).reason,
    ).toBe(reason);
  });

  it.each([
    ["empty", ""],
    ["one character", "a"],
    ["two characters", "ab"],
    ["padded one character", " a "],
    ["padded two characters", " ab "],
    ["spaces only", "   "],
    ["mixed whitespace only", "\t \n"],
    ["241 characters", "x".repeat(241)],
    ["padded 241 characters", ` \t${"x".repeat(241)}\n `],
  ])("refuses %s after trimming", (_label, reason) => {
    expect(practiceReceiptReverseV1.safeParse({ ...reverse, reason }).success).toBe(false);
  });

  it("preserves command, invoice and payment identities without mutating the input", () => {
    const input = { ...reverse, reason: " \tFictional correction\n " };
    const before = { ...input };
    Object.freeze(input);

    const parsed = practiceReceiptReverseV1.parse(input);

    expect(parsed).toEqual({ ...reverse, reason: "Fictional correction" });
    expect(parsed).not.toBe(input);
    expect(input).toEqual(before);
    expect(input.reason).toBe(" \tFictional correction\n ");
  });
});
