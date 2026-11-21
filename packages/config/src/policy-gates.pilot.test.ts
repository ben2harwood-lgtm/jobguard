import { expect, it } from "vitest";
import { PilotG1DeniedError, PolicyGateDeniedError, pilotPolicyVersions, requireApprovedDecision, requirePilotG1, type DecisionId } from "./policy-gates.js";
import { pilotApprovalFixture, unavailablePilotApproval, unavailablePilotApprovals } from "./policy-gates.pilot-test-fixture.js";

it.each(Object.keys(pilotPolicyVersions) as (keyof typeof pilotPolicyVersions)[])("%s requires its exact approved pilot version", id => {
  const policyVersion = pilotPolicyVersions[id];
  const approved = { id, policyVersion, status: "approved" } as const;
  const wrongId: DecisionId = id === "D04" ? "D02" : "D04";
  for (const record of [undefined, { ...approved, id: wrongId }, { ...approved, policyVersion: policyVersion + "_other" },
    { ...approved, status: "proposed" }, { ...approved, status: "superseded" }, { ...approved, status: "revoked" }] as const) {
    expect(() => requireApprovedDecision("pilot_no_charge", id, record)).toThrow(PolicyGateDeniedError);
  }
  expect(() => requireApprovedDecision("pilot_no_charge", id, approved)).not.toThrow();
});

it.each(unavailablePilotApprovals)("requires a current trusted record when approval is %s", (_name, value) => {
  expect(() => requirePilotG1(unavailablePilotApproval(value))).toThrow(PilotG1DeniedError);
});

it("binds all decisions, receipts and candidate fields at evaluation time", () => {
  const { approval, env } = pilotApprovalFixture();
  expect(() => requirePilotG1(env)).not.toThrow();
  for (const candidate of [{ topologyHash: "e".repeat(64) }, { migrationsHash: "e".repeat(64) }]) {
    expect(() => requirePilotG1({ ...env, JOBGUARD_PILOT_21_APPROVAL: JSON.stringify({ ...approval, candidate: { ...approval.candidate, ...candidate } }) })).toThrow(PilotG1DeniedError);
  }
  const invalid = [
    { g0: undefined }, { g1: undefined }, { activation: undefined },
    { decisions: approval.decisions.filter(x => x.id === "D04") },
    { decisions: approval.decisions.map(x => ({ ...x, id: "D04" })) },
    { decisions: approval.decisions.map(x => x.id === "D04" ? { ...x, policyVersion: "other" } : x) },
    { expiresAt: new Date(Date.now() - 1).toISOString() },
  ];
  for (const patch of invalid) {
    expect(() => requirePilotG1({ ...env, JOBGUARD_PILOT_21_APPROVAL: JSON.stringify({ ...approval, ...patch }) })).toThrow(PilotG1DeniedError);
  }
});
