import { type DecisionRecord, type DeploymentMode, requireApprovedDecision } from "@jobguard/config";

export function issueTaxInvoice(mode: DeploymentMode, decision: DecisionRecord): "gate_passed" {
  requireApprovedDecision(mode, "D02", decision);
  return "gate_passed";
}
