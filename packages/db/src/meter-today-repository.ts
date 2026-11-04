import { z } from "zod";
import type { Pool } from "pg";
import { countMeterDays, meterTodayReadV1, meterTodayJobsReadV1, type MeterTodayJobsRead, type MeterTodayRead, type MeterCountedDaysV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { meterLifecycleStoredV1, MeterLifecyclePersistenceError } from "./meter-lifecycle-source.js";

export class MeterTodayRepository {
  constructor(private readonly pool: Pool) {}
  async read(context: VerifiedTenantContext, digest: string): Promise<MeterTodayRead> {
    return (await this.readSnapshot(context, digest, false)).meter;
  }
  async readJobs(context: VerifiedTenantContext, digest: string): Promise<MeterTodayJobsRead> {
    return meterTodayJobsReadV1.parse(await this.readSnapshot(context, digest, true));
  }
  private async readSnapshot(context: VerifiedTenantContext, digest: string, includeJobs: boolean) {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
    try {
      return await withTenant(this.pool, context, async transaction => {
        const review = (await transaction.$client.query("SELECT app.mon1_track_review_decision($1,$2) id", [context.tenantId, digest])).rows[0]?.id as string | null | undefined;
        const finish = async (view: MeterTodayRead, places?: MeterCountedDaysV1["days"][number]["places"]) => {
          const meter = review ? { ...view, trackReviewDecisionId: review } : view;
          if (!includeJobs) return { version: "meter-today-jobs-read.v1" as const, meter, places: [] };
          if (!places) throw new MeterLifecyclePersistenceError("METER_UNAVAILABLE");
          const result = (await transaction.$client.query("SELECT app.mon1_today_jobs($1,$2) result", [context.tenantId, digest])).rows[0]?.result;
          const ledger = z.object({ date: z.string(), plan: z.enum(["Solo", "Builder"]), jobs: z.array(z.object({
            jobId: z.string().uuid(), customerId: z.string().uuid(), siteId: z.string().uuid(), small: z.boolean(), committed: z.boolean(),
          }).strict()) }).strict().safeParse(result);
          if (!ledger.success || ledger.data.date !== meter.date || ledger.data.plan !== meter.plan ||
            new Set(ledger.data.jobs.map(job => job.jobId)).size !== ledger.data.jobs.length) throw new MeterLifecyclePersistenceError("METER_UNAVAILABLE");
          const jobs = new Map(ledger.data.jobs.map(job => [job.jobId, job]));
          let smallAllowance = meter.freeSmallPlaces;
          const rows = places.map(place => {
            if (place.jobIds.some(id => {
              const job = jobs.get(id);
              return !job || job.customerId !== place.customerId || job.siteId !== place.siteId;
            }) || place.small !== place.jobIds.every(id => jobs.get(id)?.small === true)) {
              throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
            }
            const free = place.small && smallAllowance-- > 0;
            return { jobIds: [...place.jobIds], kind: free ? "free_small_place" as const : place.jobIds.length > 1 ? "shared_place" as const : "place" as const };
          });
          const parsed = meterTodayJobsReadV1.safeParse({ version: "meter-today-jobs-read.v1", meter, places: rows });
          if (!parsed.success) throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
          return parsed.data;
        };
        const raw = (await transaction.$client.query("SELECT app.mon1_today_source($1,$2) result", [context.tenantId, digest])).rows[0]?.result as { date?: string; stored?: unknown; view?: unknown } | undefined;
        if (raw?.view !== undefined) {
          const existing = meterTodayReadV1.safeParse(raw.view);
          if (!existing.success) throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
          return finish(existing.data);
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
        return finish(parsed.data, day?.places);
      });
    } catch (error) {
      if (error instanceof MeterLifecyclePersistenceError) throw error;
      if (error instanceof Error && error.message === "METER_FORBIDDEN") throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
      if (error instanceof Error && error.message === "METER_PROJECTION_MISMATCH") throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
      throw new MeterLifecyclePersistenceError("METER_UNAVAILABLE");
    }
  }
}
