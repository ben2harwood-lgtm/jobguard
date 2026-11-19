import { mobileAccessV1, mobilePartitionV1, type SyncJobProjectionV1 } from "@jobguard/core";
import { withTenant } from "@jobguard/db";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { AuthError, type MemoryAuthProvider } from "../auth/auth-provider.js";
import type { SyntheticMobileAuthApplication } from "../auth/mobile-auth.application.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "../auth/principal-bridge.js";
import { SyncServerError, SyntheticSyncDownloadApplication } from "./download.application.js";
import { SyntheticSyncSnapshotAdapter } from "./snapshot.adapter.js";

const callV1 = z.object({
  version: z.literal("native-download-call.v1"),
  deviceInstanceId: mobilePartitionV1.shape.deviceInstanceId,
  access: mobileAccessV1,
  operation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("check") }).strict(),
    z.object({ kind: z.literal("subscribe"), request: z.unknown() }).strict(),
    z.object({ kind: z.literal("page"), request: z.unknown() }).strict(),
  ]),
}).strict();

type Partition = z.infer<typeof mobilePartitionV1>;
type ProjectionRow = SyncJobProjectionV1 & { tenantId: string };
const schemaVersion = 1;
const enabled = { environment: "synthetic_demo", enabled: true } as const;

// Named assignments are taken from the current work order revision. The existing site-visit
// function checks the remaining team/grant/role rules. This read has no public list's row limit.
const assignedRows = `
  SELECT w.tenant_id AS "tenantId", w.job_id AS "jobId", w.id AS "workOrderId", w.reference,
    r.priority, to_char(r.issued_on,'YYYY-MM-DD') AS "issuedOn", to_char(r.due_on,'YYYY-MM-DD') AS "dueOn",
    (SELECT v.id FROM app.site_visit v
     WHERE (v.tenant_id,v.job_id,v.membership_id)=(w.tenant_id,w.job_id,$2::uuid) AND v.completed_at IS NULL
     ORDER BY v.started_at,v.id LIMIT 1) AS "openVisitId"
  FROM app.work_order w
  JOIN app.work_order_current c ON (c.tenant_id,c.work_order_id)=(w.tenant_id,w.id)
  JOIN app.work_order_revision r ON (r.tenant_id,r.work_order_id,r.id)=(w.tenant_id,w.id,c.revision_id)
  WHERE w.tenant_id=$1 AND EXISTS (
    SELECT 1 FROM app.job_assignment a
    WHERE (a.tenant_id,a.revision_id,a.membership_id)=(c.tenant_id,c.revision_id,$2::uuid)
  ) AND (SELECT a.decision FROM app.ent3b_visit_authority($2,w.job_id) a)='allowed'
  ORDER BY w.job_id LIMIT 100001`;

/** Unregistered synthetic channel. The caller supplies the existing source-session envelope
 * separately from the versioned mobile message, as on the synthetic mobile auth seam. */
export class SyntheticNativeDownloadConnection {
  constructor(
    private readonly auth: MemoryAuthProvider,
    private readonly mobile: SyntheticMobileAuthApplication,
    private readonly pool: Pool,
    private readonly options: Readonly<{
      allowedOrigin: string;
      environment?: string;
      enabled?: boolean;
      // Test replication may be broader than RLS. It never participates in assignment admission.
      replica?: (rows: readonly ProjectionRow[]) => readonly unknown[];
    }>,
  ) {}

  async call(raw: unknown, credentials: TenantRequestCredentials): Promise<unknown> {
    if (this.options.environment !== "synthetic_demo" || this.options.enabled !== true) {
      throw new SyncServerError("SYNC_DISABLED");
    }
    const parsed = callV1.safeParse(raw);
    if (!parsed.success) throw new SyncServerError("SYNC_INVALID_INPUT");
    const { operation, access, deviceInstanceId } = parsed.data;
    const verify = async () => {
      try {
        return mobilePartitionV1.parse((await this.mobile.reconnect({
          version: "mobile-reconnect.v1", access, deviceInstanceId,
        }, credentials)).partition);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "MOBILE_DENIED") {
          throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
        }
        throw new SyncServerError("SYNC_UNAVAILABLE");
      }
    };
    try {
      const partition = await verify();
      if (operation.kind === "check") return { version: "native-download-reply.v1", outcome: "current", partition };

      const application = new SyntheticSyncDownloadApplication(new SyntheticSyncSnapshotAdapter({
        withCurrentSession: (token, read) => token === access.credential
          ? this.withSnapshot(partition, credentials, read)
          : Promise.resolve(null),
      }, { ...enabled, schemaVersion }), enabled);

      let value: unknown;
      if (operation.kind === "subscribe") {
        const { generation, response } = await application.subscribeBound(access.credential, {
          version: "sync-server-subscribe.v1", request: operation.request,
        });
        value = { partition, generation, schemaVersion, token: response.token };
      } else {
        value = await application.download(access.credential, operation.request);
      }
      // A tenant switch or logout during the database operation must not publish its reply.
      await verify();
      return { version: "native-download-reply.v1", outcome: "ok", value };
    } catch (error) {
      if (error instanceof SyncServerError) {
        if (error.code === "SYNC_AUTHORITY_REQUIRED") return { version: "native-download-reply.v1", outcome: "denied" };
        throw error;
      }
      throw new SyncServerError("SYNC_UNAVAILABLE");
    }
  }

  private async withSnapshot<T>(
    partition: Partition, credentials: TenantRequestCredentials,
    read: (snapshot: unknown, transaction: Pick<PoolClient, "query">) => Promise<T>,
  ): Promise<T | null> {
    try {
      const context = await resolveVerifiedTenantContext(this.auth, credentials, this.options.allowedOrigin);
      if (context.tenantId !== partition.tenantId) return null;
      return await withTenant(this.pool, context, async db => {
        const tx = db.$client;
        if (!(await tx.query<{ synthetic: boolean }>(
          "SELECT current_database()='jobguard_synthetic_demo' AS synthetic",
        )).rows[0]?.synthetic) return null;
        const ids = [partition.tenantId, partition.membershipId, partition.userId];
        // Same tenant lock as contractor administration and work-order writers. Hold until the
        // checkpoint commits, so an audited assignment/role change cannot straddle this read.
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,54))", [partition.tenantId]);
        const member = (await tx.query<{ role: string }>(`
          SELECT role FROM app.membership
          WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND app.contractor_member_active(id)
        `, ids)).rows[0];
        if (!member) return null;

        // Neither history shrinks in the synthetic lane. Audit events cover ordinary contractor
        // mutations, including removal and re-addition between reads. The existing mobile family
        // history accounts for switch-away/switch-back and session reauthorisation.
        const { families } = await this.mobile.fixtureRecords();
        let lifecycleRevision = 0;
        let activeFamily = false;
        for (const family of families) {
          if (family.partition.userId !== partition.userId) continue;
          lifecycleRevision += family.revokedAtMs === undefined ? 1 : 2;
          if (family.partition.mobileSessionId === partition.mobileSessionId && family.revokedAtMs === undefined) {
            activeFamily = true;
          }
        }
        if (!activeFamily) return null;
        const revision = (await tx.query<{ sequence: string }>(`
          SELECT COALESCE((SELECT sequence FROM app.audit_event WHERE tenant_id=$1
            AND (event_type IN ('commercial_track.assigned', 'contractor.work_order_import.recorded')
              OR subject_type='contractor-administration'
              OR event_type LIKE 'contractor.agreement.%')
            ORDER BY sequence DESC LIMIT 1),0) AS sequence
        `, [partition.tenantId])).rows[0]!;
        const rows = (await tx.query<ProjectionRow>(assignedRows, ids.slice(0, 2))).rows;
        return read({
          version: "sync-provider-snapshot.v1", environment: "synthetic_demo",
          sessionId: partition.mobileSessionId, userId: partition.userId, activeTenantId: partition.tenantId,
          authorityRevision: Number(revision.sequence) + lifecycleRevision,
          authority: { userId: partition.userId, tenantId: partition.tenantId, membershipId: partition.membershipId,
            role: member.role, status: "active", assignedJobIds: rows.map(row => row.jobId) },
          source: this.options.replica?.(rows) ?? rows,
        }, tx);
      });
    } catch (error) {
      if (error instanceof AuthError) return null;
      // After rollback, report expected checkpoint denials as missing current authority.
      if (error instanceof Error && ["SYNC_CHECKPOINT_STALE", "SYNC_CHECKPOINT_INVALID"].includes(error.message)) {
        return null;
      }
      throw error;
    }
  }
}
