import { parsePoundsToPence, parseQuantity } from "@jobguard/core";

export type OrderForm = { quantity: string; unitPrice: string; recipient: string; requiredDate: string };
type Preview = { quantity: string; unitPricePence: number; recipient: string; requiredDate: string; differencePence: number };

export function orderMatchesForm(order: Preview, form: OrderForm): boolean {
  try {
    const shown = parseQuantity(order.quantity), entered = parseQuantity(form.quantity);
    return shown.scaled * entered.scale === entered.scaled * shown.scale
      && order.unitPricePence === parsePoundsToPence(form.unitPrice)
      && order.recipient === form.recipient && order.requiredDate === form.requiredDate;
  } catch { return false; }
}

export function canApproveOrder(order: Preview | null, form: OrderForm, busy: boolean): boolean {
  return !busy && order !== null && order.differencePence === 0 && orderMatchesForm(order, form);
}
