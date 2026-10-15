import { describe, expect, it } from "vitest";
import {
  enterpriseFeeCommandV1, enterpriseFeeReconciliationV1, enterpriseFeeReadV1,
  enterpriseFeeAgreementV1, enterpriseFeeReferenceInputV1, enterpriseFeeSignedArtifactV1,
  enterpriseFeeMonth, enterpriseFeeRecordedBeforeCutoff, representEnterpriseFeeReference,
  assertEnterpriseFeeApprovalBinding, refuseEnterpriseFeeExecution, EnterpriseFeeError,
  enterpriseFeePublicError, enterpriseFeeUnpostedDisputeV1, enterpriseFeeStatementRevisionV1,
  type EnterpriseFeeReferenceInput, type EnterpriseFeeApprovalCheck,
} from "./enterprise-fee-statement.js";
import { type EnterpriseExtra, type EnterpriseGroup } from "./enterprise-domain/index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (c = "a") => c.repeat(64);
const exact = (n: number) => ({ numerator: String(n), denominator: "1" });
const time = "2026-10-10T12:00:00Z";
function group(n = 1, net = 15000): EnterpriseGroup {
  const grant = { id: id(60), tenantId: id(20), jobId: id(30), membershipId: id(40), role: "operative" as const };
  const e: EnterpriseExtra = {
    id: id(n), tenantId: id(20), jobId: id(30), scopeItemId: id(50 + n), state: "paid", duplicateOf: null,
    billingBalances: null, workDone: true, exportedAt: time, exportLineId: id(200 + n),
    origin: { version: "extra-origin.v1", tenantId: id(20), jobId: id(30), variationId: id(n),
      origin: { version: "variation-origin.v1", jobTrack: "contractor", kind: "site_user" },
      commandId: id(70 + n), raisingMembershipId: id(40), raisingRole: "operative", serverRecordedAt: time,
      deviceId: null, deviceCapturedAt: null, evidenceHash: hash() },
    raisingCommand: { id: id(70 + n), type: "LogSiteExtra", actorId: id(40), role: "operative", grant, assigned: true },
    orderAtOrigin: { revisionId: id(80), hash: hash(), coverage: "new" }, captureNote: "Synthetic extra",
    photo: { status: "none", evidenceId: null, hash: null, tenantId: null, jobId: null, scopeItemId: null, objectVersionId: null },
    residentCaptured: false, residentConfirmationHash: null, prompt: null,
    revision: { id: id(90 + n), hash: hash(), serverRecordedAt: time, netPence: net, priceConfirmed: true, priceSource: "surveyor_quoted",
      requirement: { ruleVersion: "reference-rule.v1", steps: [{ role: "surveyor", alternates: [] }], photoRequired: false, residentRequired: false },
      approvals: [{ index: 0, revisionId: id(90 + n), hash: hash(), netPence: net, ruleVersion: "reference-rule.v1",
        actorId: id(41), grant: { ...grant, id: id(61), membershipId: id(41), role: "surveyor" }, role: "surveyor", timing: "before_work", serverRecordedAt: time }] },
    billingFacts: [],
  };
  e.billingFacts = (["invoiced", "settled"] as const).map(kind => ({ tenantId: e.tenantId, jobId: e.jobId,
    scopeItemId: e.scopeItemId, revisionId: e.revision.id, revisionHash: e.revision.hash, exportLineId: e.exportLineId!,
    invoiceId: `invoice-${n}`, invoiceLineId: `line-${n}`, sourceRef: `${kind}-${n}`, kind, net: exact(net),
    recordedAt: time, effectiveAt: time, allocationRule: kind === "settled" ? "explicit" : null, originalSourceRef: null, status: "finalized" }));
  return { version: "enterprise-group.v1", tenantId: id(20), jobId: id(30), jobTrack: "contractor", currency: "GBP",
    mode: "synthetic_demo", feeGate: false, canonicalId: e.id, members: [e], unresolvedCandidateIds: [], agreementVersionId: "v1" };
}
function reference(groups = [group()]): EnterpriseFeeReferenceInput {
  return { version: "enterprise-fee-reference-input.v1", statement: { version: "enterprise-statement.v1", tenantId: id(20),
    period: "2026-10", statementId: id(100), recordedCutoff: "2026-11-01T00:00:00Z", mode: "synthetic_demo", groups,
    agreements: [{ version: "enterprise-agreement.v1", id: "v1", tenantId: id(20), hash: hash(), effectiveFrom: "2026-01-01T00:00:00Z",
      rate: { version: "fee-rate.v1", policyVersion: "v1", numerator: "10", denominator: "100" }, basis: "on_payment",
      minimumCommitment: null, onboardingFee: null, volumeBands: null }], prior: [] },
    sources: [{ kind: "origin", id: id(1), tenantId: id(20), jobId: id(30), hash: hash(), recordedAt: time }] };
}
function check(): EnterpriseFeeApprovalCheck {
  const artifact = { version: "enterprise-fee-signed-artifact.v1" as const, action: "post-reference" as const,
    tenantId: id(20), statementId: id(100), revisionId: id(101), statementHash: hash(), inputFactsHash: hash("b"),
    currency: "GBP" as const, totalPence: 1500, sections: [{ agreementVersionId: "v1", agreementHash: hash(), feePence: 1500 }],
    expiresAt: "2026-11-20T00:00:00Z" };
  return { version: "enterprise-fee-approval-check.v1", artifact, artifactHash: hash("c"), now: "2026-11-15T00:00:00Z",
    current: { tenantId: id(20), membershipId: id(41), grantId: id(61), role: "finance", sessionValid: true, membershipActive: true, grantActive: true },
    decision: { id: id(102), resolutionId: id(103), resolution: "approved", membershipId: id(41), artifactHash: hash("c"),
      artifact, revoked: false, superseded: false },
    authorization: { id: id(104), decisionId: id(102), resolutionId: id(103), membershipId: id(41), grantId: id(61),
      artifactHash: hash("c"), artifact, amountPence: 1500, currency: "GBP", revoked: false } };
}
const refuses = (fn: () => unknown, code: string) => {
  expect(fn).toThrow(EnterpriseFeeError);
  try { fn(); } catch (e) { expect(e).toHaveProperty("code", code); }
};

describe("ENT-7 independent reference boundaries (no database or command execution)", () => {
  it("E7-01 strict commands reject supplied tenant, actor, gate, settlement, totals and unknown actions", () => {
    const c = { version: "enterprise-fee-command.v1", action: "derive", commandId: id(1), period: "2026-10" };
    expect(enterpriseFeeCommandV1.safeParse(c).success).toBe(true);
    for (const field of ["tenantId", "actorId", "permission", "origin", "settled", "policyApproved", "feeGate", "priorNetPostedPence", "totalPence"])
      expect(enterpriseFeeCommandV1.safeParse({ ...c, [field]: true }).success).toBe(false);
    for (const patch of [{ action: "charge" }, { commandId: "invalid" }, { version: "v2" }, { period: "2026-13" }])
      expect(enterpriseFeeCommandV1.safeParse({ ...c, ...patch }).success).toBe(false);
  });
  it("E7-01 separate reconciliation and read boundaries reject authority fields and malformed hashes", () => {
    const c = { version: "enterprise-exported-duplicate.v1", commandId: id(1), jobId: id(30), canonicalId: id(2),
      memberIds: [id(2), id(3)], inputFactsHash: hash(), correctionManifestHash: hash("b"), decisionId: id(4), authorizationId: id(5), reasonCode: "duplicate_work" };
    expect(enterpriseFeeReconciliationV1.safeParse(c).success).toBe(true);
    for (const patch of [{ memberIds: [id(2), id(2)] }, { canonicalId: id(9) }, { inputFactsHash: "bad" }, { actorId: id(6) }, { amountPence: 1 }])
      expect(enterpriseFeeReconciliationV1.safeParse({ ...c, ...patch }).success).toBe(false);
    expect(enterpriseFeeReadV1.safeParse({ version: "enterprise-fee-read.v1", statementId: id(1), revision: 1 }).success).toBe(true);
    expect(enterpriseFeeReadV1.safeParse({ version: "enterprise-fee-read.v1", statementId: id(1), tenantId: id(20) }).success).toBe(false);
  });
  it("E7-01 server artifacts reject unsafe money, malformed rational strings and unknown fields", () => {
    const a = check().artifact;
    for (const totalPence of [Number.MAX_SAFE_INTEGER + 1, 1.5, 1_000_000_000_001])
      expect(enterpriseFeeSignedArtifactV1.safeParse({ ...a, totalPence }).success).toBe(false);
    for (const denominator of ["0", "-1", "1.0", "01"])
      expect(enterpriseFeeReferenceInputV1.safeParse({ ...reference(), statement: { ...reference().statement,
        prior: [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 0, derivationId: null,
          contributions: [{ extraId: id(1), qualifyingPrincipal: { numerator: "1", denominator } }] }] } }).success).toBe(false);
    expect(enterpriseFeeSignedArtifactV1.safeParse({ ...a, sections: [{ ...a.sections[0]!, feePence: 1 }] }).success).toBe(false);
    expect(enterpriseFeeReferenceInputV1.safeParse({ ...reference(), policyApproved: true }).success).toBe(false);
  });
  it("E7-03 reference agreement representations refuse invoice basis and unsupported formula fields", () => {
    const agreement = { version: "enterprise-fee-agreement.v1", id: id(1), tenantId: id(20), agreementRef: "synthetic-terms",
      rate: { numerator: "10", denominator: "100" }, basis: "on_payment", effectiveFrom: time,
      policyVersion: "enterprise_site_capture_policy_v1", endOfJobCheck: false, minimumCommitment: null,
      onboardingFee: null, volumeBands: null, contentHash: hash(), environment: "synthetic_demo", operationsActorRef: "operations:fixture", recordedAt: time };
    expect(enterpriseFeeAgreementV1.safeParse(agreement).success).toBe(true);
    for (const patch of [{ basis: "on_invoice_with_true_up" }, { minimumCommitment: 1 }, { onboardingFee: 1 }, { volumeBands: [] },
      { rate: { numerator: "101", denominator: "100" } }, { rate: { numerator: "10", denominator: "0" } }])
      expect(enterpriseFeeAgreementV1.safeParse({ ...agreement, ...patch }).success).toBe(false);
    for (const value of ["invalid", "", "1.5", "1".repeat(101)])
      expect(enterpriseFeeAgreementV1.safeParse({ ...agreement, rate: { numerator: value, denominator: "100" } }).success).toBe(false);
  });
  it("E7-03 exact rate versions bind to server origin time, never device time", () => {
    const r = reference([group(1), group(2)]);
    r.statement.groups[0]!.members[0]!.origin.deviceCapturedAt = "2026-01-01T00:00:00Z";
    const second = r.statement.groups[1]!;
    second.agreementVersionId = "v2"; second.members[0]!.origin.serverRecordedAt = "2026-10-16T00:00:00Z";
    second.members[0]!.origin.deviceCapturedAt = "2026-01-01T00:00:00Z";
    second.members[0]!.revision.serverRecordedAt = "2026-10-20T00:00:00Z";
    second.members[0]!.revision.approvals[0]!.serverRecordedAt = "2026-10-20T00:00:00Z";
    second.members[0]!.exportedAt = "2026-10-20T00:00:00Z";
    second.members[0]!.billingFacts = second.members[0]!.billingFacts.map(f => ({ ...f,
      recordedAt: "2026-10-20T00:00:00Z", effectiveAt: "2026-10-20T00:00:00Z" }));
    r.statement.agreements.push({ ...r.statement.agreements[0]!, id: "v2", effectiveFrom: "2026-10-15T00:00:00Z",
      rate: { version: "fee-rate.v1", policyVersion: "v2", numerator: "8", denominator: "100" } });
    expect(representEnterpriseFeeReference(r, hash()).sections.map(s => s.deltaPence)).toEqual([1500, 1200]);
    second.agreementVersionId = "v1";
    expect(() => representEnterpriseFeeReference(r, hash())).toThrow("AGREEMENT_VERSION_MISMATCH");
  });
  it("E7-07 reference role facts preserve the FEE-BOTH-1 rule without creating capture authority", () => {
    for (const role of ["operative", "supervisor", "surveyor"] as const) {
      const r = reference(), e = r.statement.groups[0]!.members[0]!;
      e.raisingCommand.role = role; e.origin.raisingRole = role; e.raisingCommand.grant.role = role;
      e.raisingCommand.assigned = false;
      expect(representEnterpriseFeeReference(r, hash()).totalPence).toBe(role === "operative" ? 0 : 1500);
    }
  });
  it("E7-06 pure excluded-state representations contribute zero; these are not command fixtures", () => {
    for (const state of ["withdrawn", "rejected", "billing_rejected", "logged", "approved", "exported"] as const) {
      const r = reference(); r.statement.groups[0]!.members[0]!.state = state;
      expect(representEnterpriseFeeReference(r, hash()).totalPence).toBe(0);
    }
  });
  it("E7-08 pending allocations contribute zero and wrong export/revision bindings are invalid", () => {
    const r = reference(), e = r.statement.groups[0]!.members[0]!;
    e.billingFacts[1]!.status = "pending";
    expect(representEnterpriseFeeReference(r, hash()).totalPence).toBe(0);
    e.billingFacts[1]!.exportLineId = id(300);
    expect(() => representEnterpriseFeeReference(r, hash())).toThrow();
    e.billingFacts[1]!.exportLineId = e.exportLineId!; e.billingFacts[1]!.revisionId = id(301);
    expect(() => representEnterpriseFeeReference(r, hash())).toThrow();
  });
  it("E7-09 supplied stale/self approvals or missing verified photo versions cannot qualify", () => {
    const r = reference(), e = r.statement.groups[0]!.members[0]!;
    e.revision.approvals[0]!.hash = hash("b");
    expect(representEnterpriseFeeReference(r, hash()).totalPence).toBe(0);
    e.revision.approvals[0]!.hash = hash();
    e.revision.approvals[0]!.actorId = e.origin.raisingMembershipId;
    expect(representEnterpriseFeeReference(r, hash()).totalPence).toBe(0);
    e.revision.approvals[0]!.actorId = id(41);
    e.revision.requirement!.photoRequired = true;
    e.photo = { status: "verified", evidenceId: id(400), hash: hash(), tenantId: e.tenantId, jobId: e.jobId, scopeItemId: e.scopeItemId, objectVersionId: null };
    expect(representEnterpriseFeeReference(r, hash()).totalPence).toBe(0);
    e.photo.objectVersionId = "synthetic-version";
    expect(representEnterpriseFeeReference(r, hash()).totalPence).toBe(1500);
    e.photo.jobId = id(31);
    expect(() => representEnterpriseFeeReference(r, hash())).toThrow();
  });
  it("E7-10 reference representations reuse cumulative half-even and preserve FP-1", () => {
    const r = reference([group(1, 5), group(2, 5), group(3, 5)]);
    const result = representEnterpriseFeeReference(r, hash());
    expect(result.sections[0]).toMatchObject({ cumulativeFeePence: 2, deltaPence: 2, kind: "proposal" });
    expect(result.sections[0]!.lines.map(l => l.feePence)).toEqual([1, 1, 0]);
    expect(result.totalPence).toBe(2); expect(result.postingAuthorized).toBe(false);
    expect(Object.isFrozen(result.sections[0]!.lines[0]!.trace)).toBe(true);
    expect(() => JSON.stringify(result)).not.toThrow();
    r.statement.prior = [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 0,
      derivationId: id(101), contributions: [{ extraId: id(1), qualifyingPrincipal: exact(15) }] }];
    expect(() => representEnterpriseFeeReference(r, hash())).toThrow("INVALID_STATEMENT");
  });
  it("E7-10 signed mixed contribution changes preserve FP-2 without authorizing posting", () => {
    const r = reference([group(1, 15000), group(2, 10000)]);
    r.statement.groups[0]!.members[0]!.billingFacts.push({ ...r.statement.groups[0]!.members[0]!.billingFacts[0]!,
      kind: "credited", sourceRef: "credit", net: exact(5000) });
    r.statement.prior = [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 1500,
      derivationId: id(101), contributions: [{ extraId: id(1), qualifyingPrincipal: exact(15000) }] }];
    const result = representEnterpriseFeeReference(r, hash());
    expect(result.sections[0]!.lines.map(l => l.feePence)).toEqual([-500, 1000]);
    expect(result.totalPence).toBe(500); expect(result.postingAuthorized).toBe(false);
  });
  it("E7-11 London calendar months account for both DST boundaries", () => {
    expect(enterpriseFeeMonth("2026-03")).toEqual({ period: "2026-03", timeZone: "Europe/London", start: "2026-03-01T00:00:00Z", cutoff: "2026-03-31T23:00:00Z" });
    expect(enterpriseFeeMonth("2026-10").cutoff).toBe("2026-11-01T00:00:00Z");
    expect(enterpriseFeeMonth("2026-09").cutoff).toBe("2026-09-30T23:00:00Z");
    expect(enterpriseFeeMonth("2026-12").cutoff).toBe("2027-01-01T00:00:00Z");
    refuses(() => enterpriseFeeMonth("2026-00"), "INVALID_FEE_INPUT");
    refuses(() => representEnterpriseFeeReference({ ...reference(), statement: { ...reference().statement, recordedCutoff: time } }, hash()), "INVALID_FEE_INPUT");
  });
  it("E7-11 recorded time preserves microseconds and FP-3, ignoring the effective date", () => {
    expect(enterpriseFeeRecordedBeforeCutoff("2026-10-31T23:59:59.999999Z", "2026-10")).toBe(true);
    expect(enterpriseFeeRecordedBeforeCutoff("2026-11-01T00:00:00Z", "2026-10")).toBe(false);
    expect(enterpriseFeeRecordedBeforeCutoff("2026-11-01T01:00:00+01:00", "2026-10")).toBe(false);
    const r = reference(); const e = r.statement.groups[0]!.members[0]!;
    e.billingFacts.push({ ...e.billingFacts[0]!, kind: "credited", sourceRef: "late-credit", net: exact(5000),
      recordedAt: "2026-11-01T00:00:00Z", effectiveAt: time });
    const october = representEnterpriseFeeReference(r, hash());
    expect(october.totalPence).toBe(1500);
    r.statement.period = "2026-11"; r.statement.recordedCutoff = "2026-12-01T00:00:00Z";
    r.statement.prior = [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 1500,
      derivationId: id(101), contributions: [{ extraId: id(1), qualifyingPrincipal: exact(15000) }] }];
    const november = representEnterpriseFeeReference(r, hash("b"));
    expect(november.sections[0]).toMatchObject({ deltaPence: -500, kind: "linked_compensation", compensatesDerivationId: id(101) });
    expect(october.totalPence).toBe(1500);
  });
  it("E7-21 zero principal compensation keeps the original trace; absent trace is refused", () => {
    const r = reference();
    const e = r.statement.groups[0]!.members[0]!;
    e.billingFacts.push({ ...e.billingFacts[1]!, kind: "reversed", sourceRef: "reversed", originalSourceRef: "settled-1", net: exact(-15000) });
    r.statement.prior = [{ agreementVersionId: "v1", priorPolicyVersion: "v1", priorNetPostedPence: 1500,
      derivationId: id(101), contributions: [{ extraId: id(1), qualifyingPrincipal: exact(15000) }] }];
    const result = representEnterpriseFeeReference(r, hash());
    expect(result.sections[0]!.lines[0]).toMatchObject({ currentPrincipal: exact(0), feePence: -1500,
      trace: { canonicalId: id(1), members: [{ exportLineId: id(201) }] } });
    r.statement.groups = [];
    refuses(() => representEnterpriseFeeReference(r, hash()), "TRACE_REQUIRED");
  });
  it("E7-10 zero result has no journal or posting authority", () => {
    const r = reference([group(1, 5)]), result = representEnterpriseFeeReference(r, hash());
    expect(result.sections[0]).toMatchObject({ deltaPence: 0, kind: "zero_result" });
    expect(result).not.toHaveProperty("journal"); expect(result.postingAuthorized).toBe(false);
  });
  it("E7-12 independent binding validation compares every exact artifact and current authority field", () => {
    expect(() => assertEnterpriseFeeApprovalBinding(check())).not.toThrow();
    const variants = [
      (c: EnterpriseFeeApprovalCheck) => { c.current.role = "owner"; },
      (c: EnterpriseFeeApprovalCheck) => { c.current.sessionValid = false; },
      (c: EnterpriseFeeApprovalCheck) => { c.current.membershipActive = false; },
      (c: EnterpriseFeeApprovalCheck) => { c.current.grantActive = false; },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.membershipId = id(42); },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.grantId = id(62); },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.artifactHash = hash("d"); },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.amountPence = 1499; },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.revoked = true; },
      (c: EnterpriseFeeApprovalCheck) => { c.decision.resolution = "dismissed"; },
      (c: EnterpriseFeeApprovalCheck) => { c.decision.superseded = true; },
      (c: EnterpriseFeeApprovalCheck) => { c.decision.revoked = true; },
      (c: EnterpriseFeeApprovalCheck) => { c.decision.resolutionId = id(105); },
      (c: EnterpriseFeeApprovalCheck) => { c.now = c.artifact.expiresAt; },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.artifact = { ...c.artifact, inputFactsHash: hash("e") }; },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.artifact = { ...c.artifact, statementHash: hash("e") }; },
      (c: EnterpriseFeeApprovalCheck) => { c.authorization.artifact = { ...c.artifact, sections: [{ ...c.artifact.sections[0]!, agreementVersionId: "v2" }] }; },
    ];
    for (const alter of variants) { const c = structuredClone(check()); alter(c); refuses(() => assertEnterpriseFeeApprovalBinding(c), "STATEMENT_AUTHORITY_INVALID"); }
  });
  it("E7-12 Q-04 mixed signed sections stay held even when the net is zero", () => {
    const c = check();
    c.artifact = { ...c.artifact, totalPence: 0, sections: [{ ...c.artifact.sections[0]!, feePence: 1500 },
      { agreementVersionId: "v2", agreementHash: hash("d"), feePence: -1500 }] };
    c.decision.artifact = c.artifact; c.authorization.artifact = c.artifact; c.authorization.amountPence = 0;
    refuses(() => assertEnterpriseFeeApprovalBinding(c), "MIXED_SIGN_HELD");
  });
  it("E7-14 unposted-dispute intent is unapproved data and cannot reuse the original revision identity", () => {
    const value = { version: "enterprise-fee-unposted-dispute.v1", commandId: id(1), statementId: id(100), sourceRevisionId: id(101),
      sourceStatementHash: hash(), proposedRevisionId: id(102), excludedContributions: [{ agreementVersionId: "v1", extraId: id(2) }],
      reasonCode: "origin", explanation: "Synthetic dispute", state: "unapproved" };
    expect(enterpriseFeeUnpostedDisputeV1.safeParse(value).success).toBe(true);
    expect(enterpriseFeeUnpostedDisputeV1.safeParse({ ...value, state: "approved" }).success).toBe(false);
    expect(enterpriseFeeUnpostedDisputeV1.safeParse({ ...value, proposedRevisionId: id(101) }).success).toBe(false);
    expect(enterpriseFeeUnpostedDisputeV1.safeParse({ ...value, compensationPence: 1500 }).success).toBe(false);
    expect(enterpriseFeeUnpostedDisputeV1.safeParse({ ...value, excludedContributions: [...value.excludedContributions, ...value.excludedContributions] }).success).toBe(false);
    expect(value.state).toBe("unapproved");
  });
  it("E7-11 numbered revision representations bind the statement and previous identity", () => {
    const manifest = reference(), artifact = representEnterpriseFeeReference(manifest, hash());
    const value = { version: "enterprise-fee-statement-revision.v1", statementId: id(100), revisionId: id(101), revisionNumber: 1,
      previousRevisionId: null, prepared: { version: "enterprise-fee-prepared-reference.v1", manifest, artifact, inputFactsHash: hash(), statementHash: hash("b") }, serverRecordedAt: time };
    expect(enterpriseFeeStatementRevisionV1.safeParse(value).success).toBe(true);
    expect(enterpriseFeeStatementRevisionV1.safeParse({ ...value, revisionNumber: 2 }).success).toBe(false);
    expect(enterpriseFeeStatementRevisionV1.safeParse({ ...value, revisionNumber: 2, previousRevisionId: id(102) }).success).toBe(true);
    expect(enterpriseFeeStatementRevisionV1.safeParse({ ...value, statementId: id(999) }).success).toBe(false);
    expect(enterpriseFeeStatementRevisionV1.safeParse({ ...value, approved: true }).success).toBe(false);
  });
  it("E7-R6 independent public refusal representation has no resource detail", () => {
    expect(enterpriseFeePublicError(new EnterpriseFeeError("EXTRA_FORBIDDEN"))).toEqual({ status: 403,
      body: { version: "enterprise-fee-error.v1", code: "EXTRA_FORBIDDEN" } });
  });
  it("E7-25 every execution mode refuses charging and pilot illustrations have the exact label", () => {
    const r = reference(); r.statement.mode = "pilot_no_charge"; r.statement.groups[0]!.mode = "pilot_no_charge";
    expect(representEnterpriseFeeReference(r, hash()).label).toBe("Illustration — no charge");
    for (const action of ["accrue", "collect", "invoice-simulation"] as const) {
      refuses(() => refuseEnterpriseFeeExecution("pilot_no_charge", action), "FEE_GATE_CLOSED");
      refuses(() => refuseEnterpriseFeeExecution("production_billing", action), "FEE_GATE_CLOSED");
      refuses(() => refuseEnterpriseFeeExecution("synthetic_demo", action), "STATEMENT_EXECUTION_HELD");
    }
    expect(enterpriseFeeReferenceInputV1.safeParse({ ...r, statement: { ...r.statement, mode: "production_billing" } }).success).toBe(false);
  });
});
