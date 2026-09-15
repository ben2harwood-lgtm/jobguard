import type { Pool } from "pg";
import { z } from "zod";
import { syntheticLandingCommandV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid();
export const recoveryLandingPostingIdsV1 = z.object({ allocationId: uuid, derivationId: uuid, journalId: uuid }).passthrough();
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
    const input = { ...syntheticLandingCommandV1.parse(raw), ...recoveryLandingPostingIdsV1.parse(raw) };
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
