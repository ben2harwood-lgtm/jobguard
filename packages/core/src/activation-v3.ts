import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { shadowSuccessFeeV1 } from "./shadow-domain/success-fee.js";

// Reuse SV-1's policy identity instead of declaring another fee policy.
export const activationFeePolicyV3 = shadowSuccessFeeV1.unwrap().unwrap().shape.policyVersion;
const pence = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
const uuid = z.string().uuid();

/** Highest sent is zero when no immutable revision has an outbound send record. */
export function isSmallJobV3(acceptedNetPence: number, highestSentNetPence: number): boolean {
  return Math.max(pence.parse(acceptedNetPence), pence.parse(highestSentNetPence)) < 200_000;
}

/** Server-internal command: commercial facts are read under the job lock. */
export const switchLiveV3 = z.object({
  version: z.literal("switch-live.v3"), activationId: uuid, termsId: uuid, jobId: uuid,
  acceptedDocumentId: uuid, acceptedDocumentVersion: z.number().int().positive(),
  acceptedDocumentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  expectedJobRevision: z.number().int().nonnegative(),
}).strict().readonly();
export type SwitchLiveV3 = z.infer<typeof switchLiveV3>;

export const activationTermsV1 = z.object({
  version: z.literal("job-activation-terms.v1"), id: uuid, tenantId: uuid, jobId: uuid,
  activationId: uuid, baselineQuoteVersionId: uuid,
  baselineDocumentVersion: z.number().int().positive(),
  baselineDocumentHash: z.string().regex(/^[a-f0-9]{64}$/u), acceptedNetPence: pence,
  highestSentNetPence: pence, smallJob: z.boolean(), policyVersion: activationFeePolicyV3,
  commercialTrack: z.literal("small_builder"),
  // Coordinator ruling, 8 October 2026: MON-2A/MON-3 supersede this later.
  trialPlanContext: z.literal("none_recorded_pre_mon2a"),
  activatedAt: z.string().datetime(),
}).strict().refine(value => value.smallJob === (Math.max(value.acceptedNetPence, value.highestSentNetPence) < 200_000), "Small-job classification must match the frozen values").readonly();
export type ActivationTermsV1 = z.infer<typeof activationTermsV1>;
