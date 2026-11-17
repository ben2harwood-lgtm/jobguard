import { expect, it, vi } from "vitest";
import { PayNowFakeProvider } from "./pay-now-fake-provider";

const invoice = { version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo",
  tenantId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222",
  invoiceId: "33333333-3333-4333-8333-333333333333", revision: 1, builderAccount: "fake-builder-northside",
  balancePence: 100000, currency: "GBP", includesCatch: false, kind: "final" };
const command = { version: "pay-now.fake-command.v1", commandId: "44444444-4444-4444-8444-444444444444", rail: "card" };
it.each(["card", "pay_by_bank"])("settles %s fake money only to the bound builder, with a separate builder fee", rail => {
  const network = vi.fn(() => { throw new Error("Network forbidden"); });
  vi.stubGlobal("fetch", network);
  try {
    const result = new PayNowFakeProvider(invoice).execute({ ...command, rail });
    expect(result).toMatchObject({ status: "fake_settled", synthetic: true, destinationAccount: invoice.builderAccount,
      customerDebit: { pence: 100000, currency: "GBP" }, builderCredit: { pence: 100000, currency: "GBP" },
      builderFeeDebit: { pence: rail === "card" ? 300 : 25 }, platformCustomerFunds: { pence: 0 } });
    expect(network).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
it("replays once, refuses changed payloads and duplicate settlement under a different command", () => {
  const provider = new PayNowFakeProvider(invoice), result = provider.execute(command);
  expect(provider.execute(command)).toBe(result); expect(Object.isFrozen(result)).toBe(true);
  expect(() => provider.execute({ ...command, rail: "pay_by_bank" })).toThrow("REPLAY_CONFLICT");
  expect(() => provider.execute({ ...command, commandId: invoice.jobId })).toThrow("INVALID_INPUT");
});
it("does not accept foreign destinations, money, invoice identity or provider events", () => {
  for (const extra of [{ destinationAccount: "fake-builder-other" }, { amountPence: 1 }, { invoiceId: invoice.jobId },
    { status: "settled" }, { builderFee: 0 }]) {
    expect(() => new PayNowFakeProvider(invoice).execute({ ...command, ...extra })).toThrow("INVALID_INPUT");
  }
  expect(() => new PayNowFakeProvider({ ...invoice, environment: "production" })).toThrow("INVALID_INPUT");
});
it.each(["deposit", "stage"])("keeps %s Direct Debit as an explicit non-collection stub", kind => {
  const provider = new PayNowFakeProvider({ ...invoice, kind });
  const result = provider.execute({ ...command, rail: "direct_debit_stub" });
  expect(result).toMatchObject({ status: "stub_not_collected", customerDebit: { pence: 0 },
    builderCredit: { pence: 0 }, builderFeeDebit: { pence: 0 } });
  expect(provider.execute({ ...command, commandId: invoice.jobId }).status).toBe("fake_settled");
  expect(() => new PayNowFakeProvider(invoice).execute({ ...command, rail: "direct_debit_stub" })).toThrow("INVALID_INPUT");
});
