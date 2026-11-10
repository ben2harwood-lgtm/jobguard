import { describe, expect, it } from "vitest";
import {
  acceptanceIntentViewV1, coreLoopActionAvailabilityV1, coreLoopActionsV1, finalAccountPreviewViewV1,
  inboxViewV1, invoicePreviewViewV1, jobListViewV1, paymentRecordViewV1, proofViewV1,
  quotePreviewViewV1, variationsViewV1, walkReviewViewV1, type CoreLoopActionContextV1,
} from "./core-loop-views.js";
import { evaluateDraftQuote, M1_QUOTE_POLICY, type QuoteLine } from "./quote.js";
import { assembleDraftFinalAccount } from "./final-account.js";
import type { ProofCandidate, ProofRequirement } from "./proof.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const snapshot = { tenantId: id(1), jobId: id(2), subjectId: id(3), revision: 1, contentHash: "a".repeat(64) };
const context = (): CoreLoopActionContextV1 => ({ version: "core-loop-action-context.v1", environment: "synthetic_demo",
  online: true, authorized: true, connectionId: id(4), refreshedConnectionId: id(4), current: { ...snapshot },
  review: { action: "acceptQuote", connectionId: id(4), snapshot: { ...snapshot } } });
const quoteLine: QuoteLine = { id: id(5), scopeItemId: id(6), scopeRevisionId: id(7), description: "Fictional joinery",
  origin: "captured", included: true, exclusionReason: null, quantity: "2.5", unit: "hour", unitRatePence: 12333,
  discountPercent: "5", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: null, region: null };
const invoice = { id: id(8), finalAccountRevisionId: id(9), sourceHash: "b".repeat(64), netPence: 29291,
  taxPence: 5858, totalPence: 35149, balancePence: 35149, customerCreditPence: 0 };

describe("M3-6 shared core-loop groundwork (synthetic only)", () => {
  it("requires a new person review after reconnect even when commercial content is unchanged", () => {
    const old = context();
    expect(coreLoopActionAvailabilityV1("acceptQuote", old).state).toBe("ready_for_server_validation");
    const reconnected = { ...old, connectionId: id(10) };
    expect(coreLoopActionAvailabilityV1("acceptQuote", reconnected).reason).toBe("refresh_required");
    expect(coreLoopActionAvailabilityV1("acceptQuote", { ...reconnected, refreshedConnectionId: id(10) }).reason).toBe("exact_review_required");
  });
  it("binds the review to every identity, revision, hash and action", () => {
    for (const key of ["tenantId", "jobId", "subjectId", "revision", "contentHash"] as const) {
      const changed = context();
      changed.current = { ...changed.current, [key]: key === "revision" ? 2 : key === "contentHash" ? "b".repeat(64) : id(12) };
      expect(coreLoopActionAvailabilityV1("acceptQuote", changed).state).toBe("review_required");
    }
    expect(acceptanceIntentViewV1(context()).data.switchLive.state).toBe("review_required");
    expect(acceptanceIntentViewV1(context()).data.acceptance.automaticExecution).toBe(false);
  });
  it("fails closed for offline, revoked authority, missing review and malformed context", () => {
    expect(coreLoopActionAvailabilityV1("acceptQuote", { ...context(), online: false }).reason).toBe("offline");
    expect(coreLoopActionAvailabilityV1("acceptQuote", { ...context(), authorized: false }).reason).toBe("forbidden");
    expect(coreLoopActionAvailabilityV1("acceptQuote", { ...context(), review: null }).reason).toBe("exact_review_required");
    expect(() => coreLoopActionAvailabilityV1("acceptQuote", { ...context(), environment: "production" })).toThrow();
    expect(() => coreLoopActionAvailabilityV1("acceptQuote", { ...context(), secret: "unexpected" })).toThrow();
  });
  it("never automatically executes any action; offline edits remain intent only", () => {
    for (const action of Object.keys(coreLoopActionsV1) as (keyof typeof coreLoopActionsV1)[]) {
      const input = context();
      input.review!.action = action;
      expect(coreLoopActionAvailabilityV1(action, input).automaticExecution).toBe(false);
      const offline = coreLoopActionAvailabilityV1(action, { ...input, online: false });
      expect(offline.state).toBe(coreLoopActionsV1[action].mode === "online_only" ? "blocked" : "local_intent_only");
      expect(coreLoopActionAvailabilityV1(action, { ...input, authorized: false }).state).toBe("blocked");
    }
  });
  it("matches web quote totals, including half-even boundaries, exclusions and missing prices", () => {
    for (const rate of [0, 1, 3, 101, 12333, 999999]) {
      for (const quantity of ["0", "0.5", "2.5", "1.000001"]) {
        const input = { currency: "GBP", taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion,
          lines: [{ ...quoteLine, unitRatePence: rate, quantity }] };
        expect(quotePreviewViewV1(input).data).toEqual(evaluateDraftQuote(input));
      }
    }
    const input = { currency: "GBP", taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion, lines: [quoteLine] };
    expect(quotePreviewViewV1(input).data.totals.total.pence).toBe(35149);
    expect(quotePreviewViewV1({ ...input, lines: [{ ...quoteLine, unitRatePence: null }] }).data.issuable).toBe(false);
    expect(quotePreviewViewV1({ ...input, lines: [{ ...quoteLine, included: false, exclusionReason: "Customer supplied" }] }).data.totals.total.pence).toBe(0);
  });
  it("uses the web final-account assembly including signed omissions and mandatory proof blockers", () => {
    const baseline = { kind: "baseline" as const, sourceId: id(1), scopeItemId: id(6), commercialRevisionId: id(7),
      description: "Accepted baseline", netPence: 10001, approvalId: null };
    const variation = { ...baseline, kind: "variation" as const, sourceId: id(2), approvalId: id(3), netPence: -500 };
    const input = { baselineLines: [baseline], approvedVariationLines: [variation], proof: [],
      mandatoryProofRequirements: [{ scopeItemId: id(6), evidenceType: "completion_photo" }] };
    const result = finalAccountPreviewViewV1(input);
    expect(result.data).toEqual(assembleDraftFinalAccount(input));
    expect(result.data.totals.net.pence).toBe(9501);
    expect(result.data.issueBlocked).toBe(true);
    expect(() => finalAccountPreviewViewV1({ ...input, approvedVariationLines: [variation, variation] })).toThrow("DUPLICATE_APPROVED_VARIATION");
  });
  it("preserves server invoice totals and balance while a local payment is queued", () => {
    expect(invoicePreviewViewV1(invoice).data.totals.total.pence).toBe(invoice.totalPence);
    for (const localIntent of ["none", "queued", "sending", "needs_review"] as const) {
      const data = paymentRecordViewV1(invoice, localIntent).data;
      expect(data.balance.pence).toBe(invoice.balancePence);
      expect(data.localIntentIsSettlement).toBe(false);
      expect(data.recoveryEligibility).toBe("server_only");
    }
    expect(() => paymentRecordViewV1({ ...invoice, balancePence: -1 }, "queued")).toThrow();
    expect(() => invoicePreviewViewV1({ ...invoice, netPence: -1 })).toThrow();
    expect(() => invoicePreviewViewV1({ ...invoice, balancePence: 1_000_000_000_001 })).toThrow();
    const data = variationsViewV1({ jobId: id(2), baselinePence: 10001, approvedAdditionsPence: 500,
      approvedOmissionsPence: -300, pendingExtrasPence: 9999 }).data;
    expect(data.omissions.pence).toBe(-300);
    expect(data.pendingIsBillable).toBe(false);
  });
  it("rejects cross-tenant job lists and keeps queued delivery separate from settled payment", () => {
    const job = { id: id(2), tenantId: id(1), title: "Fictional job", customerLabel: "Fictional customer", status: "live",
      document: { kind: "quote", reference: null, delivery: "queued" }, customerPayment: "unknown", pilotNoCharge: true, updatedLabel: "Server revision 1" };
    const response = { version: 1, tenantId: id(1), jobs: [job] };
    expect(jobListViewV1(response, id(1)).data.jobs[0]?.customerPayment).toBe("unknown");
    expect(() => jobListViewV1(response, id(11))).toThrow("TENANT_FORBIDDEN");
    expect(() => jobListViewV1({ ...response, jobs: [{ ...job, tenantId: id(11) }] }, id(1))).toThrow("TENANT_FORBIDDEN");
  });
  it("shows review readiness without promoting scope or approving a decision", () => {
    const data = walkReviewViewV1({ version: "proposal_review_v1", reviewId: id(1), proposalId: id(2), jobId: id(3),
      revision: 0, lines: [], questions: [] }).data;
    expect(data.confirmable).toBe(false);
    expect(data.localEditsAreCanonical).toBe(false);
    const item = { id: id(1), jobId: id(2), title: "Proof needed", detail: "Add proof", classification: "mandatory",
      resolution: "dismissed", fingerprint: "a".repeat(64), source: { snapshotRevision: 2 } };
    expect(inboxViewV1([item], id(2)).data.dismissalAuthorizesAction).toBe(false);
    expect(() => inboxViewV1([item], id(3))).toThrow("JOB_FORBIDDEN");
  });
  it("offers denied-media recovery without treating local or cross-job proof as verified", () => {
    const requirement: ProofRequirement = { tenantId: id(1), jobId: id(2), scopeItemId: id(3), evidenceType: "completion_photo" };
    const candidate: ProofCandidate = { ...requirement, uploadState: "uploaded", evidenceId: id(4), objectVersionId: "v1", originalPresent: true, invalidated: false };
    const denied = proofViewV1(requirement, candidate, "denied");
    expect(denied.data.gate).toEqual({ satisfied: false, reason: "unfinished" });
    expect(denied.data.recovery).toBe("select_existing_or_text_note");
    expect(proofViewV1(requirement, { ...candidate, uploadState: "verified", jobId: id(5) }, "granted").data.gate).toEqual({ satisfied: false, reason: "wrong_target" });
    expect(proofViewV1(requirement, { ...candidate, uploadState: "verified" }, "unavailable").data.gate.satisfied).toBe(true);
  });
});
