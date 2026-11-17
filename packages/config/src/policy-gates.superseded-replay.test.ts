import { describe, expect, it } from "vitest";
import { PolicyGateDeniedError, requireApprovedDecision, type DecisionRecord } from "./policy-gates.js";

// Fictional in-memory fixtures only. "approved" here is a test value, never founder approval or release evidence.
const approved: DecisionRecord = Object.freeze({ id: "D04", policyVersion: "fixture_policy_v1", status: "approved" });
const proposed: DecisionRecord = Object.freeze({ id: "D04", policyVersion: "fixture_policy_v2", status: "proposed" });
const superseded: DecisionRecord = Object.freeze({ id: "D04", policyVersion: "fixture_policy_v1", status: "superseded" });

describe("PG2 proposed and superseded records stay refused", () => {
  it("refuses a proposed record", () => {
    expect(() => requireApprovedDecision("production_billing", "D04", proposed)).toThrow(PolicyGateDeniedError);
  });

  it("refuses a superseded record", () => {
    expect(() => requireApprovedDecision("production_billing", "D04", superseded)).toThrow(PolicyGateDeniedError);
  });

  it("refuses proposed and superseded records after an earlier call passed with an approved record", () => {
    expect(() => requireApprovedDecision("production_billing", "D04", approved)).not.toThrow();
    expect(() => requireApprovedDecision("production_billing", "D04", proposed)).toThrow(PolicyGateDeniedError);
    expect(() => requireApprovedDecision("production_billing", "D04", superseded)).toThrow(PolicyGateDeniedError);
    expect(() => requireApprovedDecision("production_billing", "D04", approved)).not.toThrow();
  });
});

describe("PG3 refusals retain context and do not mutate inputs", () => {
  it("keeps required decision id, mode and supplied policy version", () => {
    try {
      requireApprovedDecision("production_billing", "D04", superseded);
      expect.unreachable("gate should have refused");
    } catch (error) {
      const denied = error as PolicyGateDeniedError;
      expect(denied).toBeInstanceOf(PolicyGateDeniedError);
      expect(denied.code).toBe("POLICY_GATE_DENIED");
      expect(denied.decisionId).toBe("D04");
      expect(denied.mode).toBe("production_billing");
      expect(denied.policyVersion).toBe("fixture_policy_v1");
    }
  });

  it("does not mutate fixture records across passing and refusing calls", () => {
    const before = JSON.stringify([approved, proposed, superseded]);
    for (const record of [approved, proposed, superseded]) {
      try {
        requireApprovedDecision("production_billing", "D04", record);
      } catch {
        // refusal is asserted elsewhere
      }
    }
    expect(JSON.stringify([approved, proposed, superseded])).toBe(before);
    expect(Object.isFrozen(approved) && Object.isFrozen(proposed) && Object.isFrozen(superseded)).toBe(true);
  });
});
