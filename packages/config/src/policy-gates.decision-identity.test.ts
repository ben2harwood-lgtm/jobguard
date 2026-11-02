import { describe, expect, it } from "vitest";
import { PolicyGateDeniedError, requireApprovedDecision, type DecisionRecord } from "./policy-gates.js";

// Fictional in-memory fixtures only. "approved" here is a test value, never founder approval or release evidence.
const approvedD01: DecisionRecord = Object.freeze({ id: "D01", policyVersion: "fixture_policy_d01_v1", status: "approved" });
const approvedD02: DecisionRecord = Object.freeze({ id: "D02", policyVersion: "fixture_policy_d02_v1", status: "approved" });

describe("PG1 decision identity at the production gate", () => {
  it("passes when the approved record matches the required decision id", () => {
    expect(() => requireApprovedDecision("production_billing", "D01", approvedD01)).not.toThrow();
  });

  it("refuses an approved record for a different decision", () => {
    expect(() => requireApprovedDecision("production_billing", "D01", approvedD02)).toThrow(PolicyGateDeniedError);
  });

  it("refusal names the required decision, not the supplied one", () => {
    try {
      requireApprovedDecision("production_billing", "D01", approvedD02);
      expect.unreachable("gate should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyGateDeniedError);
      expect((error as PolicyGateDeniedError).decisionId).toBe("D01");
    }
  });
});
