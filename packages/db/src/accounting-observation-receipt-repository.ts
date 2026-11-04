import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { parseObservation, type Observation } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export class AccountingObservationReceiptError extends Error {
  constructor(readonly code: "ACCOUNTING_BINDING_MISMATCH" | "ACCOUNTING_VERSION_CONFLICT") {
    super(code);
    this.name = "AccountingObservationReceiptError";
  }
}

/** Server-only synthetic worker pool with jobguard_shadow; never the builder pool. */
export class AccountingObservationReceiptRepository {
  constructor(private readonly pool: Pool) {}

  async claim(context: VerifiedTenantContext, raw: readonly Observation[]): Promise<readonly Observation[]> {
    const observations = raw.map(parseObservation);
    if (observations.some(o => o.tenantId !== context.tenantId || o.kind !== "supplier_line"))
      throw new AccountingObservationReceiptError("ACCOUNTING_BINDING_MISMATCH");
    return withTenant(this.pool, context, async db => {
      // One tenant lock avoids conflicting batches acquiring receipt keys in opposite orders.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`accounting-receipt:${context.tenantId}`]);
      const emitted: Observation[] = [];
      for (const observation of observations) {
        const hash = createHash("sha256").update(JSON.stringify(observation)).digest("hex");
        const key = [context.tenantId, observation.evidence.id, observation.evidence.objectVersionId];
        const inserted = await db.$client.query(`INSERT INTO app.accounting_observation_receipt
          (tenant_id,evidence_id,object_version_id,job_id,observation_hash) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(tenant_id,evidence_id,object_version_id) DO NOTHING RETURNING evidence_id`,
          [...key, observation.jobId, hash]);
        if (inserted.rowCount) emitted.push(observation);
        else {
          const prior = await db.$client.query("SELECT observation_hash FROM app.accounting_observation_receipt WHERE tenant_id=$1 AND evidence_id=$2 AND object_version_id=$3", key);
          if (prior.rows[0]?.observation_hash !== hash) throw new AccountingObservationReceiptError("ACCOUNTING_VERSION_CONFLICT");
        }
      }
      return Object.freeze(emitted);
    });
  }
}
