import { AccountingExportSandbox } from "./accounting-export.sandbox.js";
import type { AccountingSource, AccountingScope } from "./accounting-export.contracts.js";

export const ctx = { tenantId: "demo-tenant", actorId: "demo-actor", canExport: true };
export const consent = { tenantId: ctx.tenantId, companyId: "demo-company", revision: 1, expiresAt: 5000, revoked: false };
export const source: AccountingSource = { version: 1, tenantId: ctx.tenantId, jobId: "demo-job", sourceId: "demo-invoice", revision: 1,
  kind: "customer_invoice", amount: { pence: 101, currency: "GBP" }, state: "issued", visibility: "builder", synthetic: true,
  finalAccount: { revision: 2, lockedRevision: 2 }, invoiceId: null, invoiceRevision: null,
  tax: "unsupported", retention: "unsupported", cis: "unsupported", drc: "unsupported" };
export const scope: AccountingScope = { version: 1, tenantId: ctx.tenantId, jobId: source.jobId, companyId: consent.companyId,
  sourceId: source.sourceId, sourceRevision: 1, mapping: { version: 1, tenantId: ctx.tenantId, companyId: consent.companyId,
    revision: 1, accountId: "demo-sales", customerId: "demo-customer", approval: "synthetic_reference_only",
    tax: "unsupported", retention: "unsupported", cis: "unsupported", drc: "unsupported" } };
export function command(model: AccountingExportSandbox, s = scope, suffix = "one") {
  const result = { version: 1 as const, commandId: `demo-command-${suffix}`, idempotencyKey: `demo-key-${suffix}`, scope: s,
    decision: { version: 1 as const, decisionId: `demo-decision-${suffix}`, tenantId: ctx.tenantId, actorId: ctx.actorId,
      action: "accounting_export.push" as const, previewHash: model.preview(ctx, s, 100).previewHash,
      status: "approved" as const, humanConfirmed: true as const, expiresAt: 2000 } };
  model.confirmPreview(ctx, s, result.decision, 100);
  return result;
}
export function adjustment(kind: "credit" | "receipt", pence = 50, id = `demo-${kind}`): AccountingSource {
  return { ...source, sourceId: id, kind, amount: { pence, currency: "GBP" }, invoiceId: source.sourceId, invoiceRevision: 1, finalAccount: null, state: "posted" };
}
export const scopeFor = (s: AccountingSource): AccountingScope => ({ ...scope, sourceId: s.sourceId, sourceRevision: s.revision });

