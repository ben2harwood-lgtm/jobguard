import { type DecisionRecord, type DeploymentMode, requireApprovedDecision } from "@jobguard/config";

export function dispatchToProvider(mode: DeploymentMode, decision: DecisionRecord): "gate_passed" {
  requireApprovedDecision(mode, "D04", decision);
  return "gate_passed";
}
