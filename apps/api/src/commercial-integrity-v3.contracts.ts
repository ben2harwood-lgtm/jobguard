import { z } from "zod";
// Private source imports until the coordinator integrates CH6-C/P barrels.
export { commercialIntegrityReviewV3Schema } from "../../../packages/core/dist/commercial-integrity-v3.js";
export const commercialIntegrityQueryV3 = z.object({ version: z.literal("commercial-integrity-query.v3").optional() }).strict();
export const integrityFailureStatuses = {
 UNAUTHENTICATED: 401, NOT_FOUND: 404, SYNTHETIC_MODE_REQUIRED: 403,
 INVALID_INTEGRITY_QUERY: 400, INVALID_INTEGRITY_REVIEW: 400,
 IDEMPOTENCY_CONFLICT: 409, INTEGRITY_SOURCE_CHANGED: 409, INTEGRITY_RETRY_REQUIRED: 409,
 INTEGRITY_FAMILY_UNAVAILABLE: 503, INTEGRITY_SOURCE_UNAVAILABLE: 503, INTEGRITY_UNAVAILABLE: 503,
} as const;
export type IntegrityFailureCode = keyof typeof integrityFailureStatuses;
export class IntegrityV3Error extends Error {
 constructor(readonly code: IntegrityFailureCode) { super(code); }
}
export function integrityV3Failure(error: unknown) {
 const code = error instanceof IntegrityV3Error ? error.code : "INTEGRITY_UNAVAILABLE";
 return { status: integrityFailureStatuses[code], body: { code } };
}
