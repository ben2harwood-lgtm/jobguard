import { createHash } from "node:crypto";
import { z } from "zod";
import { meterLifecycleInputV1, projectMeterDays, projectMeterJobTimeline } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";
import { readSmallTrip, smallTripReadV1 } from "./meter-small-trip.js";
import { meterLondonDateV1 } from "./meter-persistence.js";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().positive().safe();
const time = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u);
const lifecycleJob = z.unknown().transform((raw, context) => {
  const parsed = meterLifecycleInputV1.safeParse(raw);
  if (!parsed.success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid lifecycle job source" });
    return z.NEVER;
  }
  return parsed.data;
});
export const meterLifecycleSourceV1 = z.object({
  version: z.literal("meter-lifecycle-source.v1"), tenantId: uuid, scopeId: uuid,
  provenance: z.literal("actual_normal_company.v1"), plan: z.enum(["Solo", "Builder"]),
  agreementId: uuid, agreementRevision: revision, asOf: time,
  startDate: meterLondonDateV1, endDateExclusive: meterLondonDateV1,
  jobs: z.array(lifecycleJob).min(1),
  links: z.array(z.object({ id: uuid, predecessorJobId: uuid, successorJobId: uuid, linkedAt: time,
    sourceHash: hash }).strict()),
  tripObservations: z.array(smallTripReadV1),
}).strict().superRefine((source, context) => {
  if (source.startDate >= source.endDateExclusive ||
    source.links.some(link => link.predecessorJobId === link.successorJobId ||
      !source.jobs.some(job => job.jobId === link.predecessorJobId) || !source.jobs.some(job => job.jobId === link.successorJobId)) ||
    source.tripObservations.some(trip => !source.jobs.some(job => job.jobId === trip.jobId && job.trip?.id === trip.tripId && job.trip.at === trip.effectiveAt)) || new Set(source.jobs.map(job => job.jobId)).size !== source.jobs.length ||
    source.jobs.some(job => job.tenantId !== source.tenantId || job.asOf !== source.asOf ||
      job.startDate !== source.startDate || job.endDateExclusive !== source.endDateExclusive)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid lifecycle source binding" });
  }
});
export const meterLifecycleStoredV1 = z.object({
  version: z.literal("meter-lifecycle-stored.v1"), sourceId: uuid, computationId: uuid,
  sourceHash: hash, sourceRevision: revision, source: meterLifecycleSourceV1,
  alerts: z.array(z.literal("METER_CACHE_MISMATCH")).max(1),
}).strict();
export type MeterLifecycleSourceV1 = z.infer<typeof meterLifecycleSourceV1>;
export class MeterLifecyclePersistenceError extends Error {
  constructor(readonly code: "INVALID_METER_LIFECYCLE_INPUT" | "METER_FORBIDDEN" | "METER_UNAVAILABLE" |
    "METER_SOURCE_REVISION_CONFLICT" | "METER_COMMAND_CONFLICT" | "METER_PROJECTION_MISMATCH" |
    "METER_CORRECTION_PERIOD_CLOSED" | "METER_LIFECYCLE_CONFLICT" | "METER_LIFECYCLE_TERMS_UNAVAILABLE" |
    "METER_LIFECYCLE_SOURCE_UNAVAILABLE" | "METER_LIFECYCLE_PLAN_CHANGE_HELD" | "METER_LIFECYCLE_SOURCE_INVALID") {
    super(code);
    this.name = "MeterLifecyclePersistenceError";
  }
}

/** All values originate in checked SQL. No supplied fixture/count/trial fallback. */
export function projectStoredMeterLifecycle(tenantId: string, raw: unknown) {
  try {
    const stored = meterLifecycleStoredV1.parse(raw);
    if (stored.source.tenantId !== tenantId || stored.source.jobs.some(job => job.sourceRevision !== stored.sourceRevision)) {
      throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
    }
    const jobs = [...stored.source.jobs].sort((a, b) => a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0);
    // Consume both accepted MON1-L APIs and retain their held/null semantics.
    const timelines = jobs.map(job => projectMeterJobTimeline(job));
    const result = projectMeterDays({ version: "meter-lifecycle-days-input.v1", plan: stored.source.plan, jobs });
    if (JSON.stringify(timelines) !== JSON.stringify(result.timelines)) throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
    return { version: "meter-lifecycle-read.v1" as const, hypothetical: true as const,
      computationId: stored.computationId, sourceId: stored.sourceId, sourceHash: stored.sourceHash,
      sourceRevision: stored.sourceRevision, provenance: stored.source.provenance,
      resultHash: createHash("sha256").update(JSON.stringify(result)).digest("hex"), result,
      holds: ["H-METER-CLOCK", "H-PRACTICE", "H-TRIAL", "H-CORRECTIONS"] as const,
      corrections: [] as never[], alerts: stored.alerts };
  } catch (error) {
    if (error instanceof MeterLifecyclePersistenceError) throw error;
    throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
  }
}
export type MeterLifecycleReadV1 = ReturnType<typeof projectStoredMeterLifecycle>;

/** Internal future coordinator seam, never called by the runtime repository.
 * Caller must authorize the job and possess narrow trip-read grants.
 * A newer observation never edits a replay. */
export async function verifyCapturedMeterTrips(transaction: TenantTransaction, source: MeterLifecycleSourceV1): Promise<void> {
  for (const job of source.jobs) {
    const trip = await readSmallTrip(transaction, job.jobId);
    if (trip && trip.recordedAt > source.asOf) continue;
    if ((trip === null) !== (job.trip === null) || (trip && job.trip &&
      (trip.tripId !== job.trip.id || trip.effectiveAt !== job.trip.at))) {
      throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
    }
  }
}
