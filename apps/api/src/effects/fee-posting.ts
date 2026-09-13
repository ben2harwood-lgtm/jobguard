import { type DecisionRecord, type DeploymentMode, requireApprovedDecision } from "@jobguard/config";

export function postFeeObligation(mode: DeploymentMode, decision: DecisionRecord): "gate_passed" {
  requireApprovedDecision(mode, "D01", decision);
  return "gate_passed";
}
