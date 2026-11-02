import { type DecisionRecord, type DeploymentMode, requireApprovedDecision } from "@jobguard/config";
import { requireProductionSettlementEligibility } from "../production-settlement-guard.js";

export function postFeeObligation(mode: DeploymentMode, decision: DecisionRecord): "gate_passed" {
  requireApprovedDecision(mode, "D01", decision);
  requireProductionSettlementEligibility(mode);
  return "gate_passed";
}
