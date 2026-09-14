import { z } from "zod";
import { money, type Money } from "./money.js";
import { multiplyRatio } from "./rational.js";

export const ACTIVATION_POLICY_VERSION = "reference_fee_policy_v1" as const;
export const PILOT_NO_CHARGE_TERMS = "pilot_no_charge.v1" as const;
export const SYNTHETIC_DEMO_TERMS = "synthetic_demo_illustrative.v1" as const;
export const ILLUSTRATIVE_BASE_PRINCIPAL_PENCE = 7_900 as const;
export type ActivationMode = "pilot_no_charge" | "synthetic_demo";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const switchLiveV1 = z.object({
  version: z.literal("switch-live.v1"), activationId: uuid, capSnapshotId: uuid,
  syntheticObligationId: uuid.nullable(), jobId: uuid, acceptedDocumentId: uuid,
  acceptedDocumentVersion: z.number().int().positive(), acceptedDocumentHash: hash,
  expectedJobRevision: z.number().int().nonnegative(), acceptedNetValuePence: z.number().int().nonnegative(),
  recoveryCapPence: z.number().int().nonnegative(), mode: z.enum(["pilot_no_charge", "synthetic_demo"]),
  activationTermsVersion: z.enum([PILOT_NO_CHARGE_TERMS, SYNTHETIC_DEMO_TERMS]),
  feePolicyVersion: z.literal(ACTIVATION_POLICY_VERSION), activatedAt: z.coerce.date(),
}).strict();
export type SwitchLive = z.infer<typeof switchLiveV1>;

export const simulatedSettlementV1 = z.object({
  version: z.literal("simulated-settlement.v1"), settlementId: uuid, obligationId: uuid,
  providerEventId: z.string().min(1).max(200), amountPence: z.literal(ILLUSTRATIVE_BASE_PRINCIPAL_PENCE),
  currency: z.literal("GBP"), simulatedAt: z.coerce.date(),
}).strict();

export function recoveryCap(acceptedNetValue: Money): Money {
  if (acceptedNetValue.currency !== "GBP" || acceptedNetValue.pence < 0) throw new RangeError("Accepted net value must be nonnegative GBP");
  return money(Number(multiplyRatio(BigInt(acceptedNetValue.pence), 15n, 1000n, "half_even")));
}

export function assertSwitchLiveTerms(input: SwitchLive): void {
  const parsed = switchLiveV1.parse(input);
  if (recoveryCap(money(parsed.acceptedNetValuePence)).pence !== parsed.recoveryCapPence) throw new Error("CAP_MISMATCH");
  const expectedTerms = parsed.mode === "pilot_no_charge" ? PILOT_NO_CHARGE_TERMS : SYNTHETIC_DEMO_TERMS;
  if (parsed.activationTermsVersion !== expectedTerms) throw new Error("ACTIVATION_TERMS_MISMATCH");
  if (parsed.mode === "pilot_no_charge" && parsed.syntheticObligationId !== null) throw new Error("PILOT_OBLIGATION_FORBIDDEN");
  if (parsed.mode === "synthetic_demo" && parsed.syntheticObligationId === null) throw new Error("SYNTHETIC_OBLIGATION_REQUIRED");
}

export function activationEffects(mode: ActivationMode): Readonly<{activations:1;capSnapshots:1;syntheticObligations:0|1;platformJournals:0;collectionRequests:0}> {
  return Object.freeze({activations:1,capSnapshots:1,syntheticObligations:mode === "synthetic_demo" ? 1 : 0,platformJournals:0,collectionRequests:0});
}

export const activationDisclosure = Object.freeze({
  pilot: "No charge — this real-pilot activation creates no JobGuard fee, obligation, journal, or collection request.",
  illustration: "Illustrative only until D01 approval: £79.00 principal and a 1.5% accepted-net-value recovery cap. No real charge or collection.",
});
