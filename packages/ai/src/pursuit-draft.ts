import { z } from "zod";
import { buildRecoveryMessage, recoveryMessageSourceOf, recoveryMessageSourceV1, sha256, type RecoveryMessageSource } from "@jobguard/core";
import { AiGatewayError } from "./errors.js";
import { AiGateway } from "./gateway.js";
import { FixtureAiProvider, createLiveAiProvider, type RecordedFixture } from "./fixture-provider.js";
import { aiCitationSchema } from "./types.js";

export const PURSUIT_PROMPT_VERSION = "pursuit-draft.fixture.v1";
export const PURSUIT_EVALUATION_VERSION = "pursuit-draft-evaluation.v1";
/** Synthetic candidates only. A tone check is not legal/regulatory approval. Both
 * templates deliberately reuse the existing factual wording and immutable format. */
export const PURSUIT_TEMPLATES = {
  claim: { version: "pursuit-claim.v1", label: "Synthetic factual claim — D10 review pending" },
  reminder: { version: "pursuit-reminder.v1", label: "Synthetic factual reminder — D10 review pending" },
} as const;
const kindV1 = z.enum(["claim", "reminder"]);
const inputV1 = z.object({ version: z.literal("pursuit-draft-input.v1"), environment: z.literal("synthetic_demo"),
  kind: kindV1, source: recoveryMessageSourceV1,
}).strict();
export const pursuitDraftOutputV1 = z.object({ version: z.literal("pursuit-draft.v1"),
  templateVersion: z.enum(["pursuit-claim.v1", "pursuit-reminder.v1"]), body: z.string().min(1).max(2000),
  amountCitation: aiCitationSchema.strict(),
}).strict();

/** Defence in depth; exact template equality below is the allowlist. No invented
 * dates, allegations or free-form legal advice are supported by this dark slice. */
export function hasProhibitedPursuitClaim(body: string): boolean {
  return /court|bailiff|solicitor|legal authority|legal action|statutory|final demand|penalt|interest|deadline|tomorrow|within\s+\d|must pay|criminal/iu.test(body.normalize("NFKC"));
}
function factsFor(source: RecoveryMessageSource) {
  // Only these explicit fields enter the AI gateway: no hidden data, free text,
  // evidence contents, sender addresses, or source-reference instructions.
  const content = JSON.stringify({ caseId: source.caseId, jobId: source.jobId, caseRevision: source.caseRevision,
    amountPence: source.amountPence, currency: "GBP", manifestHash: source.manifestHash });
  const value = String(source.amountPence), start = content.indexOf('"amountPence":') + '"amountPence":'.length;
  return { id: "case-facts", content, sha256: sha256(content), citation: { sourceId: "case-facts", start, end: start + value.length } };
}

/** No writer, send callback or provider configuration. Caller must load the source
 * through the existing authenticated case repository; this does not mint authority. */
export class PursuitFixtureDrafter {
  private readonly gateway: AiGateway;
  constructor(fixtures: Readonly<Record<string, RecordedFixture>>) {
    this.gateway = new AiGateway(new FixtureAiProvider(fixtures));
  }
  async draft(raw: unknown, fixtureId: string, options: unknown = { provider: "fixture" }) {
    const route = z.object({ provider: z.enum(["fixture", "live"]) }).strict().safeParse(options);
    if (!route.success) throw new AiGatewayError("invalid_request", "Invalid pursuit route");
    if (route.data.provider === "live") createLiveAiProvider();
    const parsed = inputV1.safeParse(raw);
    if (!parsed.success) throw new AiGatewayError("invalid_request", "Invalid fictional pursuit source");
    const { source, kind } = parsed.data, facts = factsFor(source), message = buildRecoveryMessage(source);
    const result = await this.gateway.generate({ contractVersion: "ai_gateway_request_v1", fixtureId,
      operation: "factual_pursuit_draft", promptVersion: PURSUIT_PROMPT_VERSION, schemaVersion: "pursuit-draft.v1",
      sources: [{ id: facts.id, content: facts.content, sha256: facts.sha256 }], timeoutMs: 1000, maxOutputTokens: 2048,
    }, pursuitDraftOutputV1);
    if (result.output.templateVersion !== PURSUIT_TEMPLATES[kind].version ||
      hasProhibitedPursuitClaim(result.output.body) || result.output.body !== message.body) {
      throw new AiGatewayError("invalid_output", "Draft is outside the synthetic factual template");
    }
    const matches = (c: { sourceId: string; start: number; end: number }) => c.sourceId === facts.id &&
      c.start === facts.citation.start && c.end === facts.citation.end;
    if (!matches(result.output.amountCitation) || result.citations.length !== 1 || !matches(result.citations[0]!)) {
      throw new AiGatewayError("invalid_citation", "Draft amount must cite the exact case amount");
    }
    return { ...result, template: PURSUIT_TEMPLATES[kind], environment: "synthetic_demo" as const,
      evaluationVersion: PURSUIT_EVALUATION_VERSION, legalReview: "D10_PENDING" as const,
      // Hash covers text, exact sender/recipient, attachment versions, evidence,
      // amount, case and revision. AI output grants no approval or send authority.
      preview: { sender: message.sender, recipient: message.recipient, body: message.body,
        packId: message.packId, packRevision: message.packRevision, attachmentHash: message.attachmentHash,
        manifestHash: message.manifestHash, contentHash: message.contentHash },
    };
  }
}

/** Deterministic default for the authenticated practice preview. The resulting
 * canonical message goes through M4-5-S's unchanged Decision/outbox/fake adapter.
 * Scheduled reminders remain M4-6-S pending Decisions, never approval here. */
export async function draftPracticePursuit(source: RecoveryMessageSource, kind: "claim" | "reminder" = "claim") {
  const checked = recoveryMessageSourceV1.parse(source), facts = factsFor(checked), message = buildRecoveryMessage(checked);
  const fixtureId = "pursuit-default";
  const drafter = new PursuitFixtureDrafter({ [fixtureId]: { output: { version: "pursuit-draft.v1",
    templateVersion: PURSUIT_TEMPLATES[kind].version, body: message.body, amountCitation: facts.citation }, citations: [facts.citation] } });
  return drafter.draft({ version: "pursuit-draft-input.v1", environment: "synthetic_demo", kind,
    source: recoveryMessageSourceOf(message) }, fixtureId);
}
