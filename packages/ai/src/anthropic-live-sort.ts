import Anthropic from "@anthropic-ai/sdk";
import { liveSortPermitted, type LiveSortAdapter, type LiveSortRawResponse, type LiveSortWireRequest } from "./live-sort.js";

/**
 * V2-SQ-G: the provider adapter for the one live route, and the only file that imports the SDK (pinned 1.8.0, which
 * lists Cloudflare Workers among its supported runtimes). Sonnet 5.5 settings, per the SDK types and current docs:
 * no `thinking` (omitted, not disabled), `output_config.effort: "low"`, `output_config.format` with the wire schema,
 * no tool_choice, no prefill, no sampling parameters. No retry. Errors never carry provider text or the key.
 */
export type AnthropicLiveSortOptions = { apiKey: string | undefined; environment: string | undefined; tenantId: string | undefined; operation: string; fetch?: typeof fetch };

/** Refuses (null) unless a key is given, the environment is the synthetic demo, the tenant is the practice tenant and the operation is the one literal. */
export function createAnthropicLiveSortAdapter(options: AnthropicLiveSortOptions): LiveSortAdapter | null {
  if (!options.apiKey || !liveSortPermitted(options.environment, options.tenantId, options.operation)) return null;
  const client = new Anthropic({ apiKey: options.apiKey, maxRetries: 0, ...(options.fetch ? { fetch: options.fetch } : {}) });
  return {
    async send(request: LiveSortWireRequest): Promise<LiveSortRawResponse> {
      try {
        const message = await client.messages.create({
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          output_config: { effort: "low", format: { type: "json_schema", schema: request.schema as unknown as Record<string, unknown> } },
        }, { timeout: request.timeoutMs, maxRetries: 0 });
        const text = message.content.flatMap(block => block.type === "text" ? [block.text] : []).join("");
        const usage = message.usage && typeof message.usage.input_tokens === "number" && typeof message.usage.output_tokens === "number"
          ? { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens } : null;
        return { kind: "response", stopReason: message.stop_reason ?? null, modelId: typeof message.model === "string" ? message.model : null, text: text || null, usage };
      } catch (error) {
        return error instanceof Anthropic.APIConnectionTimeoutError ? { kind: "timeout" } : { kind: "error" };
      }
    },
  };
}
