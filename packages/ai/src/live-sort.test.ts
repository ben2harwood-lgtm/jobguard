import { describe, expect, it, vi } from "vitest";
import { createAnthropicLiveSortAdapter } from "./anthropic-live-sort.js";
import { FixtureAiProvider } from "./fixture-provider.js";
import { cleanTranscript } from "./locate-model-reading.js";
import {
  LiveAiGateway, SPOKEN_SORT_PRACTICE_TENANT_ID, isConfiguredModel, microPenceFor, reservationMicroPence, runLiveSort, spokenSortCapPence,
  type LiveSortAdapter, type LiveSortRawResponse, type LiveSortRequest,
} from "./live-sort.js";

const wire = { areas: [{ name_words: "kitchen" }], items: [{ item_index: 0, area_index: 0, trade: "Kitchen fitting" }], missed: [] };
const request = (over: Partial<LiveSortRequest> = {}): LiveSortRequest => ({ operation: "spoken_job_sort.v1", environment: "synthetic_demo",
  tenantId: SPOKEN_SORT_PRACTICE_TENANT_ID, cleaned: cleanTranscript("In the kitchen fit new units 2000."), items: [{ index: 0, words: "fit new units 2000" }], ...over });
const adapter = (raw: LiveSortRawResponse | Error): LiveSortAdapter & { send: ReturnType<typeof vi.fn> } =>
  ({ send: vi.fn(async () => { if (raw instanceof Error) throw raw; return raw; }) });
const ok = (over: Partial<Extract<LiveSortRawResponse, { kind: "response" }>> = {}): LiveSortRawResponse =>
  ({ kind: "response", stopReason: "end_turn", modelId: "claude-sonnet-5-5", text: JSON.stringify(wire), usage: { inputTokens: 900, outputTokens: 120 }, ...over });

describe("V2-SQ-G live sort: one call, typed failures, usage kept", () => {
  it("returns the parsed reading with model and usage", async () => {
    const result = await runLiveSort(adapter(ok()), request());
    expect(result).toEqual({ kind: "ok", wire, modelId: "claude-sonnet-5-5", usage: { inputTokens: 900, outputTokens: 120 } });
  });
  it("checks stop_reason first: refusal and max_tokens are typed failures that keep usage", async () => {
    expect(await runLiveSort(adapter(ok({ stopReason: "refusal", text: "{}" })), request())).toMatchObject({ kind: "failed", reason: "refused", usage: { inputTokens: 900 } });
    expect(await runLiveSort(adapter(ok({ stopReason: "max_tokens", text: "{\"areas\":" })), request())).toMatchObject({ kind: "failed", reason: "truncated", usage: { outputTokens: 120 } });
  });
  it("invalid JSON, a wrong shape and missing usage are invalid output; no retry", async () => {
    const bad = adapter(ok({ text: "not json" }));
    expect(await runLiveSort(bad, request())).toMatchObject({ kind: "failed", reason: "invalid_output" });
    expect(bad.send).toHaveBeenCalledTimes(1);
    expect(await runLiveSort(adapter(ok({ text: JSON.stringify({ ...wire, price: 5 }) })), request())).toMatchObject({ reason: "invalid_output" });
    expect(await runLiveSort(adapter(ok({ usage: null })), request())).toMatchObject({ kind: "failed", reason: "invalid_output", usage: null });
  });
  it("accepts the configured model id or a dated form of it, nothing else", async () => {
    expect(isConfiguredModel("claude-sonnet-5-5-20261101")).toBe(true);
    expect(isConfiguredModel("claude-sonnet-5-55")).toBe(false);
    expect(await runLiveSort(adapter(ok({ modelId: "claude-opus-5-5" })), request())).toMatchObject({ kind: "failed", reason: "wrong_model", usage: { inputTokens: 900 } });
  });
  it("timeout and a thrown adapter are typed, with no usage", async () => {
    expect(await runLiveSort(adapter({ kind: "timeout" }), request())).toEqual({ kind: "failed", reason: "timeout", modelId: null, usage: null });
    expect(await runLiveSort(adapter(new Error("sk-ant-secret and the words")), request())).toEqual({ kind: "failed", reason: "unavailable", modelId: null, usage: null });
  });
  it("refuses any environment, tenant or operation other than the practice route, with no call", async () => {
    for (const over of [{ environment: "production" }, { tenantId: "22222222-2222-4222-8222-222222222222" }, { operation: "other" as "spoken_job_sort.v1" }]) {
      const send = adapter(ok());
      expect(await runLiveSort(send, request(over))).toMatchObject({ kind: "failed", reason: "unavailable" });
      expect(send.send).not.toHaveBeenCalled();
    }
  });
  it("the gateway without a live adapter is unavailable; generate() is unchanged", async () => {
    const gateway = new LiveAiGateway(new FixtureAiProvider({}), () => ({ tenantId: "t" }));
    expect(await gateway.generateLive(request())).toMatchObject({ kind: "failed", reason: "unavailable" });
  });
  it("prices: 200 micro-pence an input token, 1,000 an output token; the reservation is the worst case", () => {
    expect(microPenceFor(1_000_000, 0)).toBe(200_000_000); // $2 a million at 100p a dollar = 200p
    expect(microPenceFor(0, 1_000_000)).toBe(1_000_000_000); // $10 a million = 1,000p
    expect(reservationMicroPence(8_000)).toBe(8_000 * 200 + 2_000 * 1_000);
  });
  it("the cap refuses missing, zero, negative, NaN, fractional and over-ceiling values", () => {
    for (const raw of [undefined, "", "0", "-5", "NaN", "10.5", "2001", "1e3", " "]) expect(spokenSortCapPence(raw), String(raw)).toBeNull();
    expect(spokenSortCapPence("1000")).toBe(1000);
    expect(spokenSortCapPence("2000")).toBe(2000);
  });
});

describe("V2-SQ-G Anthropic adapter (fake fetch, no network)", () => {
  const options = { apiKey: "test-key-not-real", environment: "synthetic_demo", tenantId: SPOKEN_SORT_PRACTICE_TENANT_ID, operation: "spoken_job_sort.v1" };
  it("refuses without a key or outside the practice route", () => {
    expect(createAnthropicLiveSortAdapter({ ...options, apiKey: undefined })).toBeNull();
    expect(createAnthropicLiveSortAdapter({ ...options, apiKey: "" })).toBeNull();
    expect(createAnthropicLiveSortAdapter({ ...options, environment: "production" })).toBeNull();
    expect(createAnthropicLiveSortAdapter({ ...options, tenantId: "22222222-2222-4222-8222-222222222222" })).toBeNull();
    expect(createAnthropicLiveSortAdapter({ ...options, operation: "capture_job_record_proposal" })).toBeNull();
  });
  it("sends only the fixed request shape: no thinking, no sampling, no tool choice, no prefill, structured output", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: JSON.stringify(wire) }], usage: { input_tokens: 812, output_tokens: 64 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const live = createAnthropicLiveSortAdapter({ ...options, fetch: fetch as unknown as typeof globalThis.fetch })!;
    const result = await new LiveAiGateway(new FixtureAiProvider({}), () => ({ tenantId: "t" }), live).generateLive(request());
    expect(result).toEqual({ kind: "ok", wire, modelId: "claude-sonnet-5-5", usage: { inputTokens: 812, outputTokens: 64 } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = bodies[0]!;
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "output_config", "system"]);
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 2000, output_config: { effort: "low", format: { type: "json_schema" } } });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages.map(message => message.role)).toEqual(["user"]);
    expect(messages[0]!.content).toMatch(/^<transcript>\n/u);
  });
  it("a provider error is mapped without its text", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "the words and test-key-not-real" } }), { status: 400, headers: { "content-type": "application/json" } }));
    const live = createAnthropicLiveSortAdapter({ ...options, fetch: fetch as unknown as typeof globalThis.fetch })!;
    expect(await live.send({ model: "claude-sonnet-5-5", system: "s", user: "u", schema: {} as never, maxTokens: 10, timeoutMs: 1000 })).toEqual({ kind: "error" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
