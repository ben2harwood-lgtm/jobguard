/** Shared transport mapping for Nest and the Next route adapters: database and internal messages never reach the browser. */
const errorStatus: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  SYNTHETIC_ONLY: 403,
  TENANT_FORBIDDEN: 403,
  PRACTICE_FEED_FORBIDDEN: 403,
  NOT_FOUND: 404,
  PRACTICE_FEED_NOT_FOUND: 404,
  INVALID_QUERY: 400,
  INVALID_COMMAND: 400,
  PRACTICE_FEED_NOT_CONNECTED: 409,
  PRACTICE_FEED_DISCONNECTED: 409,
  PRACTICE_FEED_STALE_REVISION: 409,
  IDEMPOTENCY_PAYLOAD_CONFLICT: 409,
  PRACTICE_FEED_DUPLICATE_NOT_FOUND: 409,
  PRACTICE_FEED_DUPLICATE_HELD: 409,
  PRACTICE_FEED_SETTLEMENT_REQUIRED: 409,
  PRACTICE_FEED_INVALID_TRANSITION: 409,
  PRACTICE_FEED_MOVEMENT_NOT_SETTLED: 409,
  PRACTICE_FEED_RECEIPT_MISMATCH: 409,
  PRACTICE_FEED_RECEIPT_ALREADY_MATCHED: 409,
};
export function practiceFeedHttpError(error: unknown) {
  const supplied = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const code = typeof supplied === "string" && Object.hasOwn(errorStatus, supplied) ? supplied : "DATABASE_UNAVAILABLE";
  return { status: errorStatus[code] ?? 503, body: { version: "practice-feed-error.v1" as const, code } };
}

export function practiceFeedSession(cookie: string | undefined) {
  const matches = cookie?.split(";").map((part) => part.trim()).filter((part) => part.startsWith("jg_session="));
  return matches?.length === 1 ? matches[0]!.slice("jg_session=".length) : undefined;
}

/** URLSearchParams silently collapses duplicate values; an ambiguous query fails closed instead. */
export function practiceFeedHttpQuery(entries: Iterable<readonly [string, string]>) {
  const query: Record<string, string> = Object.create(null) as Record<string, string>;
  query.version = "practice-feed-query.v1";
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (seen.has(key)) throw Object.assign(new Error("INVALID_QUERY"), { code: "INVALID_QUERY" });
    seen.add(key);
    query[key] = value;
  }
  return query;
}
