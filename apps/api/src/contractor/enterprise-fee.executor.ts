import {
  EnterpriseFeeError, enterpriseFeeApprovalCheckV1, enterpriseFeeInvoiceWorkV1, enterpriseModeV1,
  parseEnterpriseFee, assertEnterpriseFeeApprovalBinding, refuseEnterpriseFeeExecution,
} from "@jobguard/core";
import { canonicalJson } from "@jobguard/db";
import { bindEnterpriseFeeReference, validateEnterpriseFeeReference } from "./enterprise-fee.application.js";

/**
 * Refusal/validation machinery only. No worker registration, enqueue, durable result or provider exists here.
 * currentFacts must eventually be read after commit from persisted authority by the executor; supplied unit facts
 * are not evidence of that integration. Q-02 holds even an otherwise valid synthetic invoice.
 */
export function refuseEnterpriseFeeInvoiceWork(raw: unknown, currentFacts: unknown, workerMode: unknown): never {
  const work = parseEnterpriseFee(enterpriseFeeInvoiceWorkV1, raw), mode = parseEnterpriseFee(enterpriseModeV1, workerMode);
  if (mode === "production_billing") throw new EnterpriseFeeError("SYNTHETIC_REFERENCE_FORBIDDEN");
  if (mode !== "synthetic_demo" || work.prepared.artifact.mode !== "synthetic_demo") throw new EnterpriseFeeError("FEE_GATE_CLOSED");
  const prepared = validateEnterpriseFeeReference(work.prepared);
  const expected = bindEnterpriseFeeReference(prepared, { version: "enterprise-fee-reference-binding.v1", revisionId: work.artifact.revisionId,
    action: "invoice-simulation", expiresAt: work.artifact.expiresAt });
  const current = parseEnterpriseFee(enterpriseFeeApprovalCheckV1, currentFacts);
  if (work.artifactHash !== expected.artifactHash || canonicalJson(work.artifact) !== canonicalJson(expected.artifact) ||
    work.authorizationId !== current.authorization.id || current.artifactHash !== expected.artifactHash ||
    canonicalJson(current.artifact) !== canonicalJson(expected.artifact)) throw new EnterpriseFeeError("STATEMENT_AUTHORITY_INVALID");
  assertEnterpriseFeeApprovalBinding(current);
  if (work.outcome === "outcome_unknown") throw new EnterpriseFeeError("OUTCOME_UNKNOWN");
  return refuseEnterpriseFeeExecution(mode, "invoice-simulation");
}
