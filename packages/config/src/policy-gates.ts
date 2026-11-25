import { z } from "zod";

export const deploymentModes = ["synthetic_demo", "pilot_no_charge", "provider_sandbox", "production_billing"] as const;
export type DeploymentMode = (typeof deploymentModes)[number];

export type DecisionId = `D${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16"}`;
export type DecisionStatus = "proposed" | "approved" | "superseded" | "revoked";
export type DecisionRecord = Readonly<{ id: DecisionId; policyVersion: string; status: DecisionStatus }>;

export class PolicyGateDeniedError extends Error {
  readonly code = "POLICY_GATE_DENIED";
  constructor(readonly decisionId: DecisionId, readonly mode: DeploymentMode, readonly policyVersion: string) {
    super(`${decisionId} (${policyVersion}) must be approved before this effect can run in ${mode}`);
    this.name = "PolicyGateDeniedError";
  }
}

/** Deployment mode is supplied by trusted server configuration, never request input. */
export type EnterpriseGate = "enterprise_real_data" | "enterprise_fee_posting" | "enterprise_fee_collection" | "enterprise_ai_prompts";
export const pilotPolicyVersions = {
  D02: "reference_tax_invoice_policy_v1",
  D04: "provider_residency_policy_v1",
  D06: "customer_approval_jurisdiction_policy_v2",
  D07: "pilot_data_operations_policy_v1",
  D12: "third_party_data_protection_policy_v4",
  D13: "shadow_attribution_policy_v3",
} as const satisfies Partial<Record<DecisionId, string>>;

export function requireApprovedDecision(
  mode: DeploymentMode, requiredId: DecisionId, decision?: DecisionRecord, gate?: EnterpriseGate,
): void {
  if (!deploymentModes.includes(mode)) mode = "production_billing";
  const pilotVersion = mode === "pilot_no_charge"
    ? pilotPolicyVersions[requiredId as keyof typeof pilotPolicyVersions] : undefined;
  if (mode !== "production_billing" && !(mode === "pilot_no_charge" && (gate !== undefined || pilotVersion))) return;
  if (decision?.id !== requiredId || decision.status !== "approved" ||
      (pilotVersion !== undefined && decision.policyVersion !== pilotVersion)) {
    throw new PolicyGateDeniedError(requiredId, mode, pilotVersion ?? decision?.policyVersion ?? "missing");
  }
}

const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const candidateSchema = z.strictObject({ releaseSha: sha, topologyHash: digest, migrationsHash: digest });
const receiptSchema = z.strictObject({
  evidenceHash: digest, approvedBy: z.string().trim().min(1), approvedAt: z.iso.datetime(),
});
const decisionSchema = receiptSchema.extend({
  id: z.enum(["D02", "D04", "D06", "D07", "D12", "D13"]),
  policyVersion: z.string(),
  status: z.literal("approved"),
});
const pilotApprovalSchema = z.strictObject({
  version: z.literal("pilot-21-approval.v1"),
  status: z.literal("active"),
  candidate: candidateSchema,
  g0: receiptSchema,
  g1: receiptSchema,
  activation: receiptSchema,
  expiresAt: z.iso.datetime(),
  decisions: z.array(decisionSchema).length(Object.keys(pilotPolicyVersions).length),
});

export class PilotG1DeniedError extends Error {
  readonly code = "PILOT_G1_CLOSED";
  constructor() { super("PILOT_G1_CLOSED"); this.name = "PilotG1DeniedError"; }
}

/** Only server composition calls this switch. Deployment supplies both the running
 * candidate identity and its trusted, current PILOT-21 record. Read it per operation. */
export function requirePilotG1(env: Readonly<Record<string, string | undefined>>): void {
  const candidate = candidateSchema.safeParse({
    releaseSha: env.JOBGUARD_RELEASE_SHA,
    topologyHash: env.JOBGUARD_PILOT_TOPOLOGY_HASH,
    migrationsHash: env.JOBGUARD_PILOT_MIGRATIONS_HASH,
  });
  if (env.JOBGUARD_ENV !== "pilot_no_charge" || !candidate.success || !env.JOBGUARD_PILOT_21_APPROVAL) {
    throw new PilotG1DeniedError();
  }
  let input: unknown;
  try { input = JSON.parse(env.JOBGUARD_PILOT_21_APPROVAL); }
  catch { throw new PilotG1DeniedError(); }
  const parsed = pilotApprovalSchema.safeParse(input);
  if (!parsed.success) throw new PilotG1DeniedError();
  const record = parsed.data;
  const now = Date.now();
  const approvedAt = Date.parse(record.activation.approvedAt);
  if (record.candidate.releaseSha !== candidate.data.releaseSha ||
      record.candidate.topologyHash !== candidate.data.topologyHash ||
      record.candidate.migrationsHash !== candidate.data.migrationsHash ||
      Date.parse(record.expiresAt) <= now || approvedAt > now ||
      Date.parse(record.g0.approvedAt) > Date.parse(record.g1.approvedAt) ||
      Date.parse(record.g1.approvedAt) > approvedAt) throw new PilotG1DeniedError();

  for (const id of Object.keys(pilotPolicyVersions) as (keyof typeof pilotPolicyVersions)[]) {
    const decision = record.decisions.find(item => item.id === id);
    if (!decision || decision.policyVersion !== pilotPolicyVersions[id] ||
        Date.parse(decision.approvedAt) > Date.parse(record.g1.approvedAt)) throw new PilotG1DeniedError();
  }
}

/** Conditional guard for existing mixed-mode entry points. */
export function requireG1ForPilot(mode: string | undefined, env: Readonly<Record<string, string | undefined>>): void {
  if (mode === "pilot_no_charge") requirePilotG1(env);
}

/** The repository records are deliberately proposed until founder approval evidence exists. */
export const proposedDecisionRecords = {
  D01: { id: "D01", policyVersion: "reference_fee_policy_v1", status: "proposed" },
  D02: { id: "D02", policyVersion: "reference_tax_invoice_policy_v1", status: "proposed" },
  D04: { id: "D04", policyVersion: "provider_residency_policy_v1", status: "proposed" },
} as const satisfies Record<"D01" | "D02" | "D04", DecisionRecord>;
