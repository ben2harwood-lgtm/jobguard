/** Shared transport mapping: database/internal messages are never returned to the browser. */
const errorStatus: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  SYNTHETIC_ONLY: 403,
  TENANT_FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_QUERY: 400,
  INVALID_COMMAND: 400,
  ALLOCATION_FORBIDDEN: 403,
  ALLOCATION_NOT_FOUND: 404,
  ALLOCATION_INVALID_COMMAND: 400,
  ALLOCATION_TAX_BASIS_UNCERTAIN: 409,
  ALLOCATION_AMOUNT_INVALID: 400,
  ALLOCATION_NOT_PREPARED: 409,
  ALLOCATION_FEED_REQUIRED: 409,
  ALLOCATION_APPROVAL_MISMATCH: 409,
  ALLOCATION_AUDIT_REQUIRED: 409,
  ALLOCATION_CASE_INVOICE_MISMATCH: 409,
  ALLOCATION_CHANGE_ALREADY_RECORDED: 409,
  ALLOCATION_EFFECT_REQUIRED: 409,
  ALLOCATION_ELIGIBILITY_REQUIRED: 409,
  ALLOCATION_EVIDENCE_INVALID: 409,
  ALLOCATION_EXCEEDS_AVAILABLE: 409,
  ALLOCATION_EXCEEDS_CLAIM: 409,
  ALLOCATION_REVERSAL_EXCEEDS_AVAILABLE: 409,
  ALLOCATION_SETTLED_SOURCE_REQUIRED: 409,
  ALLOCATION_SOURCE_MISMATCH: 409,
  ALLOCATION_STALE_REVISION: 409,
  IDEMPOTENCY_PAYLOAD_CONFLICT: 409,
};
export function practiceAllocationHttpError(error: unknown) {
  const supplied = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const code = typeof supplied === "string" && Object.hasOwn(errorStatus, supplied) ? supplied : "DATABASE_UNAVAILABLE";
  return { status: errorStatus[code] ?? 503, body: { version: "practice-allocation-error.v1" as const, code } };
}

export function practiceAllocationSession(cookie: string | undefined) {
  const matches = cookie?.split(";").map((part) => part.trim()).filter((part) => part.startsWith("jg_session="));
  return matches?.length === 1 ? matches[0]!.slice("jg_session=".length) : undefined;
}

/** URLSearchParams otherwise silently collapses duplicate values; ambiguous queries fail closed. */
export function practiceAllocationHttpQuery(entries: Iterable<readonly [string, string]>) {
  const query: Record<string, string> = Object.create(null) as Record<string, string>;
  query.version = "practice-allocation-query.v1";
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (seen.has(key)) throw Object.assign(new Error("INVALID_QUERY"), { code: "INVALID_QUERY" });
    seen.add(key);
    query[key] = value;
  }
  return query;
}
