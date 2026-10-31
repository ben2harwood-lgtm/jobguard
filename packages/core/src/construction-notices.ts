import { z } from "zod";
import { utcDatetimeV1 } from "./datetime.js";

/** Pure fixture model only. No routes, persistence, provider, AI wording or legal templates. */
export const CONSTRUCTION_NOTICES_ENABLED = false as const;
export const CONSTRUCTION_NOTICE_WATERMARK = "FIXTURE, NOT REVIEWED — NOT A NOTICE — NOT FOR SERVICE" as const;
const id = z.guid().transform(value => value.toLowerCase());
const text = z.string().trim().min(1).max(200);
const revision = z.number().int().positive().max(2147483647);
const context = { tenantId: id, jobId: id };

export const noticeProfessionalReviewV1 = z.object({
  version: z.literal("notice.professional-review.v1"), reviewerReference: text, qualificationReference: text,
  signedAt: utcDatetimeV1, profileId: text, profileVersion: revision, templateVersion: text,
  requiredFactsVersion: text, dateRulesVersion: text, serviceAssumptionsVersion: text, fixtureSuiteVersion: text,
  signoffEvidenceId: id,
}).strict();
export const noticeRuleProfileV1 = z.object({
  version: z.literal("notice.rule-profile.v1"), id: text, revision,
  classification: z.literal("fixture_not_reviewed"), jurisdiction: z.literal("fictional"),
  contract: text, sourceReference: text, templateVersion: text, requiredFactsVersion: text,
  dateRulesVersion: text, serviceAssumptionsVersion: text, fixtureSuiteVersion: text,
  requiredFacts: z.array(z.enum(["dueDate", "contractReference", "triggerEvidenceId"])).min(1),
  trigger: z.literal("dueDate"), offsetDays: z.number().int().min(-366).max(366),
  dayCount: z.enum(["calendar", "working"]), roll: z.enum(["none", "next_working"]),
  calendar: z.object({ sourceReference: text, version: text,
    weekendDays: z.array(z.number().int().min(0).max(6)).max(6), holidays: z.array(z.iso.date()).max(366),
  }).strict().nullable(),
  serviceMethods: z.array(z.enum(["fixture_email", "fixture_hand_delivery"])).min(1),
  professionalReview: noticeProfessionalReviewV1.nullable(),
}).strict().superRefine((profile, ctx) => {
  if ((profile.dayCount === "working" || profile.roll === "next_working") && !profile.calendar) {
    ctx.addIssue({ code: "custom", message: "Working-day rules require a named calendar" });
  }
});
export type NoticeRuleProfile = z.infer<typeof noticeRuleProfileV1>;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const profileBase = {
  version: "notice.rule-profile.v1", revision: 1, classification: "fixture_not_reviewed", jurisdiction: "fictional",
  contract: "Imaginary workshop contract A", sourceReference: "fictional-contract-A/clause-7/rev-1",
  templateVersion: "fixture-placeholder.v1", requiredFactsVersion: "fixture-facts.v1",
  dateRulesVersion: "fixture-date-rules.v1", serviceAssumptionsVersion: "fixture-service.v1",
  fixtureSuiteVersion: "construction-notices.fixture.v1", requiredFacts: ["dueDate", "contractReference", "triggerEvidenceId"],
  trigger: "dueDate", offsetDays: -2, dayCount: "calendar", roll: "none", calendar: null,
  serviceMethods: ["fixture_email", "fixture_hand_delivery"], professionalReview: null,
};
/** The only supported profiles. Caller-supplied profiles/reviews never enter the calculator. */
export const CONSTRUCTION_NOTICE_FIXTURE_PROFILES: readonly NoticeRuleProfile[] = freeze([
  noticeRuleProfileV1.parse({ ...profileBase, id: "fixture-calendar" }),
  noticeRuleProfileV1.parse({ ...profileBase, id: "fixture-working", contract: "Imaginary workshop contract B",
    sourceReference: "fictional-contract-B/clause-9/rev-1", offsetDays: 2, dayCount: "working", roll: "next_working",
    calendar: { sourceReference: "fictional-calendar-only", version: "fictional-2026.v1", weekendDays: [0, 6], holidays: ["2026-11-02"] },
  }),
]);
export type ConstructionNoticeErrorCode = "INVALID_INPUT" | "UNSUPPORTED_ADVICE_REQUIRED" | "MISSING_FACTS"
  | "CONTEXT_MISMATCH" | "STALE_REVISION" | "REPLAY_CONFLICT" | "APPROVAL_REQUIRED" | "INVALID_SERVICE_STATE" | "REAL_NOTICE_DISABLED";
export class ConstructionNoticeError extends Error {
  constructor(public readonly code: ConstructionNoticeErrorCode, message: string) {
    super(message); this.name = "ConstructionNoticeError";
  }
}
function fail(code: ConstructionNoticeErrorCode, message: string): never { throw new ConstructionNoticeError(code, message); }
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) fail("INVALID_INPUT", "Invalid versioned notice fixture input");
  return result.data;
}
function profileFor(profileId: string, profileVersion: number): NoticeRuleProfile {
  const profile = CONSTRUCTION_NOTICE_FIXTURE_PROFILES.find(p => p.id === profileId && p.revision === profileVersion);
  if (!profile) fail("UNSUPPORTED_ADVICE_REQUIRED", "Unsupported contract profile/version; seek professional advice");
  return profile;
}
export const noticeInputV1 = z.object({
  version: z.literal("notice.input.v1"), environment: z.literal("synthetic"), ...context,
  noticeId: id, revision, previousRevisionId: id.nullable(), revisionId: id,
  profileId: text, profileVersion: revision, recipientReference: text,
  serviceMethod: z.enum(["fixture_email", "fixture_hand_delivery"]),
  facts: z.object({ dueDate: z.iso.date().nullable(), contractReference: text.nullable(), triggerEvidenceId: id.nullable() }).strict(),
}).strict();
export type NoticeInput = z.infer<typeof noticeInputV1>;
function checklist(input: NoticeInput, profile: NoticeRuleProfile) {
  return profile.requiredFacts.map(fact => ({ fact, present: input.facts[fact] !== null }));
}
export function constructionNoticeChecklist(input: unknown) {
  const data = parse(noticeInputV1, input);
  return freeze(checklist(data, profileFor(data.profileId, data.profileVersion)));
}
function deadline(dueDate: string, profile: NoticeRuleProfile): string {
  const date = new Date(`${dueDate}T00:00:00.000Z`);
  const isWorking = () => !profile.calendar?.weekendDays.includes(date.getUTCDay())
    && !profile.calendar?.holidays.includes(date.toISOString().slice(0, 10));
  const step = (direction: number) => date.setUTCDate(date.getUTCDate() + direction);
  for (let remaining = Math.abs(profile.offsetDays); remaining > 0;) {
    step(Math.sign(profile.offsetDays));
    if (profile.dayCount === "calendar" || isWorking()) remaining--;
  }
  if (profile.roll === "next_working") while (!isWorking()) step(1);
  const result = date.toISOString().slice(0, 10);
  if (!z.iso.date().safeParse(result).success) fail("UNSUPPORTED_ADVICE_REQUIRED", "Deadline outside supported date range; seek advice");
  return result;
}
function preview(input: NoticeInput) {
  const profile = profileFor(input.profileId, input.profileVersion);
  if (checklist(input, profile).some(item => !item.present)) fail("MISSING_FACTS", "Complete every required contract fact before preview");
  if (!profile.serviceMethods.includes(input.serviceMethod)) fail("UNSUPPORTED_ADVICE_REQUIRED", "Unsupported service method; seek advice");
  return freeze({ version: "notice.fixture-preview.v1" as const, watermark: CONSTRUCTION_NOTICE_WATERMARK,
    input, profile, deadline: deadline(input.facts.dueDate!, profile),
    realGenerationEnabled: false as const, realSendEnabled: false as const,
  });
}
export type NoticeFixturePreview = ReturnType<typeof preview>;
const historyV1 = z.object({ version: z.literal("notice.history.v1"), environment: z.literal("synthetic"), ...context,
  noticeId: id, revisions: z.array(noticeInputV1).max(1000),
}).strict();
export type NoticeFixtureHistory = z.infer<typeof historyV1>;
function validateHistory(input: unknown): NoticeFixtureHistory {
  const history = parse(historyV1, input), seen = new Set<string>();
  for (const [index, record] of history.revisions.entries()) {
    if (record.tenantId !== history.tenantId || record.jobId !== history.jobId || record.noticeId !== history.noticeId) {
      fail("CONTEXT_MISMATCH", "Notice revision belongs to another tenant, job or notice");
    }
    if (seen.has(record.revisionId)) fail("REPLAY_CONFLICT", "Duplicate revision identity");
    seen.add(record.revisionId);
    if (record.revision !== index + 1 || record.previousRevisionId !== (history.revisions[index - 1]?.revisionId ?? null)) {
      fail("STALE_REVISION", "Notice revisions must extend the current immutable history");
    }
    preview(record);
  }
  return history;
}
export function appendNoticeFixtureRevision(historyInput: unknown, input: unknown): NoticeFixtureHistory {
  const history = validateHistory(historyInput), next = parse(noticeInputV1, input);
  const existing = history.revisions.find(r => r.revisionId === next.revisionId);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(next)) fail("REPLAY_CONFLICT", "Revision identity reused with different facts");
    return freeze(history);
  }
  return freeze(validateHistory({ ...history, revisions: [...history.revisions, next] }));
}
export function previewConstructionNoticeFixture(historyInput: unknown): NoticeFixturePreview {
  const history = validateHistory(historyInput), current = history.revisions.at(-1);
  if (!current) fail("MISSING_FACTS", "A complete notice revision is required");
  return preview(current);
}

/** Exact canonical preview bytes bind all facts, dates, source versions, recipient and method.
 * These are fixture Decisions, never an authenticated command or production authorization.
 */
export const noticeFixtureDecisionV1 = z.object({
  version: z.literal("notice.fixture-decision.v1"), environment: z.literal("synthetic"), ...context,
  id, action: z.literal("notice.fixture_service"), actorKind: z.literal("human"), actorId: id,
  resolution: z.enum(["pending", "approved", "rejected", "dismissed", "revoked", "superseded"]),
  approvedPreview: z.string().min(1).max(20000), decidedAt: utcDatetimeV1, expiresAt: utcDatetimeV1,
}).strict();
export function noticeFixtureApprovalTarget(historyInput: unknown): string {
  return JSON.stringify(previewConstructionNoticeFixture(historyInput));
}
function approvedDecision(history: NoticeFixtureHistory, input: unknown, now: string) {
  const decision = parse(noticeFixtureDecisionV1, input);
  if (decision.tenantId !== history.tenantId || decision.jobId !== history.jobId) fail("CONTEXT_MISMATCH", "Decision belongs to another tenant or job");
  if (decision.resolution !== "approved" || decision.approvedPreview !== noticeFixtureApprovalTarget(history)
    || Date.parse(decision.decidedAt) > Date.parse(now) || Date.parse(decision.expiresAt) <= Date.parse(now)) {
    fail("APPROVAL_REQUIRED", "Current exact human approval required for this fixture preview");
  }
  return decision;
}
export const noticeServiceEventV1 = z.object({
  version: z.literal("notice.fixture-service-event.v1"), environment: z.literal("synthetic"), ...context,
  id, noticeRevisionId: id, decisionId: id, recordedAt: utcDatetimeV1,
  state: z.enum(["queued", "provider_accepted", "outcome_unknown", "read", "legally_served"]),
  providerReference: text.nullable(), evidenceId: id.nullable(), legalAssessmentReference: text.nullable(),
}).strict();
const serviceBookV1 = z.object({ version: z.literal("notice.fixture-service-book.v1"),
  decision: noticeFixtureDecisionV1.nullable(), events: z.array(noticeServiceEventV1).max(1000),
}).strict();
export type NoticeFixtureServiceBook = z.infer<typeof serviceBookV1>;
function validateServiceEvent(event: z.infer<typeof noticeServiceEventV1>, prior: z.infer<typeof noticeServiceEventV1>[],
  history: NoticeFixtureHistory, decision: z.infer<typeof noticeFixtureDecisionV1>) {
  if (event.tenantId !== history.tenantId || event.jobId !== history.jobId
    || event.noticeRevisionId !== history.revisions.at(-1)?.revisionId || event.decisionId !== decision.id) {
    fail("CONTEXT_MISMATCH", "Service evidence must bind the exact current notice and Decision");
  }
  approvedDecision(history, decision, event.recordedAt);
  if (prior.some(e => e.id === event.id)) fail("REPLAY_CONFLICT", "Duplicate service event identity");
  if (prior.length === 0 ? event.state !== "queued" : event.state === "queued") {
    fail("INVALID_SERVICE_STATE", "One initial queue event is required; unknown outcomes must be reconciled, never blindly requeued");
  }
  if (prior.length > 0 && Date.parse(event.recordedAt) < Date.parse(prior.at(-1)!.recordedAt)) {
    fail("INVALID_SERVICE_STATE", "Service history must be chronological");
  }
  if (prior.some(e => e.state === event.state)) fail("INVALID_SERVICE_STATE", "Each service fact is recorded once");
  if (event.state !== "queued" && event.evidenceId === null) fail("INVALID_SERVICE_STATE", "Service facts require evidence");
  if ((event.state === "provider_accepted" || event.state === "read") && event.providerReference === null) {
    fail("INVALID_SERVICE_STATE", "Provider facts require a provider reference");
  }
  if (event.state === "legally_served" && event.legalAssessmentReference === null) {
    fail("INVALID_SERVICE_STATE", "Legal service requires separate assessment evidence; delivery/read is insufficient");
  }
}
/** Records made-up service facts only; it never schedules or sends anything. */
export function appendNoticeFixtureServiceEvent(historyInput: unknown, decisionInput: unknown, bookInput: unknown, eventInput: unknown): NoticeFixtureServiceBook {
  const history = validateHistory(historyInput), book = parse(serviceBookV1, bookInput);
  const event = parse(noticeServiceEventV1, eventInput), decision = approvedDecision(history, decisionInput, event.recordedAt);
  if (book.events.length > 0 && (book.decision === null || JSON.stringify(book.decision) !== JSON.stringify(decision))) {
    fail("APPROVAL_REQUIRED", "Service history must retain the exact Decision and approved preview");
  }
  if (book.events.length === 0 && book.decision !== null) fail("INVALID_SERVICE_STATE", "Empty service history cannot claim approval");
  const validated: z.infer<typeof noticeServiceEventV1>[] = [];
  for (const previous of book.events) { validateServiceEvent(previous, validated, history, decision); validated.push(previous); }
  const existing = validated.find(e => e.id === event.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(event)) fail("REPLAY_CONFLICT", "Service event identity reused with different evidence");
    return freeze(book);
  }
  validateServiceEvent(event, validated, history, decision);
  return freeze({ ...book, decision, events: [...validated, event] });
}
export function constructionNoticeProductionBlockers(profileId: string, profileVersion: number): readonly string[] {
  const profile = profileFor(profileId, profileVersion);
  return Object.freeze(["FEATURE_DISABLED", "FIXTURE_ONLY", ...(profile.professionalReview === null ? ["PROFESSIONAL_REVIEW_REQUIRED"] : [])]);
}
/** Unconditional: a timer, valuation suggestion, claimed review or human Decision cannot enable real notices. */
export function assertRealConstructionNoticeAllowed(): never {
  return fail("REAL_NOTICE_DISABLED", "Real notice generation and sending are disabled; professional review and production authorization are absent");
}
