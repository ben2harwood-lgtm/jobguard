# M0-12b — dark speech fixture data flow

Register format: [provider-data-flow-v1](../contracts/provider-data-flow-v1.md).
Review date: 29 October 2026. Owner: JobGuard engineering; real-route approval owner:
D04 data/security owner. No D04/D12 approval or provider capability verification is claimed.

| Field | Current fixture route |
| --- | --- |
| Provider / feature | Internal deterministic Deepgram-shaped STT fake behind `packages/ai`; no vendor SDK |
| Environment / subjects | Synthetic fixtures only; generated silent 46-byte WAV and fictional text, no real people |
| Purpose / legal basis / roles | Test capture recovery and source provenance; real-data legal basis and processor terms unapproved |
| Origin / processing / storage / logs / backups | Local process and existing tenant-scoped PostgreSQL/private versioned test storage. No external processing. Hosted destinations/log/backup regions require approval before real data |
| Endpoint / deployment | Explicit `https://deepgram-fixture.invalid/v1/listen` configuration, deployment `deepgram-fixture.invalid`. Inert identifier only: never fetched. Every other configuration, endpoint, credential or live mode is rejected |
| Data direction | Server reads verified exact-version fixture evidence, validates tenant/job/evidence identity and bytes/hash, then executes the in-memory fake |
| Persistence / provenance | Separate `deepgram_transcript` capture source; transcript UTF-8 hash differs from retained audio hash. Metadata binds fixture/model/version, audio evidence/version/hash/length, original typed input and raw transcript |
| Retention / training / deletion | No provider retention or training. Fixture originals and source records follow existing immutable storage rules; no new deletion/WORM behavior. Real-data policies remain unapproved |
| Subprocessors / encryption / credentials | None added; no API key, provider transport or vendor account. Existing storage/database security is unchanged and does not constitute real-route approval |
| Failure / fallback | Typed recoverable errors preserve original text; missing upload, outage and timeout never create source rows. Partial transcript and original text are returned separately for review and never saved automatically. No provider/global fallback |
| Kill switch | Structural: only a fixed generated audio hash/length and fixture configuration are accepted. New capture service has no controller/module/HTTP registration. Public capture request still accepts text/local dictation only |
| Verification | Local deterministic tests, typechecks and build commands recorded in commit message. PostgreSQL upgrade/fresh, RLS and browser suites require CI; not represented by fake tests |

The dark entry point is `DeepgramFixtureCaptureService`. It consumes **already
registered** evidence on an existing synthetic job, reads it through
`FixtureSpeechAudioReader`, and returns a cited non-authoritative proposal. Only a
complete fixture response stores a labelled source, using the existing job ID.
It creates no new job, commercial revision, approval, send or payment. The current
watchdog evidence live-job and post-lock guards are preserved; no pre-job/draft
upload exemption is introduced. The normal review/promotion command remains the
only way to make canonical scope.

The deterministic transport's response is fictional text selected by fixture ID;
it does not recognize the generated silence. This is an adapter contract test,
not real speech recognition or an accuracy/residency evaluation. Browser-local
on-device dictation and its no-upload contract remain available and unchanged.
The display labels the new source as a Deepgram fixture transcript.

Before any live audio work: approve and independently verify D04's precise EU/UK
API endpoint/features/settings, processing/storage/log/backup regions,
subprocessors, training/retention/deletion and transport security. Introduce a
separately gated real transport with timeout/cancellation and no global fallback,
authorized uploads for the intended job lifecycle, approved-region evaluations,
and an explicit user choice. This change supplies none of those approvals.
