import { AiGateway, type AiSessionResolver } from "./gateway.js";
import type { AiProvider } from "./types.js";
import { SPOKEN_SORT_OPERATION, SPOKEN_SORT_SYSTEM, safeToSend, spokenSortJsonSchema, spokenSortUserMessage, spokenSortWireV1, type CleanedTranscript, type SortItem, type SpokenSortWire } from "./locate-model-reading.js";

/**
 * V2-SQ-G: the one live model route, practice tenant only. Types, gates and prices; the provider adapter is
 * `anthropic-live-sort.ts`, the only file that imports the SDK. `generate()` and the fixture provider are untouched.
 */
export const SPOKEN_SORT_MODEL = "claude-sonnet-5-5" as const;
export const SPOKEN_SORT_MAX_TOKENS = 2_000;
export const SPOKEN_SORT_TIMEOUT_MS = 15_000;
/** The practice tenant (equal to DEMO_TENANT_ID in @jobguard/db; apps/api tests the two are the same). */
export const SPOKEN_SORT_PRACTICE_TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const SPOKEN_SORT_ENVIRONMENT = "synthetic_demo" as const;

/**
 * Price table, checked against https://platform.claude.com/docs/en/about-claude/pricing on 27 Nov 2026:
 * Claude Sonnet 5.5 is $2 per million input tokens and $10 per million output tokens, with no long-context surcharge.
 * The cap is in pence; 100 pence per US dollar over-counts on purpose (the pound has been worth more than a dollar).
 * So one input token costs 2 × 100 = 200 micro-pence, and one output token 10 × 100 = 1,000 micro-pence.
 */
export const MICRO_PENCE_PER_INPUT_TOKEN = 200;
export const MICRO_PENCE_PER_OUTPUT_TOKEN = 1_000;
export const microPenceFor = (inputTokens: number, outputTokens: number) => inputTokens * MICRO_PENCE_PER_INPUT_TOKEN + outputTokens * MICRO_PENCE_PER_OUTPUT_TOKEN;
/** Worst case: one token per UTF-8 byte of everything sent, plus every output token allowed. */
export const reservationMicroPence = (sentBytes: number) => microPenceFor(sentBytes, SPOKEN_SORT_MAX_TOKENS);

/** Hard ceiling on the monthly cap, whatever the environment says. */
export const SPOKEN_SORT_CAP_CEILING_PENCE = 2_000;
/** The cap in pence from its environment value; null (refuse) when missing, zero, negative, not a whole number, or over the ceiling. */
export function spokenSortCapPence(raw: string | undefined): number | null {
  if (raw === undefined || !/^[1-9]\d{0,5}$/u.test(raw.trim())) return null;
  const pence = Number(raw.trim());
  return pence > 0 && pence <= SPOKEN_SORT_CAP_CEILING_PENCE ? pence : null;
}

export type LiveSortUsage = { inputTokens: number; outputTokens: number };
export type LiveSortFailure = "refused" | "truncated" | "timeout" | "invalid_output" | "wrong_model" | "cap_reached" | "unavailable";
export type LiveSortResult =
  | { kind: "ok"; wire: SpokenSortWire; modelId: string; usage: LiveSortUsage }
  | { kind: "failed"; reason: LiveSortFailure; modelId: string | null; usage: LiveSortUsage | null };

/** What the adapter sends: fixed system text, the marked data block, and the wire schema. Nothing else. */
export type LiveSortWireRequest = { model: typeof SPOKEN_SORT_MODEL; system: string; user: string; schema: typeof spokenSortJsonSchema; maxTokens: number; timeoutMs: number };
/** The provider's answer, before any checks. Errors are mapped by the adapter, never thrown with provider text. */
export type LiveSortRawResponse =
  | { kind: "response"; stopReason: string | null; modelId: string | null; text: string | null; usage: LiveSortUsage | null }
  | { kind: "timeout" } | { kind: "error" };
export interface LiveSortAdapter { send(request: LiveSortWireRequest): Promise<LiveSortRawResponse> }

export type LiveSortRequest = {
  operation: typeof SPOKEN_SORT_OPERATION; environment: string; tenantId: string; cleaned: CleanedTranscript; items: SortItem[];
};

/** All three must hold, or there is no live route. */
export const liveSortPermitted = (environment: string | undefined, tenantId: string | undefined, operation: string) =>
  environment === SPOKEN_SORT_ENVIRONMENT && tenantId === SPOKEN_SORT_PRACTICE_TENANT_ID && operation === SPOKEN_SORT_OPERATION;

/** A dated form of the configured id ("claude-sonnet-5-5-20261101") is the same model; anything else is not. */
export const isConfiguredModel = (returned: string | null) => returned === SPOKEN_SORT_MODEL || (returned?.startsWith(`${SPOKEN_SORT_MODEL}-`) ?? false);

/** One call, no retry. The result carries usage whenever the provider returned any. */
export async function runLiveSort(adapter: LiveSortAdapter, request: LiveSortRequest): Promise<LiveSortResult> {
  if (!liveSortPermitted(request.environment, request.tenantId, request.operation)) return { kind: "failed", reason: "unavailable", modelId: null, usage: null };
  // Fail closed: a customer or site that the clause finder missed is never sent.
  if (!safeToSend(request.cleaned, request.items)) return { kind: "failed", reason: "unavailable", modelId: null, usage: null };
  let raw: LiveSortRawResponse;
  try {
    raw = await adapter.send({ model: SPOKEN_SORT_MODEL, system: SPOKEN_SORT_SYSTEM, user: spokenSortUserMessage(request.cleaned, request.items),
      schema: spokenSortJsonSchema, maxTokens: SPOKEN_SORT_MAX_TOKENS, timeoutMs: SPOKEN_SORT_TIMEOUT_MS });
  } catch {
    return { kind: "failed", reason: "unavailable", modelId: null, usage: null };
  }
  if (raw.kind === "timeout") return { kind: "failed", reason: "timeout", modelId: null, usage: null };
  if (raw.kind === "error") return { kind: "failed", reason: "unavailable", modelId: null, usage: null };
  const usage = raw.usage && Number.isSafeInteger(raw.usage.inputTokens) && Number.isSafeInteger(raw.usage.outputTokens)
    && raw.usage.inputTokens >= 0 && raw.usage.outputTokens >= 0 ? raw.usage : null;
  const failed = (reason: LiveSortFailure): LiveSortResult => ({ kind: "failed", reason, modelId: raw.kind === "response" ? raw.modelId : null, usage });
  // stop_reason first: a refusal or a cut-off answer is never parsed.
  if (raw.stopReason === "refusal") return failed("refused");
  if (raw.stopReason === "max_tokens" || raw.stopReason === "model_context_window_exceeded") return failed("truncated");
  if (!isConfiguredModel(raw.modelId)) return failed("wrong_model");
  if (raw.stopReason !== "end_turn" || raw.text === null) return failed("invalid_output");
  let json: unknown;
  try { json = JSON.parse(raw.text); } catch { return failed("invalid_output"); }
  const wire = spokenSortWireV1.safeParse(json);
  if (!wire.success) return failed("invalid_output");
  if (!usage) return failed("invalid_output");
  return { kind: "ok", wire: wire.data, modelId: raw.modelId!, usage };
}

/**
 * `AiGateway` with the one live method. A subclass, so `gateway.ts` (hash-pinned by the golden-run record) and
 * `generate()` stay byte-identical. Without a live adapter, `generateLive()` is unavailable.
 */
export class LiveAiGateway extends AiGateway {
  constructor(provider: AiProvider, resolveSession?: AiSessionResolver, private readonly live?: LiveSortAdapter) {
    super(provider, resolveSession);
  }
  async generateLive(request: LiveSortRequest): Promise<LiveSortResult> {
    if (!this.live) return { kind: "failed", reason: "unavailable", modelId: null, usage: null };
    return runLiveSort(this.live, request);
  }
}
