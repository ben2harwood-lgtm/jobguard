import { z } from "zod";
import { money, parsePayNowInvoice, payNowFakeResult, PayNowSyntheticError } from "@jobguard/core";

const commandV1 = z.object({
  version: z.literal("pay-now.fake-command.v1"), commandId: z.guid(),
  rail: z.enum(["card", "pay_by_bank", "direct_debit_stub"]),
}).strict();
type Result = Readonly<{
  synthetic: true; invoiceId: string; invoiceRevision: number; destinationAccount: string;
  status: "fake_settled" | "stub_not_collected";
  customerDebit: ReturnType<typeof money>; builderCredit: ReturnType<typeof money>;
  builderFeeDebit: ReturnType<typeof money>; platformCustomerFunds: ReturnType<typeof money>;
}>;

/** In-memory fake only: no network, credentials, real receipts, ledger or database writes.
 * One instance belongs to one fictional invoice. Replays survive only for its lifetime.
 * It cannot accept a caller-selected destination, amount, fee or settlement event.
 */
export class PayNowFakeProvider {
  private readonly invoice;
  private readonly results = new Map<string, { payload: string; result: Result }>();
  private settled = false;
  constructor(rawInvoice: unknown) { this.invoice = parsePayNowInvoice(rawInvoice); }
  execute(raw: unknown): Result {
    const parsed = commandV1.safeParse(raw);
    if (!parsed.success) throw new PayNowSyntheticError("INVALID_INPUT");
    const command = parsed.data;
    const key = command.commandId.toLowerCase(), payload = JSON.stringify(command.rail);
    const previous = this.results.get(key);
    if (previous) {
      if (previous.payload !== payload) throw new PayNowSyntheticError("REPLAY_CONFLICT");
      return previous.result;
    }
    const stub = command.rail === "direct_debit_stub";
    if ((stub && this.invoice.kind === "final") || (!stub && this.settled)) {
      throw new PayNowSyntheticError("INVALID_INPUT");
    }
    const result: Result = payNowFakeResult(this.invoice, command.rail);
    this.results.set(key, { payload, result });
    if (!stub) this.settled = true;
    return result;
  }
}
