import type { Pool } from "pg";
import { meterTodayReadV1, type MeterTodayRead } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { MeterLifecyclePersistenceError } from "./meter-lifecycle-source.js";

export class MeterTodayRepository {
  constructor(private readonly pool: Pool) {}
  async read(context: VerifiedTenantContext, digest: string): Promise<MeterTodayRead> {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
    try {
      return await withTenant(this.pool, context, async transaction => {
        const raw = (await transaction.$client.query("SELECT app.mon1_fresh_counted_meter_today($1,$2) result", [context.tenantId, digest])).rows[0]?.result;
        const parsed = meterTodayReadV1.safeParse(raw);
        if (!parsed.success) throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
        return parsed.data;
      });
    } catch (error) {
      if (error instanceof MeterLifecyclePersistenceError) throw error;
      if (error instanceof Error && error.message === "METER_FORBIDDEN") throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
      if (error instanceof Error && error.message === "METER_PROJECTION_MISMATCH") throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
      throw new MeterLifecyclePersistenceError("METER_UNAVAILABLE");
    }
  }
}
