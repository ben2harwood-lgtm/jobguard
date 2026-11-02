import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { countMeterDays } from "@jobguard/core";
import { z } from "zod";
import type { TenantTransaction } from "./tenant-context.js";
import { meterLifecycleSourceV1, MeterLifecyclePersistenceError } from "./meter-lifecycle-source.js";

const requestV1 = z.object({ version: z.literal("meter-day-ledger-write.v1"), sourceId: z.string().uuid() }).strict();
const recipe = "london-midnight-stops.v1";

/** Internal meter-role seam only. Caller supplies an authorized tenant transaction;
 * runtime has no table grants. No session/read API, admission or billing action.
 * The recipe applies the approved clock to the immutable foundation source.
 * Changed inputs require a new source revision; same-source mismatches refuse.
 */
export async function persistMeterDayLedger(transaction: TenantTransaction, raw: unknown): Promise<string> {
  const input = requestV1.safeParse(raw);
  if (!input.success) throw new MeterLifecyclePersistenceError("INVALID_METER_LIFECYCLE_INPUT");
  const db = transaction.$client;
  const tenantId = (await db.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant_id")).rows[0]?.tenant_id;
  if (!tenantId) throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))", [tenantId]);
  const stored = (await db.query(`SELECT scope_id,source,source_hash,revision,
    source_hash=encode(sha256(convert_to(source::text,'UTF8')),'hex') AS valid
    FROM app.meter_lifecycle_source WHERE tenant_id=$1 AND id=$2`, [tenantId, input.data.sourceId])).rows[0];
  if (!stored) throw new MeterLifecyclePersistenceError("METER_FORBIDDEN");
  const source = meterLifecycleSourceV1.safeParse(stored.source);
  if (!stored.valid || !source.success || source.data.tenantId !== tenantId || source.data.scopeId !== stored.scope_id ||
    source.data.jobs.some(job => job.sourceRevision !== stored.revision)) {
    throw new MeterLifecyclePersistenceError("METER_LIFECYCLE_SOURCE_INVALID");
  }
  const result = countMeterDays({ version: "meter-lifecycle-days-input.v1", plan: source.data.plan,
    jobs: source.data.jobs.map(job => ({ ...job, policy: { version: "meter-lifecycle-policy.v1", revision: recipe, clockStatus: "approved" } })) });
  const existing = (await db.query(`SELECT id,source_hash,status FROM app.meter_lifecycle_computation
    WHERE tenant_id=$1 AND scope_id=$2 AND source_id=$3 AND recipe_version=$4`,
  [tenantId, stored.scope_id, input.data.sourceId, recipe])).rows[0];
  if (existing) {
    const rows = (await db.query(`SELECT date::text,source_hash,status,result FROM app.meter_lifecycle_day_ledger
      WHERE tenant_id=$1 AND scope_id=$2 AND computation_id=$3 ORDER BY date`, [tenantId, stored.scope_id, existing.id])).rows;
    if (existing.source_hash !== stored.source_hash || existing.status !== "counted" || rows.length !== result.days.length ||
      rows.some((row, i) => row.date !== result.days[i]!.date || row.source_hash !== stored.source_hash || row.status !== "counted" ||
        !isDeepStrictEqual(row.result, result.days[i]))) throw new MeterLifecyclePersistenceError("METER_PROJECTION_MISMATCH");
    return existing.id as string;
  }
  const id = randomUUID();
  await db.query(`INSERT INTO app.meter_lifecycle_computation(tenant_id,scope_id,id,source_id,source_hash,recipe_version,status)
    VALUES($1,$2,$3,$4,$5,$6,'counted')`, [tenantId, stored.scope_id, id, input.data.sourceId, stored.source_hash, recipe]);
  await db.query(`INSERT INTO app.meter_lifecycle_day_ledger(tenant_id,scope_id,computation_id,date,source_hash,status,result)
    SELECT $1,$2,$3,(day->>'date')::date,$4,'counted',day FROM jsonb_array_elements($5::jsonb) day`,
  [tenantId, stored.scope_id, id, stored.source_hash, JSON.stringify(result.days)]);
  return id;
}

