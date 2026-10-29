import { createHash } from "node:crypto";
import { z } from "zod";
import { deepgramTranscriptSourceV1, syntheticSpeechAudio, type DeepgramTranscriptSource } from "@jobguard/core";
import { extractCaptureFixture } from "./capture.js";

// This is an explicit inert fixture destination, never an actual provider endpoint.
export const DEEPGRAM_FIXTURE_ENDPOINT = "https://deepgram-fixture.invalid/v1/listen";
const configV1 = z.object({
  contractVersion: z.literal("deepgram_fixture_config_v1"),
  mode: z.literal("fixture"), endpoint: z.literal(DEEPGRAM_FIXTURE_ENDPOINT),
}).strict();
const requestV1 = z.object({
  contractVersion: z.literal("deepgram_fixture_request_v1"),
  captureId: z.guid(), jobId: z.guid(), evidenceId: z.guid(), fixtureId: z.string().min(1).max(100),
  originalText: z.string().max(50_000), timeoutMs: z.number().int().min(1).max(30_000),
}).strict();
const responseV1 = z.object({
  contractVersion: z.literal("deepgram_fixture_response_v1"),
  transcript: z.string().trim().min(1).max(50_000), status: z.enum(["complete", "partial"]),
}).strict();
export const registeredSpeechAudioV1 = z.object({
  contractVersion: z.literal("registered_speech_audio_v1"),
  tenantId: z.guid(), jobId: z.guid(), evidenceId: z.guid(),
  state: z.literal("verified"), environment: z.literal("synthetic_demo"),
  evidenceType: z.literal("synthetic_speech_audio"), contentType: z.literal("audio/wav"),
  objectKey: z.string().min(1), objectVersionId: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u), byteLength: z.literal(46),
  serverVerifiedAt: z.string().datetime(), bytes: z.instanceof(Uint8Array),
}).strict();
export type RegisteredSpeechAudio = z.infer<typeof registeredSpeechAudioV1>;
/** Server-only port: implementation must authenticate scope and read an exact registered object version. */
export interface RegisteredSpeechAudioReader {
  read(tenantId: string, jobId: string, evidenceId: string): Promise<unknown>;
}
export type DeepgramFailureCode = "LIVE_DISABLED" | "INVALID_REQUEST" | "AUDIO_NOT_VERIFIED" |
  "PROVIDER_UNAVAILABLE" | "TIMEOUT" | "INVALID_RESPONSE";
export class DeepgramError extends Error {
  constructor(readonly code: DeepgramFailureCode) { super(code); }
}
export type DeepgramCaptureResult =
  | { status: "ready" | "partial"; originalText: string; source: DeepgramTranscriptSource;
      proposal: Awaited<ReturnType<typeof extractCaptureFixture>> }
  | { status: "recoverable"; originalText: string; code: DeepgramFailureCode };

/** Deterministic fake transport. There is intentionally no injectable network transport,
 * SDK, credential, live factory or endpoint fallback. Unknown fixtures fail closed. */
export class DeepgramFixtureAdapter {
  private readonly fixtures: Readonly<Record<string, unknown>>;
  constructor(config: unknown, fixtures: Readonly<Record<string, unknown>>) {
    if (!configV1.safeParse(config).success) throw new DeepgramError("LIVE_DISABLED");
    this.fixtures = structuredClone(fixtures);
  }

  async capture(tenantId: string, raw: unknown, audio: RegisteredSpeechAudioReader): Promise<DeepgramCaptureResult> {
    const request = requestV1.safeParse(raw);
    if (!request.success || !z.guid().safeParse(tenantId).success) throw new DeepgramError("INVALID_REQUEST");
    const input = request.data;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bounds storage lookup as well as fake provider execution. Late results never write capture state.
      return await Promise.race([
        this.execute(tenantId, input, audio),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DeepgramError("TIMEOUT")), input.timeoutMs); }),
      ]);
    } catch (error) {
      return { status: "recoverable", originalText: input.originalText,
        code: error instanceof DeepgramError ? error.code : "AUDIO_NOT_VERIFIED" };
    } finally { clearTimeout(timer); }
  }

  private async execute(tenantId: string, input: z.infer<typeof requestV1>, audio: RegisteredSpeechAudioReader): Promise<DeepgramCaptureResult> {
    const parsed = registeredSpeechAudioV1.safeParse(await audio.read(tenantId, input.jobId, input.evidenceId));
    if (!parsed.success) throw new DeepgramError("AUDIO_NOT_VERIFIED");
    const record = parsed.data;
    const hash = createHash("sha256").update(record.bytes).digest("hex");
    const fixtureHash = createHash("sha256").update(syntheticSpeechAudio()).digest("hex");
    if (record.tenantId !== tenantId || record.jobId !== input.jobId || record.evidenceId !== input.evidenceId ||
        record.bytes.length !== record.byteLength || record.sha256 !== hash || hash !== fixtureHash) {
      throw new DeepgramError("AUDIO_NOT_VERIFIED");
    }
    if (!Object.hasOwn(this.fixtures, input.fixtureId)) throw new DeepgramError("PROVIDER_UNAVAILABLE");
    const response = responseV1.safeParse(this.fixtures[input.fixtureId]);
    if (!response.success) throw new DeepgramError("INVALID_RESPONSE");
    const source = deepgramTranscriptSourceV1.parse({
      kind: "deepgram_transcript", text: response.data.transcript,
      acquisition: {
        contractVersion: "deepgram_fixture_transcript_v1", environment: "synthetic_demo",
        provider: "deepgram_fixture", deployment: "deepgram-fixture.invalid", model: "fixture-stt-v1",
        schemaVersion: "deepgram_fixture_response_v1", evaluationVersion: "deepgram-fixture-contract-v1",
        fixtureId: input.fixtureId, evidenceId: record.evidenceId, evidenceJobId: record.jobId,
        objectVersionId: record.objectVersionId, sourceSha256: hash, audioByteLength: record.byteLength,
        originalText: input.originalText, rawTranscript: response.data.transcript,
        status: response.data.status, humanEdited: false,
      },
    });
    return { status: response.data.status === "partial" ? "partial" : "ready", originalText: input.originalText,
      source, proposal: await extractCaptureFixture(input.captureId, source.text, input.fixtureId) };
  }
}
