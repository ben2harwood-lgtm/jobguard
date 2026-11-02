import type { Pool } from "pg";
import { z } from "zod";
import { meterLondonDateV1 } from "./meter-persistence.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { MeterLifecyclePersistenceError, projectStoredMeterLifecycle,
  type MeterLifecycleReadV1 } from "./meter-lifecycle-source.js";

const uuid = z.string().uuid();
const checkedRefusals = ["METER_FORBIDDEN", "METER_SOURCE_REVISION_CONFLICT", "METER_COMMAND_CONFLICT",
  "METER_CORRECTION_PERIOD_CLOSED", "METER_LIFECYCLE_CONFLICT", "METER_LIFECYCLE_TERMS_UNAVAILABLE",
  "METER_LIFECYCLE_SOURCE_UNAVAILABLE", "METER_LIFECYCLE_PLAN_CHANGE_HELD", "METER_LIFECYCLE_SOURCE_INVALID"] as const;
export const meterLifecycleCaptureV1 = z.object({ version: z.literal("meter-lifecycle-capture.v1"),
  commandId: uuid, periodStart: meterLondonDateV1, expectedSourceRevision: z.number().int().nonnegative().max(2147483646) }).strict();
export const meterLifecycleRebuildV1 = z.object({ version: z.literal("meter-lifecycle-rebuild.v1"), sourceId: uuid }).strict();
export const meterLifecycleReadRequestV1 = z.object({ version: z.literal("meter-lifecycle-read.v1"), computationId: uuid }).strict();

/** Checked normal-company authority is evaluated by SQL on every call, including replay. */
export class MeterLifecycleRepository {
  constructor(private readonly pool: Pool) {}
  async capture(context: VerifiedTenantContext, digest: string, raw: unknown): Promise<MeterLifecycleReadV1> {
    const input = this.parse(meterLifecycleCaptureV1, digest, raw);
    return this.run(context, async transaction => {
      const stored = (await transaction.$client.query("SELECT app.mon1_lifecycle_capture($1,$2,$3,$4::date,$5) result",
        [context.tenantId, digest, input.commandId, input.periodStart, input.expectedSourceRevision])).rows[0]?.result;
      const projected = projectStoredMeterLifecycle(context.tenantId, stored);
      return projected;
    });
  }
  async rebuild(context: VerifiedTenantContext, digest: string, raw: unknown): Promise<MeterLifecycleReadV1> {
    const input = this.parse(meterLifecycleRebuildV1, digest, raw);
    return this.run(context, async transaction => projectStoredMeterLifecycle(context.tenantId,
      (await transaction.$client.query("SELECT app.mon1_lifecycle_rebuild($1,$2,$3) result", [context.tenantId, digest, input.sourceId])).rows[0]?.result));
  }
  async read(context: VerifiedTenantContext, digest: string, raw: unknown): Promise<MeterLifecycleReadV1> {
    const input = this.parse(meterLifecycleReadRequestV1, digest, raw);
    return this.run(context, async transaction => projectStoredMeterLifecycle(context.tenantId,
      (await transaction.$client.query("SELECT app.mon1_lifecycle_read($1,$2,$3) result", [context.tenantId, digest, input.computationId])).rows[0]?.result));
  }
  private parse<T>(schema: z.ZodType<T, unknown>, digest: string, raw: unknown): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success || typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) throw new MeterLifecyclePersistenceError("INVALID_METER_LIFECYCLE_INPUT");
    return parsed.data;
  }
  private async run(context: VerifiedTenantContext, work: (transaction: TenantTransaction) => Promise<MeterLifecycleReadV1>): Promise<MeterLifecycleReadV1> {
    try { return await withTenant(this.pool, context, work); }
    catch (error) {
      if (error instanceof MeterLifecyclePersistenceError) throw error;
      if (error instanceof Error && checkedRefusals.some(code => code === error.message)) {
        throw new MeterLifecyclePersistenceError(error.message as (typeof checkedRefusals)[number]);
      }
      throw new MeterLifecyclePersistenceError("METER_UNAVAILABLE");
    }
  }
}
