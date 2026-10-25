import { z } from "zod";
import type { TenantTransaction } from "./tenant-context.js";

const factTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u);
const pence = z.string().regex(/^\d+$/u).transform(Number)
  .refine(value => Number.isSafeInteger(value) && value > 400000 && value <= 1000000000000);

/** Internal read contract. A trip is a meter source, never a fee or approval. */
export const smallTripReadV1 = z.object({
  version: z.literal("meter-small-trip.v1"),
  tripId: z.string().uuid(),
  jobId: z.string().uuid(),
  observationId: z.string().uuid(),
  revision: z.number().int().positive(),
  previousObservationId: z.string().uuid().nullable(),
  effectiveAt: factTime,
  recordedAt: factTime,
  netPence: pence,
  sourceKind: z.enum(["activation", "variation_approval"]),
  sourceId: z.string().uuid(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  policyVersion: z.literal("meter-small-trip.v1"),
}).strict();
export type SmallTripReadV1 = z.output<typeof smallTripReadV1>;

export class SmallTripReadError extends Error {
  constructor(readonly code: "INVALID_SMALL_TRIP_INPUT" | "SMALL_TRIP_SOURCE_INVALID") {
    super(code);
    this.name = "SmallTripReadError";
  }
}

/**
 * Caller has authenticated and authorized this job in the existing transaction.
 * This function grants no authority and starts no transaction/lock of its own.
 * Latest observation is a new source revision; the original trip stays immutable.
 * Times are formatted by PostgreSQL to avoid pg/Date millisecond truncation.
 */
export async function readSmallTrip(transaction: TenantTransaction, jobId: string): Promise<SmallTripReadV1 | null> {
  if (!z.string().uuid().safeParse(jobId).success) throw new SmallTripReadError("INVALID_SMALL_TRIP_INPUT");
  const result = await transaction.$client.query(`SELECT
    'meter-small-trip.v1'::text AS version, e.id AS "tripId", e.job_id AS "jobId",
    o.id AS "observationId", o.revision, o.previous_observation_id AS "previousObservationId",
    to_char(o.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "effectiveAt",
    to_char(o.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "recordedAt",
    o.net_pence::text AS "netPence", o.source_kind AS "sourceKind", o.source_id AS "sourceId",
    o.source_hash AS "sourceHash", o.policy_version AS "policyVersion"
    FROM app.job_small_trip_event e
    JOIN LATERAL (SELECT observation.* FROM app.job_small_trip_observation observation
      WHERE (observation.tenant_id,observation.job_id,observation.trip_id)=(e.tenant_id,e.job_id,e.id)
      ORDER BY observation.revision DESC LIMIT 1) o ON true
    WHERE e.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND e.job_id=$1`, [jobId]);
  if (!result.rows.length) return null;
  const parsed = smallTripReadV1.safeParse(result.rows[0]);
  if (!parsed.success) throw new SmallTripReadError("SMALL_TRIP_SOURCE_INVALID");
  return parsed.data;
}
