export const deploymentModes = ["synthetic_demo", "pilot_no_charge", "provider_sandbox", "production_billing"] as const;
export type DeploymentMode = (typeof deploymentModes)[number];

export type DecisionId = `D${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12"}`;
export type DecisionStatus = "proposed" | "approved" | "superseded";
export type DecisionRecord = Readonly<{ id: DecisionId; policyVersion: string; status: DecisionStatus }>;

export class PolicyGateDeniedError extends Error {
  readonly code = "POLICY_GATE_DENIED";
  constructor(readonly decisionId: DecisionId, readonly mode: DeploymentMode, readonly policyVersion: string) {
    super(`${decisionId} (${policyVersion}) must be approved before this effect can run in ${mode}`);
    this.name = "PolicyGateDeniedError";
  }
}

/** Deployment mode is supplied by trusted server configuration, never request input. */
export function requireApprovedDecision(mode: DeploymentMode, requiredId: DecisionId, decision: DecisionRecord): void {
  if (mode === "production_billing" && (decision.id !== requiredId || decision.status !== "approved")) {
    throw new PolicyGateDeniedError(requiredId, mode, decision.policyVersion);
  }
}

/** The repository records are deliberately proposed until founder approval evidence exists. */
export const proposedDecisionRecords = {
  D01: { id: "D01", policyVersion: "reference_fee_policy_v1", status: "proposed" },
  D02: { id: "D02", policyVersion: "reference_tax_invoice_policy_v1", status: "proposed" },
  D04: { id: "D04", policyVersion: "provider_residency_policy_v1", status: "proposed" },
} as const satisfies Record<"D01" | "D02" | "D04", DecisionRecord>;
