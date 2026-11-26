import type { Pool } from "pg";
import { z } from "zod";
import {
  generateShadowPilotReport, sha256, shadowPilotFinancialHash, shadowPilotFinancialRecordV1,
  shadowPilotFinancialCounts, shadowPilotSubscriptionCounts,
  ShadowPilotReportError, freezeShadow, type ShadowPilotFinancialRecord,
} from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const jobsV1 = z.array(z.string().uuid()).min(1).max(1000);
const captureAtLock = z.object({
  count: z.number().int().nonnegative(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/u),
  captureRegisterHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

/** Offline research reader only. Requires the existing migration/research connection;
 * builder runtime has no SELECT on these private books. Never mount on an HTTP route.
 * Explicit tenant predicates supplement RLS; a superuser connection is not an RLS test.
 */
export class ShadowPilotFinancialReader {
  constructor(private readonly pool: Pool) {}

  async read(context: VerifiedTenantContext, rawJobIds: readonly string[]): Promise<ShadowPilotFinancialRecord> {
    return (await this.readSnapshot(context, rawJobIds)).financialRecord;
  }

  private async readSnapshot(context: VerifiedTenantContext, rawJobIds: readonly string[], requirePilotLock = false) {
    const jobIds = [...new Set(jobsV1.parse(rawJobIds).map(id => id.toLowerCase()))].sort();
    return withTenant(this.pool, context, async db => {
      // One statement/snapshot covers job visibility and all gross financial history.
      // Count attempts, even pending/failed ones, and never net journals against reversals.
      const result = await db.$client.query<{ jobs: string[]; sources: {
        kind: "accruals" | "invoices" | "collections"; table: string; jobId: string; rowId: string; payload: unknown;
      }[]; subscriptions: unknown; capture: unknown }>(`
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
        ), subscription_sources AS (
          SELECT 'activations' kind, 'subscription_agreement_revision' AS "table", id, to_jsonb(r) payload
            FROM app.subscription_agreement_revision r WHERE tenant_id=$1
          UNION ALL
          SELECT 'activations', 'subscription_mandate_event', command_id, to_jsonb(r)
            FROM app.subscription_mandate_event r WHERE tenant_id=$1 AND state='active'
          UNION ALL
          SELECT 'effects', 'subscription_plan_change', id, to_jsonb(r)
            FROM app.subscription_plan_change r WHERE tenant_id=$1
          UNION ALL
          SELECT 'effects', 'trial_subscription_source', source_id, to_jsonb(r)
            FROM app.trial_subscription_source r WHERE tenant_id=$1 AND conversion_date IS NOT NULL
          UNION ALL
          SELECT 'effects', 'subscription_period', id, to_jsonb(r)
            FROM app.subscription_period r WHERE tenant_id=$1
          UNION ALL
          SELECT 'effects', 'platform_statement', id, to_jsonb(r)
            FROM app.platform_statement r WHERE tenant_id=$1
          UNION ALL
          SELECT 'effects', 'subscription_simulated_work', id, to_jsonb(r)
            FROM app.subscription_simulated_work r WHERE tenant_id=$1
          UNION ALL
          SELECT 'effects', 'subscription_simulated_attempt', id, to_jsonb(r)
            FROM app.subscription_simulated_attempt r WHERE tenant_id=$1
          UNION ALL
          SELECT 'effects', 'subscription_simulated_result', id, to_jsonb(r)
            FROM app.subscription_simulated_result r WHERE tenant_id=$1
        )
        SELECT ARRAY(SELECT id::text FROM app.job WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id) jobs,
          coalesce((SELECT jsonb_agg(jsonb_build_object('kind',kind,'table',"table",'jobId',job_id,
            'rowId',id,'payload',payload) ORDER BY kind,"table",job_id,id) FROM sources),'[]'::jsonb) sources,
          coalesce((SELECT jsonb_agg(jsonb_build_object('kind',kind,'table',"table",'rowId',id,
            'rowHash',encode(sha256(convert_to(payload::text,'UTF8')),'hex')) ORDER BY kind,"table",id)
            FROM subscription_sources),'[]'::jsonb) subscriptions,
          (SELECT jsonb_build_object('count',jsonb_array_length(l.snapshot->'captureRegister'),
            'snapshotHash',l.snapshot_digest,'captureRegisterHash',l.capture_register_hash)
            FROM app.final_account_lock l
            JOIN app.job_commercial_track t ON (t.tenant_id,t.job_id)=(l.tenant_id,l.job_id)
            JOIN app.job j ON (j.tenant_id,j.id)=(l.tenant_id,l.job_id)
            WHERE $3::boolean AND l.tenant_id=$1 AND l.job_id=($2::uuid[])[1]
              AND t.job_track='small_builder' AND t.environment='pilot_no_charge'
              AND t.provenance='pilot_capture' AND j.practice_session_digest IS NULL AND j.practice_scenario IS NULL
              AND l.onboarding_terms_version ~ '^pilot_final_check_terms[.]v[1-9][0-9]{0,8}$') capture
      `, [context.tenantId, jobIds, requirePilotLock]);
      const row = result.rows[0];
      if (!row || row.jobs.join() !== jobIds.join()) throw new ShadowPilotReportError();
      const capture = captureAtLock.safeParse(row.capture);
      if (requirePilotLock && !capture.success) throw new ShadowPilotReportError();
      const sources = row.sources.map(({ payload, ...source }) => ({ ...source, rowHash: sha256(JSON.stringify(payload)) }));
      const record = shadowPilotFinancialRecordV1.omit({ sourceHash: true }).parse({
        version: "shadow-pilot-financial-record.v1", tenantId: context.tenantId, jobIds, sources, subscriptionSources: row.subscriptions,
      });
      const financialRecord = shadowPilotFinancialRecordV1.parse({ ...record, sourceHash: shadowPilotFinancialHash(record) });
      freezeShadow(financialRecord);
      return { financialRecord, capture: capture.data };
    });
  }

  /** Offline only. The report is a projection of the pilot paths already running at this base. */
  async pilotReport(context: VerifiedTenantContext, jobId: string) {
    const { financialRecord, capture } = await this.readSnapshot(context, [jobId], true);
    if (!capture || !financialRecord.subscriptionSources || financialRecord.sources.length ||
      financialRecord.subscriptionSources.length) throw new ShadowPilotReportError();
    const { count, ...captureSource } = capture;
    return freezeShadow({
      report: {
        version: "pilot-no-charge-report.v1",
        usage: {
          capturesPerJob: {
            status: "observed", value: count, denominator: 1,
            method: "Count distinct capture IDs recorded in one immutable final-account lock register, including withdrawn captures.",
          },
        },
        missing: [
          "signalsRemainingAtLock", "falsePositives", "confirmedAmount", "recoveredAmount", "disputedAttributions",
          "fairness", "harmFromWithholding", "missedMustSurfaceEvents", "sourceUsefulness", "hypotheticalSubscription",
          "hypotheticalSuccessFee", "demonstratedValue", "valueLessHypotheticalCosts",
        ],
        effects: shadowPilotFinancialCounts(financialRecord),
        subscriptionEffects: shadowPilotSubscriptionCounts(financialRecord),
        randomisedArm: "disabled", releaseApproval: false,
      },
      // Retain only in restricted operator evidence. Digests can link back to source records.
      evidence: { ...captureSource, financialHash: financialRecord.sourceHash },
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
    try {
      return generateShadowPilotReport({ ...raw, financialRecord }, access);
    } catch (error) {
      // Only this offline research boundary names validated stored rows. Shared
      // domain errors keep generic messages so ordinary logs cannot expose them.
      if (error instanceof ShadowPilotReportError && error.financialSources.length)
        error.message = `INVALID_PILOT_REPORT: fee rows ${JSON.stringify(error.financialSources)}`;
      throw error;
    }
  }
}
