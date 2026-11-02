import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  AiGateway, AiGatewayError, aiGatewayRequestSchema, aiSourceSchema,
  type AiOutputSchema, type AiProvider,
} from "@jobguard/ai";
import { withTenant, type VerifiedTenantContext } from "@jobguard/db";
import type { AuthProvider } from "./auth/auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";

/** Credentials come from the server's identity adapter, never the AI payload.
 * The existing bridge re-reads session expiry/revocation and active membership. */
export function createAiSessionResolver(
  identity: AuthProvider,
  credentials: () => TenantRequestCredentials,
  allowedOrigin: string,
): () => Promise<VerifiedTenantContext> {
  return () => resolveVerifiedTenantContext(identity, credentials(), allowedOrigin);
}

/** Only builder capture records are eligible here. Their immutable stored kind
 * defines visibility; audio, shadow tables and unknown kinds are not supported.
 * No caller content, ownership, hash or visibility is forwarded to the provider. */
export async function loadAiCaptureSources(pool: Pool, context: VerifiedTenantContext, ids: readonly string[]) {
  if (ids.some(id => !z.guid().safeParse(id).success)) throw sourceRefused();
  return withTenant(pool, context, async db => {
    const sources = [];
    for (const id of ids) {
      const row = (await db.$client.query(`SELECT id,tenant_id,content_text,sha256,
        CASE WHEN kind IN ('text','browser_local_transcript') THEN 'public' ELSE 'hidden' END AS visibility
        FROM app.capture_source WHERE tenant_id=$1 AND id=$2`, [context.tenantId, id])).rows[0];
      if (!row || row.tenant_id !== context.tenantId || row.visibility !== "public") throw sourceRefused();
      const source = aiSourceSchema.safeParse({ id: row.id, tenantId: row.tenant_id,
        content: row.content_text, sha256: row.sha256, visibility: row.visibility });
      if (!source.success || source.data.id !== id ||
        createHash("sha256").update(source.data.content).digest("hex") !== source.data.sha256) throw sourceRefused();
      sources.push(source.data);
    }
    return sources;
  });
}

const sourceRefused = () => new AiGatewayError("invalid_request", "AI source is not permitted");

/** Dark composition only: no route, live provider or transport is installed. */
export class AiCaptureAuthority {
  constructor(
    private readonly pool: Pool,
    private readonly provider: AiProvider,
    private readonly resolveSession: () => Promise<VerifiedTenantContext>,
  ) {}

  async generate<T>(raw: unknown, outputSchema: AiOutputSchema<T>) {
    const parsed = aiGatewayRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AiGatewayError("invalid_request", "Invalid AI request");
    let context: VerifiedTenantContext;
    try { context = await this.resolveSession(); }
    catch { throw new AiGatewayError("invalid_request", "AI session is not permitted"); }
    if (parsed.data.tenantId !== undefined && parsed.data.tenantId !== context.tenantId) throw sourceRefused();
    let sources;
    try { sources = await loadAiCaptureSources(this.pool, context, parsed.data.sources.map(source => source.id)); }
    catch { throw sourceRefused(); }
    // Recheck authority after storage reads; never hold a DB transaction over a provider call.
    return new AiGateway(this.provider, this.resolveSession).generate({ ...parsed.data, sources, tenantId: context.tenantId }, outputSchema);
  }
}
