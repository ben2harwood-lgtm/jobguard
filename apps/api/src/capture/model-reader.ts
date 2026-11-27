import { randomUUID } from "node:crypto";
import type { JobUnderstanding } from "@jobguard/core";
import {
  CONTEXT_READER_VERSION, FixtureAiProvider, LiveAiGateway, MODEL_READER_VERSION, SPOKEN_SORT_MAX_INPUT_BYTES, SPOKEN_SORT_MODEL,
  SPOKEN_SORT_OPERATION, SPOKEN_SORT_PROMPT_VERSION, cleanTranscript, combineModelReading, microPenceFor, reservationMicroPence,
  sentBytes, sortItems, spokenSortCapPence,
} from "@jobguard/ai";
import { createAnthropicLiveSortAdapter } from "@jobguard/ai/live-adapter";
import type { StoredUnderstanding, V2AiCallLedger, VerifiedTenantContext } from "@jobguard/db";

/**
 * V2-SQ-G: Reader B around Reader A, for the spoken capture only. A live call needs all three switches
 * (JOBGUARD_SPOKEN_JOB_MODEL_KEY, a valid JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE, JOBGUARD_SPOKEN_JOB_LIVE=1), the
 * synthetic-demo environment, the practice tenant, both 2069 tables, a transcript of at most 8,000 bytes, and room
 * under the cap and the daily limit. The call is made outside any database transaction. Nothing here logs.
 */
export type ModelReaderEnv = { [name: string]: string | undefined };
export type ModelReaderPorts = { ledger: Pick<V2AiCallLedger, "available" | "reserve" | "settle">; env: ModelReaderEnv };
export type ModelReading = { used: false } | { used: true; understanding: JobUnderstanding; stored: StoredUnderstanding };

/** The model the proposal records when the model reader was used: Reader A's value plus the model id. */
export const withModelReader = (readerAModel: string) => `${readerAModel}+${SPOKEN_SORT_MODEL}`;

/** True only when all three switches are set; Reader A is not even re-read otherwise. */
export const modelReaderOn = (env: ModelReaderEnv) => switches(env) !== null;

/** All three switches, or null. The key is read here and handed to the adapter, never logged or returned. */
function switches(env: ModelReaderEnv): { key: string; capPence: number } | null {
  const key = env.JOBGUARD_SPOKEN_JOB_MODEL_KEY;
  const capPence = spokenSortCapPence(env.JOBGUARD_SPOKEN_JOB_MONTHLY_CAP_PENCE);
  if (!key || capPence === null || env.JOBGUARD_SPOKEN_JOB_LIVE !== "1") return null;
  return { key, capPence };
}

export async function readWithModel(ports: ModelReaderPorts, context: VerifiedTenantContext, input: { captureId: string; text: string; readerA: JobUnderstanding }): Promise<ModelReading> {
  const on = switches(ports.env);
  if (!on) return { used: false };
  if (new TextEncoder().encode(input.text).length > SPOKEN_SORT_MAX_INPUT_BYTES) return { used: false };
  const adapter = createAnthropicLiveSortAdapter({ apiKey: on.key, environment: ports.env.JOBGUARD_ENV, tenantId: context.tenantId, operation: SPOKEN_SORT_OPERATION });
  if (!adapter) return { used: false };
  if (!(await ports.ledger.available(context))) return { used: false };

  const cleaned = cleanTranscript(input.text);
  const items = sortItems(input.readerA, input.text, cleaned);
  const callId = randomUUID();
  const reservation = await ports.ledger.reserve(context, { callId, captureId: input.captureId, microPence: reservationMicroPence(sentBytes(cleaned, items)), capMicroPence: on.capPence * 1_000_000 });
  // At the cap the reader is dark until the next UTC month; Reader A carries on.
  if (!reservation.reserved) return { used: false };

  const gateway = new LiveAiGateway(new FixtureAiProvider({}), () => ({ tenantId: context.tenantId }), adapter);
  const result = await gateway.generateLive({ operation: SPOKEN_SORT_OPERATION, environment: ports.env.JOBGUARD_ENV ?? "", tenantId: context.tenantId, cleaned, items });
  // Settle from returned usage. With none (a timeout, a crash), the reservation counts in full.
  if (result.usage) {
    await ports.ledger.settle(context, { callId, captureId: input.captureId, microPence: microPenceFor(result.usage.inputTokens, result.usage.outputTokens),
      outcome: result.kind === "ok" ? "ok" : result.reason === "cap_reached" ? "unavailable" : result.reason, modelId: result.modelId,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }).catch(() => undefined);
  }
  if (result.kind !== "ok") return { used: false };
  const combined = combineModelReading(input.readerA, input.text, result.wire, input.captureId);
  if (!combined.used) return { used: false };
  return { used: true, understanding: combined.understanding, stored: { understanding: combined.understanding, readerA: input.readerA,
    readerAVersion: CONTEXT_READER_VERSION, readerBVersion: `${MODEL_READER_VERSION}:${result.modelId}`, promptVersion: SPOKEN_SORT_PROMPT_VERSION } };
}
