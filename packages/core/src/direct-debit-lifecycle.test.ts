import { describe, it, expect } from "vitest";
import { directDebitMandateNext, directDebitMandateOrder, directDebitMandateTerminal,
 directDebitPaymentNext, directDebitPaymentOrder, directDebitPaymentTerminal } from "./direct-debit-lifecycle.js";
describe("synthetic Direct Debit lifecycle", () => {
 it("keeps each mandate state distinct and never revives a terminal mandate", () => {
  for (const state of [...directDebitMandateOrder, ...directDebitMandateTerminal]) expect(directDebitMandateNext("created", state)).toBe(state);
  for (const terminal of directDebitMandateTerminal) for (const delayed of [...directDebitMandateOrder, ...directDebitMandateTerminal]) expect(directDebitMandateNext(terminal, delayed)).toBe(terminal);
  expect(directDebitMandateNext("active", "pending_submission")).toBe("active");
 });
 it("never invents payout, and preserves reversals and failures against delayed progress", () => {
  for (const state of [...directDebitPaymentOrder, ...directDebitPaymentTerminal]) expect(directDebitPaymentNext(null, state)).toBe(state);
  for (const terminal of directDebitPaymentTerminal) for (const delayed of directDebitPaymentOrder) expect(directDebitPaymentNext(terminal, delayed)).toBe(terminal);
  expect(directDebitPaymentNext("paid_out", "confirmed")).toBe("paid_out");
  expect(directDebitPaymentNext("paid_out", "charged_back")).toBe("charged_back");
  expect(directDebitPaymentNext("confirmed", "failed")).toBe("failed");
  expect(directDebitPaymentNext("failed", "late_failure")).toBe("late_failure");
 });
});
