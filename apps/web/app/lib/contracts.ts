import { z } from "zod";

export const tenantIdV1 = z.string().uuid();
export const jobStatusV1 = z.enum(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"]);
export const deliveryStateV1 = z.enum(["not_sent", "queued", "outcome_unknown", "delivered"]);
export const paymentStateV1 = z.enum(["not_due", "due", "part_paid", "settled"]);
export const jobSummaryV1 = z.object({
  id: z.string().uuid(), tenantId: tenantIdV1, title: z.string(), customerLabel: z.string(), status: jobStatusV1,
  document: z.object({ kind: z.enum(["none", "quote", "invoice"]), reference: z.string().nullable(), delivery: deliveryStateV1 }),
  customerPayment: paymentStateV1, pilotNoCharge: z.boolean(), updatedLabel: z.string(),
});
export const jobsResponseV1 = z.object({ version: z.literal(1), tenantId: tenantIdV1, jobs: z.array(jobSummaryV1) });
export const sessionResponseV1 = z.object({ version: z.literal(1), principal: z.object({ displayName: z.string() }), tenants: z.array(z.object({ id: tenantIdV1, name: z.string() })) });
export type JobSummary = z.infer<typeof jobSummaryV1>;
export type SessionView = z.infer<typeof sessionResponseV1>;

export class UiRequestError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "TENANT_FORBIDDEN" | "NOT_FOUND" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super(code);
  }
}
