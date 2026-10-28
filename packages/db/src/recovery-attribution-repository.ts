import type { Pool } from "pg";
import { z } from "zod";
import { parseRecoveryAttributionCommand, recoveryAttributionRevisionV1, type RecoveryAttributionRevisionV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Storage access only. Runtime assessment stays closed pending the accepted source adapter. */
export class RecoveryAttributionRepository {
  constructor(private readonly pool: Pool) {}
  async assess(context: VerifiedTenantContext, jobId: string, sessionDigest: string, raw: unknown): Promise<RecoveryAttributionRevisionV1> {
    const command = parseRecoveryAttributionCommand(raw);
    const job = z.string().uuid().parse(jobId);
    return withTenant(this.pool, context, async db => {
      const row = (await db.$client.query<{ result: unknown }>(
        "SELECT app.assess_recovery_attribution($1,$2,$3::jsonb) result", [job, sessionDigest, command],
      )).rows[0];
      return recoveryAttributionRevisionV1.parse(row?.result);
    });
  }
  /** No hidden-table access; RLS requires the current authenticated owner and locked practice job. */
  async history(context: VerifiedTenantContext, jobId: string, sessionDigest: string): Promise<readonly RecoveryAttributionRevisionV1[]> {
    const job = z.string().uuid().parse(jobId);
    return withTenant(this.pool, context, async db => {
      await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [sessionDigest]);
      const rows = await db.$client.query<{ document: unknown }>(
        "SELECT document FROM app.recovery_attribution_revision WHERE tenant_id=$1 AND job_id=$2 ORDER BY case_id,work_id,line_id,lock_id,revision", [context.tenantId, job],
      );
      return rows.rows.map(row => recoveryAttributionRevisionV1.parse(row.document));
    });
  }
}
