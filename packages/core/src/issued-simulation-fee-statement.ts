import { z } from "zod";
import { simulationFeeStatementDocumentV1, canonicalSimulationFeeStatementJson } from "./simulation-fee-statement.js";
import { exactPenceV1 } from "./cumulative-fee.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { sha256 } from "./evidence-pack.js";

const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().safe().min(0).max(MAX_MONEY_PENCE);
export const simulationFeeSourceSnapshotV1 = z.object({
  postingRevision: z.number().int().positive(), qualifyingPrincipal: exactPenceV1, feePence: pence,
  adjustments: z.object({paymentReversalIds:z.array(id).max(10_000),creditNoteIds:z.array(id).max(10_000),evidenceInvalidationIds:z.array(id).max(10_000)}).strict(),
  derivations: z.array(z.object({ derivationId: id, reviewId: id, authorizationId: id, statementHash: hash }).strict()).min(1).max(10_000),
  sources: z.array(z.object({ assessmentId: id, currentAssessmentId: id, sourceHash: hash, reviewAuthorizationId: id,
    allocationIds: z.array(id).min(1).max(10_000), remainingPrincipal: exactPenceV1,
    reasonCodes: z.array(z.string().max(100)).max(100),
  }).strict()).min(1).max(10_000),
}).strict();
export const issuedSimulationFeeStatementV1 = simulationFeeStatementDocumentV1.extend({
  version: z.literal("issued-simulation-fee-statement.v1"),
  number: z.string().regex(/^DEMO-FEE-[0-9]{6,}$/u), jobId: id,
  namespace: z.literal("success_fee.synthetic.v1"), sourceSnapshot: simulationFeeSourceSnapshotV1,
}).superRefine((v, ctx) => {
  if (v.cumulativeFeePrincipal.pence !== v.sourceSnapshot.feePence
    || JSON.stringify(v.qualifyingPrincipal) !== JSON.stringify(v.sourceSnapshot.qualifyingPrincipal))
    ctx.addIssue({code: "custom", message: "Statement and source snapshot differ"});
});
export type IssuedSimulationFeeStatement = z.infer<typeof issuedSimulationFeeStatementV1>;
export const simulationFeeStatementCommandV1 = z.discriminatedUnion("action", [
  z.object({version:z.literal("simulation-fee-statement-command.v1"),commandId:id,action:z.literal("issue")}).strict(),
  z.object({version:z.literal("simulation-fee-statement-command.v1"),commandId:id,action:z.literal("approve"),statementId:id,statementHash:hash}).strict(),
]);
export const issuedSimulationFeeStatementRecordV1 = z.object({document:issuedSimulationFeeStatementV1,documentHash:hash}).strict();
export const simulationFeeStatementViewV1 = z.object({version:z.literal("simulation-fee-statement-view.v1"),jobId:id,
  statements:z.array(issuedSimulationFeeStatementRecordV1).max(10_000)}).strict();
export const simulationFeeStatementResultV1 = z.object({version:z.literal("simulation-fee-statement-result.v1"),
  commandId:id,statementId:id,documentHash:hash,authorizationId:id.nullable(),replayed:z.boolean()}).strict();

/** Same canonical JSON/UTF-8 contract as the existing representation, including its validation. */
export function downloadIssuedSimulationFeeStatement(raw: unknown, expectedHash: string) {
  const document = issuedSimulationFeeStatementV1.parse(raw);
  const canonicalJson = canonicalSimulationFeeStatementJson(document);
  if (sha256(canonicalJson) !== expectedHash) throw new Error("SIMULATION_FEE_STATEMENT_HASH_MISMATCH");
  return {document, documentHash:expectedHash, canonicalJson, bytes:new TextEncoder().encode(canonicalJson),
    filename:`${document.number}.v1.json`};
}
