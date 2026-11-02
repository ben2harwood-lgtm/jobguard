import { z } from "zod";
import { deploymentModes, requireApprovedDecision } from "./policy-gates.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const reference = z.string().min(1).max(300);
const approval = z.object({ approvedBy: reference, approvedAt: z.iso.datetime(), evidenceHash: hash }).strict();
const decision = (id: "D12" | "D16", policyVersion: string) => z.object({ id: z.literal(id),
  policyVersion: z.literal(policyVersion), status: z.literal("approved"), approval }).strict();
/** Evidence DATA only. Parsing this record never constitutes approval or opens a live path. */
export const enterprisePilotEvidenceV1 = z.object({ version: z.literal("enterprise-pilot-evidence.v1"),
  tenantId: z.guid(), agreementVersionId: z.guid(), termsHash: hash,
  signedPilot: z.object({ termsHash: hash, agreementVersionId: z.guid(), evidenceHash: hash }).strict(),
  signedDpaHash: hash, contractSetHash: hash, solicitorReview: approval, founderPilotApproval: approval,
  g1EvidenceHash: hash, d12: decision("D12", "third_party_data_protection_policy_v4"),
  d16: decision("D16", "enterprise_site_capture_policy_v1"),
}).strict().refine(v => v.signedPilot.termsHash === v.termsHash && v.signedPilot.agreementVersionId === v.agreementVersionId &&
  v.founderPilotApproval.evidenceHash === v.termsHash && v.solicitorReview.evidenceHash === v.contractSetHash,
"Pilot review and signature must bind the exact terms/version and contract set");

export class EnterpriseRealDataDeniedError extends Error {
  readonly code = "ENTERPRISE_REAL_DATA_DENIED";
  constructor() { super("enterprise_real_data is dark pending release approval"); this.name = "EnterpriseRealDataDeniedError"; }
}
/** Server-only gate. No flag or supplied approval can activate real contractor data in this slice. */
export function requireEnterpriseRealData(mode: unknown, tenantId: string, rawEvidence: unknown): never {
  const deployment = z.enum(deploymentModes).safeParse(mode);
  const evidence = enterprisePilotEvidenceV1.safeParse(rawEvidence);
  if (!deployment.success || !evidence.success || evidence.data.tenantId !== tenantId) throw new EnterpriseRealDataDeniedError();
  requireApprovedDecision(deployment.data, "D12", evidence.data.d12, "enterprise_real_data");
  requireApprovedDecision(deployment.data, "D16", evidence.data.d16, "enterprise_real_data");
  throw new EnterpriseRealDataDeniedError();
}
