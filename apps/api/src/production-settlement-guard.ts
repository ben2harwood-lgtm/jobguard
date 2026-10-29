import { MAX_MONEY_PENCE } from "@jobguard/core";
import { z } from "zod";

const id = z.string().uuid();
const pence = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const binding = { tenantId: id, jobId: id };

/** Server-reconstructed facts only. Schema validity never grants authority. */
const settlementFactsV1 = z.object({
  version: z.literal("production-settlement-facts.v1"),
  ...binding,
  amountPence: pence,
  category: z.enum(["cash", "consumed_credit"]),
  source: z.object({
    ...binding,
    environment: z.enum(["production_billing", "synthetic_demo", "synthetic_reference", "provider_sandbox"]),
    proof: z.enum(["verified", "builder_attested", "unverified"]),
    movement: z.enum(["settled", "pending", "cancelled"]),
    settledPence: pence,
    allocatedPence: pence,
    reversedPence: pence,
    refundedPence: pence,
  }).strict(),
}).strict();

/** Placeholder flag deliberately absent. No environment variable or queued payload can approve G4-S.
 * Replacing this flag needs the real reviewed evidence/decision authority, outside this dark slice.
 */
const g4SEvidenceRecord: undefined = undefined;
export function readG4SEvidenceChecklist() {
  return Object.freeze({
    version: "g4-s-evidence-checklist.v1" as const,
    record: g4SEvidenceRecord === undefined ? "missing" as const : "present" as const,
    lock: "missing", isolation: "missing", attribution: "missing",
    reversalRefundControls: "missing", independentV3Arithmetic: "missing",
    reviewedTerms: "missing", reviewedPilotEvidence: "missing",
    productionEnabled: false,
  } as const);
}

/** Internal readiness read, never a builder response or an authorization certificate.
 * Deliberately no source IDs, counts, free text or Zod errors in the result.
 */
export function readProductionSettlementEligibility(raw: unknown) {
  const parsed = settlementFactsV1.safeParse(raw);
  const f = parsed.success ? parsed.data : undefined;
  const cashRequirementsMet = f !== undefined && f.category === "cash" && f.amountPence > 0 &&
    f.tenantId === f.source.tenantId && f.jobId === f.source.jobId &&
    f.source.environment === "production_billing" && f.source.proof === "verified" &&
    f.source.movement === "settled" && f.source.reversedPence === 0 && f.source.refundedPence === 0 &&
    f.amountPence <= f.source.allocatedPence && f.source.allocatedPence <= f.source.settledPence;
  return Object.freeze({
    version: "production-settlement-eligibility.v1" as const,
    cashRequirementsMet,
    consumedCreditProductionEnabled: false as const,
    g4S: readG4SEvidenceChecklist(),
    eligible: false as const,
  });
}

export class ProductionSettlementDeniedError extends Error {
  readonly code = "PRODUCTION_SETTLEMENT_DISABLED";
  constructor() { super("PRODUCTION_SETTLEMENT_DISABLED"); this.name = "ProductionSettlementDeniedError"; }
}

/** Single dark gate shared by settlement, accrual and collection execution seams.
 * Synthetic callers keep their existing validation/authorization and return semantics.
 * All other modes refuse, even perfectly shaped claimed cash or claimed approvals.
 */
export function requireProductionSettlementEligibility(mode: string, facts?: unknown): void {
  if (mode === "synthetic_demo") return;
  const result = readProductionSettlementEligibility(facts);
  if (!result.eligible) throw new ProductionSettlementDeniedError();
}

/** Check before reads, claims, audit writes or adapters; queue data is never gate evidence. */
export async function executeSettlementGuardedWork<T>(mode: string, execute: () => Promise<T>): Promise<T> {
  requireProductionSettlementEligibility(mode);
  return execute();
}
