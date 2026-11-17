import { z } from "zod";
import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const readV1 = z.object({ version: z.literal("shadow-read.v1"), jobId: z.string().uuid() }).strict();
const emergencyReadV1 = readV1.extend({ version: z.literal("shadow-emergency-read.v1"), reason: z.string().trim().min(1).max(1000) }).strict();
const supportDisclosureV1 = readV1.extend({ version: z.literal("shadow-support-disclosure.v1"), signalId: z.string().uuid(), eventId: z.string().uuid() }).strict();
export class ShadowPersistenceError extends Error {
  constructor(readonly code: "INVALID_SHADOW_REQUEST") { super(code); }
}
export interface PersistedShadowSignal {
  tenant_id: string; job_id: string; id: string; work_id: string;
  state: string; description: string; disclosed_before_lock: boolean;
  first_builder_visible_at: Date | null;
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ShadowPersistenceError("INVALID_SHADOW_REQUEST");
  return result.data;
}
/** Server-only. Supply the narrowly privileged pool for the requested operation.
 * The emergency pool is never a builder runtime or shadow worker credential.
 * Membership verification precedes creation of the supplied tenant context.
 */
export class ShadowRepository {
  constructor(private readonly pool: Pool) {}
  async reveal(context: VerifiedTenantContext, raw: unknown): Promise<PersistedShadowSignal[]> {
    const request = parse(readV1, raw);
    return withTenant(this.pool, context, async db => (await db.$client.query<PersistedShadowSignal>(
      "SELECT * FROM app.reveal_shadow_signals($1,$2)", [context.tenantId, request.jobId],
    )).rows);
  }
  async emergencyRead(context: VerifiedTenantContext, raw: unknown): Promise<PersistedShadowSignal[]> {
    const request = parse(emergencyReadV1, raw);
    return withTenant(this.pool, context, async db => (await db.$client.query<PersistedShadowSignal>(
      "SELECT * FROM app.read_shadow_emergency($1,$2,$3)", [context.tenantId, request.jobId, request.reason],
    )).rows);
  }
  /** Support conversation disclosure uses the same durable routine as every other route. */
  async supportDisclosure(context: VerifiedTenantContext, raw: unknown): Promise<string> {
    const request = parse(supportDisclosureV1, raw);
    return withTenant(this.pool, context, async db => (await db.$client.query<{ id: string }>(
      "SELECT app.record_shadow_disclosure($1,$2,$3,$4,'support_conversation') AS id",
      [context.tenantId, request.jobId, request.signalId, request.eventId],
    )).rows[0]!.id);
  }
}
