import { z } from "zod";
import { MAX_MONEY_PENCE } from "@jobguard/core";

// This deliberately accepts synthetic identifiers only. No names, free text or credentials.
const id = z.string().regex(/^demo-[a-z0-9-]{1,80}$/);
const taxCode = z.enum(["unsupported", "no_tax", "standard", "zero_rated"]);
const revision = z.number().int().positive().safe();
const amount = z.object({ pence: z.number().int().positive().max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
export const accountingSourceV1 = z.object({
  version: z.literal(1), tenantId: id, jobId: id, sourceId: id, revision,
  kind: z.enum(["customer_invoice", "credit", "receipt"]), amount,
  state: z.enum(["issued", "posted", "cancelled", "superseded"]),
  visibility: z.literal("builder"), synthetic: z.literal(true),
  // Final invoices bind the immutable locked revision, never today's working account.
  finalAccount: z.object({ revision, lockedRevision: revision }).strict().nullable(),
  invoiceId: id.nullable(), invoiceRevision: revision.nullable(),
  tax: taxCode, retention: z.literal("unsupported"),
  cis: z.literal("unsupported"), drc: z.literal("unsupported"),
}).strict();
export type AccountingSource = z.infer<typeof accountingSourceV1>;
export const accountingMappingV1 = z.object({
  version: z.literal(1), tenantId: id, companyId: id, revision,
  accountId: id, customerId: id, approval: z.literal("synthetic_reference_only"),
  tax: taxCode, retention: z.literal("unsupported"),
  cis: z.literal("unsupported"), drc: z.literal("unsupported"),
}).strict();
export const accountingScopeV1 = z.object({ version: z.literal(1), tenantId: id, jobId: id,
  companyId: id, sourceId: id, sourceRevision: revision, mapping: accountingMappingV1,
}).strict();
export type AccountingScope = z.infer<typeof accountingScopeV1>;
export const accountingTargetV1 = z.object({
  version: z.literal(1), companyId: id, objectType: z.enum(["invoice", "credit_note", "payment"]),
  sourceId: id, sourceRevision: revision, invoiceId: id.nullable(), invoiceRevision: revision.nullable(),
  amount, accountId: id, customerId: id,
  tax: taxCode, retention: z.literal("unsupported"), cis: z.literal("unsupported"), drc: z.literal("unsupported"),
}).strict();
export type AccountingTarget = z.infer<typeof accountingTargetV1>;
export const accountingDecisionV1 = z.object({ version: z.literal(1), decisionId: id,
  tenantId: id, actorId: id, action: z.literal("accounting_export.push"),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.literal("approved"),
  humanConfirmed: z.literal(true), expiresAt: z.number().int().safe(),
}).strict();
export const accountingRouteDecisionV1 = accountingDecisionV1.extend({ action: z.literal("accounting_export.route") });
export const accountingCommandV1 = z.object({ version: z.literal(1), commandId: id,
  idempotencyKey: id, scope: accountingScopeV1, decision: accountingDecisionV1,
}).strict();
export type ExportCode = "disabled" | "invalid_input" | "forbidden" | "source_unavailable" |
  "reference_conflict" | "approval_required" | "consent_expired" | "replay_conflict" | "reconcile_required" | "unsupported_mapping" | "connection_required" | "rate_limited";
export class AccountingExportError extends Error {
  constructor(readonly code: ExportCode) { super(`Accounting export: ${code}`); }
}
export function parseAccounting<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const unsupported = result.error.issues.some(issue => ["tax", "retention", "cis", "drc"].includes(String(issue.path.at(-1))));
    throw new AccountingExportError(unsupported ? "unsupported_mapping" : "invalid_input");
  }
  return result.data;
}
