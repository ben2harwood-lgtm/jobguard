import { z } from "zod";
import { BillingDataError, billingStatusV1, normalizeBillingStatus, parseBillingCsv, sha256 } from "@jobguard/core";

/** Internal parser seam only. No route, actor, tenant, production mode or writer is composed. */
export const billingImportEnvelopeV1 = z.discriminatedUnion("transport", [
  z.object({ version: z.literal("billing-import.v1"), transport: z.literal("api"),
    events: z.array(billingStatusV1).min(1).max(10_000) }).strict(),
  z.object({ version: z.literal("billing-import.v1"), transport: z.literal("csv"),
    csv: z.string().min(1).max(5_000_000) }).strict(),
]);
export function parseBillingImportEnvelope(raw: unknown) {
  const parsed = billingImportEnvelopeV1.safeParse(raw);
  if (!parsed.success) throw new BillingDataError("BILLING_INVALID");
  const input = parsed.data;
  const events = input.transport === "csv" ? parseBillingCsv(new TextEncoder().encode(input.csv)) : input.events;
  return Object.freeze({ transport: input.transport,
    sourceHash: sha256(input.transport === "csv" ? input.csv : JSON.stringify(raw)),
    observations: Object.freeze(events.map(normalizeBillingStatus)) });
}
