import { createHash } from "node:crypto";
import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, jobRecordProposalV1, type JobRecordProposal } from "@jobguard/core";
import { FixtureAiProvider } from "./fixture-provider.js";
import { AiGateway } from "./gateway.js";
import { parseCaptureFixture } from "./capture-fixture-parser.js";
export { CAPTURE_FIXTURE_PARSER_VERSION, CaptureFixtureError } from "./capture-fixture-parser.js";

export const PINNED_CAPTURE_MODEL = "fixture-capture-v1" as const;

/** Zero-spend structured fixture route. Labels/evaluation expectations are never
 * passed to the parser or provider. This is not a live-model evaluation. */
export async function extractCaptureFixture(sourceId: string, text: string, fixtureId: string): Promise<JobRecordProposal> {
  const proposal = parseCaptureFixture(sourceId, text);
  const gateway = new AiGateway(new FixtureAiProvider({ [fixtureId]: { output: proposal, citations: collectSpans(proposal) } }));
  return (await gateway.generate({ contractVersion: "ai_gateway_request_v1", fixtureId, operation: "capture_job_record_proposal", promptVersion: CAPTURE_PROMPT_VERSION, schemaVersion: CAPTURE_SCHEMA_VERSION, sources: [{ id: sourceId, content: text, sha256: createHash("sha256").update(text).digest("hex") }], timeoutMs: 1_000, maxOutputTokens: 4_096 }, jobRecordProposalV1)).output;
}
function collectSpans(value: unknown): { sourceId: string; start: number; end: number }[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = record.kind === "extracted" ? [record.span as { sourceId: string; start: number; end: number }] : [];
  return own.concat(...Object.values(record).map(child => Array.isArray(child) ? child.flatMap(collectSpans) : collectSpans(child)));
}
