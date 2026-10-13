import { z } from "zod";
const uuid = z.string().uuid();
const reviewedText = (maximum: number) => z.string().min(1).max(maximum).refine(value => /\S/u.test(value));
/** Job identity comes from the route; authority comes only from the persisted session and database. */
export const logSiteExtraV1 = z.object({ version: z.literal("log-site-extra.v1"), commandId: uuid, note: reviewedText(5000), description: reviewedText(500) }).strict();
export const siteExtraLoggedV1 = z.object({ version: z.literal("site-extra-logged.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), jobId: uuid, extraId: uuid, state: z.literal("logged") }).strict();
export const siteExtraErrorCodes = ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "TRACK_FORBIDDEN", "EXTRA_FORBIDDEN", "INVALID_COMMAND", "NOT_FOUND", "COMMAND_CONFLICT", "STALE_REVISION", "SITE_EXTRA_UNAVAILABLE", "PHOTO_NOT_ACCEPTED", "CONFIRMATION_MISMATCH"] as const;
export type SiteExtraErrorCode = typeof siteExtraErrorCodes[number];
export const siteExtraFailureV1 = z.object({ version: z.literal("site-extra-error.v1"), code: z.enum(siteExtraErrorCodes) }).strict();
export class SiteExtraError extends Error {
 constructor(readonly code: SiteExtraErrorCode) { super(code); this.name = "SiteExtraError"; }
}
export function siteExtraHttpStatus(code: SiteExtraErrorCode): number {
 const status: Record<SiteExtraErrorCode, number> = { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, TRACK_FORBIDDEN: 403, EXTRA_FORBIDDEN: 403, INVALID_COMMAND: 400, NOT_FOUND: 404, COMMAND_CONFLICT: 409, STALE_REVISION: 409, SITE_EXTRA_UNAVAILABLE: 503, PHOTO_NOT_ACCEPTED: 422, CONFIRMATION_MISMATCH: 422 };
 return status[code];
}
