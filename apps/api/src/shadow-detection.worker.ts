import { z } from "zod";
import { AiGatewayError } from "@jobguard/ai";
import { detectShadowObservations, type Observation, type ShadowCapture, type ShadowProposal } from "@jobguard/core";
import type { VerifiedTenantContext } from "@jobguard/db";
const taskV1 = z.object({ version: z.literal("shadow-detection-task.v1"), tenantId: z.string().uuid(), jobId: z.string().uuid() }).strict();
export class ShadowWorkerError extends Error {
  constructor(readonly code: "INVALID_SHADOW_TASK" | "SHADOW_TASK_TENANT_MISMATCH" | "SHADOW_TERMS_NOT_ACCEPTED" | "SHADOW_SYNTHETIC_ONLY") { super(code); }
}
export interface ShadowWorkerPorts {
  assertTermsRelation(): Promise<void>;
  hasAcceptedTerms(context: VerifiedTenantContext): Promise<boolean>;
  read(context: VerifiedTenantContext, request: { version: "shadow-observation-read.v1"; jobId: string }): Promise<{ observations: readonly Observation[]; captures: readonly ShadowCapture[] }>;
  propose(observation: Observation, fixtureId: string, at: string): Promise<{ proposals: readonly ShadowProposal[] }>;
  persist(context: VerifiedTenantContext, request: { version: "shadow-detection-batch.v1"; jobId: string; observations: readonly Observation[]; captures: readonly ShadowCapture[]; proposals: readonly ShadowProposal[] }): Promise<unknown>;
}
/** Context is supplied per invocation; never stored on the service or inside a port container. */
export class ShadowDetectionWorker {
  constructor(private readonly ports: ShadowWorkerPorts, private readonly environment: string, private readonly now: () => string = () => new Date().toISOString()) {}
  async start(): Promise<void> {
    if (this.environment !== "synthetic_demo") throw new ShadowWorkerError("SHADOW_SYNTHETIC_ONLY");
    await this.ports.assertTermsRelation();
  }
  async execute(context: VerifiedTenantContext, payload: unknown): Promise<void> {
    const parsed = taskV1.safeParse(payload); if (!parsed.success) throw new ShadowWorkerError("INVALID_SHADOW_TASK");
    if (parsed.data.tenantId !== context.tenantId) throw new ShadowWorkerError("SHADOW_TASK_TENANT_MISMATCH");
    if (this.environment !== "synthetic_demo") throw new ShadowWorkerError("SHADOW_SYNTHETIC_ONLY");
    if (!await this.ports.hasAcceptedTerms(context)) throw new ShadowWorkerError("SHADOW_TERMS_NOT_ACCEPTED");
    const { observations, captures } = await this.ports.read(context, { version: "shadow-observation-read.v1", jobId: parsed.data.jobId });
    const at = this.now(), proposals = [...detectShadowObservations(observations, captures, at)];
    let aiFailure: AiGatewayError | undefined;
    for (const o of observations) {
      // Catch only the AI call. Validation, authority, cancellation and sink failures
      // retain their normal refusal semantics; they are never partial successes.
      let result: Awaited<ReturnType<ShadowWorkerPorts["propose"]>>;
      try { result = await this.ports.propose(o, o.evidence.id, at); }
      catch (error) {
        if (!(error instanceof AiGatewayError) || !["fixture_not_found", "invalid_provider_response", "invalid_output", "invalid_citation"].includes(error.code)) throw error;
        aiFailure ??= error;
        continue;
      }
      proposals.push(...result.proposals);
    }
    await this.ports.persist(context, { version: "shadow-detection-batch.v1", jobId: parsed.data.jobId, observations, captures, proposals });
    // The sink owns must-surface processing. Commit its deterministic results first,
    // then fail the task honestly so the existing scheduler records the AI failure.
    if (aiFailure) throw aiFailure;
  }
}
