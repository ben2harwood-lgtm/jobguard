import { AiGatewayError } from "./errors.js";
import {
  aiGatewayRequestSchema,
  aiProviderResponseSchema,
  aiCitationSchema,
  type AiGatewayRequest,
  type AiGatewayResponse,
  type AiOutputSchema,
  type AiProvider,
} from "./types.js";

export type RepairOutput = (invalidOutput: unknown) => unknown;

export class AiGateway {
  constructor(private readonly provider: AiProvider) {}

  async generate<T>(
    untrustedRequest: unknown,
    outputSchema: AiOutputSchema<T>,
    options: { signal?: AbortSignal; repair?: RepairOutput } = {},
  ): Promise<AiGatewayResponse<T>> {
    const parsedRequest = aiGatewayRequestSchema.safeParse(untrustedRequest);
    if (!parsedRequest.success) throw new AiGatewayError("invalid_request", "Invalid AI request");
    const request = parsedRequest.data;
    // Unscoped sources remain supported only for the existing synthetic fixtures.
    // Tenant context must come from the authenticated caller before any future route.
    if (request.sources.some((source) =>
      (source.visibility !== undefined && source.visibility !== "public") ||
      source.tenantId !== request.tenantId
    )) {
      throw new AiGatewayError("invalid_request", "AI source is not permitted");
    }
    if (options.signal?.aborted) throw new AiGatewayError("cancelled", "AI fixture request was cancelled");

    let untrustedResponse: unknown;
    try {
      untrustedResponse = await this.provider.execute(request, options.signal);
    } catch (error) {
      // Provider diagnostics and causes may contain credentials or source text.
      throw new AiGatewayError(error instanceof AiGatewayError ? error.code : "invalid_provider_response", "AI provider failed");
    }
    const parsedResponse = aiProviderResponseSchema.safeParse(untrustedResponse);
    if (!parsedResponse.success) {
      throw new AiGatewayError("invalid_provider_response", "Invalid AI provider response");
    }
    if (parsedResponse.data.fixtureId !== request.fixtureId) {
      throw new AiGatewayError("invalid_provider_response", "AI provider returned the wrong fixture identity");
    }
    validateCitations(request, parsedResponse.data.citations);

    let parsedOutput = outputSchema.safeParse(parsedResponse.data.output);
    let repairAttempts: 0 | 1 = 0;
    if (!parsedOutput.success && options.repair) {
      repairAttempts = 1;
      let repairedOutput: unknown;
      try {
        repairedOutput = options.repair(parsedResponse.data.output);
      } catch {
        throw new AiGatewayError("invalid_output", "AI output repair failed");
      }
      parsedOutput = outputSchema.safeParse(repairedOutput);
    }
    if (!parsedOutput.success) throw new AiGatewayError("invalid_output", "Invalid structured AI output");
    validateOutputCitations(request, parsedOutput.data);

    return {
      output: parsedOutput.data,
      citations: parsedResponse.data.citations,
      provenance: {
        provider: parsedResponse.data.provider,
        model: parsedResponse.data.model,
        deployment: parsedResponse.data.deployment,
        fixtureId: parsedResponse.data.fixtureId,
        promptVersion: request.promptVersion,
        schemaVersion: request.schemaVersion,
        sourceHashes: Object.fromEntries(request.sources.map((source) => [source.id, source.sha256])),
      },
      costPence: 0,
      repairAttempts,
    };
  }
}

/** Validate references retained by the output schema, including after repair.
 * Offset-only shadow proposal citations keep their existing proposer checks. */
function validateOutputCitations(request: AiGatewayRequest, value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) validateOutputCitations(request, child);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if ("sourceId" in record && "start" in record && "end" in record) {
    const citation = aiCitationSchema.safeParse(record);
    if (!citation.success) throw new AiGatewayError("invalid_citation", "Invalid output source reference");
    validateCitations(request, [citation.data]);
  }
  for (const child of Object.values(record)) validateOutputCitations(request, child);
}
function validateCitations(request: AiGatewayRequest, citations: readonly { sourceId: string; start: number; end: number }[]): void {
  const sources = new Map(request.sources.map((source) => [source.id, source.content]));
  for (const citation of citations) {
    const source = sources.get(citation.sourceId);
    if (source === undefined || citation.start >= citation.end || citation.end > source.length) {
      throw new AiGatewayError("invalid_citation", "Citation is outside source bounds");
    }
  }
}
