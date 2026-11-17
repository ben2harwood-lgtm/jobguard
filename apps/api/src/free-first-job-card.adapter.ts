import { z } from "zod";
import { FreeFirstJobError, freeFirstJobCardV1, parseFreeFirstJob } from "@jobguard/core";

/** Trusted test/scenario input only. Never expose this schema as a browser setup-completion request. */
export const freeFirstJobCardFixtureV1 = z.object({
  version: z.literal("free-first-job-card-fixture.v1"), environment: z.literal("synthetic_demo"),
  tenantId: z.guid({ error: "Invalid uuid" }), setupId: z.guid({ error: "Invalid uuid" }), fixtureCard: z.enum(["card_a", "card_b"]),
  outcome: z.enum(["requested", "completed", "redirect_only", "cancelled", "failed", "outcome_unknown"]),
}).strict().readonly();

/** Stateless provider-neutral fixture, no hosted URL/network/durable setup or settlement claim. */
export function simulateFreeFirstJobCardSetup(raw: unknown) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new FreeFirstJobError("FREE_FIRST_JOB_SYNTHETIC_ONLY");
  const input = parseFreeFirstJob(freeFirstJobCardFixtureV1, raw);
  const scope = { version: "free-first-job-card.v1", environment: input.environment, tenantId: input.tenantId };
  const card = parseFreeFirstJob(freeFirstJobCardV1, input.outcome === "completed" ? {
    ...scope, status: "completed", provider: "simulated",
    reference: `sim_ref_${input.tenantId}_${input.setupId}`, fingerprint: `sim_fp_${input.fixtureCard}`,
  } : { ...scope, status: input.outcome });
  return Object.freeze({
    version: "free-first-job-card-fixture-result.v1" as const, environment: input.environment,
    simulated: true as const, hypothetical: true as const, realExternalActions: 0 as const,
    hostedFlow: "simulated" as const, card,
  });
}
