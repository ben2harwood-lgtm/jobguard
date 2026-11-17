import { z } from "zod";
import { parseObservation, proposalFromObservation, sha256, shadowDetectionId, observationV1, shadowCaptureV1, type Observation, type ShadowProposal } from "@jobguard/core";
import { AiGateway } from "./gateway.js";
import { FixtureAiProvider, type RecordedFixture } from "./fixture-provider.js";
import type { AiGatewayRequest } from "./types.js";

export const shadowAiOutputV1 = z.object({ version: z.literal("shadow-ai-proposals.v1"), proposals: z.array(z.object({
  description: z.string().min(1).max(160), confidenceBand: z.enum(["low", "medium", "high"]), recommendation: z.enum(["hold", "suggest"]),
  citation: z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1) }).strict(),
}).strict()).max(20) }).strict();
export const shadowFixtureCorpusV1 = z.object({ version: z.literal("shadow-observation-corpus.v1"), cases: z.array(z.object({
  id: z.string().min(1), observations: z.array(observationV1).min(1), captures: z.array(shadowCaptureV1),
  responses: z.record(z.string(), z.object({ output: shadowAiOutputV1, citations: z.array(z.object({ sourceId: z.string(), start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict()) }).strict()),
}).strict()).min(1) }).strict();
export const SHADOW_PROMPT_VERSION = "shadow-proposal.fixture.v1";
/** Prompt policy and operation are fixed; uploaded instructions appear only inside source data. */
export function shadowGatewayRequest(o: Observation, fixtureId: string): AiGatewayRequest {
  return { contractVersion: "ai_gateway_request_v1", fixtureId, operation: "shadow_cited_proposals",
    promptVersion: SHADOW_PROMPT_VERSION, schemaVersion: "shadow-ai-proposals.v1",
    sources: [{ tenantId: o.tenantId, visibility: "public", id: o.evidence.id, content: o.text, sha256: sha256(o.text) }], timeoutMs: 1000, maxOutputTokens: 2048 };
}
/** Constructible only with recorded responses. No provider factory, SDK, region fallback or network client. */
export class ShadowFixtureProposer {
  private readonly provider: FixtureAiProvider;
  constructor(fixtures: Readonly<Record<string, RecordedFixture>>) { this.provider = new FixtureAiProvider(fixtures); }
  async propose(raw: unknown, fixtureId: string, at: string) {
    const o = parseObservation(raw), result = await new AiGateway(this.provider, () => ({ tenantId: o.tenantId })).generate(shadowGatewayRequest(o, fixtureId), shadowAiOutputV1);
    const proposals: ShadowProposal[] = [], seen = new Set<string>(); let droppedCitations = 0;
    for (const candidate of result.output.proposals) {
      const c = candidate.citation;
      if (c.start >= c.end || c.end > o.text.length || o.text.slice(c.start, c.end) !== c.quote) { droppedCitations++; continue; }
      // AI can suggest wording, never rule facts, work identity, value, origin or eligibility.
      const proposal = proposalFromObservation(o, "ai_proposal", SHADOW_PROMPT_VERSION, at, { lock: "before_lock", adoption: "after_adoption" });
      // A candidate identity includes every validated output field, in fixed order.
      // Keep work identity unchanged; neither result order nor processing time enters the ID.
      const signalId = shadowDetectionId([proposal.signalId, "shadow-ai-candidate.v1", candidate.description,
        candidate.confidenceBand, candidate.recommendation, String(c.start), String(c.end), c.quote]);
      if (seen.has(signalId)) continue;
      seen.add(signalId);
      proposals.push({ ...proposal, signalId, description: candidate.description, confidenceBand: candidate.confidenceBand,
        evidence: proposal.evidence.map(e => ({ ...e, signalId })) });
    }
    return { proposals, droppedCitations, provenance: result.provenance, evaluationVersion: "shadow-held-out.v1" as const };
  }
}
