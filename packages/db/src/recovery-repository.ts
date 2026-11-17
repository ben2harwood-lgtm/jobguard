import type { Pool } from "pg";
import { z } from "zod";
import { syntheticLandingCommandV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.guid({ error: "Invalid uuid" });
export const recoveryLandingPostingIdsV1 = z.object({ allocationId: uuid, derivationId: uuid, journalId: uuid }).passthrough();
// Validate the envelope once: separate strict parses reject each other's fields.
const postingId = syntheticLandingCommandV1.shape.commandId;
const recoveryLandingApprovalV1 = syntheticLandingCommandV1.extend({
  allocationId: postingId, derivationId: postingId, journalId: postingId,
}).strict();
export const recoveryLandingReversalV1 = z.object({
  version: z.literal("recovery.landing.reverse.v1"), reversalId: uuid, derivationId: uuid, journalId: uuid,
  allocationId: uuid, amountPence: z.number().int().positive(), reason: z.string().trim().min(1).max(120),
}).strict();

/** M4 extends this port with real provider adapters; M1 accepts synthetic facts only. */
export interface RecoveryOutcomePostingPort {
  approveSyntheticLanding(context: VerifiedTenantContext, input: unknown): Promise<string>;
  reverseSyntheticLanding(context: VerifiedTenantContext, input: unknown): Promise<string>;
}

export class PostgresRecoveryOutcomePostingPort implements RecoveryOutcomePostingPort {
  constructor(private readonly pool: Pool) {}
  async approveSyntheticLanding(context: VerifiedTenantContext, raw: unknown): Promise<string> {
    const input = recoveryLandingApprovalV1.parse(raw);
    return withTenant(this.pool, context, async (db) => (await db.$client.query<{ id: string }>(
      "SELECT app.approve_synthetic_landing($1::jsonb) id", [JSON.stringify(input)],
    )).rows[0]!.id);
  }
  async reverseSyntheticLanding(context: VerifiedTenantContext, raw: unknown): Promise<string> {
    const input = recoveryLandingReversalV1.parse(raw);
    return withTenant(this.pool, context, async (db) => (await db.$client.query<{ id: string }>(
      "SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7) id",
      [context.tenantId, input.reversalId, input.derivationId, input.journalId, input.allocationId, input.amountPence, input.reason],
    )).rows[0]!.id);
  }
}
