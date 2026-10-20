import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AiGatewayError } from "./errors.js";
import { FixtureAiProvider, type RecordedFixture } from "./fixture-provider.js";
import { AiGateway, type RepairOutput } from "./gateway.js";
import { aiCitationSchema, type AiGatewayRequest, type AiGatewayResponse } from "./types.js";

const uuid = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/u);
const name = z.string().min(1).max(200);
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const citationV1 = z.object({ sourceId: uuid, sha256: hash, objectVersion: name,
  start: z.number().int().safe().nonnegative(), end: z.number().int().safe().positive(), quote: z.string().min(1).max(4000),
}).strict().refine(value => value.start < value.end);

/** Model output has no job identity, matching identity or commercial authority channel. */
export const enterpriseAiOutputV1 = z.object({ version: z.literal("enterprise-ai-output.v1"),
  items: z.array(z.object({ description: z.string().min(1).max(4000), ambiguity: z.enum(["clear", "review"]),
    citations: z.array(citationV1).min(1).max(20),
  }).strict()).max(20),
}).strict();
export type EnterpriseAiOutput = z.infer<typeof enterpriseAiOutputV1>;

const sourceV1 = z.object({ evidenceId: uuid, tenantId: uuid, jobId: uuid,
  kind: z.enum(["note", "transcript", "photo_caption"]), text: z.string().max(100000), sha256: hash, objectVersion: name,
  status: z.enum(["upload_pending", "quarantined", "verified", "rejected", "superseded"]), invalidated: z.boolean(),
}).strict();
const caseV1 = z.object({ id: name, tenantId: uuid, jobId: uuid,
  baseline: z.object({ revisionId: uuid, orderedWork: z.array(z.string().min(1).max(4000)).max(1000) }).strict(),
  sources: z.array(sourceV1).min(1).max(100).refine(values => unique(values.map(value => value.evidenceId))),
  response: z.object({ output: z.record(z.unknown()), citations: z.array(aiCitationSchema.strict()).max(400) }).strict(),
}).strict();
export const enterpriseFixtureCorpusV1 = z.object({ version: z.literal("enterprise-ai-corpus.v1"),
  cases: z.array(caseV1).min(1).max(1000).refine(values => unique(values.map(value => value.id))),
}).strict();
export type EnterpriseFixtureCase = z.infer<typeof caseV1>;
const requestV1 = z.object({ version: z.literal("enterprise-ai-fixture-request.v1"),
  mode: z.enum(["synthetic_demo", "pilot_no_charge", "production_billing"]), dataClass: z.literal("fictional_fixture"),
  provider: z.literal("fixture"), fixtureId: name,
}).strict();

export const ENTERPRISE_AI_EVALUATION_VERSION = "enterprise-ai-evaluation.v1" as const;

/** Fixed policy; source contents remain data. Baseline is supplied separately from evidence. No tools exist. */
export function enterpriseFixtureRequest(row: EnterpriseFixtureCase): AiGatewayRequest {
  return { contractVersion: "ai_gateway_request_v1", fixtureId: row.id,
    operation: "enterprise_possible_extras", promptVersion: "enterprise-extra-detection.fixture.v1", schemaVersion: "enterprise-ai-output.v1",
    sources: [{ id: row.baseline.revisionId, content: JSON.stringify(row.baseline), sha256: digest(JSON.stringify(row.baseline)) },
      ...row.sources.map(source => ({ id: source.evidenceId, content: source.text, sha256: source.sha256 }))],
    timeoutMs: 1000, maxOutputTokens: 2048 };
}

const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const envelopeIdentity = (citation: { sourceId: string; start: number; end: number }) => `${citation.sourceId}:${citation.start}:${citation.end}`;

/** Validation against bundled stored snapshots, not a database evidence-finalization or authorization proof. */
export function validateEnterpriseFixtureResult(result: AiGatewayResponse<EnterpriseAiOutput>, row: EnterpriseFixtureCase): void {
  const sources = new Map(row.sources.map(source => [source.evidenceId, source]));
  const envelope = new Set(result.citations.map(envelopeIdentity)), used = new Set<string>();
  for (const item of result.output.items) for (const citation of item.citations) {
    const source = sources.get(citation.sourceId);
    if (!source || source.tenantId !== row.tenantId || source.jobId !== row.jobId || source.status !== "verified" || source.invalidated ||
      source.sha256 !== citation.sha256 || digest(source.text) !== source.sha256 || source.objectVersion !== citation.objectVersion ||
      citation.start < 0 || citation.start >= citation.end || citation.end > source.text.length || source.text.slice(citation.start, citation.end) !== citation.quote ||
      !envelope.has(envelopeIdentity(citation))) throw new AiGatewayError("invalid_citation", "invalid_citation");
    used.add(envelopeIdentity(citation));
  }
  if (envelope.size !== used.size) throw new AiGatewayError("invalid_citation", "invalid_citation");
}

/** Only fixed repository fixtures may supply source text. A mode label never authorizes arbitrary real data. */
export async function loadEnterpriseFixtureCorpus(split: "development" | "held-out-inputs") {
  const file = split === "development" ? "development.v1.json" : "held-out-inputs.v1.json";
  const raw: unknown = JSON.parse(await readFile(new URL(`../../../docs/fixtures/enterprise-ai-prompts/${file}`, import.meta.url), "utf8"));
  const parsed = enterpriseFixtureCorpusV1.safeParse(raw);
  if (!parsed.success) throw new AiGatewayError("invalid_request", "Invalid enterprise fixture corpus");
  for (const row of parsed.data.cases) for (const source of row.sources) {
    if (source.tenantId !== row.tenantId || source.jobId !== row.jobId || source.status !== "verified" || source.invalidated || digest(source.text) !== source.sha256) {
      throw new AiGatewayError("invalid_citation", "invalid_citation");
    }
  }
  return parsed.data;
}

/** Internal fixture evaluator, no endpoint, credentials, live provider, database handle or commercial callback. */
export async function detectEnterpriseFixture(raw: unknown, options: {
  responses?: Readonly<Record<string, RecordedFixture>>; repair?: RepairOutput;
} = {}) {
  const parsed = requestV1.safeParse(raw);
  if (!parsed.success) throw new AiGatewayError("invalid_request", "Invalid enterprise fixture request");
  if (parsed.data.mode !== "synthetic_demo") {
    throw new AiGatewayError("live_route_disabled", "enterprise_ai_prompts requires D04, DPA, M0-12a and G2 evidence; live use is disabled");
  }
  const development = await loadEnterpriseFixtureCorpus("development"), held = await loadEnterpriseFixtureCorpus("held-out-inputs");
  const row = [...development.cases, ...held.cases].find(value => value.id === parsed.data.fixtureId);
  if (!row) throw new AiGatewayError("fixture_not_found", "Unknown enterprise fixture");
  const gateway = new AiGateway(new FixtureAiProvider(options.responses ?? { [row.id]: row.response }));
  let result: AiGatewayResponse<EnterpriseAiOutput>;
  try {
    result = await gateway.generate(enterpriseFixtureRequest(row), enterpriseAiOutputV1, options.repair ? { repair: options.repair } : {});
  } catch (error) {
    if (error instanceof AiGatewayError) throw error;
    throw new AiGatewayError("invalid_output", "Invalid enterprise fixture output");
  }
  validateEnterpriseFixtureResult(result, row);
  return { ...result, environment: "synthetic_demo" as const, tenantId: row.tenantId, jobId: row.jobId,
    baselineRevisionId: row.baseline.revisionId, evaluationVersion: ENTERPRISE_AI_EVALUATION_VERSION };
}
