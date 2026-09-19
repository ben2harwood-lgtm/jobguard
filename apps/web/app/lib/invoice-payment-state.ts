/** Financial labels are projections of server facts, never writable paid flags. */
export interface InvoicePaymentFact {
  id: string;
  totalPence: number;
  balancePence: number;
  customerCreditPence: number;
  // Zod optional fields may be absent OR explicitly undefined. Both mean
  // unknown provenance, never an inferred zero payment or credit.
  paidPence?: number | undefined;
  creditedPence?: number | undefined;
}
export interface JobPaymentState {
  state: "not_invoiced" | "unpaid" | "part_paid" | "paid" | "credited" | "settled" | "outstanding" | "zero_balance";
  label: string;
  paymentStatus: string;
  invoiceCount: number;
}
function amount(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) throw new Error("INVALID_INVOICE_PAYMENT_FACT");
  return BigInt(value);
}
export function deriveJobPaymentState(invoices: readonly InvoicePaymentFact[]): JobPaymentState {
  const count = invoices.length;
  if (count === 0) return { state: "not_invoiced", label: "Work under way", paymentStatus: "No invoice issued", invoiceCount: 0 };
  const ids = new Set<string>();
  let outstanding = false, anyPaid = false, allCredits = true, anyCredit = false, completeSources = true;
  for (const invoice of invoices) {
    if (!invoice.id || ids.has(invoice.id)) throw new Error("INVALID_INVOICE_PAYMENT_FACT");
    ids.add(invoice.id);
    const total = amount(invoice.totalPence), balance = amount(invoice.balancePence), credit = amount(invoice.customerCreditPence);
    outstanding ||= balance > 0n;
    if (invoice.paidPence === undefined || invoice.creditedPence === undefined) {
      completeSources = false; allCredits = false; continue;
    }
    const paid = amount(invoice.paidPence), credited = amount(invoice.creditedPence);
    if (credited > total) throw new Error("INVALID_INVOICE_PAYMENT_FACT");
    const debt = total - credited;
    const expectedBalance = debt > paid ? debt - paid : 0n;
    const expectedCredit = paid > debt ? paid - debt : 0n;
    if (balance !== expectedBalance || credit !== expectedCredit) throw new Error("INCONSISTENT_INVOICE_PAYMENT_FACTS");
    anyPaid ||= paid > 0n; anyCredit ||= credited > 0n; allCredits &&= debt === 0n;
  }
  if (outstanding && !completeSources) return { state: "outstanding", label: "Work under way", paymentStatus: "Balance outstanding; payment source unavailable", invoiceCount: count };
  if (outstanding) return { state: anyPaid ? "part_paid" : "unpaid", label: "Work under way", paymentStatus: anyPaid ? "Part paid" : "Unpaid", invoiceCount: count };
  if (!completeSources) return { state: "settled", label: "Customer balance settled", paymentStatus: "Balance settled; payment source unavailable", invoiceCount: count };
  if (allCredits && !anyPaid && !anyCredit) return { state: "zero_balance", label: "No customer payment due", paymentStatus: "Zero-value invoice; no payment recorded", invoiceCount: count };
  if (allCredits && !anyPaid) return { state: "credited", label: "Balance settled by credit", paymentStatus: "No customer cash payment recorded", invoiceCount: count };
  return { state: "paid", label: "Customer paid", paymentStatus: "Paid", invoiceCount: count };
}
