// Administrative synthetic stored-row fixtures. These do not impersonate the practice
// statement writer or claim identity sessions can issue its practice-tenant statements.
import { randomUUID, createHash } from "node:crypto";
import { platformInvoiceCanonical, issuedSimulationFeeStatementV1 } from "@jobguard/core";
export const feeHash = (value: unknown) => createHash("sha256").update(platformInvoiceCanonical(value)).digest("hex");
export function feeSourceFixture(jobId: string, sequence = 1, amount = 3200) {
  const id = randomUUID(), approvalId = randomUUID(), decisionId = randomUUID();
  const sourceSnapshot = { postingRevision: sequence, qualifyingPrincipal: { numerator: "282000", denominator: "1" }, feePence: 28200,
    adjustments: { paymentReversalIds: [], creditNoteIds: [], evidenceInvalidationIds: [] },
    derivations: [{ derivationId: randomUUID(), reviewId: randomUUID(), authorizationId: randomUUID(), statementHash: "a".repeat(64) }],
    sources: [{ assessmentId: randomUUID(), currentAssessmentId: randomUUID(), sourceHash: "b".repeat(64), reviewAuthorizationId: randomUUID(),
      allocationIds: [randomUUID(), randomUUID()], remainingPrincipal: { numerator: "282000", denominator: "1" }, reasonCodes: [] }],
  };
  const document = issuedSimulationFeeStatementV1.parse({ version: "issued-simulation-fee-statement.v1", statementId: id, jobId,
    number: `DEMO-FEE-${String(sequence).padStart(6, "0")}`, namespace: "success_fee.synthetic.v1", environment: "synthetic_demo",
    policyVersion: "reference_fee_policy_v3", qualifyingPrincipal: sourceSnapshot.qualifyingPrincipal,
    cumulativeFeePrincipal: { pence: 28200, currency: "GBP" }, documentPrincipal: { pence: amount, currency: "GBP" },
    postingHistory: [], original: null, sourceSnapshot,
    settlementHistory: { state: "integration_unavailable", dependency: "M4-12-S" },
    warning: "Simulation statement — proposed policy, principal only; not a tax invoice or real amount due", vatLabel: "VAT not calculated",
    sandboxLabel: "Practice sandbox — synthetic data; nothing is sent or charged" });
  const documentHash = feeHash(document);
  return { id, job_id: jobId, sequence, document, document_hash: documentHash, source_hash: feeHash(sourceSnapshot),
    recomputed_hash: documentHash, snapshot_hash: feeHash(sourceSnapshot), approval_id: approvalId, approval_hash: documentHash, decisionId };
}
