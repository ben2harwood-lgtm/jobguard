import { z } from "zod";
import { money, type Money } from "./money.js";
import { recoveryCap } from "./activation.js";

export const IMPORT_TERMS_CANDIDATE = "synthetic_import_terms_candidate.v1" as const;
export const IMPORT_FEE_POLICY_CANDIDATE = "reference_fee_policy_v1" as const;
export const IMPORT_LINEAGE_LABEL = "Imported — builder-attested baseline; weaker than a JobGuard-generated and customer-accepted quote." as const;
export const PRODUCTION_IMPORT_ENABLED = false as const;

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const adoptJobV1 = z.object({
  version: z.literal("adopt-job.v1"), jobId: uuid, baselineId: uuid,
  title: z.string().trim().min(1).max(200), lifecyclePoint: z.enum(["live", "invoiced"]),
  provenance: z.literal("imported"), lineageStrength: z.literal("builder_attested_weaker"),
  baselineHash: hash, baselineDescription: z.string().trim().min(1).max(2000),
  acceptedNetValuePence: z.number().int().nonnegative(), recoveryCapPence: z.number().int().nonnegative(),
  acceptedValueSource: z.literal("builder_attestation"), attestedByMembershipId: uuid,
  attestedAt: z.coerce.date(), importTermsVersion: z.literal(IMPORT_TERMS_CANDIDATE),
  feePolicyVersion: z.literal(IMPORT_FEE_POLICY_CANDIDATE), mode: z.literal("synthetic_candidate"),
}).strict();
export type AdoptJob = z.infer<typeof adoptJobV1>;

export function capFromImportedAcceptedValue(value: Money): Money { return recoveryCap(value); }

export function assertAdoptJob(input: AdoptJob): void {
  const parsed = adoptJobV1.parse(input);
  if (capFromImportedAcceptedValue(money(parsed.acceptedNetValuePence)).pence !== parsed.recoveryCapPence) throw new Error("IMPORT_CAP_MISMATCH");
  if (parsed.attestedAt.getTime() > Date.now()) throw new Error("IMPORT_ATTESTATION_IN_FUTURE");
}

export function importedLineage<T extends { provenance: "imported" }>(value: T) {
  return Object.freeze({ ...value, lineageStrength: "builder_attested_weaker" as const, lineageLabel: IMPORT_LINEAGE_LABEL });
}
