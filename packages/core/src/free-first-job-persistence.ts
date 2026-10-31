import { z } from "zod";

/** Server-fact contract only. No browser completion payload and no admission grant. */
export const persistedTrialFactsV1 = z.object({
 version:z.literal("free-first-job-persisted-facts.v1"), environment:z.literal("synthetic_demo"),
 verifiedIdentity:z.boolean(), sufficientIdentity:z.boolean(), completedSameBusinessCard:z.boolean(),
 distinctPriorActivation:z.boolean(), targetAlreadyActive:z.boolean(),
}).strict().readonly();

/** These prerequisite results cannot authorize a live transition or establish a billing date. */
export function admissionPrerequisites(raw:unknown):"existing_job"|"identity_required"|"card_required"|"awaiting_c" {
 const facts=persistedTrialFactsV1.parse(raw);
 if(facts.targetAlreadyActive)return "existing_job";
 if(!facts.verifiedIdentity||!facts.sufficientIdentity)return "identity_required";
 if(facts.distinctPriorActivation&&!facts.completedSameBusinessCard)return "card_required";
 return "awaiting_c";
}
