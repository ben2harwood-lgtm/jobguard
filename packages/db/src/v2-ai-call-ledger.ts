import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/**
 * V2-SQ-G: the model-reader spend ledger (migration 2069), append-only. A call is reserved before it is made, in its
 * own short transaction under a tenant-month lock, and settled after it from the usage the provider returned. A
 * reservation with no settled row counts in full, so a timeout or a crash between the two can only over-count.
 */
export type AiCallOutcome = "ok" | "refused" | "truncated" | "timeout" | "invalid_output" | "wrong_model" | "unavailable";
export type ReserveResult = { reserved: true } | { reserved: false; reason: "cap_reached" | "daily_limit" | "unavailable" };
/** At most this many calls per UTC day for the tenant: practice sessions are anonymous and free to mint. */
export const V2_AI_DAILY_CALL_LIMIT = 40;

export class V2AiCallLedger {
  constructor(private readonly pool: Pool) {}

  /** Both 2069 tables, or neither: without them no call is made. */
  async available(context: VerifiedTenantContext): Promise<boolean> {
    return withTenant(this.pool, context, async db => {
      const { rows: [row] } = await db.$client.query<{ ready: boolean }>(
        "SELECT to_regclass('app.v2_ai_call') IS NOT NULL AND to_regclass('app.v2_job_understanding') IS NOT NULL AS ready");
      return row?.ready === true;
    });
  }

  async reserve(context: VerifiedTenantContext, input: { callId: string; captureId: string; microPence: number; capMicroPence: number; dailyLimit?: number }): Promise<ReserveResult> {
    if (!Number.isSafeInteger(input.microPence) || input.microPence <= 0 || !Number.isSafeInteger(input.capMicroPence) || input.capMicroPence <= 0) {
      return { reserved: false, reason: "unavailable" };
    }
    return withTenant(this.pool, context, async db => {
      const { rows: [ready] } = await db.$client.query<{ ready: boolean }>("SELECT to_regclass('app.v2_ai_call') IS NOT NULL AS ready");
      if (!ready?.ready) return { reserved: false, reason: "unavailable" } as const;
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1::uuid::text), hashtext('v2_ai_call:' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM')))", [context.tenantId]);
      // Spent this UTC month: every settled row, plus the full reservation of every call that has no settled row.
      const { rows: [spent] } = await db.$client.query<{ month: string; today: number }>(`
        SELECT coalesce(sum(CASE WHEN s.call_id IS NOT NULL THEN s.micro_pence ELSE r.micro_pence END), 0)::text AS month,
          count(*) FILTER (WHERE r.utc_day = (clock_timestamp() AT TIME ZONE 'UTC')::date)::int AS today
        FROM app.v2_ai_call r
        LEFT JOIN app.v2_ai_call s ON (s.tenant_id, s.call_id, s.phase) = (r.tenant_id, r.call_id, 'settled')
        WHERE r.tenant_id = $1 AND r.phase = 'reserved'
          AND r.utc_month = date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date`, [context.tenantId]);
      if ((spent?.today ?? 0) >= (input.dailyLimit ?? V2_AI_DAILY_CALL_LIMIT)) return { reserved: false, reason: "daily_limit" } as const;
      if (BigInt(spent?.month ?? "0") + BigInt(input.microPence) > BigInt(input.capMicroPence)) return { reserved: false, reason: "cap_reached" } as const;
      await db.$client.query(`INSERT INTO app.v2_ai_call (tenant_id, call_id, phase, capture_id, operation, micro_pence)
        VALUES ($1, $2, 'reserved', $3, 'spoken_job_sort.v1', $4)`, [context.tenantId, input.callId, input.captureId, input.microPence]);
      return { reserved: true } as const;
    });
  }

  /** From returned usage only. With no usage there is nothing to settle and the reservation stands in full. */
  async settle(context: VerifiedTenantContext, input: { callId: string; captureId: string; microPence: number; outcome: AiCallOutcome; modelId: string | null; inputTokens: number; outputTokens: number }): Promise<void> {
    await withTenant(this.pool, context, async db => {
      await db.$client.query(`INSERT INTO app.v2_ai_call (tenant_id, call_id, phase, capture_id, operation, micro_pence, outcome, model_id, input_tokens, output_tokens)
        VALUES ($1, $2, 'settled', $3, 'spoken_job_sort.v1', $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [context.tenantId, input.callId, input.captureId, input.microPence, input.outcome, input.modelId?.slice(0, 100) || null, input.inputTokens, input.outputTokens]);
    });
  }
}
