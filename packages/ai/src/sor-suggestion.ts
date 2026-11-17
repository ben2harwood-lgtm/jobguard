import { z } from "zod";
import { sha256 } from "@jobguard/core";
import { AiGatewayError } from "./errors.js";
import { FixtureAiProvider, createLiveAiProvider, type RecordedFixture } from "./fixture-provider.js";
import { AiGateway } from "./gateway.js";
import type { AiGatewayRequest } from "./types.js";

const uuid = z.guid({ error: "Invalid uuid" }).transform(value => value.toLowerCase());
const text = (max: number) => z.string().min(1).max(max).refine(value => /\S/u.test(value));
const code = text(80);
export const SOR_SUGGESTION_PROMPT_VERSION = "sor-suggestion.fixture.v1";
export const SOR_SUGGESTION_EVALUATION_VERSION = "sor-suggestion-evaluation.v1";

/** Internal fictional snapshots, not an HTTP input or a constructor of tenant authority.
 * An eventual source adapter must read these bindings and capture_text from storage after authorization.
 * No rates or quantities are read by this calculation. */
export const sorSuggestionInputV1 = z.object({
  version: z.literal("sor-suggestion-input.v1"), environment: z.literal("synthetic_demo"),
  job: z.object({ tenantId: uuid, id: uuid, clientContractVersionId: uuid, workOrderRevisionId: uuid, sorVersionId: uuid }).strict(),
  extra: z.object({ tenantId: uuid, jobId: uuid, id: uuid, kind: z.literal("free_text"),
    captureText: text(5000), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  schedule: z.object({ tenantId: uuid, clientContractVersionId: uuid, versionId: uuid,
    items: z.array(z.object({ code, description: text(500), unit: text(40) }).strict()).max(10000)
      .refine(items => new Set(items.map(item => item.code)).size === items.length),
  }).strict(),
}).strict().superRefine((value, context) => {
  const { job, extra, schedule } = value;
  if (job.tenantId !== extra.tenantId || job.id !== extra.jobId || job.tenantId !== schedule.tenantId ||
    job.clientContractVersionId !== schedule.clientContractVersionId || job.sorVersionId !== schedule.versionId ||
    sha256(extra.captureText) !== extra.sha256) {
    context.addIssue({ code: "custom", message: "Snapshot binding or source hash is invalid" });
  }
});

/** There is no commercial decision field, generated wording, price or inferred quantity. */
export const sorSuggestionOutputV1 = z.object({ version: z.literal("sor-suggestions.v1"),
  suggestions: z.array(z.object({ label: z.literal("suggestion"), sorCode: code,
    citation: z.object({ sourceId: uuid, start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: text(5000) }).strict(),
  }).strict()).max(5).refine(items => new Set(items.map(item => item.sorCode)).size === items.length),
}).strict();
export type SorSuggestionInput = z.infer<typeof sorSuggestionInputV1>;
export type SorSuggestionOutput = z.infer<typeof sorSuggestionOutputV1>;

function requestFor(snapshot: SorSuggestionInput, fixtureId: string): AiGatewayRequest {
  const catalogue = JSON.stringify([...snapshot.schedule.items].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { contractVersion: "ai_gateway_request_v1", fixtureId, operation: "sor_candidate_suggestions",
    promptVersion: SOR_SUGGESTION_PROMPT_VERSION, schemaVersion: "sor-suggestions.v1",
    sources: [{ id: snapshot.extra.id, content: snapshot.extra.captureText, sha256: snapshot.extra.sha256 },
      { id: `sor:${snapshot.schedule.versionId}`, content: catalogue, sha256: sha256(catalogue) }],
    timeoutMs: 1000, maxOutputTokens: 2048 };
}

/** Only M0-12's recorded fixture provider can be constructed. Source text is data;
 * fixed operation/prompt/schema controls cannot be supplied by the source or model.
 * Produces candidates only: no repository, callback, command, writer or network client. */
export class SorSuggestionFixtureProposer {
  private readonly gateway: AiGateway;
  constructor(fixtures: Readonly<Record<string, RecordedFixture>>) {
    this.gateway = new AiGateway(new FixtureAiProvider(fixtures));
  }

  async propose(raw: unknown, fixtureId: string, options: unknown = { provider: "fixture" }) {
    const route = z.object({ provider: z.enum(["fixture", "live"]) }).strict().safeParse(options);
    if (!route.success) throw new AiGatewayError("invalid_request", "Invalid SoR suggestion route");
    if (route.data.provider === "live") createLiveAiProvider();
    const parsed = sorSuggestionInputV1.safeParse(raw);
    if (!parsed.success) throw new AiGatewayError("invalid_request", "Invalid fictional SoR snapshot");
    const snapshot = parsed.data;
    // Deliberately no repair: zero attempts is within the gateway's at-most-one limit.
    const result = await this.gateway.generate(requestFor(snapshot, fixtureId), sorSuggestionOutputV1);
    const allowedCodes = new Set(snapshot.schedule.items.map(item => item.code));
    for (const suggestion of result.output.suggestions) {
      if (!allowedCodes.has(suggestion.sorCode)) throw new AiGatewayError("invalid_output", "Item is outside the job's SoR");
      const c = suggestion.citation;
      if (c.sourceId !== snapshot.extra.id || c.start >= c.end || c.end > snapshot.extra.captureText.length ||
        snapshot.extra.captureText.slice(c.start, c.end) !== c.quote ||
        !result.citations.some(span => span.sourceId === c.sourceId && span.start === c.start && span.end === c.end)) {
        throw new AiGatewayError("invalid_citation", "Suggestion does not cite the stored extra text");
      }
    }
    // Gateway-level spans must also belong to actual suggestions, not unrelated catalogue text.
    if (result.citations.some(span => !result.output.suggestions.some(s => s.citation.sourceId === span.sourceId &&
      s.citation.start === span.start && s.citation.end === span.end))) {
      throw new AiGatewayError("invalid_citation", "Unbound SoR suggestion citation");
    }
    return { ...result, environment: "synthetic_demo" as const, jobId: snapshot.job.id, extraId: snapshot.extra.id,
      clientContractVersionId: snapshot.job.clientContractVersionId, workOrderRevisionId: snapshot.job.workOrderRevisionId,
      sorVersionId: snapshot.job.sorVersionId, evaluationVersion: SOR_SUGGESTION_EVALUATION_VERSION };
  }
}
