import { z } from "zod";
import { MAX_MONEY_PENCE, money } from "./money.js";
import { multiplyRatio } from "./rational.js";

/** MON-6: draft fixture model only. No command, issuance, collection or production authority. */
export const PAY_NOW_ENABLED = false as const;
export const PAY_NOW_REFERENCE_POLICY = "d10-v2-synthetic-reference.v1" as const;
// D10 v2 gives ranges, not an approved tariff. These exact values are fixture choices only.
export const PAY_NOW_REFERENCE_CAP_PENCE = 600;
const id = z.guid().transform(value => value.toLowerCase());
export const payNowInvoiceV1 = z.object({
  version: z.literal("pay-now.synthetic-invoice.v1"), environment: z.literal("synthetic_demo"),
  tenantId: id, jobId: id, invoiceId: id, revision: z.number().int().safe().positive(),
  builderAccount: z.string().regex(/^fake-builder-[a-z0-9-]{1,80}$/u),
  balancePence: z.number().int().positive().max(MAX_MONEY_PENCE), currency: z.literal("GBP"),
  includesCatch: z.boolean(), kind: z.enum(["final", "deposit", "stage"]),
}).strict().readonly();
export type PayNowInvoice = z.infer<typeof payNowInvoiceV1>;
export type PayNowRail = "bank_transfer" | "card" | "pay_by_bank";
export class PayNowSyntheticError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "REPLAY_CONFLICT" | "PAY_NOW_DISABLED") {
    super(code); this.name = "PayNowSyntheticError";
  }
}
export function parsePayNowInvoice(raw: unknown): PayNowInvoice {
  const parsed = payNowInvoiceV1.safeParse(raw);
  if (!parsed.success) throw new PayNowSyntheticError("INVALID_INPUT");
  return parsed.data;
}
export function payNowOptions(raw: unknown) {
  const invoice = parsePayNowInvoice(raw);
  return (["bank_transfer", "card", "pay_by_bank"] as const).map(rail => {
    const calculated = rail === "card"
      ? Number(multiplyRatio(BigInt(invoice.balancePence), 3n, 1000n, "half_even"))
      : rail === "pay_by_bank" ? 25 : 0;
    // Never charge more than the payment, including a payment smaller than the fixed fee.
    const fee = Math.min(calculated, PAY_NOW_REFERENCE_CAP_PENCE, invoice.balancePence);
    return Object.freeze({ rail, customerTotal: money(invoice.balancePence), customerSurcharge: money(0),
      builderFee: money(fee), feePayer: "builder" as const, policy: PAY_NOW_REFERENCE_POLICY,
      destinationAccount: invoice.builderAccount, synthetic: true as const });
  });
}
export function assertPayNowLiveAllowed(): never { throw new PayNowSyntheticError("PAY_NOW_DISABLED"); }
