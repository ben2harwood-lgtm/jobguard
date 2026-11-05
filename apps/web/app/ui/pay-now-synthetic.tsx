"use client";
import * as React from "react";
import { PAY_NOW_ENABLED, parsePayNowInvoice, payNowOptions } from "@jobguard/core";
import { PayNowFakeProvider } from "../lib/pay-now-fake-provider";

export const payNowPounds = (pence: number) => `GBP ${(pence / 100).toFixed(2)}`;
export const payNowLabels = { bank_transfer: "Bank transfer", card: "Card", pay_by_bank: "Pay by bank" };

export const payNowTransferWording = "Transfer directly to the builder’s own account. Ask the builder for bank details.";
export const payNowFeeWording = "Unapproved D10 v2 synthetic reference only: card 0.3%, capped at £6; pay-by-bank 25p; bank transfer free. Fees never exceed the payment. VAT treatment awaits a ruling.";

export const payNowPreviewTitle = "Pay this invoice — synthetic preview";
export const payNowNoPayment = "No simulated payment recorded.";
export const payNowInvoiceWording = (balancePence: number) => `Fictional invoice. No real payment links or money. Amount due ${payNowPounds(balancePence)}. No customer surcharge.`;
export const payNowSettlementWording = (result: { destinationAccount: string; builderCredit: { pence: number }; builderFeeDebit: { pence: number } }) =>
  `Fake settlement to ${result.destinationAccount}: ${payNowPounds(result.builderCredit.pence)}. Builder fee debit ${payNowPounds(result.builderFeeDebit.pence)}. No real money moved.`;

/** Reserved invoice slot. Deliberately cannot be activated by a browser flag or prop. */
export function CustomerInvoicePayNow({ invoice }: { invoice?: unknown }) {
  if (!PAY_NOW_ENABLED || invoice === undefined) return null;
  return <SyntheticPayNowPreview invoice={invoice}/>;
}

/** Isolated component preview for fictional invoices; never mounted in the live invoice flow. */
export function SyntheticPayNowPreview({ invoice: raw }: { invoice: unknown }) {
  const invoice = parsePayNowInvoice(raw);
  const binding = JSON.stringify(invoice);
  const provider = React.useMemo(() => new PayNowFakeProvider(JSON.parse(binding)), [binding]);
  const [outcome, setOutcome] = React.useState<{ binding: string; text: string } | null>(null);
  function simulate(rail: "card" | "pay_by_bank" | "direct_debit_stub") {
    try {
      const result = provider.execute({ version: "pay-now.fake-command.v1", commandId: crypto.randomUUID(), rail });
      setOutcome({ binding, text: result.status === "stub_not_collected" ? "Direct Debit stub: nothing collected."
        : payNowSettlementWording(result) });
    } catch { setOutcome({ binding, text: "Simulation refused. No payment recorded." }); }
  }
  return <section aria-label="Synthetic invoice payment options">
    <h3>{payNowPreviewTitle}</h3>
    <p>{payNowInvoiceWording(invoice.balancePence)}</p>
    <ul style={{ listStyle: "none", padding: 0 }}>
      {payNowOptions(invoice).map(option => <li key={option.rail} style={{ padding: 12 }}>
        <strong>{payNowLabels[option.rail]}</strong> · {payNowPounds(option.customerTotal.pence)}
        {option.rail === "bank_transfer" ? <p>{payNowTransferWording}</p>
          : <p><a href={`#fake-${invoice.invoiceId}-${option.rail}`} onClick={event => { event.preventDefault(); simulate(option.rail as "card" | "pay_by_bank"); }}>Simulate {payNowLabels[option.rail].toLowerCase()} payment</a></p>}
      </li>)}
    </ul>
    {invoice.kind !== "final" && <button type="button" onClick={() => simulate("direct_debit_stub")}>Preview {invoice.kind} Direct Debit stub</button>}
    <p role="status">{outcome?.binding === binding ? outcome.text : payNowNoPayment}</p>
    <aside aria-label="Builder fee preview"><h4>Builder fee preview</h4>
      <p>{payNowFeeWording}</p>
      {payNowOptions(invoice).map(option => <p key={option.rail}>{payNowLabels[option.rail]}: builder pays {payNowPounds(option.builderFee.pence)} separately.</p>)}
    </aside>
  </section>;
}
