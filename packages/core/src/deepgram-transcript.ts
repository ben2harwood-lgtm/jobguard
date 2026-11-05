import { z } from "zod";

/** Deliberately silent, generated 16-bit mono PCM WAV. Never supplied by a user. */
export function syntheticSpeechAudio(): Uint8Array {
  return new Uint8Array([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,
    16,0,0,0,1,0,1,0,64,31,0,0,128,62,0,0,2,0,16,0,
    100,97,116,97,2,0,0,0,0,0]);
}

export const deepgramTranscriptSourceV1 = z.object({
  kind: z.literal("deepgram_transcript"),
  text: z.string().min(1).max(50_000),
  acquisition: z.object({
    contractVersion: z.literal("deepgram_fixture_transcript_v1"),
    environment: z.literal("synthetic_demo"),
    provider: z.literal("deepgram_fixture"),
    deployment: z.literal("deepgram-fixture.invalid"),
    model: z.literal("fixture-stt-v1"),
    schemaVersion: z.literal("deepgram_fixture_response_v1"),
    evaluationVersion: z.literal("deepgram-fixture-contract-v1"),
    fixtureId: z.string().min(1).max(100),
    evidenceId: z.guid(), evidenceJobId: z.guid(), objectVersionId: z.string().min(1).max(1024),
    sourceSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    audioByteLength: z.literal(46),
    originalText: z.string().max(50_000),
    rawTranscript: z.string().min(1).max(50_000),
    status: z.enum(["complete", "partial"]),
    humanEdited: z.boolean(),
  }).strict(),
}).strict();
export type DeepgramTranscriptSource = z.infer<typeof deepgramTranscriptSourceV1>;
