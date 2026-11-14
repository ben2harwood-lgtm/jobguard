import type { Pool } from "pg";
import { z } from "zod";
import { approveBillability, reviewBillability, MAX_MONEY_PENCE, type RecoveryBillabilityApproval, type RecoveryBillabilityReview } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { RequestBindingRefusedError } from "./request-binding-error.js";

const id = z.string().uuid().refine(value => value === value.toLowerCase());
const base = { version: z.literal("recovery-billability-command.v1"), commandId: id, caseId: id, workId: id, lineId: id, expectedCaseRevision: z.number().int().positive().safe() };
// Stored authority fields (including lockId) cannot occur in either command.
export const persistedBillabilityCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("review"), claimedEligiblePrincipalPence: z.number().int().nonnegative().max(MAX_MONEY_PENCE), reasons: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ ...base, action: z.literal("approve"), reviewCommandId: id }).strict(),
]);
type Result = RecoveryBillabilityReview | RecoveryBillabilityApproval;
type Prepared = { replay?: Result; snapshot: unknown; command: unknown; authority: unknown; review: unknown };

/** DARK M4-2 integration. No HTTP/provider/fee writer; the database refuses live use.
 * Both calls run under the same transaction and business locks, before audit.
 * Replays return their first immutable result; fresh approvals re-read stored facts.
 */
export class RecoveryBillabilityRepository {
  constructor(private readonly pool: Pool, private readonly environment = process.env.JOBGUARD_ENV ?? "unconfigured") {}
  async read(context: VerifiedTenantContext, jobId: string, caseId: string, sessionDigest: string): Promise<{
    version: "recovery-billability-view.v1"; caseId: string; caseRevision: number;
    lines: { workId: string; lineId: string }[];
    reviews: { workId: string; lineId: string; review: RecoveryBillabilityReview; approved: boolean }[];
  }> {
    if (this.environment !== "synthetic_demo") throw new Error("BILLABILITY_NOT_FOUND");
    const job = id.parse(jobId), recoveryCase = id.parse(caseId);
    return withTenant(this.pool, context, async db => (await db.$client.query(
      "SELECT app.read_recovery_billability($1,$2,$3) result", [job, recoveryCase, sessionDigest],
    )).rows[0]!.result);
  }
  async command(context: VerifiedTenantContext, jobId: string, sessionDigest: string, raw: unknown): Promise<Result> {
    if (this.environment !== "synthetic_demo") throw new Error("BILLABILITY_FORBIDDEN");
    const parsed = persistedBillabilityCommandV1.safeParse(raw);
    if (!parsed.success) throw new Error("INVALID_BILLABILITY_INPUT");
    const command = parsed.data, job = id.parse(jobId);
    return withTenant(this.pool, context, async db => {
      const invoke = async (result: Result | null): Promise<Prepared> => (await db.$client.query<{ result: Prepared }>(
        "SELECT app.recovery_billability($1,$2,$3::jsonb,$4::jsonb) result", [job, sessionDigest, command, result],
      )).rows[0]!.result;
      const prepared = await invoke(null);
      if (prepared.replay) return prepared.replay;
      const result = command.action === "review"
        ? reviewBillability(prepared.command, prepared.snapshot, prepared.authority)
        : approveBillability(prepared.command, prepared.review, prepared.snapshot, prepared.authority);
      return (await invoke(result)).replay!;
    }).catch((error: unknown) => {
      if (typeof error === "object" && error !== null &&
          "code" in error && error.code === "23505" &&
          "constraint" in error && error.constraint === "billability_one_line_approval") {
        throw new Error("BILLABILITY_LINE_ALREADY_APPROVED");
      }
      // LP-6d: an unbound or mismatched request (for example another tenant's context) is refused as forbidden.
      if (error instanceof RequestBindingRefusedError || (typeof error === "object" && error !== null && "code" in error && error.code === "42501"
        && "message" in error && error.message === "REQUEST_BINDING_REFUSED")) throw new Error("BILLABILITY_FORBIDDEN");
      throw error;
    });
  }
}
