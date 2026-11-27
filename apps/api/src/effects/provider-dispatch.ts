import { type DecisionRecord, type DeploymentMode, requireApprovedDecision, requireG1ForPilot } from "@jobguard/config";

export function dispatchToProvider(mode: DeploymentMode, decision?: DecisionRecord): "gate_passed" {
  requireApprovedDecision(mode, "D04", decision);
  requireG1ForPilot(mode, process.env);
  return "gate_passed";
}

/** A queue delivery can carry work identifiers only. The practice executor
 * stays unavailable in pilot, even when the real-data gate is open. */
export async function executePracticeDispatch(mode: string | undefined, execute: () => Promise<void>): Promise<void> {
  requireG1ForPilot(mode, process.env);
  if (mode === "pilot_no_charge") throw new Error("PILOT_OUTBOUND_ADAPTER_UNAVAILABLE");
  await execute();
}
