import type { Pool } from "pg";
import { z } from "zod";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid();
const base = { version: z.literal("stored-receipt-case-command.v1"), commandId: uuid,
  factLineId: uuid, caseId: uuid, workId: uuid, expectedCaseRevision: z.number().int().safe().positive() };
export const storedReceiptCaseCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("review") }).strict(),
  z.object({ ...base, action: z.literal("approve"), reviewId: uuid, approvalHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
]);
const fraction = z.object({ numerator: z.string().regex(/^-?(0|[1-9][0-9]*)$/u), denominator: z.string().regex(/^[1-9][0-9]*$/u) }).strict();
export const storedReceiptCaseResultV1 = z.object({
  version: z.literal("stored-receipt-case-result.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0),
  jobId: uuid, reviewId: uuid, approvalHash: z.string().regex(/^[a-f0-9]{64}$/u), allocationId: uuid.nullable(), replayed: z.boolean(),
  facts: z.object({ version: z.literal("stored-receipt-case-facts.v1"), currency: z.literal("GBP"), caseId: uuid, workId: uuid, lineId: uuid, lockId: uuid,
    factLineId: uuid, paymentId: uuid, sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), movementId: uuid,
    movementHash: z.string().regex(/^[a-f0-9]{64}$/u), caseRevision: z.number().int().positive(), gross: fraction, net: fraction,
    reversesId: uuid.nullable(), rule: z.enum(["explicit", "separate_invoice", "pro_rata"]), sourceRef: z.string().min(1).max(300),
    policyVersion: z.literal("reference_fee_policy_v3") }).strict(),
}).strict();
export class StoredReceiptCaseAllocationError extends Error {
  constructor(readonly code: string) { super(code); this.name = "StoredReceiptCaseAllocationError"; }
}
/** Consumes stored bridge facts only. Never forwards an amount or an artifact. */
export class StoredReceiptCaseAllocationRepository {
  constructor(private readonly pool: Pool, private readonly environment = process.env.JOBGUARD_ENV ?? "unconfigured") {}
  async command(context: VerifiedTenantContext, jobId: string, digest: string, raw: unknown) {
    if (this.environment !== "synthetic_demo") throw new StoredReceiptCaseAllocationError("STORED_RECEIPT_SYNTHETIC_ONLY");
    const command = storedReceiptCaseCommandV1.safeParse(raw);
    if (!uuid.safeParse(jobId).success || !/^[a-f0-9]{64}$/u.test(digest) || !command.success)
      throw new StoredReceiptCaseAllocationError("INVALID_STORED_RECEIPT_COMMAND");
    // Transport/commit ambiguity and serialization failures remain errors. A caller
    // retries with the SAME command id; it must never synthesize another success.
    return withTenant(practiceMaterialPool(this.pool, digest), context, async db => {
      await db.$client.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");
      const row = (await db.$client.query<{ result: unknown }>(
        "SELECT app.allocate_stored_receipt_line($1,$2,$3,$4::jsonb) result", [context.tenantId, jobId, digest, JSON.stringify(command.data)],
      )).rows[0];
      const result = storedReceiptCaseResultV1.parse(row?.result);
      if (result.jobId !== jobId || result.facts.caseId !== command.data.caseId || result.facts.workId !== command.data.workId || result.facts.factLineId !== command.data.factLineId)
        throw new StoredReceiptCaseAllocationError("STORED_RECEIPT_RESULT_MISMATCH");
      return result;
    });
  }
}
