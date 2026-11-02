import { utcDatetimeV1 } from "./datetime.js";
import { z } from "zod";
const uuid = z.guid({ error: "Invalid uuid" });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
/** The plan's exact words (BUILD_PLAN.md section 9.2, ENT-3); no screen shows them in this piece. */
export const closeoutQuestionVersion = "closeout-question.v1" as const;
export const closeoutQuestionText = "Did the resident ask for anything extra?" as const;
export const closeoutAnswers = ["yes", "no"] as const;
export type CloseoutAnswer = typeof closeoutAnswers[number];
/** The job and the visit come from the route path and never from the body; authority comes only from the persisted session and the database. */
export const startSiteVisitV1 = z.object({ version: z.literal("start-site-visit.v1"), commandId: uuid }).strict();
export const completeSiteVisitV1 = z.object({ version: z.literal("complete-site-visit.v1"), commandId: uuid, closeoutAnswer: z.enum(closeoutAnswers) }).strict();
const completeWithoutAnswerCheck = z.object({ version: z.literal("complete-site-visit.v1"), commandId: uuid, closeoutAnswer: z.null().optional() }).strict();
/** A body that is valid apart from a missing or null answer is CLOSEOUT_ANSWER_REQUIRED; every other invalid body is INVALID_COMMAND. */
export function parseCompleteSiteVisit(raw: unknown): { ok: true; data: z.infer<typeof completeSiteVisitV1> } | { ok: false; code: "CLOSEOUT_ANSWER_REQUIRED" | "INVALID_COMMAND" } {
 const body = completeSiteVisitV1.safeParse(raw);
 if (body.success) return { ok: true, data: body.data };
 return { ok: false, code: completeWithoutAnswerCheck.safeParse(raw).success ? "CLOSEOUT_ANSWER_REQUIRED" : "INVALID_COMMAND" };
}
const head = { environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0) };
export const siteVisitStartedV1 = z.object({ version: z.literal("site-visit-started.v1"), ...head, jobId: uuid, visitId: uuid, startedAt: utcDatetimeV1 }).strict();
export const siteVisitCompletedV1 = z.object({ version: z.literal("site-visit-completed.v1"), ...head, jobId: uuid, visitId: uuid, completedAt: utcDatetimeV1, closeoutAnswer: z.enum(closeoutAnswers) }).strict();
/** No money field, no resident field and no address in either read (the site worker sees the work, not the price or the person). */
export const siteAssignedJobsV1 = z.object({
 version: z.literal("site-assigned-jobs.v1"), ...head,
 jobs: z.array(z.object({ jobId: uuid, workOrderId: uuid, reference: z.string().min(1).max(100), priority: z.enum(["routine", "urgent", "emergency"]), issuedOn: day, dueOn: day.nullable(), openVisitId: uuid.nullable() }).strict()).max(200),
 truncated: z.boolean(),
}).strict();
export const siteOrderLinesV1 = z.object({
 version: z.literal("site-order-lines.v1"), ...head, jobId: uuid, workOrderId: uuid, revision: z.number().int().positive(),
 lines: z.array(z.object({ position: z.number().int().nonnegative(), scopeItemId: uuid, clientLineReference: z.string().nullable(), sorCode: z.string().min(1), description: z.string(), unit: z.string().min(1), quantity: z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/u) }).strict()).max(1000),
}).strict();
export const siteVisitErrorCodes = ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "TRACK_FORBIDDEN", "VISIT_FORBIDDEN", "INVALID_COMMAND", "CLOSEOUT_ANSWER_REQUIRED", "NOT_FOUND", "JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT", "VISIT_ALREADY_OPEN", "VISIT_ALREADY_COMPLETED", "SITE_VISIT_UNAVAILABLE"] as const;
export type SiteVisitErrorCode = typeof siteVisitErrorCodes[number];
export const siteVisitFailureV1 = z.object({ version: z.literal("site-visit-error.v1"), code: z.enum(siteVisitErrorCodes) }).strict();
export class SiteVisitError extends Error {
 constructor(readonly code: SiteVisitErrorCode) { super(code); this.name = "SiteVisitError"; }
}
export function siteVisitHttpStatus(code: SiteVisitErrorCode): number {
 const status: Record<SiteVisitErrorCode, number> = { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, TRACK_FORBIDDEN: 403, VISIT_FORBIDDEN: 403, INVALID_COMMAND: 400, CLOSEOUT_ANSWER_REQUIRED: 400, NOT_FOUND: 404, JOB_NOT_LIVE: 409, IDEMPOTENCY_CONFLICT: 409, VISIT_ALREADY_OPEN: 422, VISIT_ALREADY_COMPLETED: 422, SITE_VISIT_UNAVAILABLE: 503 };
 return status[code];
}
