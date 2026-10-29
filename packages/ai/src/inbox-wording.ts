import { z } from "zod";
import { MAX_MONEY_PENCE, sha256 } from "@jobguard/core";
import { AiGatewayError } from "./errors.js";
import { AiGateway } from "./gateway.js";
import { FixtureAiProvider, createLiveAiProvider, type RecordedFixture } from "./fixture-provider.js";

const uuid = z.guid().transform(value => value.toLowerCase());
export const inboxWordingInputV1 = z.object({
  version: z.literal("inbox-wording-input.v1"), environment: z.literal("synthetic_demo"),
  visibility: z.literal("builder_visible"), tenantId: uuid, jobId: uuid, decisionId: uuid,
  amount: z.object({ pence: z.number().int().min(0).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict().nullable(),
  action: z.enum(["review", "provide_proof", "review_approval"]),
  facts: z.array(z.object({ sourceId: uuid, text: z.string().min(1).max(1000) }).strict()).min(1).max(20)
    .refine(facts => new Set(facts.map(fact => fact.sourceId)).size === facts.length),
}).strict();
export const inboxWordingOutputV1 = z.object({ version: z.literal("inbox-wording-output.v1"),
  heading: z.enum(["recorded_facts", "review_recorded_facts"]), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
const routeV1 = z.object({ provider: z.enum(["fixture", "live"]).default("fixture"), enabled: z.boolean().default(false) }).strict();
const PROMPT = "inbox-wording.fixture.v1";
export const INBOX_WORDING_EVALUATION_VERSION = "inbox-wording-evaluation.fixture.v1";

/** Bounded wording seam through the existing gateway. Only a recorded fake is constructible.
 * Generated output selects a heading; amount, facts, citations and action come only from the snapshot.
 * No arbitrary generated claims, authorizations, commands, URLs or hidden inputs are accepted.
 */
export class InboxWordingFixture {
  private readonly gateway: AiGateway;
  constructor(fixtures: Readonly<Record<string, RecordedFixture>>) {
    this.gateway = new AiGateway(new FixtureAiProvider(fixtures));
  }

  async word(raw: unknown, fixtureId: string, options: unknown = {}) {
    const route = routeV1.safeParse(options), parsed = inboxWordingInputV1.safeParse(raw);
    if (!route.success || !parsed.success) throw new AiGatewayError("invalid_request", "Invalid fictional inbox wording request");
    if (route.data.provider === "live") createLiveAiProvider();
    const snapshot = parsed.data;
    const content = JSON.stringify(snapshot), sourceHash = sha256(content);
    const deterministic = { heading: "Recorded facts", amount: snapshot.amount, action: snapshot.action,
      facts: snapshot.facts, reviewRequired: true as const, sourceHash,
      evaluationVersion: INBOX_WORDING_EVALUATION_VERSION, mode: "deterministic" as const };
    if (!route.data.enabled) return deterministic;
    try {
      const result = await this.gateway.generate({ contractVersion: "ai_gateway_request_v1", fixtureId,
        operation: "inbox_wording", promptVersion: PROMPT, schemaVersion: "inbox-wording-output.v1",
        sources: [{ id: snapshot.decisionId, content, sha256: sourceHash }], timeoutMs: 1000, maxOutputTokens: 128,
      }, inboxWordingOutputV1);
      if (result.output.sourceHash !== sourceHash || result.citations.length !== 1 ||
        result.citations[0]?.sourceId !== snapshot.decisionId || result.citations[0].start !== 0 ||
        result.citations[0].end !== content.length) return deterministic;
      return { ...deterministic,
        heading: result.output.heading === "review_recorded_facts" ? "Review recorded facts" : "Recorded facts",
        mode: "fixture_suggestion" as const, provenance: result.provenance };
    } catch {
      // Invalid output, missing fixture and provider failures preserve existing deterministic copy.
      // Do not expose fixture errors or model output in logs, metrics or the caller's response.
      return deterministic;
    }
  }
}
