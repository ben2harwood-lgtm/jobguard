import { type DecisionRecord, type DeploymentMode, requireApprovedDecision, requireG1ForPilot } from "@jobguard/config";

export function issueTaxInvoice(mode: DeploymentMode, decision?: DecisionRecord): "gate_passed" {
  requireApprovedDecision(mode, "D02", decision);
  requireG1ForPilot(mode, process.env);
  return "gate_passed";
}
