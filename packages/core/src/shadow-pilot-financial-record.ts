import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { shadowId } from "./shadow-domain/types.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const shadowPilotFinancialRecordV1 = z.object({
  version: z.literal("shadow-pilot-financial-record.v1"),
  tenantId: shadowId, jobIds: z.array(shadowId).min(1).max(1000),
  sources: z.array(z.object({
    kind: z.enum(["accruals", "invoices", "collections"]),
    table: z.enum(["recovery_fee_journal", "success_fee_journal", "platform_fee_statement", "platform_fee_attempt"]),
    jobId: shadowId, rowId: shadowId, rowHash: digest,
  }).strict()),
  // Older synthetic snapshots checked job books only. An absent inventory is unknown.
  subscriptionSources: z.array(z.object({
    kind: z.enum(["activations", "effects"]),
    table: z.enum([
      "subscription_agreement_revision", "subscription_mandate_event", "subscription_plan_change",
      "trial_subscription_source", "subscription_period", "platform_statement",
      "subscription_simulated_work", "subscription_simulated_attempt", "subscription_simulated_result",
    ]),
    rowId: shadowId, rowHash: digest,
  }).strict()).optional(),
  sourceHash: digest,
}).strict();
export type ShadowPilotFinancialRecord = z.infer<typeof shadowPilotFinancialRecordV1>;

/** Reproduction digest, not a signature. Only the DB reader establishes provenance. */
export function shadowPilotFinancialHash(record: Omit<ShadowPilotFinancialRecord, "sourceHash">): string {
  return sha256(JSON.stringify(record));
}

export function shadowPilotFinancialCounts(record: Pick<ShadowPilotFinancialRecord, "sources">) {
  return {
    accruals: record.sources.filter(row => row.kind === "accruals").length,
    invoices: record.sources.filter(row => row.kind === "invoices").length,
    collections: record.sources.filter(row => row.kind === "collections").length,
  };
}

export function shadowPilotSubscriptionCounts(record: Pick<ShadowPilotFinancialRecord, "subscriptionSources">) {
  if (!record.subscriptionSources) return null;
  return {
    activations: record.subscriptionSources.filter(row => row.kind === "activations").length,
    effects: record.subscriptionSources.filter(row => row.kind === "effects").length,
  };
}
