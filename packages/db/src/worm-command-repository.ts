import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { type WormStorage, type TimestampResult, type TimestampRequest } from "@jobguard/storage";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid();
const fields = {
  version: z.literal("worm.command.v1"), policyVersion: z.literal("synthetic_d07_v1"),
  commandId: uuid, idempotencyKey: uuid, actorMembershipId: uuid, jobId: uuid, evidenceId: uuid,
};
export const wormCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...fields, action: z.literal("apply_hold") }).strict(),
  z.object({ ...fields, action: z.literal("release_hold"), releaseOf: uuid }).strict(),
  z.object({ ...fields, action: z.literal("request_anchor"), subject: z.enum(["manifest", "checkpoint"]) }).strict(),
]);
export type WormCommand = z.infer<typeof wormCommandV1>;
export type WormReceipt = {
  id: string; tenant_id: string; actor_id: string; evidence_id: string;
  action: WormCommand["action"]; payload: WormCommand; object_key: string;
  object_version_id: string; imprint: string; attempts: number;
  status: "queued" | "executing" | "applied" | "pending" | "outcome_unknown" | "cancelled";
  result: Record<string, unknown> | null;
};
export class WormCommandError extends Error {
  constructor(readonly code: "DARK_ONLY" | "INVALID_INPUT" | "WORM_REFUSED" | "WORM_REPLAY_CONFLICT" | "D07_REQUIRED") {
    super(code); this.name = "WormCommandError";
  }
}
const refuse = (error: unknown): never => {
  if (error instanceof WormCommandError) throw error;
  if (error instanceof Error && error.message === "WORM_REPLAY_CONFLICT") throw new WormCommandError("WORM_REPLAY_CONFLICT");
  throw new WormCommandError("WORM_REFUSED"); // No SQL details, keys, provider errors or token material escape.
};
async function audit(db: TenantTransaction, c: WormReceipt, phase: string) {
  await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: c.actor_id,
    eventType: `worm.${phase}`, subjectType: "evidence", subjectRef: c.evidence_id,
    payload: { references: { command: c.id, action: c.action, status: c.status }, hashes: { imprint: c.imprint.trim() } } }]);
}

/** No HTTP route or live switch. Call only from a synthetic harness with a verified actor context.
 * SQL's migration-owned fixture allowlist is additionally required; caller flags cannot admit evidence.
 */
export class WormCommandRepository {
  constructor(private readonly pool: Pool, private readonly enabled = false) {}
  private requireDark() { if (!this.enabled) throw new WormCommandError("DARK_ONLY"); }

  async submit(context: VerifiedTenantContext, input: unknown): Promise<WormReceipt> {
    this.requireDark();
    const parsed = wormCommandV1.safeParse(input);
    if (!parsed.success) throw new WormCommandError("INVALID_INPUT");
    return withTenant(this.pool, context, async db => {
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${context.tenantId}/worm`]);
      const existed = await db.$client.query("SELECT id FROM app.worm_command WHERE tenant_id=$1 AND (id=$2 OR idempotency_key=$3)",
        [context.tenantId, parsed.data.commandId, parsed.data.idempotencyKey]);
      const c = (await db.$client.query<WormReceipt>("SELECT * FROM app.worm_submit($1::jsonb)", [JSON.stringify(parsed.data)])).rows[0]!;
      if (!existed.rows.length) await audit(db, c, "authorized");
      return c;
    }).catch(refuse);
  }

  /** Claim commits before provider I/O. An executing/unknown hold is never blindly retried.
   * A crashed executing claim requires explicit reconciliation, not another worker mutation.
   */
  async execute(context: VerifiedTenantContext, commandId: string, storage: WormStorage,
    tsa: { anchor(request: TimestampRequest): Promise<TimestampResult> }): Promise<WormReceipt> {
    this.requireDark();
    if (!uuid.safeParse(commandId).success) throw new WormCommandError("INVALID_INPUT");
    const claim = await withTenant(this.pool, context, async db => {
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${context.tenantId}/worm`]);
      const prior = (await db.$client.query<WormReceipt>("SELECT * FROM app.worm_command WHERE tenant_id=$1 AND id=$2", [context.tenantId, commandId])).rows[0];
      const c = (await db.$client.query<WormReceipt>("SELECT * FROM app.worm_claim($1)", [commandId])).rows[0]!;
      const claimed = !!prior && ["queued", "pending"].includes(prior.status) && c.status === "executing";
      if (claimed || c.status !== prior?.status) await audit(db, c, c.status);
      return { c, claimed };
    }).catch(refuse);
    if (!claim.claimed) return claim.c;
    const { c } = claim;
    const target = { tenantId: context.tenantId, key: c.object_key, versionId: c.object_version_id };
    let status: "applied" | "pending" | "outcome_unknown" = "applied";
    let material: Record<string, unknown> = { status: "applied" };
    try {
      if (c.action === "request_anchor") {
        if (c.payload.action !== "request_anchor") throw new WormCommandError("WORM_REFUSED");
        const result = await tsa.anchor({ schemaVersion: 1, synthetic: true, subject: c.payload.subject, imprint: c.imprint.trim() });
        if (result.status === "pending") { status = "pending"; material = result; }
        else material = { ...result, token: Buffer.from(result.token).toString("base64"), query: Buffer.from(result.query).toString("base64") };
      } else {
        await storage.hold(target, c.action === "apply_hold");
        const observed = await storage.read(target);
        if (observed.held !== (c.action === "apply_hold")) throw new WormCommandError("WORM_REFUSED");
      }
    } catch {
      status = c.action === "request_anchor" ? "pending" : "outcome_unknown";
      material = { status, reason: "service_unavailable" };
    }
    return withTenant(this.pool, context, async db => {
      const finished = (await db.$client.query<WormReceipt>("SELECT * FROM app.worm_finish($1,$2,$3,$4::jsonb)",
        [commandId, c.attempts, status, JSON.stringify(material)])).rows[0]!;
      await audit(db, finished, status);
      return finished;
    }).catch(refuse);
  }

  /** No policy inferred from hold release; D07 has not approved expiry or deletion. */
  deleteOrExpire(): never { throw new WormCommandError("D07_REQUIRED"); }
}
