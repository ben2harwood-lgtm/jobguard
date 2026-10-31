import type { Pool } from "pg";
import { countMeterDays, meterTodayReadV1, type MeterTodayRead } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { meterLifecycleStoredV1, MeterLifecyclePersistenceError } from "./meter-lifecycle-source.js";

export class MeterTodayRepository {
  constructor(private readonly pool: Pool) {}
  async read(context: VerifiedTenantContext, digest: string): Promise<MeterTodayRead> {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
    try {
      return await withTenant(this.pool, context, async transaction => {
        const raw = (await transaction.$client.query("SELECT app.mon1_today_source($1,$2) result", [context.tenantId, digest])).rows[0]?.result as { date?: string; stored?: unknown; view?: unknown } | undefined;
        if (raw?.view !== undefined) {
          const existing = meterTodayReadV1.safeParse(raw.view);
          if (!existing.success) throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
          return existing.data;
        }
        const stored = meterLifecycleStoredV1.safeParse(raw?.stored);
        if (!stored.success || stored.data.source.tenantId !== context.tenantId ||
          stored.data.source.jobs.some(job => job.sourceRevision !== stored.data.sourceRevision)) {
          throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
        }
        const source = stored.data.source;
        const counted = countMeterDays({ version: "meter-lifecycle-days-input.v1", plan: source.plan,
          jobs: source.jobs.map(job => ({ ...job, policy: { version: "meter-lifecycle-policy.v1",
            revision: "london-midnight-stops.v1", clockStatus: "approved" } })) });
        const day = counted.days.find(day => day.date === raw?.date);
        const parsed = meterTodayReadV1.safeParse(day && { version: "meter-today-read.v1", hypothetical: true,
          date: day.date, plan: source.plan, countedPlaces: day.countedPlaces, freeSmallPlaces: day.freeSmallPlaces });
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
