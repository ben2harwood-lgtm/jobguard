import { HttpException } from "@nestjs/common";
import { CommandError, PracticeAccessError, WatchdogError } from "@jobguard/db";
import { JobWorkStateError } from "@jobguard/core";
import { ZodError } from "zod";

// Exact domain failures emitted by these operational repositories. Never infer
// status from prefixes, SQLSTATEs, driver text or an error's supplied name.
const CONFLICTS = new Set([
  "STALE_MATERIAL_RATE_REVISION", "STALE_MATERIAL_REQUIREMENT_REVISION",
  "STALE_PURCHASE_ORDER_REVISION", "PURCHASE_ORDER_AUTHORITY_STALE", "MATERIAL_RATE_NOT_COMPARABLE",
  "STALE_DOCUMENT_INTAKE", "STALE_GOODS_RECEIPT", "STALE_SUPPLIER_FACTS",
  "PURCHASE_ORDER_REQUIRED", "DELIVERY_DOCUMENT_REQUIRED", "SOURCE_DISPOSITION_REQUIRED",
  "CONFIRMED_MATCH_SOURCES_REQUIRED", "CONFIRMED_SOURCE_FACTS_REQUIRED", "FINDING_SUPERSEDED",
  "REVIEW_REVISION_CONFLICT", "SUPERSESSION_REVISION_CONFLICT",
]);
const INVALID = new Set([
  "UNKNOWN_FIXTURE_ALIAS", "DOCUMENT_TYPE_MISMATCH", "ARITHMETIC_MISMATCH",
  "UNRELATED_SUPPLIER_BILLS", "REPLACEMENT_BILL_NOT_LOWER", "INVALID_ADVISORY_BUDGET",
]);
const NOT_FOUND = new Set([
  "MATERIAL_REQUIREMENT_NOT_FOUND", "SUPPLIER_PROPOSAL_NOT_FOUND", "FINDING_NOT_FOUND", "DECISION_NOT_FOUND_FOR_JOB",
]);

/** Controller-local transport boundary; application authorization runs first.
 * Existing typed filters retain their exact errors, including linked-job offers.
 * Unknown failures remain 500 and never expose internal messages or SQL details.
 */
export async function laterOperationalCall<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof PracticeAccessError || error instanceof WatchdogError ||
      error instanceof JobWorkStateError || error instanceof HttpException) throw error;
    if (error instanceof ZodError) throw new HttpException({ code: "INVALID_COMMAND" }, 400);
    if (error instanceof CommandError) {
      throw new HttpException({ code: error.code }, error.code === "COMMAND_CONFLICT" ? 409 : 403);
    }
    // Legacy domain failures are plain Errors. A driver or decorated error with
    // the same text is still an unknown fault, even when its message matches.
    if (error instanceof Error && Object.getPrototypeOf(error) === Error.prototype && !("code" in error)) {
      const code = error.message;
      const status = CONFLICTS.has(code) ? 409 : INVALID.has(code) ? 400 : NOT_FOUND.has(code) ? 404 : undefined;
      if (status) throw new HttpException({ code }, status);
    }
    throw new HttpException({ code: "INTERNAL_ERROR" }, 500);
  }
}
