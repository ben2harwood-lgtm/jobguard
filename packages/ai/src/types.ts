import { z } from "zod";

export const AI_GATEWAY_CONTRACT_VERSION = "ai_gateway_request_v1" as const;

export const aiSourceSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const aiGatewayRequestSchema = z.object({
  contractVersion: z.literal(AI_GATEWAY_CONTRACT_VERSION),
  fixtureId: z.string().min(1),
  operation: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  sources: z.array(aiSourceSchema).min(1),
  timeoutMs: z.number().int().positive().max(30_000),
  maxOutputTokens: z.number().int().positive().max(8_192),
});

export type AiGatewayRequest = z.infer<typeof aiGatewayRequestSchema>;

export const aiCitationSchema = z.object({
  sourceId: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});

export type AiCitation = z.infer<typeof aiCitationSchema>;

export const aiProviderResponseSchema = z.object({
  output: z.unknown(),
  citations: z.array(aiCitationSchema),
  provider: z.string().min(1),
  model: z.string().min(1),
  deployment: z.string().min(1),
  fixtureId: z.string().min(1),
  costPence: z.literal(0),
});

export type AiProviderResponse = z.infer<typeof aiProviderResponseSchema>;

export type AiGatewayResponse<T> = {
  output: T;
  citations: readonly AiCitation[];
  provenance: {
    provider: string;
    model: string;
    deployment: string;
    fixtureId: string;
    promptVersion: string;
    schemaVersion: string;
    sourceHashes: Readonly<Record<string, string>>;
  };
  costPence: 0;
  repairAttempts: 0 | 1;
};

export interface AiProvider {
  readonly kind: "fixture";
  execute(request: AiGatewayRequest, signal?: AbortSignal): Promise<unknown>;
}

export type AiOutputSchema<T> = z.ZodType<T>;
