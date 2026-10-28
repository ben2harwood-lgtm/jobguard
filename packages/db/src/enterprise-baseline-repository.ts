import type { Pool } from "pg";
import { z } from "zod";
import { baselineCohortsV1, BaselineError, deriveBaseline, exportBaseline, importBaselineBatch,
  dashboardCanonical, EnterpriseDashboardError } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const sourceId = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,99}$/u);
export const baselineStoreV1 = z.object({ version: z.literal("baseline-store.v1"),
  format: z.enum(["json", "csv"]), content: z.string().max(8_000_000),
  teamBindings: z.array(z.object({ sourceTeamId: sourceId, teamId: z.guid().transform(v => v.toLowerCase()) }).strict()).min(1).max(1000),
}).strict();
export const baselineReadV1 = z.object({ version: z.literal("baseline-read.v1"), batchId: z.guid(),
  cohorts: baselineCohortsV1, methodVersion: z.string().min(1).max(100), outputFormat: z.enum(["json", "csv"]),
}).strict();
function mode() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new EnterpriseDashboardError("MODE_FORBIDDEN");
}
function checked<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BaselineError("BASELINE_INVALID");
  return parsed.data;
}
function failure(error: unknown): never {
  if (error instanceof BaselineError || error instanceof EnterpriseDashboardError) throw error;
  const code = (error as { code?: string }).code;
  if (code === "23505") throw new BaselineError("BASELINE_CONFLICT");
  if (code === "42501" || code === "P0002") throw new EnterpriseDashboardError("NOT_FOUND");
  if (code === "23514" || code === "22P02") throw new BaselineError("BASELINE_INVALID");
  throw new EnterpriseDashboardError("DASHBOARD_UNAVAILABLE");
}
/** Internal synthetic historical writer. It never creates live jobs, extras or billing facts. */
export class EnterpriseBaselineRepository {
  constructor(private readonly pool: Pool) {}
  async import(context: VerifiedTenantContext, sessionId: string, raw: unknown) {
    mode(); checked(z.guid(), sessionId);
    const input = checked(baselineStoreV1, raw), { batch } = importBaselineBatch([], input.format, input.content);
    const bindings = input.teamBindings.toSorted((a, b) => a.sourceTeamId < b.sourceTeamId ? -1 : a.sourceTeamId > b.sourceTeamId ? 1 : 0);
    if (new Set(bindings.map(b => b.teamId)).size !== bindings.length ||
        dashboardCanonical(bindings.map(b => b.sourceTeamId)) !== dashboardCanonical(batch.history.teamIds))
      throw new BaselineError("BASELINE_INVALID");
    try {
      return await withTenant(this.pool, context, async db => (await db.$client.query<{ result: { batchId: string; sourceHash: string; replayed: boolean } }>(
        "SELECT app.enterprise_baseline_import($1,$2,$3,$4::jsonb) result",
        [sessionId, dashboardCanonical(batch.history), batch.sourceHash, dashboardCanonical(bindings)])).rows[0]!.result);
    } catch (error) { failure(error); }
  }
  async read(context: VerifiedTenantContext, sessionId: string, raw: unknown) {
    mode(); checked(z.guid(), sessionId);
    const input = checked(baselineReadV1, raw);
    try {
      return await withTenant(this.pool, context, async db => {
        const history = (await db.$client.query<{ history: unknown }>(
          "SELECT app.enterprise_baseline_read($1,$2) history", [sessionId, input.batchId])).rows[0]!.history;
        const report = deriveBaseline(history, input.cohorts, input.methodVersion);
        return { report, content: exportBaseline(history, input.cohorts, input.outputFormat), format: input.outputFormat };
      });
    } catch (error) { failure(error); }
  }
}
