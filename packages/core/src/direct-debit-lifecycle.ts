/** Synthetic fixture lifecycle only; no collection, settlement or retry authority. */
export const directDebitMandateOrder = ["created", "pending_submission", "active"] as const;
export const directDebitMandateTerminal = ["cancelled", "failed", "expired"] as const;
export const directDebitPaymentOrder = ["pending_submission", "submitted", "confirmed", "paid_out"] as const;
export const directDebitPaymentTerminal = ["failed", "cancelled", "charged_back", "late_failure"] as const;
export type DirectDebitMandateState = typeof directDebitMandateOrder[number] | typeof directDebitMandateTerminal[number];
export type DirectDebitPaymentState = typeof directDebitPaymentOrder[number] | typeof directDebitPaymentTerminal[number];
export function directDebitMandateNext(old: DirectDebitMandateState, next: DirectDebitMandateState): DirectDebitMandateState {
  const terminal: readonly string[] = directDebitMandateTerminal;
  const order: readonly string[] = directDebitMandateOrder;
  return !terminal.includes(old) && (terminal.includes(next) || order.indexOf(next) > order.indexOf(old)) ? next : old;
}
export function directDebitPaymentNext(old: DirectDebitPaymentState | null, next: DirectDebitPaymentState): DirectDebitPaymentState {
  if (old === "charged_back" || old === "late_failure") return old;
  if (next === "charged_back" || next === "late_failure") return next;
  const terminal: readonly string[] = directDebitPaymentTerminal;
  const order: readonly string[] = directDebitPaymentOrder;
  if (old && terminal.includes(old)) return old;
  return !old || terminal.includes(next) || order.indexOf(next) > order.indexOf(old) ? next : old;
}
