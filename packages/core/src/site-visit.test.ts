import { describe, expect, it } from "vitest";
import {
 startSiteVisitV1, completeSiteVisitV1, parseCompleteSiteVisit, siteVisitStartedV1, siteVisitCompletedV1, siteAssignedJobsV1, siteOrderLinesV1,
 closeoutQuestionVersion, closeoutQuestionText, siteVisitErrorCodes, siteVisitFailureV1, SiteVisitError, siteVisitHttpStatus,
} from "./site-visit.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const start = { version: "start-site-visit.v1", commandId: id(1) };
const complete = { version: "complete-site-visit.v1", commandId: id(2), closeoutAnswer: "no" };
// ENT-3a's definition "Authority fields" plus the names this piece adds.
const authority = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance",
 "jobId", "visitId", "siteVisitId", "startedAt", "completedAt", "questionVersion"];
const head = { environment: "synthetic_demo", realExternalActions: 0 };
describe("site-visit.v1 boundaries", () => {
 it("[B17] start accepts exactly its minimal input", () => { expect(startSiteVisitV1.parse(start)).toEqual(start); });
 it.each(authority)("[B17] start refuses authority field %s", field => { expect(startSiteVisitV1.safeParse({ ...start, [field]: "tampered" }).success).toBe(false); });
 it("[B17] complete accepts exactly its minimal input for both answers", () => {
  expect(completeSiteVisitV1.parse(complete)).toEqual(complete);
  expect(completeSiteVisitV1.parse({ ...complete, closeoutAnswer: "yes" }).closeoutAnswer).toBe("yes");
 });
 it.each(authority)("[B17] complete refuses authority field %s", field => { expect(completeSiteVisitV1.safeParse({ ...complete, [field]: "tampered" }).success).toBe(false); });
 it("[B17] both commands enforce version and uuid", () => {
  for (const change of [{ version: "old" }, { commandId: "invalid" }]) { expect(startSiteVisitV1.safeParse({ ...start, ...change }).success).toBe(false); expect(completeSiteVisitV1.safeParse({ ...complete, ...change }).success).toBe(false); }
 });
 it("[B6] completing without an answer is refused by the schema", () => {
  const { closeoutAnswer: _removed, ...missing } = complete;
  for (const body of [missing, { ...complete, closeoutAnswer: null }, { ...complete, closeoutAnswer: "" }, { ...complete, closeoutAnswer: "maybe" }, { ...complete, closeoutAnswer: true }, { ...complete, closeoutAnswer: "Yes" }, { ...complete, closeoutAnswer: " yes" }]) expect(completeSiteVisitV1.safeParse(body).success).toBe(false);
 });
 it("[B6] a body valid apart from a missing or null answer is CLOSEOUT_ANSWER_REQUIRED; every other invalid body is INVALID_COMMAND", () => {
  const { closeoutAnswer: _removed, ...missing } = complete;
  expect(parseCompleteSiteVisit(missing)).toEqual({ ok: false, code: "CLOSEOUT_ANSWER_REQUIRED" });
  expect(parseCompleteSiteVisit({ ...complete, closeoutAnswer: null })).toEqual({ ok: false, code: "CLOSEOUT_ANSWER_REQUIRED" });
  for (const body of [{ ...missing, extra: 1 }, { ...missing, commandId: "invalid" }, { ...complete, closeoutAnswer: "" }, { ...complete, closeoutAnswer: "maybe" }, { ...complete, closeoutAnswer: true }, { ...complete, closeoutAnswer: "Yes" }, null, "text", [], undefined]) expect(parseCompleteSiteVisit(body)).toEqual({ ok: false, code: "INVALID_COMMAND" });
  expect(parseCompleteSiteVisit(complete)).toEqual({ ok: true, data: complete });
 });
 it("[B6] the close-out question is the plan's exact words and version", () => {
  expect(closeoutQuestionText).toBe("Did the resident ask for anything extra?"); expect(closeoutQuestionVersion).toBe("closeout-question.v1");
 });
 it("[B18] every code maps to its one status and error bodies carry version and code only", () => {
  const expected = { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, TRACK_FORBIDDEN: 403, VISIT_FORBIDDEN: 403, INVALID_COMMAND: 400, CLOSEOUT_ANSWER_REQUIRED: 400, NOT_FOUND: 404, JOB_NOT_LIVE: 409, IDEMPOTENCY_CONFLICT: 409, VISIT_ALREADY_OPEN: 422, VISIT_ALREADY_COMPLETED: 422, SITE_VISIT_UNAVAILABLE: 503 } as const;
  expect([...siteVisitErrorCodes].sort()).toEqual(Object.keys(expected).sort());
  for (const [code, status] of Object.entries(expected)) { const body = siteVisitFailureV1.parse({ version: "site-visit-error.v1", code }); expect(siteVisitHttpStatus(body.code)).toBe(status); expect(new SiteVisitError(body.code).message).toBe(code); }
  expect(siteVisitFailureV1.safeParse({ version: "site-visit-error.v1", code: "unknown" }).success).toBe(false);
  expect(siteVisitFailureV1.safeParse({ version: "site-visit-error.v1", code: "NOT_FOUND", detail: "text" }).success).toBe(false);
 });
 it("[B2] validates the synthetic results and refuses a changed environment, a real action or an extra key", () => {
  const started = { version: "site-visit-started.v1", ...head, jobId: id(3), visitId: id(4), startedAt: "2026-10-13T09:00:00.123Z" };
  const completed = { version: "site-visit-completed.v1", ...head, jobId: id(3), visitId: id(4), completedAt: "2026-10-13T09:30:00.123Z", closeoutAnswer: "yes" };
  expect(siteVisitStartedV1.parse(started)).toEqual(started); expect(siteVisitCompletedV1.parse(completed)).toEqual(completed);
  for (const change of [{ environment: "production_billing" }, { realExternalActions: 1 }, { price: 1 }]) { expect(siteVisitStartedV1.safeParse({ ...started, ...change }).success).toBe(false); expect(siteVisitCompletedV1.safeParse({ ...completed, ...change }).success).toBe(false); }
  expect(siteVisitCompletedV1.safeParse({ ...completed, closeoutAnswer: "maybe" }).success).toBe(false);
 });
 it("[B15] the read results carry no money, resident or address key", () => {
  const job = { jobId: id(5), workOrderId: id(6), reference: "WO-1", priority: "urgent", issuedOn: "2026-10-08", dueOn: null, openVisitId: null };
  const jobs = { version: "site-assigned-jobs.v1", ...head, jobs: [job], truncated: false };
  const lines = { version: "site-order-lines.v1", ...head, jobId: id(5), workOrderId: id(6), revision: 2, lines: [{ position: 0, scopeItemId: id(7), clientLineReference: "L1", sorCode: "REPAIR-DOOR", description: "Repair internal door", unit: "each", quantity: "1" }] };
  expect(siteAssignedJobsV1.parse(jobs)).toEqual(jobs); expect(siteOrderLinesV1.parse(lines)).toEqual(lines);
  for (const key of ["ratePence", "netPence", "rate", "net", "resident", "contact", "address", "pence"]) {
   expect(siteAssignedJobsV1.safeParse({ ...jobs, jobs: [{ ...job, [key]: 1 }] }).success).toBe(false);
   expect(siteOrderLinesV1.safeParse({ ...lines, lines: [{ ...lines.lines[0], [key]: 1 }] }).success).toBe(false);
  }
  expect(siteAssignedJobsV1.safeParse({ ...jobs, jobs: [{ ...job, priority: "weekly" }] }).success).toBe(false);
  expect(siteAssignedJobsV1.safeParse({ ...jobs, jobs: [{ ...job, openVisitId: id(8), dueOn: "2026-10-22" }], truncated: true }).success).toBe(true);
 });
});
