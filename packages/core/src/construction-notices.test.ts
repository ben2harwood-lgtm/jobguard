import { describe, expect, it } from "vitest";
import {
  appendNoticeFixtureRevision, appendNoticeFixtureServiceEvent, assertRealConstructionNoticeAllowed,
  CONSTRUCTION_NOTICES_ENABLED, CONSTRUCTION_NOTICE_FIXTURE_PROFILES, constructionNoticeChecklist,
  constructionNoticeProductionBlockers, ConstructionNoticeError, noticeFixtureApprovalTarget,
  noticeProfessionalReviewV1, noticeRuleProfileV1, previewConstructionNoticeFixture,
  type NoticeFixtureHistory, type NoticeFixtureServiceBook, type NoticeInput,
} from "./construction-notices.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { tenantId: id(1), jobId: id(2) };
function input(): NoticeInput {
  return { version: "notice.input.v1", environment: "synthetic", ...context, noticeId: id(3), revision: 1,
    previousRevisionId: null, revisionId: id(4), profileId: "fixture-calendar", profileVersion: 1,
    recipientReference: "fictional-recipient-A", serviceMethod: "fixture_email",
    facts: { dueDate: "2026-11-02", contractReference: "fictional-contract-A", triggerEvidenceId: id(5) } };
}
function empty(): NoticeFixtureHistory {
  return { version: "notice.history.v1", environment: "synthetic", ...context, noticeId: id(3), revisions: [] };
}
const history = () => appendNoticeFixtureRevision(empty(), input());
const decision = (h = history()) => ({
  version: "notice.fixture-decision.v1" as const, environment: "synthetic" as const, ...context, id: id(10),
  action: "notice.fixture_service" as const, actorKind: "human" as const, actorId: id(11), resolution: "approved" as const,
  approvedPreview: noticeFixtureApprovalTarget(h), decidedAt: "2026-10-30T09:00:00Z", expiresAt: "2026-11-01T09:00:00Z",
});
const serviceEmpty = (): NoticeFixtureServiceBook => ({ version: "notice.fixture-service-book.v1", decision: null, events: [] });
const event = () => ({ version: "notice.fixture-service-event.v1" as const, environment: "synthetic" as const, ...context,
  id: id(20), noticeRevisionId: id(4), decisionId: id(10), recordedAt: "2026-10-30T10:00:00Z", state: "queued" as const,
  providerReference: null, evidenceId: null, legalAssessmentReference: null });
function code(run: () => unknown, expected: string) {
  try { run(); throw new Error("Expected failure"); }
  catch (error) { expect(error).toBeInstanceOf(ConstructionNoticeError); expect(error).toMatchObject({ code: expected }); }
}
const queued = () => appendNoticeFixtureServiceEvent(history(), decision(), serviceEmpty(), event());

describe("M4-19 dark construction notices", () => {
  it("ships only immutable fictional profiles without professional approval", () => {
    expect(CONSTRUCTION_NOTICES_ENABLED).toBe(false);
    for (const profile of CONSTRUCTION_NOTICE_FIXTURE_PROFILES) {
      expect(profile.professionalReview).toBeNull();
      expect(Object.isFrozen(profile.requiredFacts)).toBe(true);
      expect(constructionNoticeProductionBlockers(profile.id, profile.revision)).toEqual([
        "FEATURE_DISABLED", "FIXTURE_ONLY", "PROFESSIONAL_REVIEW_REQUIRED",
      ]);
    }
    expect(noticeProfessionalReviewV1.safeParse({ reviewerReference: "claimed" }).success).toBe(false);
  });
  it("retains date-rule, source, template and calendar versions in the preview", () => {
    const p = previewConstructionNoticeFixture(history());
    expect(p).toMatchObject({ deadline: "2026-10-31", realGenerationEnabled: false, realSendEnabled: false,
      profile: { sourceReference: "fictional-contract-A/clause-7/rev-1", dateRulesVersion: "fixture-date-rules.v1", calendar: null } });
    expect(p.watermark).toContain("NOT A NOTICE");
  });
  it("uses weekends and named holidays only for the profile that explicitly names them", () => {
    const working = appendNoticeFixtureRevision(empty(), { ...input(), profileId: "fixture-working",
      facts: { ...input().facts, dueDate: "2026-10-30" } });
    expect(previewConstructionNoticeFixture(working).deadline).toBe("2026-11-04");
    // Calendar profile keeps Saturday, despite the other profile's weekend rules.
    expect(previewConstructionNoticeFixture(history()).deadline).toBe("2026-10-31");
    const profile = CONSTRUCTION_NOTICE_FIXTURE_PROFILES[1]!;
    expect(noticeRuleProfileV1.safeParse({ ...profile, calendar: null }).success).toBe(false);
  });
  it("handles leap days and year boundaries with UTC date arithmetic", () => {
    for (const [dueDate, expected] of [["2028-03-02", "2028-02-29"], ["2027-01-01", "2026-12-30"]]) {
      const h = appendNoticeFixtureRevision(empty(), { ...input(), facts: { ...input().facts, dueDate } });
      expect(previewConstructionNoticeFixture(h).deadline).toBe(expected);
    }
  });
  it("recomputes changed due dates while preserving frozen prior revisions", () => {
    const original = history(), oldTarget = noticeFixtureApprovalTarget(original);
    const nextInput = { ...input(), revision: 2, revisionId: id(6), previousRevisionId: id(4),
      facts: { ...input().facts, dueDate: "2026-11-05" } };
    const next = appendNoticeFixtureRevision(original, nextInput);
    nextInput.facts.dueDate = "2026-12-01";
    expect(previewConstructionNoticeFixture(next).deadline).toBe("2026-11-03");
    expect(noticeFixtureApprovalTarget(original)).toBe(oldTarget);
    expect(next.revisions[0]).toEqual(original.revisions[0]);
    expect(Object.isFrozen(next.revisions[0]!.facts)).toBe(true);
    code(() => appendNoticeFixtureServiceEvent(next, decision(original), serviceEmpty(), { ...event(), noticeRevisionId: id(6) }), "APPROVAL_REQUIRED");
  });
  it.each(["dueDate", "contractReference", "triggerEvidenceId"] as const)("missing %s blocks preview", fact => {
    const missing = { ...input(), facts: { ...input().facts, [fact]: null } };
    expect(constructionNoticeChecklist(missing).find(item => item.fact === fact)?.present).toBe(false);
    code(() => appendNoticeFixtureRevision(empty(), missing), "MISSING_FACTS");
  });
  it("flags unsupported profiles, versions and service methods for advice or validation", () => {
    for (const change of [{ profileId: "UK-act-universal" }, { profileVersion: 2 }]) {
      code(() => appendNoticeFixtureRevision(empty(), { ...input(), ...change }), "UNSUPPORTED_ADVICE_REQUIRED");
    }
    code(() => appendNoticeFixtureRevision(empty(), { ...input(), serviceMethod: "post" }), "INVALID_INPUT");
  });
  it("rejects rewritten, stale, cross-context and malformed histories", () => {
    expect(appendNoticeFixtureRevision(history(), input()).revisions).toHaveLength(1);
    code(() => appendNoticeFixtureRevision(history(), { ...input(), recipientReference: "changed" }), "REPLAY_CONFLICT");
    code(() => appendNoticeFixtureRevision(history(), { ...input(), revisionId: id(6) }), "STALE_REVISION");
    for (const key of ["tenantId", "jobId", "noticeId"] as const) {
      code(() => appendNoticeFixtureRevision(empty(), { ...input(), [key]: id(99) }), "CONTEXT_MISMATCH");
    }
    for (const change of [{ environment: "production" }, { aiWording: "assertion" }, { version: "notice.input.v2" },
      { facts: { ...input().facts, dueDate: "2026-02-30" } }]) {
      code(() => appendNoticeFixtureRevision(empty(), { ...input(), ...change }), "INVALID_INPUT");
    }
    code(() => previewConstructionNoticeFixture({ ...history(), revisions: [input(), input()] }), "REPLAY_CONFLICT");
    code(() => previewConstructionNoticeFixture(empty()), "MISSING_FACTS");
  });
  it("keeps queue, provider acceptance, read and assessed legal service as separate facts", () => {
    let book = queued();
    for (const [n, state] of [[21, "provider_accepted"], [22, "read"], [23, "legally_served"]] as const) {
      book = appendNoticeFixtureServiceEvent(history(), decision(), book, { ...event(), id: id(n), state,
        evidenceId: id(30 + n), providerReference: "fictional-provider-ref", legalAssessmentReference: state === "legally_served" ? "fictional-assessment" : null });
      expect(book.events).toHaveLength(n - 19);
    }
    expect(book.events.map(e => e.state)).toEqual(["queued", "provider_accepted", "read", "legally_served"]);
    expect(book.decision?.approvedPreview).toBe(noticeFixtureApprovalTarget(history()));
    expect(JSON.parse(book.decision!.approvedPreview).input).toMatchObject({ recipientReference: "fictional-recipient-A", serviceMethod: "fixture_email", revisionId: id(4) });
    expect(Object.isFrozen(book.events)).toBe(true);
  });
  it("permits documented fictional hand service without treating a provider as necessary proof", () => {
    const h = appendNoticeFixtureRevision(empty(), { ...input(), serviceMethod: "fixture_hand_delivery" });
    let book = appendNoticeFixtureServiceEvent(h, decision(h), serviceEmpty(), event());
    book = appendNoticeFixtureServiceEvent(h, decision(h), book, { ...event(), id: id(21), state: "legally_served", evidenceId: id(50), legalAssessmentReference: "fictional-reviewed-hand-service" });
    expect(book.events.map(e => e.state)).toEqual(["queued", "legally_served"]);
  });
  it("requires evidence and a separate assessment for legal service", () => {
    for (const state of ["provider_accepted", "read", "outcome_unknown", "legally_served"]) {
      code(() => appendNoticeFixtureServiceEvent(history(), decision(), queued(), { ...event(), id: id(21), state }), "INVALID_SERVICE_STATE");
    }
    code(() => appendNoticeFixtureServiceEvent(history(), decision(), queued(), { ...event(), id: id(21), state: "legally_served", evidenceId: id(50) }), "INVALID_SERVICE_STATE");
    code(() => appendNoticeFixtureServiceEvent(history(), decision(), serviceEmpty(), { ...event(), state: "read" }), "INVALID_SERVICE_STATE");
  });
  it("records unknown outcomes without allowing blind requeue and accepts reconciliation facts", () => {
    const unknown = appendNoticeFixtureServiceEvent(history(), decision(), queued(), { ...event(), id: id(21), state: "outcome_unknown", evidenceId: id(50) });
    code(() => appendNoticeFixtureServiceEvent(history(), decision(), unknown, { ...event(), id: id(22) }), "INVALID_SERVICE_STATE");
    expect(appendNoticeFixtureServiceEvent(history(), decision(), unknown, { ...event(), id: id(22), state: "provider_accepted", evidenceId: id(51), providerReference: "fictional-reconciled" }).events).toHaveLength(3);
  });
  it("treats exact retries as no-ops and rejects changed event identity or imported history tampering", () => {
    expect(appendNoticeFixtureServiceEvent(history(), decision(), queued(), event())).toEqual(queued());
    code(() => appendNoticeFixtureServiceEvent(history(), decision(), queued(), { ...event(), evidenceId: id(50) }), "REPLAY_CONFLICT");
    code(() => appendNoticeFixtureServiceEvent(history(), decision(), { ...queued(), decision: null }, event()), "APPROVAL_REQUIRED");
    code(() => appendNoticeFixtureServiceEvent(history(), decision(), { ...queued(), events: [{ ...event(), state: "read" }] }, event()), "INVALID_SERVICE_STATE");
  });
  it("rejects non-approval resolutions, expiry, future decisions and changed exact targets", () => {
    for (const resolution of ["pending", "rejected", "dismissed", "revoked", "superseded"]) {
      code(() => appendNoticeFixtureServiceEvent(history(), { ...decision(), resolution }, serviceEmpty(), event()), "APPROVAL_REQUIRED");
    }
    for (const change of [{ expiresAt: event().recordedAt }, { decidedAt: "2026-10-31T00:00:00Z" }, { approvedPreview: "claimed-approval" }]) {
      code(() => appendNoticeFixtureServiceEvent(history(), { ...decision(), ...change }, serviceEmpty(), event()), "APPROVAL_REQUIRED");
    }
    for (const change of [{ actorKind: "timer" }, { actorKind: "valuation_suggestion" }, { action: "notice.send" }, { aiToneApproved: true }]) {
      code(() => appendNoticeFixtureServiceEvent(history(), { ...decision(), ...change }, serviceEmpty(), event()), "INVALID_INPUT");
    }
    code(() => appendNoticeFixtureServiceEvent(history(), { ...decision(), tenantId: id(99) }, serviceEmpty(), event()), "CONTEXT_MISMATCH");
    code(() => appendNoticeFixtureServiceEvent(history(), decision(), serviceEmpty(), { ...event(), jobId: id(99) }), "CONTEXT_MISMATCH");
  });
  it.each(["recipientReference", "serviceMethod"] as const)("changing %s invalidates prior approval", key => {
    const next = { ...input(), [key]: key === "serviceMethod" ? "fixture_hand_delivery" : "fictional-recipient-B" };
    const h = appendNoticeFixtureRevision(empty(), next);
    code(() => appendNoticeFixtureServiceEvent(h, decision(), serviceEmpty(), event()), "APPROVAL_REQUIRED");
  });
  it.each(["timer", "valuation_suggestion", "human_approval", "claimed_professional_review", "ai_tone_pass"])("%s cannot generate or send a real notice", () => {
    code(() => assertRealConstructionNoticeAllowed(), "REAL_NOTICE_DISABLED");
  });
});
