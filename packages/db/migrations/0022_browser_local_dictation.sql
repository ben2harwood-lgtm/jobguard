BEGIN;
ALTER TABLE app.capture_source DROP CONSTRAINT capture_source_kind_check;
ALTER TABLE app.capture_source ALTER COLUMN kind TYPE varchar(40);
ALTER TABLE app.capture_source ADD CONSTRAINT capture_source_kind_check CHECK (kind IN ('text','audio','browser_local_transcript'));
ALTER TABLE app.capture_source ADD COLUMN acquisition_metadata jsonb;
ALTER TABLE app.capture_source ADD COLUMN audio_byte_length integer NOT NULL DEFAULT 0 CHECK (audio_byte_length = 0);
ALTER TABLE app.capture_source ADD CONSTRAINT capture_source_local_metadata_check CHECK (
  kind <> 'browser_local_transcript' OR (acquisition_metadata->>'contractVersion' = 'browser_local_dictation_v1' AND acquisition_metadata->>'language' = 'en-GB' AND acquisition_metadata->>'processLocally' = 'true' AND acquisition_metadata->>'audioUploaded' = 'false' AND acquisition_metadata->>'audioStored' = 'false'));
COMMIT;
