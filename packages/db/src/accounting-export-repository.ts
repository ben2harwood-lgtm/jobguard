import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid();
const syntheticId = z.string().regex(/^demo-[a-z0-9-]{1,80}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().safe();
const route = z.enum(["codat", "xero", "quickbooks"]);
const tax = z.enum(["unsupported", "no_tax", "standard", "zero_rated"]);
const mapping = z.object({ version: z.literal(1), tenantId: syntheticId, companyId: syntheticId,
 revision, accountId: syntheticId, customerId: syntheticId, approval: z.literal("synthetic_reference_only"),
 tax, retention: z.literal("unsupported"), cis: z.literal("unsupported"), drc: z.literal("unsupported") }).strict();
const routeScope = z.object({ version: z.literal(1), tenantId: syntheticId, jobId: syntheticId,
 companyId: syntheticId, sourceId: syntheticId, sourceRevision: revision, mapping }).strict();
const routeRequest = z.object({ version: z.literal(1), scope: routeScope, from: route, to: route,
 connectionRevision: revision, consentRevision: revision }).strict();
const routeConfirmation = routeRequest.extend({ commandId: uuid, decisionId: uuid, previewHash: hash,
 expiresAt: z.iso.datetime(), humanConfirmed: z.literal(true), action: z.literal("accounting_export.route"),
 status: z.literal("approved"), tenantId: syntheticId }).strict();
const routeArtifact = routeRequest.extend({ entries: z.array(z.object({ sourceId: syntheticId,
 artifact: z.record(z.string(), z.unknown()), reference: hash, externalId: syntheticId,
 status: z.literal("pushed"), attemptId: uuid.nullable(), attempts: z.number().int().nonnegative() }).strict()) }).strict();
export const storedAccountingRoutePreviewV1 = z.object({ version: z.literal(1), artifact: routeArtifact, previewHash: hash }).strict();
export const storedAccountingRouteChangeV1 = storedAccountingRoutePreviewV1.extend({ commandId: uuid, decisionId: uuid,
 actorId: uuid, revision }).strict();
const schemas = {
 routeChangePreview: routeRequest, routeChangeConfirm: routeConfirmation,
 preview: z.object({}).strict(), read: z.object({}).strict(),
 approve: z.object({ version: z.literal(1), decisionId: uuid, previewHash: hash,
  expiresAt: z.iso.datetime(), humanConfirmed: z.literal(true) }).strict(),
 claim: z.object({ version: z.literal(1), attemptId: uuid }).strict(),
 reconcile: z.object({ version: z.literal(1), attemptId: uuid }).strict(),
};
export const storedAccountingExportV1 = z.object({ version: z.literal(1), sourceId: syntheticId,
 reference: hash, previewHash: hash, artifact: z.record(z.string(), z.unknown()),
 status: z.enum(["pending", "outcome_unknown", "pushed", "confirmed_absent", "external_edit", "duplicate_import", "reference_conflict"]),
 attemptId: uuid.nullable(), attempts: z.number().int().nonnegative(), externalId: syntheticId.nullable(),
 qualifyingRecoveryProof: z.literal(false) }).strict();
export type StoredAccountingExport = z.infer<typeof storedAccountingExportV1>;
export class StoredAccountingExportError extends Error {
 constructor(readonly code: string) { super(code); }
}
/** Dark synthetic persistence. No API route, scheduler, provider or production enablement. */
export class AccountingExportRepository {
 constructor(private readonly pool: Pool) {}
 async routeChangePreview(context: VerifiedTenantContext, digest: string, sourceId: string, input: unknown) {
  return storedAccountingRoutePreviewV1.parse(await this.execute(context, digest, "routeChangePreview", sourceId, input));
 }
 async routeChangeConfirm(context: VerifiedTenantContext, digest: string, sourceId: string, input: unknown) {
  return storedAccountingRouteChangeV1.parse(await this.execute(context, digest, "routeChangeConfirm", sourceId, input));
 }
 async execute(context: VerifiedTenantContext, digest: string, operation: keyof typeof schemas, sourceId: string, input: unknown = {}): Promise<unknown> {
  const parsed = schemas[operation]?.safeParse(input);
  if (!parsed?.success || !syntheticId.safeParse(sourceId).success || !hash.safeParse(digest).success)
   throw new StoredAccountingExportError("EXPORT_INVALID_INPUT");
  try {
   return await withTenant(this.pool, context, async db => {
    const routeOperation = operation === "routeChangePreview" || operation === "routeChangeConfirm";
    const sql = routeOperation ? "SELECT app.accounting_export_route($1,$2,$3,$4,$5::jsonb) result"
     : "SELECT app.accounting_export($1,$2,$3,$4,$5::jsonb) result";
    const result = (await db.$client.query(sql,
     [context.tenantId, digest, operation, sourceId, JSON.stringify(parsed.data)])).rows[0]?.result;
    if (operation === "routeChangePreview") return storedAccountingRoutePreviewV1.parse(result);
    if (operation === "routeChangeConfirm") return storedAccountingRouteChangeV1.parse(result);
    return operation === "preview" ? z.object({ version: z.literal(1), artifact: z.record(z.string(), z.unknown()), previewHash: hash }).strict().parse(result)
     : storedAccountingExportV1.parse(result);
   });
  } catch (error) {
   const message = error instanceof Error ? error.message : "";
   throw new StoredAccountingExportError(message === "METER_FORBIDDEN" ? "EXPORT_FORBIDDEN" :
    /^EXPORT_[A-Z_]+$/.test(message) ? message : "EXPORT_UNAVAILABLE");
  }
 }
}
