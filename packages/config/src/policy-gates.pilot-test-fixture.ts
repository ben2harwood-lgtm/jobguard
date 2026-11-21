import { pilotPolicyVersions } from "./policy-gates.js";

/** Fictional receipt for isolated tests only. No application imports this module. */
export function pilotApprovalFixture() {
  const candidate = { releaseSha: "a".repeat(40), topologyHash: "b".repeat(64), migrationsHash: "c".repeat(64) };
  const receipt = { evidenceHash: "d".repeat(64), approvedBy: "Fictional Approver", approvedAt: new Date(Date.now() - 60_000).toISOString() };
  const approval = {
    version: "pilot-21-approval.v1",
    status: "active",
    candidate: { ...candidate },
    g0: { ...receipt, approvedBy: "Fictional Technical Acceptor" },
    g1: receipt,
    activation: receipt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    decisions: Object.entries(pilotPolicyVersions).map(([id, policyVersion]) => ({ ...receipt, id, policyVersion, status: "approved" })),
  };
  const env = {
    JOBGUARD_ENV: "pilot_no_charge",
    JOBGUARD_RELEASE_SHA: candidate.releaseSha,
    JOBGUARD_PILOT_TOPOLOGY_HASH: candidate.topologyHash,
    JOBGUARD_PILOT_MIGRATIONS_HASH: candidate.migrationsHash,
    JOBGUARD_PILOT_21_APPROVAL: JSON.stringify(approval),
  };
  return { approval, env };
}

export const unavailablePilotApprovals = [
  ["missing", undefined],
  ["invalid", "{untrusted"],
  ["stale", "stale"],
  ["revoked", "revoked"],
] as const;

export function unavailablePilotApproval(value: (typeof unavailablePilotApprovals)[number][1]) {
  const { approval, env } = pilotApprovalFixture();
  if (value === "stale") approval.candidate.releaseSha = "e".repeat(40);
  if (value === "revoked") approval.status = "revoked";
  return { ...env, JOBGUARD_PILOT_21_APPROVAL: value === undefined || value === "{untrusted" ? value : JSON.stringify(approval) };
}
