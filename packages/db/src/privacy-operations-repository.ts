import type { Pool } from "pg";
import { privacyCommandV1, privacyQueryV1, privacyErrorCodes, PrivacyOperationsError } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export class PrivacyOperationsRepository {
  constructor(private readonly pool: Pool) {}
  async command(context: VerifiedTenantContext, digest: string, raw: unknown) {
    const parsed = privacyCommandV1.safeParse(raw);
    if (!parsed.success) throw new PrivacyOperationsError("PRIVACY_INVALID");
    return this.run(context, "SELECT app.privacy_command($1,$2,$3::jsonb) result", digest, JSON.stringify(parsed.data));
  }
  async read(context: VerifiedTenantContext, digest: string, raw: unknown) {
    const parsed = privacyQueryV1.safeParse(raw);
    if (!parsed.success) throw new PrivacyOperationsError("PRIVACY_INVALID");
    return this.run(context, "SELECT app.privacy_read($1,$2,$3::uuid) result", digest, parsed.data.requestId);
  }
  private async run(context: VerifiedTenantContext, sql: string, digest: string, value: string): Promise<Record<string, unknown>> {
    try {
      return await withTenant(this.pool, context, async db => (await db.$client.query(sql, [context.tenantId, digest, value])).rows[0].result);
    } catch (error) {
      const e = error as { code?: string; message?: string };
      const known = privacyErrorCodes.find(code => code === e.message);
      throw new PrivacyOperationsError(known ?? (e.code === "42501" ? "PRIVACY_FORBIDDEN" : ["22P02", "22023", "22003"].includes(e.code ?? "") ? "PRIVACY_INVALID" : "PRIVACY_UNAVAILABLE"));
    }
  }
}
