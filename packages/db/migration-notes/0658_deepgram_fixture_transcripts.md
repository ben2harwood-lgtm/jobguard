# 0658 — dark M0-12b fixture transcripts

Add `deepgram_transcript` with fixture-only metadata and exactly 46 audio bytes;
all pre-existing kinds retain the zero-byte rule. Audio bytes remain in verified,
versioned evidence, while capture stores transcript UTF-8 bytes/hash separately.
The synthetic original store additionally accepts only the exact generated silent
WAV. No rows are rewritten, no privileges/RLS/owners change, and no provider is enabled.
Evidence registration keeps the existing live-job/post-lock guards; the dark intake
adds a source to that same fixture job without generating another job or commercial state.

Upgrade: apply after predecessors; pre-existing image/text/local transcript rows
satisfy the unchanged alternatives. CI must run fresh/upgrade and real-PostgreSQL
capture/evidence tests. Local sandbox cannot start PostgreSQL.

Recovery: forward-fix constraints in a new migration. An intentional rollback
requires first archiving/exporting new fixture-kind rows; do not delete evidence
or edit this or earlier migrations. D04, route verification and live evaluation
remain separate gates; no real audio, endpoint, key or network transport exists.

Migration proof: `test/migration-proofs/0658_deepgram_fixture_transcripts.proof.json`
has empty LP-0, upgrade and tenancy changes. The SQL only replaces/adds CHECK
constraints on existing tables: it creates no routines, relations (including
indexes), policies or rows, and changes no capability, owner, ACL or RLS posture.
CHECK constraints are outside the upgrade snapshot's recorded attributes; their
behavior remains covered by `test/deepgram.integration.test.ts`. No RLS-off
allowance is declared. This migration needs no unmerged sibling proof.
