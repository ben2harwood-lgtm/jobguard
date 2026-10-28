import type { Pool } from "pg";
import { z } from "zod";
import { EnterpriseFeeError, enterpriseFeeErrorCodes } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** ENT-7a: finance asks the database to derive; it supplies no amount, rate, origin or allocation. */
export const enterpriseFeeDeriveCommandV1 = z.object({ version: z.literal("enterprise-fee-derive.v1"), commandId: z.guid(),
  agreementVersionId: z.guid(), period: z.string().regex(/^[2-9]\d{3}-(?:0[1-9]|1[0-2])$/u) }).strict();
const period = z.string().regex(/^[2-9]\d{3}-(?:0[1-9]|1[0-2])$/u);
/** ENT-7b: finance prepares, disputes and approves an exact statement revision. Amounts are only echoed for binding. */
export const enterpriseFeePrepareStatementV1 = z.object({ version: z.literal("enterprise-fee-prepare-statement.v1"), commandId: z.guid(), period }).strict();
export const enterpriseFeeDisputeStatementV1 = z.object({ version: z.literal("enterprise-fee-dispute-statement.v1"), commandId: z.guid(), statementId: z.guid(),
  reasonCode: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u) }).strict();
export const enterpriseFeeApproveStatementV1 = z.object({ version: z.literal("enterprise-fee-approve-statement.v1"), commandId: z.guid(), statementId: z.guid(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u), totalDeltaPence: z.number().int().refine(Number.isSafeInteger), expiresAt: z.iso.datetime({ offset: true }) }).strict();
/** ENT-7c: finance posts an approved revision by presenting the exact authorisation its approval created. */
export const enterpriseFeePostStatementV1 = z.object({ version: z.literal("enterprise-fee-post-statement.v1"), commandId: z.guid(), statementId: z.guid(), authorizationId: z.guid() }).strict();
/** ReconcileExportedDuplicate: explicit finance approval; amounts come only from stored billing facts. */
export const enterpriseReconcileExportedDuplicateV1 = z.object({ version: z.literal("enterprise-reconcile-exported-duplicate.v1"),
  commandId: z.guid(), jobId: z.guid(), duplicateId: z.guid(), canonicalId: z.guid() }).strict()
  .refine(x => x.duplicateId !== x.canonicalId);
export type EnterpriseDuplicateCorrection = { correctionId: string; linkId: string; contentHash: string; replayed: boolean;
  corrections: { runId: string; exportLineId: string; source: string; invoiceNumber: string; externalInvoiceLineId: string;
    kind: "credit_instruction"; netPence: number; grossPence: number }[] };
export type EnterpriseFeePosting = { id: string; kind: "accrual" | "compensation"; agreementVersionId: string; amountPence: number; compensatesFeeId: string | null;
  environment: "synthetic_demo"; lines: { account: string; debitPence: number; creditPence: number }[] };
export type EnterpriseFeeStatementRead = {
  id: string; period: string; revision: number; predecessorId: string | null; contentHash: string; totalDeltaPence: number;
  sections: { agreementVersionId: string; derivationId: string; cumulativeFeePence: number; priorNetPostedPence: number; deltaPence: number }[];
  superseded: boolean; dispute: { reason: string } | null; approval: { authorizationId: string; expiresAt: string } | null;
};
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
  private parse<T extends z.ZodType>(schema: T, raw: unknown, session: string): z.infer<T> {
    const parsed = schema.safeParse(raw);
    if (!parsed.success || !z.guid().safeParse(session).success) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
    return parsed.data;
  }
  async prepareStatement(context: VerifiedTenantContext, session: string, raw: unknown): Promise<{ statementId: string; replayed: boolean }> {
    const input = this.parse(enterpriseFeePrepareStatementV1, raw, session);
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_prepare_statement($1,$2,$3) result", [session, input.commandId, input.period])).rows[0].result);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
  async disputeStatement(context: VerifiedTenantContext, session: string, raw: unknown): Promise<{ disputeId: string; replayed: boolean }> {
    const input = this.parse(enterpriseFeeDisputeStatementV1, raw, session);
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_dispute_statement($1,$2,$3,$4) result", [session, input.commandId, input.statementId, input.reasonCode])).rows[0].result);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
  async approveStatement(context: VerifiedTenantContext, session: string, raw: unknown): Promise<{ authorizationId: string; replayed: boolean }> {
    const input = this.parse(enterpriseFeeApproveStatementV1, raw, session);
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_approve_statement($1,$2,$3,$4,$5,$6) result",
          [session, input.commandId, input.statementId, input.contentHash, input.totalDeltaPence, input.expiresAt])).rows[0].result);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
  async readStatement(context: VerifiedTenantContext, session: string, statementId: string): Promise<EnterpriseFeeStatementRead> {
    if (!z.guid().safeParse(statementId).success || !z.guid().safeParse(session).success) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_read_statement($1,$2) result", [session, statementId])).rows[0].result as EnterpriseFeeStatementRead);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
  async postStatement(context: VerifiedTenantContext, session: string, raw: unknown): Promise<{ statementId: string; replayed: boolean; journals?: number }> {
    const input = this.parse(enterpriseFeePostStatementV1, raw, session);
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_post_statement($1,$2,$3,$4) result", [session, input.commandId, input.statementId, input.authorizationId])).rows[0].result);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
  async reconcileExportedDuplicate(context: VerifiedTenantContext, session: string, raw: unknown): Promise<EnterpriseDuplicateCorrection> {
    const input = this.parse(enterpriseReconcileExportedDuplicateV1, raw, session);
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_reconcile_exported_duplicate($1,$2,$3,$4,$5) result",
          [session, input.commandId, input.jobId, input.duplicateId, input.canonicalId])).rows[0].result as EnterpriseDuplicateCorrection);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
  async readPostings(context: VerifiedTenantContext, session: string, statementId: string): Promise<EnterpriseFeePosting[]> {
    if (!z.guid().safeParse(statementId).success || !z.guid().safeParse(session).success) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
    try {
      return await withTenant(this.pool, context, async db =>
        (await db.$client.query("SELECT app.ef_read_postings($1,$2) result", [session, statementId])).rows[0].result as EnterpriseFeePosting[]);
    } catch (error) { enterpriseFeeDatabaseFailure(error); }
  }
}
