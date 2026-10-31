import type { Pool } from "pg";
import { z } from "zod";
import { RecoveryLineAllocationRepository, StoredReceiptCaseAllocationRepository,
 neutralReceiptFactCommandV1, storedReceiptCaseCommandV1 } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";

export class ReceiptCaseAllocationApplicationError extends Error {
 constructor(readonly code: "SYNTHETIC_MODE_REQUIRED" | "INVALID_RECEIPT_CASE_COMMAND" | "INVALID_RECEIPT_CASE_QUERY") { super(code); }
}
// Each saved review has its own approval. No caller-supplied money or principal.
export const receiptCaseAllocationCommandV1 = z.discriminatedUnion("target", [
 z.object({ version: z.literal("receipt-case-allocation-command.v1"), target: z.literal("receipt_lines"), command: neutralReceiptFactCommandV1 }).strict(),
 z.object({ version: z.literal("receipt-case-allocation-command.v1"), target: z.literal("case"), command: storedReceiptCaseCommandV1 }).strict(),
]);
type Stores = {
 lines: Pick<RecoveryLineAllocationRepository, "view" | "command">;
 cases: Pick<StoredReceiptCaseAllocationRepository, "command">;
};
export class ReceiptCaseAllocationApplication {
 private readonly access: PracticeAccess;
 private readonly stores: Stores;
 constructor(pool: Pool, sessionId?: string, stores?: Stores) {
  this.access = new PracticeAccess(pool, sessionId);
  this.stores = stores ?? { lines: new RecoveryLineAllocationRepository(pool), cases: new StoredReceiptCaseAllocationRepository(pool) };
 }
 private async authorize(jobId: string) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ReceiptCaseAllocationApplicationError("SYNTHETIC_MODE_REQUIRED");
  return this.access.job(jobId);
 }
 async view(jobId: string, query: unknown = {}) {
  const auth = await this.authorize(jobId);
  if (!z.object({}).strict().safeParse(query).success) throw new ReceiptCaseAllocationApplicationError("INVALID_RECEIPT_CASE_QUERY");
  return this.stores.lines.view(auth.context, { membershipId: auth.membershipId, identityUserId: auth.identityUserId }, auth.digest, jobId);
 }
 async command(jobId: string, raw: unknown) {
  const auth = await this.authorize(jobId);
  let body = raw;
  if (typeof raw === "function") {
   try { body = await raw(); } catch { throw new ReceiptCaseAllocationApplicationError("INVALID_RECEIPT_CASE_COMMAND"); }
  }
  const parsed = receiptCaseAllocationCommandV1.safeParse(body);
  if (!parsed.success) throw new ReceiptCaseAllocationApplicationError("INVALID_RECEIPT_CASE_COMMAND");
  const input = parsed.data;
  if (input.target === "case") return this.stores.cases.command(auth.context, jobId, auth.digest, input.command);
  return this.stores.lines.command(auth.context, { membershipId: auth.membershipId, identityUserId: auth.identityUserId }, auth.digest, jobId, input.command);
 }
}

/** Closed list: SQL diagnostics never become an accidental data-disclosure API. */
export function receiptCaseAllocationFailure(error: unknown): { status: number; code: string } {
 const code = error instanceof Error ? ("code" in error && typeof error.code === "string" && !/^[0-9A-Z]{5}$/u.test(error.code) ? error.code : error.message) : "";
 if (code === "UNAUTHENTICATED") return { status: 401, code };
 if (["NOT_FOUND", "RECEIPT_LINE_FORBIDDEN", "FORBIDDEN", "STORED_RECEIPT_FORBIDDEN"].includes(code)) return { status: 404, code: "NOT_FOUND" };
 if (["SYNTHETIC_MODE_REQUIRED", "RECEIPT_LINE_SYNTHETIC_ONLY", "STORED_RECEIPT_SYNTHETIC_ONLY"].includes(code)) return { status: 403, code: "SYNTHETIC_MODE_REQUIRED" };
 if (["INVALID_RECEIPT_CASE_COMMAND", "INVALID_RECEIPT_CASE_QUERY"].includes(code)) return { status: 400, code };
 if (["STORED_RECEIPT_APPROVAL_CHANGED", "STORED_RECEIPT_IDEMPOTENCY_CONFLICT", "STORED_RECEIPT_STALE", "RECEIPT_LINE_APPROVAL_CHANGED",
  "RECEIPT_LINE_SOURCE_CHANGED", "RECEIPT_LINE_IDEMPOTENCY_CONFLICT", "RECEIPT_LINE_CAPACITY_EXCEEDED", "RECEIPT_LINE_NOT_AVAILABLE",
  "STORED_RECEIPT_LINE_ALREADY_BOUND", "STORED_RECEIPT_LINE_BINDING_REQUIRED", "STORED_RECEIPT_CASE_SOURCE_REQUIRED", "RECEIPT_LINE_SETTLEMENT_REQUIRED"].includes(code)) return { status: 409, code };
 return { status: 503, code: "RECEIPT_CASE_ALLOCATION_UNAVAILABLE" };
}
