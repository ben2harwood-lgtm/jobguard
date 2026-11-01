import { describe, expect, it } from "vitest";
import { applyContractorMandateReference as apply, ContractorMandateError, contractorAgreementV1,
  type ContractorMandateReference } from "./contractor-mandate.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-29T00:00:00Z";
const binding = { tenantId: id(1), agreementVersionId: id(2), termsHash: "a".repeat(64), scopeHash: "b".repeat(64), rateHash: "c".repeat(64), limitPence: 2000, track: "paid" as const, currency: "GBP" as const };
function fixture(): ContractorMandateReference {
  return { version: "contractor-mandate-reference.v1", mode: "synthetic_demo", agreement: { version: "contractor-agreement.v1", id: id(3), binding,
    status: "active", approval: { actorId: id(4), decisionId: id(5), resolutionId: id(6),
      status: "approved", binding, approvedAt: now, revoked: false } }, actions: [], events: [] };
}
function request(amountPence = 1000, actionId = 10, action: "collect" | "refund" = "collect", originalActionId: string | null = null) {
  const artifact = { binding, statementId: id(7), statementHash: "d".repeat(64), amountPence, pilotExempt: false, action, originalActionId, expiresAt: "2026-10-30T00:00:00Z" };
  return { kind: "request" as const, actionId: id(actionId), artifact,
    approval: { actorId: id(90), decisionId: id(actionId + 100), resolutionId: id(actionId + 200), status: "approved", revoked: false, artifact } };
}
function envelope(event: unknown, eventId = 20, role = "human", tenantId = id(1)) {
  return { version: "contractor-mandate-event.v1", id: id(eventId), event, now, context: { tenantId, actorId: id(4), role } };
}
function queued() { return apply(fixture(), envelope(request())); }
function started() { return apply(queued(), envelope({ kind: "start", actionId: id(10) }, 21, "worker")); }
function settled() { return apply(started(), envelope({ kind: "outcome", actionId: id(10), outcome: "settled" }, 22, "provider")); }
const denied = (fn: () => unknown) => expect(fn).toThrow(ContractorMandateError);

describe("ENT-14 dark contractor mandate reference", () => {
  it("binds exact approved terms/version without mutating the supplied immutable history", () => {
    const state = fixture(), before = structuredClone(state);
    expect(apply(state, envelope(request())).actions[0]?.outcome).toBe("queued");
    expect(state).toEqual(before);
    const changed = fixture(); changed.agreement.binding = { ...binding, rateHash: "e".repeat(64) };
    expect(contractorAgreementV1.safeParse(changed.agreement).success).toBe(false);
  });
  it.each(["termsHash", "scopeHash", "rateHash", "agreementVersionId", "tenantId"] as const)("requires new human authority when %s changes", key => {
    const r = structuredClone(request()); r.artifact.binding[key] = key.endsWith("Id") ? id(90) : "e".repeat(64);
    denied(() => apply(fixture(), envelope(r)));
    r.approval.artifact = r.artifact;
    denied(() => apply(fixture(), envelope(r)));
  });
  it("binds mandate limits to both agreement and action approval", () => {
    const state = fixture(); state.agreement.binding = { ...binding, limitPence: 3000 };
    denied(() => apply(state, envelope(request())));
    const r = structuredClone(request()); r.artifact.binding.limitPence = 3000;
    denied(() => apply(fixture(), envelope(r)));
  });
  it("requires a separate human-approved agreement for a new rate/scope/version", () => {
    const state = fixture(), r = structuredClone(request());
    const revised = { ...binding, agreementVersionId: id(90), rateHash: "e".repeat(64), scopeHash: "f".repeat(64) };
    state.agreement.binding = revised; state.agreement.approval.binding = revised;
    r.artifact.binding = revised; r.approval.artifact = r.artifact;
    expect(apply(state, envelope(r)).actions).toHaveLength(1);
    denied(() => apply(queued(), envelope({ kind: "change_agreement", binding: revised }, 55, "worker")));
  });
  it("rejects revoked, rejected and mismatched action approvals and expired requests", () => {
    for (const update of [{ status: "rejected" }, { revoked: true }])
      denied(() => apply(fixture(), envelope({ ...request(), approval: { ...request().approval, ...update } })));
    const r = request(); r.artifact.expiresAt = now;
    denied(() => apply(fixture(), envelope(r)));
    const mismatch = structuredClone(request()); mismatch.approval.artifact = { ...mismatch.approval.artifact, amountPence: 999 };
    denied(() => apply(fixture(), envelope(mismatch)));
  });
  it.each(["collect", "refund"] as const)("requires a different human approver from the %s requester", action => {
    const state = action === "collect" ? fixture() : settled();
    const r = request(1000, 11, action, action === "refund" ? id(10) : null);
    const before = structuredClone(state);
    r.approval.actorId = id(4);
    denied(() => apply(state, envelope(r, 31)));
    expect(state).toEqual(before);
    r.approval.actorId = id(90);
    const approved = apply(state, envelope(r, 31));
    expect(approved.actions.at(-1)?.approval.actorId).toBe(id(90));
    expect(approved.events.at(-1)?.context.actorId).toBe(id(4));
    expect(apply(approved, envelope(r, 31))).toEqual(approved);
  });
  it("makes identical command replays no-ops and rejects changed payloads, duplicate actions and statements", () => {
    const s = queued(); expect(apply(s, envelope(request()))).toEqual(s);
    denied(() => apply(s, envelope(request(), 20, "worker")));
    const otherActor = envelope(request()); otherActor.context.actorId = id(90); denied(() => apply(s, otherActor));
    denied(() => apply(s, envelope(request(999))));
    denied(() => apply(s, envelope(request(), 30)));
    denied(() => apply(s, envelope(request(1000, 11), 30)));
    const replayApproval = request(500, 11); replayApproval.artifact.statementId = id(90); replayApproval.approval.decisionId = id(110);
    denied(() => apply(s, envelope(replayApproval, 30)));
  });
  it("refuses cross-tenant access before returning replay or outcome data", () => {
    denied(() => apply(queued(), envelope(request(), 20, "human", id(90))));
    denied(() => apply(started(), envelope({ kind: "outcome", actionId: id(10), outcome: "settled" }, 30, "provider", id(90))));
  });
  it("workers cannot create agreement authority, request collections/refunds, cancel or settle work", () => {
    denied(() => apply(fixture(), envelope(request(), 20, "worker")));
    denied(() => apply(settled(), envelope(request(1000, 11, "refund", id(10)), 31, "worker")));
    denied(() => apply(queued(), envelope({ kind: "cancel" }, 31, "worker")));
    denied(() => apply(started(), envelope({ kind: "outcome", actionId: id(10), outcome: "settled" }, 31, "worker")));
    denied(() => apply(queued(), envelope({ kind: "start", actionId: id(10) }, 31, "human")));
  });
  it.each(["revoke", "cancel", "provider_cancel"])("%s stops new dispatch without erasing in-flight/unknown results", kind => {
    const cancel = envelope({ kind }, 30, kind === "provider_cancel" ? "provider" : "human");
    const cancelledQueue = apply(queued(), cancel);
    denied(() => apply(cancelledQueue, envelope({ kind: "start", actionId: id(10) }, 31, "worker")));
    denied(() => apply(cancelledQueue, envelope(request(1000, 11), 31)));
    const inFlight = apply(started(), cancel);
    const unknown = apply(inFlight, envelope({ kind: "outcome", actionId: id(10), outcome: "outcome_unknown" }, 31, "provider"));
    denied(() => apply(unknown, envelope({ kind: "start", actionId: id(10) }, 32, "worker")));
    expect(apply(unknown, envelope({ kind: "reconcile", actionId: id(10), outcome: "settled" }, 32, "provider")).actions[0]?.outcome).toBe("settled");
  });
  it("rejects a second dispatch while in-flight and handles identical provider replays once", () => {
    denied(() => apply(started(), envelope({ kind: "start", actionId: id(10) }, 30, "worker")));
    const outcome = envelope({ kind: "outcome", actionId: id(10), outcome: "settled" }, 22, "provider");
    expect(apply(settled(), outcome)).toEqual(settled());
    denied(() => apply(settled(), envelope({ kind: "outcome", actionId: id(10), outcome: "settled" }, 30, "provider")));
    const revised = queued();
    revised.agreement.binding = { ...binding, rateHash: "e".repeat(64) };
    revised.agreement.approval.binding = revised.agreement.binding;
    denied(() => apply(revised, envelope({ kind: "start", actionId: id(10) }, 30, "worker")));
  });
  it("only retries known failures, preserving action identity and requiring unexpired approval", () => {
    const unknown = apply(started(), envelope({ kind: "outcome", actionId: id(10), outcome: "outcome_unknown" }, 30, "provider"));
    denied(() => apply(unknown, envelope({ kind: "start", actionId: id(10) }, 31, "worker")));
    denied(() => apply(unknown, envelope({ kind: "outcome", actionId: id(10), outcome: "failed" }, 31, "provider")));
    const failed = apply(unknown, envelope({ kind: "reconcile", actionId: id(10), outcome: "failed" }, 31, "provider"));
    const retry = envelope({ kind: "start", actionId: id(10) }, 32, "worker");
    expect(apply(failed, retry).actions[0]?.attempts).toBe(2);
    retry.now = "2026-10-30T00:00:00Z"; denied(() => apply(failed, retry));
    denied(() => apply(settled(), envelope({ kind: "start", actionId: id(10) }, 32, "worker")));
  });
  it.each(["collect", "refund"] as const)("bounds %s attempts across failures and reconciliation without replay increments", action => {
    const actionId = action === "collect" ? id(10) : id(11);
    let state = action === "collect" ? queued() : apply(settled(), envelope(request(1000, 11, "refund", id(10)), 31));
    let eventId = 40;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const start = envelope({ kind: "start", actionId }, eventId++, "worker");
      state = apply(state, start);
      expect(state.actions.find(a => a.id === actionId)?.attempts).toBe(attempt);
      expect(apply(state, start)).toEqual(state);
      if (attempt === 2) {
        state = apply(state, envelope({ kind: "outcome", actionId, outcome: "outcome_unknown" }, eventId++, "provider"));
        denied(() => apply(state, envelope({ kind: "start", actionId }, eventId++, "worker")));
        state = apply(state, envelope({ kind: "reconcile", actionId, outcome: "failed" }, eventId++, "provider"));
      } else {
        state = apply(state, envelope({ kind: "outcome", actionId, outcome: "failed" }, eventId++, "provider"));
      }
    }
    const before = structuredClone(state);
    denied(() => apply(state, envelope({ kind: "start", actionId }, eventId++, "worker")));
    expect(state).toEqual(before);
    expect(state.actions.find(a => a.id === actionId)?.outcome).toBe("failed");
    if (action === "collect") denied(() => apply(state, envelope(request(1000, 12), eventId++)));
  });
  it("bounds collection reservations with exact integer sums", () => {
    for (const amount of [0, -1, 0.5, 1_000_000_000_001, Number.MAX_SAFE_INTEGER]) denied(() => apply(fixture(), envelope(request(amount))));
    const r = request(1001, 11); r.artifact.statementId = id(90);
    denied(() => apply(queued(), envelope(r, 31)));
  });
  it("requires explicit bounded refunds against the original settled statement, even after cancellation", () => {
    denied(() => apply(queued(), envelope(request(1000, 11, "refund", id(10)), 31)));
    const cancelled = apply(settled(), envelope({ kind: "cancel" }, 30));
    const refund = request(600, 11, "refund", id(10));
    const s = apply(cancelled, envelope(refund, 31));
    expect(apply(s, envelope({ kind: "start", actionId: id(11) }, 32, "worker")).actions[1]?.outcome).toBe("in_flight");
    denied(() => apply(s, envelope(request(401, 12, "refund", id(10)), 33)));
    const wrong = request(100, 12, "refund", id(10)); wrong.artifact.statementHash = "e".repeat(64);
    denied(() => apply(s, envelope(wrong, 33)));
    denied(() => apply(settled(), envelope(request(100, 12, "refund", id(90)), 33)));
    expect(s.actions[0]?.outcome).toBe("settled");
  });
  it("never charges a pilot or accepts hidden data/locked-bill overrides as authority", () => {
    for (const mode of ["pilot_no_charge", "production_billing", "provider_sandbox"])
      denied(() => apply({ ...fixture(), mode }, envelope(request())));
    const pilotStatement = request(); pilotStatement.artifact.pilotExempt = true;
    denied(() => apply(fixture(), envelope(pilotStatement)));
    const stalePilotWork = queued();
    stalePilotWork.actions[0]!.artifact.pilotExempt = true;
    stalePilotWork.actions[0]!.approval.artifact.pilotExempt = true;
    denied(() => apply(stalePilotWork, envelope({ kind: "start", actionId: id(10) }, 30, "worker")));
    const pilot = fixture();
    pilot.agreement.binding = { ...binding, track: "pilot_no_charge" };
    pilot.agreement.approval.binding = pilot.agreement.binding;
    denied(() => apply(pilot, envelope(request())));
    const rewrittenPilot = structuredClone(pilot); rewrittenPilot.agreement.binding = { ...rewrittenPilot.agreement.binding, track: "paid" };
    denied(() => apply(rewrittenPilot, envelope(request())));
    denied(() => apply(pilot, envelope(request(100, 11, "refund", id(10)))));
    for (const extra of [{ shadowSignals: [id(90)] }, { lockedBillId: id(90) }, { realData: true }])
      denied(() => apply(fixture(), envelope({ ...request(), ...extra })));
  });
});
