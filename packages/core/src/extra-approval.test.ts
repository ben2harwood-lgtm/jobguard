import { describe, expect, it } from "vitest";
import { approvalRulesV1, referenceApprovalRulesV1 } from "./contractor.js";
import { sha256 } from "./evidence-pack.js";
import { approvalSeparationConstraint, evaluateExtraApprovalRequirement, extraRoleConstraint, orderedExtraSteps, overdueEligibilityConstraint, preserveExtraWorkHistory } from "./extra-approval.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rules = () => approvalRulesV1.parse({ ...referenceApprovalRulesV1, proceedLimit: { pence: 100, currency: "GBP" }, bands: [{ upToPence: 100, steps: [] }, { upToPence: null, steps: referenceApprovalRulesV1.bands[1]!.steps }], clientApproval: { kind: "threshold", abovePence: 200, beforeWorkAbovePence: 300, timeLimitMinutes: 5 } });
const proposal = (net: number | null, document = rules()) => ({ version: "extra-approval-input.v1", ruleVersionId: id(1), ruleDocumentHash: sha256(JSON.stringify(document)), clientContractVersionId: id(2), revision: { id: id(3), hash: "b".repeat(64), net: net === null ? null : { pence: net, currency: "GBP" } }, rules: document });

describe("ENT-5 independent requirements", () => {
  it("E5-01 exact thresholds and unpriced requirements", () => {
    for (const value of [99, 100, 101, 199, 200, 201, 299, 300, 301]) {
      const result = evaluateExtraApprovalRequirement(proposal(value));
      expect(result.bandIndex).toBe(value <= 100 ? 0 : 1);
      expect(result.comparisons).toEqual({ withinProceedLimit: value <= 100, aboveClientThreshold: value > 200, aboveClientBeforeWorkThreshold: value > 300 });
      expect(result.approvalAuthority).toBe(false);
    }
    const result = evaluateExtraApprovalRequirement(proposal(null));
    expect(result.bandIndex).toBe(1);
    expect(result.comparisons).toEqual({ withinProceedLimit: false, aboveClientThreshold: true, aboveClientBeforeWorkThreshold: true });
    expect(result.approvalAuthority).toBe(false);
  });
  it("E5-02 partial immutable proposal retains supplied identities evidence and timer terms", () => {
    const raw = proposal(100), result = evaluateExtraApprovalRequirement(raw), before = JSON.stringify(result);
    raw.rules.evidence.photosRequired = false;
    raw.rules.bands[0]!.steps.push(referenceApprovalRulesV1.bands[0]!.steps[0]!);
    raw.revision.hash = "c".repeat(64);
    expect(JSON.stringify(result)).toBe(before);
    expect(Object.isFrozen(result.rules.evidence)).toBe(true);
    expect(result.ruleVersionId).toBe(id(1));
    expect(result.clientContractVersionId).toBe(id(2));
  });
  it("E5-01 malformed documents hash mismatch and invalid money fail with typed errors", () => {
    for (const raw of [{ ...proposal(1), rules: { ...rules(), unexpected: true } }, { ...proposal(1), ruleDocumentHash: "0".repeat(64) }, proposal(0), proposal(-1), proposal(1_000_000_000_001), proposal(1.5)]) {
      expect(() => evaluateExtraApprovalRequirement(raw)).toThrowError(expect.objectContaining({ code: "INVALID_EXTRA_APPROVAL_INPUT" }));
    }
  });
  it("BEN-Q06 required customer approval follows required company approvals", () => {
    expect(orderedExtraSteps(["supervisor", "surveyor"], true).map(s => s.role)).toEqual(["supervisor", "surveyor", "client_approver"]);
    expect(orderedExtraSteps([], true)).toEqual([{ kind: "contract_rule", role: "contract_rule", index: 0 }, { kind: "human", role: "client_approver", index: 1 }]);
    expect(orderedExtraSteps([], false)).toEqual([{ kind: "contract_rule", role: "contract_rule", index: 0 }]);
    const document = rules();
    if (document.clientApproval.kind === "threshold") document.clientApproval.beforeWorkAbovePence = 50;
    expect(evaluateExtraApprovalRequirement(proposal(100, document)).comparisons).toEqual({ withinProceedLimit: true, aboveClientThreshold: false, aboveClientBeforeWorkThreshold: true });
    expect(() => evaluateExtraApprovalRequirement({ ...proposal(100), rules: { ...rules(), clientApproval: { kind: "threshold", abovePence: 200, timeLimitMinutes: 5 } } })).toThrow();
  });
  it("BEN-Q01 surveyor pricing authority remains separate from pricing representation", () => {
    expect(extraRoleConstraint({ version: "extra-role-constraint.v1", action: "price", role: "surveyor", siteStaff: false })).toBe("permitted_constraint");
    for (const role of ["supervisor", "operative", "owner", "admin"]) expect(extraRoleConstraint({ version: "extra-role-constraint.v1", action: "price", role, siteStaff: true })).toBe("refused");
  });
  it("BEN-Q11 supervisor withdrawal does not infer wider role authority", () => {
    expect(extraRoleConstraint({ version: "extra-role-constraint.v1", action: "withdraw", role: "supervisor", siteStaff: true })).toBe("permitted_constraint");
    for (const role of ["surveyor", "owner", "admin", "commercial_manager", "operative"]) expect(extraRoleConstraint({ version: "extra-role-constraint.v1", action: "withdraw", role, siteStaff: true })).toBe("held");
  });
  it("BEN-Q04 revision cannot bypass separation or self-approval", () => {
    const base = { version: "extra-separation.v1", raiserPerson: id(1), candidatePerson: id(2), stepKey: "surveyor", revisionId: id(7), history: [{ person: id(2), stepKey: "supervisor", revisionId: id(6) }] };
    expect(approvalSeparationConstraint(base)).toBe("refused_reused_person");
    expect(approvalSeparationConstraint({ ...base, candidatePerson: id(1), history: [] })).toBe("refused_self");
    expect(approvalSeparationConstraint({ ...base, stepKey: "supervisor" })).toBe("held_repeat_semantics");
    expect(approvalSeparationConstraint({ ...base, candidatePerson: id(3) })).toBe("permitted_constraint");
    expect(() => approvalSeparationConstraint({ ...base, history: [{ person: id(2), revisionId: id(6) }] })).toThrow();
  });
  it("BEN-Q05 start and finish representations retain uncertainty and established breaches", () => {
    const before = { version: "extra-work-history.v1", start: { reference: "reported-start", uncertainty: "time uncertain" }, finish: { reference: "reported-finish", uncertainty: "scope uncertain" }, establishedBreaches: ["breach-fact-1"] };
    const after = preserveExtraWorkHistory(before, ["breach-fact-2"]);
    expect(after.start).toEqual(before.start); expect(after.finish).toEqual(before.finish);
    expect(after.establishedBreaches).toEqual(["breach-fact-1", "breach-fact-2"]);
    expect(preserveExtraWorkHistory(after, []).establishedBreaches).toEqual(after.establishedBreaches);
    expect(preserveExtraWorkHistory({ ...before, start: null, finish: null }, []).start).toBeNull();
    expect(extraRoleConstraint({ version: "extra-role-constraint.v1", action: "report", role: "operative", siteStaff: true })).toBe("permitted_constraint");
    expect(extraRoleConstraint({ version: "extra-role-constraint.v1", action: "report", role: "owner", siteStaff: false })).toBe("held");
    expect(() => preserveExtraWorkHistory({ ...before, timing: "before_work" }, [])).toThrow();
  });
  it("BEN-Q08 original approvers remain eligible and backups require agreed waits", () => {
    const input = { version: "extra-overdue-eligibility.v1", originalPeople: [id(1)], agreedBackupPeople: [id(2)], agreedWaitElapsed: false };
    expect(overdueEligibilityConstraint(input)).toEqual([id(1)]);
    expect(overdueEligibilityConstraint({ ...input, agreedWaitElapsed: true })).toEqual([id(1), id(2)]);
    expect(overdueEligibilityConstraint({ ...input, agreedBackupPeople: [], agreedWaitElapsed: true })).toEqual([id(1)]);
    expect(() => overdueEligibilityConstraint({ ...input, escalationRole: "owner" })).toThrow();
  });
});
