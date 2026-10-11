import { ZodError } from "zod";

/**
 * One server-side mapping from an internal failure to a client-safe status and code.
 * Only typed pack codes pass through; PostgreSQL, driver, parser and programming error text never reaches a client.
 */
export function evidencePackFailure(error: unknown): { status: number; code: string } {
  if (error instanceof ZodError || error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return { status: 400, code: "INVALID_COMMAND" };
  const message = error instanceof Error ? error.message : "";
  if (message === "NOT_FOUND") return { status: 404, code: message };
  if (message === "UNAUTHENTICATED") return { status: 401, code: message };
  if (message === "FORBIDDEN") return { status: 403, code: message };
  if (message === "SYNTHETIC_MODE_REQUIRED") return { status: 400, code: message };
  if (/^EVIDENCE_PACK_[A-Z_]+$/u.test(message)) {
    return { status: message.includes("NOT_FOUND") ? 404 : /STALE|CONFLICT/u.test(message) ? 409 : 400, code: message };
  }
  return { status: 500, code: "INTERNAL_ERROR" };
}
