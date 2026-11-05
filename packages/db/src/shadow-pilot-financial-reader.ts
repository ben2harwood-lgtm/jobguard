import type { Pool } from "pg";
import { z } from "zod";
import {
  generateShadowPilotReport, sha256, shadowPilotFinancialHash, shadowPilotFinancialRecordV1,
  ShadowPilotReportError, freezeShadow, type ShadowPilotFinancialRecord,
} from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const jobsV1 = z.array(z.string().uuid()).min(1).max(1000);

/** Offline research reader only. Requires the existing migration/research connection;
 * builder runtime has no SELECT on these private books. Never mount on an HTTP route.
 * Explicit tenant predicates supplement RLS; a superuser connection is not an RLS test.
 */
export class ShadowPilotFinancialReader {
  constructor(private readonly pool: Pool) {}

  async read(context: VerifiedTenantContext, rawJobIds: readonly string[]): Promise<ShadowPilotFinancialRecord> {
    const jobIds = [...new Set(jobsV1.parse(rawJobIds).map(id => id.toLowerCase()))].sort();
    return withTenant(this.pool, context, async db => {
      // One statement/snapshot covers job visibility and all gross financial history.
      // Count attempts, even pending/failed ones, and never net journals against reversals.
      const result = await db.$client.query<{ jobs: string[]; sources: {
        kind: "accruals" | "invoices" | "collections"; table: string; jobId: string; rowId: string; payload: unknown;
      }[] }>(`
        WITH sources AS (
          SELECT 'accruals' kind, 'recovery_fee_journal' AS "table", job_id, id, to_jsonb(r) payload
            FROM app.recovery_fee_journal r WHERE tenant_id=$1 AND job_id=ANY($2::uuid[])
          UNION ALL
          SELECT 'accruals', 'success_fee_journal', job_id, id, to_jsonb(r)
            FROM app.success_fee_journal r WHERE tenant_id=$1 AND job_id=ANY($2::uuid[])
          UNION ALL
          SELECT 'invoices', 'platform_fee_statement', job_id, id, to_jsonb(r)
            FROM app.platform_fee_statement r WHERE tenant_id=$1 AND job_id=ANY($2::uuid[])
          UNION ALL
          SELECT 'collections', 'platform_fee_attempt', job_id, id, to_jsonb(r)
            FROM app.platform_fee_attempt r WHERE tenant_id=$1 AND job_id=ANY($2::uuid[])
        )
        SELECT ARRAY(SELECT id::text FROM app.job WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id) jobs,
          coalesce((SELECT jsonb_agg(jsonb_build_object('kind',kind,'table',"table",'jobId',job_id,
            'rowId',id,'payload',payload) ORDER BY kind,"table",job_id,id) FROM sources),'[]'::jsonb) sources
      `, [context.tenantId, jobIds]);
      const row = result.rows[0];
      if (!row || row.jobs.join() !== jobIds.join()) throw new ShadowPilotReportError();
      const sources = row.sources.map(({ payload, ...source }) => ({ ...source, rowHash: sha256(JSON.stringify(payload)) }));
      const record = shadowPilotFinancialRecordV1.omit({ sourceHash: true }).parse({
        version: "shadow-pilot-financial-record.v1", tenantId: context.tenantId, jobIds, sources,
      });
      const parsed = shadowPilotFinancialRecordV1.parse({ ...record, sourceHash: shadowPilotFinancialHash(record) });
      freezeShadow(parsed);
      return parsed;
    });
  }

  /** Always re-read the books; supplied financial assertions are rejected, never used. */
  async report(context: VerifiedTenantContext, jobIds: readonly string[], raw: unknown,
    access: Parameters<typeof generateShadowPilotReport>[1]) {
    if (access.environment !== "synthetic_demo" || access.audience !== "synthetic_researcher"
      || access.lockId === null || access.tenantId !== context.tenantId) throw new ShadowPilotReportError();
    if (typeof raw !== "object" || raw === null || "financialEffects" in raw || "financialRecord" in raw)
      throw new ShadowPilotReportError();
    const financialRecord = await this.read(context, jobIds);
    return generateShadowPilotReport({ ...raw, financialRecord }, access);
  }
}
