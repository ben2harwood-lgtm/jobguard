import { z } from "zod";
import { FreeFirstJobError, freeFirstJobCardV1, parseFreeFirstJob } from "@jobguard/core";

/** Trusted test/scenario input only. Never expose this schema as a browser setup-completion request. */
export const freeFirstJobCardFixtureV1 = z.object({
  version: z.literal("free-first-job-card-fixture.v1"), environment: z.literal("synthetic_demo"),
  tenantId: z.string().uuid(), setupId: z.string().uuid(), fixtureCard: z.enum(["card_a", "card_b"]),
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

/** Trusted executor fixture only: attempt envelope must come from the checked repository.
 * This returns a proposal for migration-owned fixture persistence, never a card-on-file fact.
 */
export function simulatePersistedTrialCardResult(rawAttempt:unknown, rawScenario:unknown) {
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new FreeFirstJobError("FREE_FIRST_JOB_SYNTHETIC_ONLY");
 const attempt=parseFreeFirstJob(z.object({version:z.literal("trial-card-attempt.v1"),environment:z.literal("synthetic_demo"),hypothetical:z.literal(true),attemptId:z.string().uuid(),verificationId:z.string().uuid(),status:z.literal("requested")}).strict(),rawAttempt);
 const scenario=parseFreeFirstJob(z.object({version:z.literal("trial-card-scenario.v1"),fixtureCard:z.enum(["card_a","card_b"]),outcome:z.enum(["completed","redirect_only","failed","cancelled","outcome_unknown"])}).strict(),rawScenario);
 return Object.freeze({version:"trial-card-fixture.v1" as const,attemptId:attempt.attemptId,fixtureCard:scenario.fixtureCard,outcome:scenario.outcome});
}
