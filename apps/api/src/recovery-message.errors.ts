import { ZodError } from "zod";

const CONFLICTS = new Set([
  "RECOVERY_MESSAGE_CHANGED", "RECOVERY_MESSAGE_EXPIRED", "RECOVERY_MESSAGE_STALE_REVISION", "RECOVERY_MESSAGE_COMMAND_CONFLICT", "RECOVERY_MESSAGE_EXISTING_EFFECT",
  "RECOVERY_MESSAGE_NOT_APPROVED", "RECOVERY_MESSAGE_REVOKED", "RECOVERY_MESSAGE_BLOCKED", "RECOVERY_MESSAGE_ALREADY_DELIVERED", "RECOVERY_MESSAGE_RECONCILE_REQUIRED",
  "RECOVERY_MESSAGE_NOT_RECONCILABLE", "RECOVERY_MESSAGE_NOT_REVOCABLE", "RECOVERY_MESSAGE_NOT_ADVANCEABLE", "RECOVERY_MESSAGE_EXECUTION_PENDING",
  "RECOVERY_MESSAGE_SOURCES_REQUIRED", "RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED", "RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE", "RECOVERY_MESSAGE_CONTENT_INVALID",
]);

/**
 * One server-side mapping from an internal failure to a client-safe status and code. Only the listed typed codes pass
 * through; PostgreSQL, driver, parser and programming error text never reaches a client, and an unlisted
 * typed-looking code is treated as unknown.
 */
export function recoveryMessageFailure(error: unknown): { status: number; code: string } {
  if (error instanceof ZodError || error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return { status: 400, code: "INVALID_COMMAND" };
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return { status: 401, code: message };
  if (message === "FORBIDDEN" || message === "RECOVERY_MESSAGE_FORBIDDEN") return { status: 403, code: message };
  if (message === "SYNTHETIC_MODE_REQUIRED") return { status: 400, code: message };
  if (message === "RECOVERY_MESSAGE_NOT_FOUND") return { status: 404, code: message };
  if (CONFLICTS.has(message)) return { status: 409, code: message };
  return { status: 500, code: "INTERNAL_ERROR" };
}
