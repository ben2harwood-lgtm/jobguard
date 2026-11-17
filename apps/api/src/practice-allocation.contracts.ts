import { z } from "zod";
export { practiceAllocationCommandV1, practiceAllocationQueryV1 } from "@jobguard/core";

const identifier = z.string().uuid();
const safePence = z.number().int().safe().min(0).max(1_000_000_000_000);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
export const practiceAllocationResponseV1 = z.object({
  version: z.literal("practice-allocation-view.v1"),
  environment: z.literal("synthetic_demo"),
  jobId: identifier,
  revision: z.number().int().nonnegative(),
  prepared: z.boolean(),
  landing: z.literal("Simulated"),
  realExternalActions: z.literal(0),
  recoveryGrossMovementsPence: safePence,
  eligibleNetPence: safePence,
  allocatedTaxPence: safePence,
  customerInvoiceBalancePence: safePence.nullable(),
  feeExecutionState: z.enum(["Ready — simulated", "Paused — recovery changed"]),
  invoiceId: identifier.nullable(),
  invoices: z.array(z.object({ id: identifier, number: z.string(), totalPence: safePence }).strict()),
  cases: z.array(z.object({
    id: identifier, claimedNetPence: safePence, book: z.string(), sourceRefs: z.array(z.string()),
    landedNetPence: safePence, outstandingNetPence: safePence, state: z.string(),
  }).strict()),
  evidence: z.array(z.object({ id: identifier, sha256, objectVersionId: z.string().min(1) }).strict()),
  movements: z.array(z.object({
    id: identifier, underlyingMovementId: z.string().min(1), grossPence: safePence,
    remainingGrossPence: safePence, availableGrossPence: safePence,
    representations: z.array(z.string().min(1)), sourceHash: sha256,
    state: z.enum(["settled", "reversed"]),
  }).strict()),
  allocations: z.array(z.object({
    id: identifier, movementId: identifier, caseId: identifier, evidenceId: identifier,
    netPence: safePence, taxPence: safePence, grossPence: safePence, reversedNetPence: safePence,
    eligible: z.boolean(), policyVersion: z.string().min(1), reviewerRef: z.string().min(1),
  }).strict()),
  events: z.array(z.object({
    id: identifier, allocationId: identifier, kind: z.enum(["reverse", "invalidate_evidence", "dispute"]),
    netPence: safePence, taxPence: safePence, grossPence: safePence,
  }).strict()),
}).strict();
export type PracticeAllocationResponse = z.infer<typeof practiceAllocationResponseV1>;

export const practiceAllocationErrorV1 = z.object({
  version: z.literal("practice-allocation-error.v1"), code: z.string(),
}).strict();
