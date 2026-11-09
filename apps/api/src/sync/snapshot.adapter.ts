import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { syncAuthorityFactsV1 } from "@jobguard/core";
import { SyncServerError, type SyntheticSyncStore } from "./download.application.js";

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const providerSnapshotV1 = z.object({
  version: z.literal("sync-provider-snapshot.v1"), environment: z.literal("synthetic_demo"),
  sessionId: z.guid(), userId: z.guid(), activeTenantId: z.guid(),
  authorityRevision: revision, authority: syncAuthorityFactsV1.nullable(),
  source: z.array(z.unknown()).max(200000),
}).strict();

/** Fake-provider seam, NOT a production authentication implementation.
 * Authenticate the opaque session; lock current identity/membership/assignment facts and set verified
 * transaction-local tenant context before calling read. Hold those locks through checkpoint commit.
 * authorityRevision is a durable server-owned user lifecycle counter: advance on every revoke, grant,
 * role/assignment change and tenant switch, even if nobody downloads between revoke and regrant.
 * Never source this counter or tenant context from a request. No provider implementation is mounted. */
export interface SyntheticSnapshotProvider {
  withCurrentSession<T>(sessionToken: string,
    read: (snapshot: unknown, transaction: Pick<PoolClient, "query">) => Promise<T>): Promise<T | null>;
}

/** Durable generations live in PostgreSQL, never in this adapter's memory. Only the download
 * application's scoped-token gate serves rows; this internal store is not a snapshot endpoint. */
export class SyntheticSyncSnapshotAdapter implements SyntheticSyncStore {
  constructor(private readonly provider: SyntheticSnapshotProvider,
    private readonly config: { environment?: string; enabled?: boolean; schemaVersion?: number } = {}) {}

  async readCurrentSession(sessionToken: string): Promise<unknown> {
    if (this.config.environment !== "synthetic_demo" || this.config.enabled !== true) throw new SyncServerError("SYNC_DISABLED");
    if (!z.string().min(1).max(4096).safeParse(sessionToken).success) throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
    const schemaVersion = revision.safeParse(this.config.schemaVersion);
    if (!schemaVersion.success || schemaVersion.data < 1) throw new SyncServerError("SYNC_UNAVAILABLE");
    try {
      return await this.provider.withCurrentSession(sessionToken, async (raw, transaction) => {
        const parsed = providerSnapshotV1.safeParse(raw);
        if (!parsed.success) throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
        const snapshot = parsed.data;
        if (snapshot.authority && (snapshot.authority.userId !== snapshot.userId
          || snapshot.authority.tenantId !== snapshot.activeTenantId)) throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
        try {
          const context = await transaction.query<{ tenant_id: string; user_id: string }>(`
            SELECT app.current_tenant() AS tenant_id, m.identity_user_id AS user_id
            FROM app.membership m
            WHERE m.tenant_id=app.current_tenant() AND m.id=app.current_actor()
              AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
              AND NOT EXISTS (SELECT 1 FROM app.contractor_membership_revocation v
                WHERE v.tenant_id=m.tenant_id AND v.membership_id=m.id)`);
          if (context.rows.length !== 1 || context.rows[0]?.tenant_id !== snapshot.activeTenantId
            || context.rows[0]?.user_id !== snapshot.userId) throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
        } catch {
          throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
        }
        const authority = snapshot.authority ? { ...snapshot.authority,
          assignedJobIds: [...new Set(snapshot.authority.assignedJobIds)].sort() } : null;
        // No source values, hidden data, token or session identifier enters the checkpoint hash.
        const scopeHash = createHash("sha256").update(JSON.stringify(authority)).digest("hex");
        const result = await transaction.query<{ generation: string }>(
          "SELECT app.sync_snapshot_generation($1::uuid,$2::bigint,$3::bigint,$4::text,$5::text) AS generation",
          [snapshot.userId, snapshot.authorityRevision, schemaVersion.data, scopeHash, "synthetic_demo"]);
        const generation = revision.safeParse(Number(result.rows[0]?.generation));
        if (!generation.success || generation.data < 1) throw new SyncServerError("SYNC_UNAVAILABLE");
        return { version: "sync-server-snapshot.v1", environment: "synthetic_demo",
          sessionId: snapshot.sessionId, userId: snapshot.userId, activeTenantId: snapshot.activeTenantId,
          generation: generation.data, authority, source: snapshot.source };
      });
    } catch (error) {
      if (error instanceof SyncServerError) throw error;
      throw new SyncServerError("SYNC_UNAVAILABLE");
    }
  }
}
