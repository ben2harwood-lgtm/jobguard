BEGIN;
-- Dark M0-12b: existing kinds retain zero audio bytes; new kind is fixture-only.
ALTER TABLE app.capture_source DROP CONSTRAINT capture_source_kind_check;
ALTER TABLE app.capture_source ADD CONSTRAINT capture_source_kind_check
  CHECK (kind IN ('text','audio','browser_local_transcript','deepgram_transcript'));
ALTER TABLE app.capture_source DROP CONSTRAINT capture_source_audio_byte_length_check;
ALTER TABLE app.capture_source ADD CONSTRAINT capture_source_audio_byte_length_check CHECK (
  (kind = 'deepgram_transcript' AND audio_byte_length = 46)
  OR (kind <> 'deepgram_transcript' AND audio_byte_length = 0));
ALTER TABLE app.capture_source ADD CONSTRAINT capture_source_deepgram_fixture_check CHECK (
  kind <> 'deepgram_transcript' OR (
    acquisition_metadata IS NOT NULL AND
    jsonb_typeof(acquisition_metadata->'evidenceId') = 'string' AND
    acquisition_metadata ? 'evidenceId' AND
    acquisition_metadata @> '{"contractVersion":"deepgram_fixture_transcript_v1","environment":"synthetic_demo","provider":"deepgram_fixture","deployment":"deepgram-fixture.invalid","model":"fixture-stt-v1","audioByteLength":46}'::jsonb
  ));
ALTER TABLE app.synthetic_evidence_original DROP CONSTRAINT synthetic_evidence_original_content_type_check;
ALTER TABLE app.synthetic_evidence_original ADD CONSTRAINT synthetic_evidence_original_content_type_check
  CHECK (content_type IN ('image/png','image/jpeg','image/webp','audio/wav'));
-- Only the one generated silent WAV is supported; no arbitrary or live audio.
ALTER TABLE app.synthetic_evidence_original ADD CONSTRAINT synthetic_speech_fixture_bytes_check
  CHECK (content_type <> 'audio/wav' OR bytes = decode(
    '524946462600000057415645666d74201000000001000100401f0000803e00000200100064617461020000000000','hex'));
COMMIT;
