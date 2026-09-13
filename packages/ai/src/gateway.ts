import { z } from "zod";
import { AiGatewayError } from "./errors.js";
import {
  aiGatewayRequestSchema,
  aiProviderResponseSchema,
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
    if (!parsedRequest.success) throw typedZodError("invalid_request", "Invalid AI request", parsedRequest.error);
    const request = parsedRequest.data;
    if (options.signal?.aborted) throw new AiGatewayError("cancelled", "AI fixture request was cancelled");

    let untrustedResponse: unknown;
    try {
      untrustedResponse = await this.provider.execute(request, options.signal);
    } catch (error) {
      if (error instanceof AiGatewayError) throw error;
      throw new AiGatewayError("invalid_provider_response", "AI provider failed", { cause: error });
    }
    const parsedResponse = aiProviderResponseSchema.safeParse(untrustedResponse);
    if (!parsedResponse.success) {
      throw typedZodError("invalid_provider_response", "Invalid AI provider response", parsedResponse.error);
    }
    if (parsedResponse.data.fixtureId !== request.fixtureId) {
      throw new AiGatewayError("invalid_provider_response", "AI provider returned the wrong fixture identity");
    }
    validateCitations(request, parsedResponse.data.citations);

    let parsedOutput = outputSchema.safeParse(parsedResponse.data.output);
    let repairAttempts: 0 | 1 = 0;
    if (!parsedOutput.success && options.repair) {
      repairAttempts = 1;
      parsedOutput = outputSchema.safeParse(options.repair(parsedResponse.data.output));
    }
    if (!parsedOutput.success) throw typedZodError("invalid_output", "Invalid structured AI output", parsedOutput.error);

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

function validateCitations(request: AiGatewayRequest, citations: readonly { sourceId: string; start: number; end: number }[]): void {
  const sources = new Map(request.sources.map((source) => [source.id, source.content]));
  for (const citation of citations) {
    const source = sources.get(citation.sourceId);
    if (source === undefined || citation.start >= citation.end || citation.end > source.length) {
      throw new AiGatewayError("invalid_citation", `Citation is outside source bounds: ${citation.sourceId}`);
    }
  }
}

function typedZodError(code: "invalid_request" | "invalid_provider_response" | "invalid_output", message: string, error: z.ZodError): AiGatewayError {
  return new AiGatewayError(code, `${message}: ${error.issues.map((issue) => issue.message).join(", ")}`, { cause: error });
}
