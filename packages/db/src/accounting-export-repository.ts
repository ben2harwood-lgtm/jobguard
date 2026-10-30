import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid();
const syntheticId = z.string().regex(/^demo-[a-z0-9-]{1,80}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const observation = z.object({ id: syntheticId, tenantId: syntheticId, reference: hash,
 contentHash: hash, paid: z.boolean(), payload: z.record(z.string(), z.unknown()) }).strict();
const schemas = {
 preview: z.object({}).strict(), read: z.object({}).strict(),
 approve: z.object({ version: z.literal(1), decisionId: uuid, previewHash: hash,
  expiresAt: z.iso.datetime(), humanConfirmed: z.literal(true) }).strict(),
 claim: z.object({ version: z.literal(1), attemptId: uuid }).strict(),
 reconcile: z.object({ version: z.literal(1), attemptId: uuid, matches: z.array(observation).max(100) }).strict(),
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
 async execute(context: VerifiedTenantContext, digest: string, operation: keyof typeof schemas, sourceId: string, input: unknown = {}): Promise<unknown> {
  const parsed = schemas[operation]?.safeParse(input);
  if (!parsed?.success || !syntheticId.safeParse(sourceId).success || !hash.safeParse(digest).success)
   throw new StoredAccountingExportError("EXPORT_INVALID_INPUT");
  try {
   return await withTenant(this.pool, context, async db => {
    const result = (await db.$client.query("SELECT app.accounting_export($1,$2,$3,$4,$5::jsonb) result",
     [context.tenantId, digest, operation, sourceId, JSON.stringify(parsed.data)])).rows[0]?.result;
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
