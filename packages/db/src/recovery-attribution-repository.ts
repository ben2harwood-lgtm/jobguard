import type { Pool } from "pg";
import { z } from "zod";
import { parseRecoveryAttributionCommand, recoveryAttributionRevisionV1, type RecoveryAttributionRevisionV1 } from "@jobguard/core";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Synthetic runtime assessment resolves sources inside the authenticated database transaction. */
export class RecoveryAttributionRepository {
  constructor(private readonly pool: Pool) {}
  async assess(context: VerifiedTenantContext, jobId: string, sessionDigest: string, raw: unknown): Promise<RecoveryAttributionRevisionV1> {
    const command = parseRecoveryAttributionCommand(raw);
    const job = z.string().uuid().parse(jobId);
    return withTenant(this.pool, context, async db => {
      const row = (await db.$client.query<{ result: unknown }>(
        "SELECT app.assess_recovery_attribution($1,$2,$3::jsonb) result", [job, sessionDigest, command],
      )).rows[0];
      const result=recoveryAttributionRevisionV1.parse(row?.result);
      if(result.tenantId!==context.tenantId || result.jobId!==job || result.caseId!==command.caseId
        || result.workId!==command.workId || result.lineId!==command.lineId || result.lockId!==command.lockId)
        throw new PracticeAccessError("NOT_FOUND");
      return result;
    });
  }
  /** No hidden-table access; RLS requires the current authenticated owner and locked practice job. */
  async history(context: VerifiedTenantContext, jobId: string, sessionDigest: string): Promise<readonly RecoveryAttributionRevisionV1[]> {
    const job = z.string().uuid().parse(jobId);
    return withTenant(this.pool, context, async db => {
      // Reauthenticate inside the read transaction. No attribution/shadow table is
      // touched until the current session owns this job and its lock exists.
      const gate = (await db.$client.query<{ locked: boolean }>(`
        SELECT EXISTS(SELECT 1 FROM app.final_account_lock l WHERE l.tenant_id=j.tenant_id AND l.job_id=j.id) locked
        FROM app.job j
        JOIN app.authenticate_practice_session($1) p ON p.tenant_id=j.tenant_id
        JOIN app.membership m ON (m.tenant_id,m.id)=(p.tenant_id,p.membership_id)
        WHERE current_database()='jobguard_synthetic_demo' AND j.tenant_id=$2 AND j.id=$3
          AND j.practice_session_digest=$1 AND m.role='owner' AND m.revoked_at IS NULL
          AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`, [sessionDigest, context.tenantId, job])).rows[0];
      if (!gate) throw new PracticeAccessError("NOT_FOUND");
      if (!gate.locked) return [];
      await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [sessionDigest]);
      const rows = await db.$client.query<{ document: unknown }>(
        "SELECT document FROM app.recovery_attribution_revision WHERE tenant_id=$1 AND job_id=$2 ORDER BY case_id,work_id,line_id,lock_id,revision", [context.tenantId, job],
      );
      return rows.rows.map(row => {
        const document = recoveryAttributionRevisionV1.parse(row.document);
        if (document.tenantId !== context.tenantId || document.jobId !== job) throw new PracticeAccessError("NOT_FOUND");
        return document;
      });
    });
  }
}
