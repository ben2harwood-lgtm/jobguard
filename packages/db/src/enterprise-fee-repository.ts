import type { Pool } from "pg";
import { z } from "zod";
import { EnterpriseFeeError, enterpriseFeeErrorCodes } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** ENT-7a: finance asks the database to derive; it supplies no amount, rate, origin or allocation. */
export const enterpriseFeeDeriveCommandV1 = z.object({ version: z.literal("enterprise-fee-derive.v1"), commandId: z.guid(),
  agreementVersionId: z.guid(), period: z.string().regex(/^[2-9]\d{3}-(?:0[1-9]|1[0-2])$/u) }).strict();
export type EnterpriseFeeDerivationRead = {
  id: string; agreementVersionId: string; period: string; recordedCutoff: string; inputHash: string;
  qualifyingPrincipal: { numerator: string; denominator: string }; cumulativeFeePence: number;
  contributions: { extraId: string; originKind: string; exportLineId: string; allocationId: string; runId: string; rule: string;
    qualifyingPrincipal: { numerator: string; denominator: string } }[];
};

export function enterpriseFeeDatabaseFailure(error: unknown): never {
  if (error instanceof EnterpriseFeeError) throw error;
  const message = (error as { message?: string }).message;
  const known = enterpriseFeeErrorCodes.find(code => code === message);
  if (known) throw new EnterpriseFeeError(known);
  const code = (error as { code?: string }).code;
  if (code === "42501") throw new EnterpriseFeeError("EXTRA_FORBIDDEN");
  if (code === "23505") throw new EnterpriseFeeError("COMMAND_CONFLICT");
  throw new EnterpriseFeeError("OUTCOME_UNKNOWN");
}

export class EnterpriseFeeRepository {
  constructor(private readonly pool: Pool) {}
  async derive(context: VerifiedTenantContext, session: string, raw: unknown): Promise<{ derivationId: string; replayed: boolean }> {
    const input = enterpriseFeeDeriveCommandV1.safeParse(raw);
    if (!input.success || !z.guid().safeParse(session).success) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
    try {
      return await withTenant(this.pool, context, async db => (await db.$client.query("SELECT app.ef_derive($1,$2,$3,$4) result",
        [session, input.data.commandId, input.data.agreementVersionId, input.data.period])).rows[0].result);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
  /** Finance-only drill-down of one stored derivation. Display only; posting and approval are later steps. */
  async read(context: VerifiedTenantContext, session: string, derivationId: string): Promise<EnterpriseFeeDerivationRead> {
    if (!z.guid().safeParse(derivationId).success || !z.guid().safeParse(session).success) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_read($1,$2) result", [session, derivationId])).rows[0].result as EnterpriseFeeDerivationRead);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
}
