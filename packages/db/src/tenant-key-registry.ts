import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const command = z.object({ version: z.literal("tenant-key-command.v1"), commandId: z.guid() }).strict();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
const keyVersion = z.number().int().min(1).max(1000000);
const rotate = command.extend({ fingerprint }).strict();
const revoke = command.extend({ keyVersion }).strict();
const use = z.object({ version: z.literal("tenant-key-use.v1"), keyVersion, fingerprint,
  operation: z.enum(["sign", "verify", "wrap", "unwrap"]) }).strict();
export class TenantKeyRegistryError extends Error {
  readonly code = "TENANT_KEY_REGISTRY_REFUSED";
  constructor() { super("Synthetic tenant key registry operation refused"); }
}

/** DARK assurance-only seam: use a restricted registry connection, never a business
 * runtime pool. No production path or KMS integration. Persist metadata, not keys.
 * Every operation reads current durable state; no status cache survives revocation.
 */
export class SyntheticTenantKeyRegistry {
  constructor(private readonly pool: Pool, private readonly enabled = false) {}

  private async transaction<T>(context: VerifiedTenantContext, work: (db: TenantTransaction) => Promise<T>): Promise<T> {
    try {
      if (!this.enabled || process.env.NODE_ENV === "production") throw new TenantKeyRegistryError();
      return await withTenant(this.pool, context, async db => {
        const mode = await db.$client.query("SELECT current_database() AS name");
        if (mode.rows[0]?.name !== "jobguard_synthetic_demo") throw new TenantKeyRegistryError();
        // Same lock for use and lifecycle: a revoke waits for in-progress local
        // crypto, and no operation beginning after its commit can use that key.
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,486))", [context.tenantId]);
        return work(db);
      });
    } catch { throw new TenantKeyRegistryError(); }
  }

  private async replay(db: TenantTransaction, tenant: string, id: string) {
    return (await db.$client.query<{ operation: string; version: number; fingerprint: string }>(`
      SELECT 'rotate' AS operation,version,fingerprint FROM app.tenant_key_version WHERE tenant_id=$1 AND command_id=$2
      UNION ALL SELECT 'revoke',r.version,k.fingerprint FROM app.tenant_key_revocation r
       JOIN app.tenant_key_version k USING(tenant_id,version) WHERE r.tenant_id=$1 AND r.command_id=$2`, [tenant, id])).rows[0];
  }

  async rotate(context: VerifiedTenantContext, raw: unknown): Promise<number> {
    return this.transaction(context, async db => {
      const input = rotate.parse(raw), t = context.tenantId;
      const prior = await this.replay(db, t, input.commandId);
      if (prior) {
        if (prior.operation !== "rotate" || prior.fingerprint !== input.fingerprint) throw new TenantKeyRegistryError();
        return prior.version;
      }
      const next = (await db.$client.query<{ version: number }>("SELECT coalesce(max(version),0)+1 AS version FROM app.tenant_key_version WHERE tenant_id=$1", [t])).rows[0]!.version;
      await db.$client.query("INSERT INTO app.tenant_key_version(tenant_id,version,command_id,fingerprint) VALUES($1,$2,$3,$4)", [t, next, input.commandId, input.fingerprint]);
      await this.audit(db, input.commandId, "rotate", next, input);
      return next;
    });
  }

  async revoke(context: VerifiedTenantContext, raw: unknown): Promise<void> {
    return this.transaction(context, async db => {
      const input = revoke.parse(raw), t = context.tenantId;
      const prior = await this.replay(db, t, input.commandId);
      if (prior) {
        if (prior.operation !== "revoke" || prior.version !== input.keyVersion) throw new TenantKeyRegistryError();
        return;
      }
      await db.$client.query("INSERT INTO app.tenant_key_revocation(tenant_id,version,command_id) VALUES($1,$2,$3)", [t, input.keyVersion, input.commandId]);
      await this.audit(db, input.commandId, "revoke", input.keyVersion, input);
    });
  }

  /** Synchronous FAKE crypto only, inside the lifecycle lock. Never put provider
   * or other network calls here. Rotation retires older keys for verification and
   * unwrapping only; revocation refuses ALL uses, including older signatures.
   * Caller supplies server-owned context after authentication, never payload tenant.
   */
  async withKey<T>(context: VerifiedTenantContext, raw: unknown, crypto: () => T extends PromiseLike<unknown> ? never : T): Promise<T> {
    return this.transaction(context, async db => {
      const input = use.parse(raw);
      const rows = await db.$client.query<{ fingerprint: string; current: boolean; revoked: boolean }>(`
        SELECT k.fingerprint,k.version=(SELECT max(version) FROM app.tenant_key_version WHERE tenant_id=$1) AS current,
         EXISTS(SELECT 1 FROM app.tenant_key_revocation r WHERE (r.tenant_id,r.version)=(k.tenant_id,k.version)) AS revoked
        FROM app.tenant_key_version k WHERE k.tenant_id=$1 AND k.version=$2`, [context.tenantId, input.keyVersion]);
      const key = rows.rows[0];
      if (!key || key.revoked || key.fingerprint !== input.fingerprint ||
        (!key.current && ["sign", "wrap"].includes(input.operation))) throw new TenantKeyRegistryError();
      const result = crypto();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TenantKeyRegistryError();
      return result;
    });
  }

  private async audit(db: TenantTransaction, commandId: string, operation: string, version: number, input: unknown) {
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: "system:synthetic-key-registry",
      eventType: `tenant.key.${operation}`, subjectType: "tenant-key", subjectRef: String(version),
      payload: { references: { commandId }, hashes: { request: digest } } }]);
  }
}
