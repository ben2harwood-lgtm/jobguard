import { z } from "zod";

export const tenantIdV1 = z.guid({ error: "Invalid uuid" });
export const jobStatusV1 = z.enum(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"]);
export const deliveryStateV1 = z.enum(["not_sent", "queued", "outcome_unknown", "delivered", "unknown"]);
export const paymentStateV1 = z.enum(["not_due", "due", "part_paid", "settled", "unknown"]);
// Shared with the native groundwork; one job-list read contract.
export { coreLoopJobSummaryV1 as jobSummaryV1, coreLoopJobsResponseV1 as jobsResponseV1 } from "@jobguard/core";
import { coreLoopJobSummaryV1 as jobSummaryV1 } from "@jobguard/core";
export const sessionResponseV1 = z.object({ version: z.literal(1), principal: z.object({ displayName: z.string() }), tenants: z.array(z.object({ id: tenantIdV1, name: z.string() })) });
export type JobSummary = z.infer<typeof jobSummaryV1>;
export type SessionView = z.infer<typeof sessionResponseV1>;

export class UiRequestError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "TENANT_FORBIDDEN" | "NOT_FOUND" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super(code);
  }
}
