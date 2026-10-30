import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid().transform(v => v.toLowerCase());
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export class ImportHistoryError extends Error {
  constructor(readonly code: "SYNTHETIC_MODE_REQUIRED" | "IMPORT_HISTORY_BINDING_MISMATCH") { super(code); }
}
export const importHistoryCommand = z.object({ version: z.literal("import-history-command.v1"), commandId: uuid, evidenceId: uuid }).strict();
export const importedCatchCommand = z.object({ version: z.literal("import-catch-command.v2"), commandId: uuid, baselineId: uuid, evidenceId: uuid }).strict();
export const importedCatchResult = z.object({ version: z.literal("import-catch-result.v1"), catchId: uuid, jobId: uuid, evidenceId: uuid,
  fee: z.object({ pence: z.literal(0), currency: z.literal("GBP") }).strict(), reason: z.literal("pre_adoption_evidence"),
  explanation: z.literal("Evidence from before adoption is permanently excluded"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0) }).strict();

function syntheticOnly() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ImportHistoryError("SYNTHETIC_MODE_REQUIRED");
}
/** Exclusion-only adapter. Historical bytes still use the ordinary verified evidence upload path.
 * Capture time is builder-attested metadata, not proof of when work happened. No positive attribution is asserted.
 */
export class ImportPreAdoptionRepository {
  constructor(private readonly pool: Pool) {}
  async write(context: VerifiedTenantContext, sessionDigest: string, jobId: string, raw: unknown) {
    syntheticOnly(); const input = importHistoryCommand.parse(raw), job = uuid.parse(jobId), d = digest.parse(sessionDigest);
    return withTenant(this.pool, context, async db => {
      const auditId = randomUUID();
      const row = (await db.$client.query<{ result: unknown }>("SELECT app.ch5_write_history($1,$2,$3,$4,$5,$6) result",
        [context.tenantId, job, d, input.commandId, input.evidenceId, auditId])).rows[0];
      const result = z.object({ id: uuid, inserted: z.boolean(), actorId: uuid }).strict().parse(row?.result);
      if (result.inserted) await appendAuditBatch(db, [{ id: auditId, version: "audit.v1", actorRef: `membership:${result.actorId}`,
        eventType: "job.imported_historical_evidence", subjectType: "job", subjectRef: job,
        payload: { references: { evidenceId: input.evidenceId, historyId: result.id, reason: "pre_adoption_evidence" }, classifications: { action: "operational" } } }]);
      return { historyId: result.id, classification: "pre_adoption_evidence" as const };
    });
  }
  async assess(context: VerifiedTenantContext, sessionDigest: string, jobId: string, raw: unknown) {
    syntheticOnly(); const input = importedCatchCommand.parse(raw), job = uuid.parse(jobId), d = digest.parse(sessionDigest);
    return withTenant(this.pool, context, async db => {
      const row = (await db.$client.query<{ result: unknown }>("SELECT app.ch5_imported_catch($1,$2,$3,$4,$5,$6) result",
        [context.tenantId, job, d, input.baselineId, input.evidenceId, input.commandId])).rows[0];
      const result = importedCatchResult.parse(row?.result);
      if (result.jobId !== job || result.evidenceId !== input.evidenceId) throw new ImportHistoryError("IMPORT_HISTORY_BINDING_MISMATCH");
      return result;
    });
  }
}
