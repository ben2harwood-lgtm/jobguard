import type { Pool } from "pg";
import { z } from "zod";
import { outboundActionV1Schema, type OutboundAdapter, type SafeTelemetry } from "./outbox.js";

const claimV1 = z.object({
  action: z.object({ id: z.guid(), authorization_id: z.guid(), adapter: z.string(), provider_effect_key: z.string(),
    action_type: z.string(), recipient: z.string().nullable(), content_hash: z.string(), immutable_content: z.string(),
    aggregate_revision: z.number(), amount_pence: z.union([z.string(), z.number()]).nullable(), currency: z.string().nullable(),
    policy_version: z.string(), authorization_expires_at: z.string(), created_at: z.string() }),
  attempt: z.number().int().positive(), token: z.guid(),
});
const resultV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("succeeded"), providerReference: z.string().min(1).max(300) }).strict(),
  z.object({ kind: z.literal("retryable"), code: z.string().min(1).max(100) }).strict(),
  z.object({ kind: z.literal("outcome_unknown"), code: z.string().min(1).max(100) }).strict(),
]);

/** Worker credentials only. Queue payload supplies an identifier, never authority. */
export class WorkerActionExecutor {
  constructor(private pool: Pool, private adapters: Map<string, OutboundAdapter>, private telemetry: SafeTelemetry) {}

  async execute(id: string) {
    z.guid().parse(id);
    // Each checked routine commits before/after the adapter call. No business
    // network call occurs in a transaction, and the claim token fences replay.
    const raw = (await this.pool.query<{ claim: unknown }>(
      "SELECT app.claim_worker_action($1::uuid,$2::text[]) AS claim", [id, [...this.adapters.keys()]],
    )).rows[0]?.claim;
    if (raw == null) return;
    if (z.object({ refused: z.literal(true), code: z.literal("AUTHORIZATION_REVOKED") }).strict().safeParse(raw).success) {
      return { kind: "cancelled" as const, code: "AUTHORIZATION_REVOKED" as const };
    }
    const { action: row, attempt, token } = claimV1.parse(raw);
    const action = outboundActionV1Schema.parse({ version: "outbound-action.v1", id: row.id,
      authorizationId: row.authorization_id, adapter: row.adapter, providerEffectKey: row.provider_effect_key,
      actionType: row.action_type, recipient: row.recipient, contentHash: row.content_hash,
      immutableContent: row.immutable_content, aggregateRevision: row.aggregate_revision,
      amountPence: row.amount_pence === null ? null : Number(row.amount_pence), currency: row.currency,
      policyVersion: row.policy_version, authorizationExpiresAt: row.authorization_expires_at });
    const adapter = this.adapters.get(action.adapter);
    if (!adapter) throw new Error("FAKE_ADAPTER_NOT_REGISTERED");
    this.telemetry.emit("outbox.queue_age", { actionId: id, seconds: Math.max(0, (Date.now() - Date.parse(row.created_at)) / 1000) });
    // An exception leaves an executing claim. Lease expiry moves it to unknown,
    // preventing a second delivery when the first provider result was lost.
    const result = resultV1.parse(await adapter.deliver(Object.freeze(action)));
    const completed = (await this.pool.query<{ completed: boolean }>(
      "SELECT app.complete_worker_action($1::uuid,$2::uuid,$3::text,$4::text,$5::text) AS completed",
      [id, token, result.kind, result.kind === "succeeded" ? result.providerReference : null,
        result.kind === "succeeded" ? null : result.code],
    )).rows[0]?.completed;
    if (!completed) return;
    if (result.kind === "outcome_unknown") this.telemetry.emit("outbox.unknown_outcome", { actionId: id, attempt });
    if (result.kind === "retryable") {
      this.telemetry.emit(attempt >= 5 ? "outbox.failure" : "outbox.retry", { actionId: id, attempt });
    }
  }
}
