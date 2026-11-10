import type { Pool } from "pg";
import { z } from "zod";
import { recurringExtras, type RecurringExtraObservation } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Uses existing runtime SELECT grants only; no privileged connection or commercial writes. */
export class RecurringExtrasRepository {
  constructor(private readonly pool: Pool) {}
  async read(context: VerifiedTenantContext, rawActorId: unknown, rawJobId: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_ONLY");
    const actorId = z.guid().parse(rawActorId), jobId = z.guid().parse(rawJobId);
    return withTenant(this.pool, context, async db => {
      await db.$client.query("SET TRANSACTION READ ONLY");
      const owner = await db.$client.query(`SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner'
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [context.tenantId, actorId]);
      if (!owner.rowCount) throw new Error("FORBIDDEN");
      if (!(await db.$client.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2", [context.tenantId, jobId])).rowCount) throw new Error("NOT_FOUND");
      const asOf = (await db.$client.query<{ cutoff: Date }>("SELECT clock_timestamp() AS cutoff")).rows[0]!.cutoff.toISOString();
      const { rows } = await db.$client.query<Omit<RecurringExtraObservation, "ratePence" | "approvedAt"> & { ratePence: string; approvedAt: Date }>(`SELECT
        'recurring-extra-observation.v1' AS version,v.tenant_id AS "tenantId",v.job_id AS "jobId",v.id AS "variationId",
        r.id AS "revisionId",o.id AS "observationId",r.description,r.unit,o.unit_rate_pence::text AS "ratePence",
        a.approved_at AS "approvedAt",v.state,false AS withdrawn
        FROM app.variation v
        JOIN app.variation_revision r ON (r.tenant_id,r.job_id,r.variation_id,r.id)=(v.tenant_id,v.job_id,v.id,v.current_revision_id)
        JOIN app.variation_approval a ON (a.tenant_id,a.job_id,a.variation_id,a.revision_id)=(v.tenant_id,v.job_id,v.id,r.id)
        JOIN app.variation_rate_observation o ON (o.tenant_id,o.job_id,o.variation_id,o.revision_id)=(v.tenant_id,v.job_id,v.id,r.id)
        WHERE v.tenant_id=$1 AND v.state='approved'
        AND a.content_hash=r.content_hash AND a.signed_delta_pence=r.signed_delta_pence AND a.revision=r.revision
        AND o.unit=r.unit AND o.unit_rate_pence=r.unit_rate_pence
        AND o.provenance_kind=r.rate_provenance_kind AND o.source_ref=r.rate_source_ref
        AND o.source_hash=r.rate_source_hash AND o.rate_version=r.rate_version
        AND NOT EXISTS(SELECT 1 FROM app.variation_withdrawal w WHERE (w.tenant_id,w.job_id,w.variation_id)=(v.tenant_id,v.job_id,v.id))
        ORDER BY v.id`, [context.tenantId]);
      return recurringExtras({ version: "recurring-extras-query.v1", tenantId: context.tenantId, asOf }, rows.map(row => ({ ...row,
        ratePence: Number(row.ratePence), approvedAt: new Date(row.approvedAt).toISOString() })));
    });
  }
}
