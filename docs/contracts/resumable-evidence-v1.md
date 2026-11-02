# M3-5 dark resumable evidence server contract

`ResumableEvidenceService` is a synthetic server harness with no controller, provider,
real URL, gateway call or deployment. It defaults off. Explicit enablement still
requires the job's server-owned `synthetic_demo` track and active tenant membership
on every operation. The service binds actorMembershipId to the membership and identity
user retained in the authenticated context; queued system contexts are refused. G3 and D08 remain closed.

Requests use strict `version: resumable-evidence.v1` schemas. Begin supplies the
stable upload id, job/scope, actor membership, client SHA-256, device capture time,
content type, byte length and expiry through the existing two-phase command. For
this protocol `maximumBytes` is the exact original file byte length (at most 25 MB).
New uploads preserve shorter client expiries and cap longer ones at 24 hours from
server time; past expiries are refused. Retries retain the first stored expiry.
No request can replace the persisted job/scope, digest or capture time on replay.
Client digest/time remain expectations and labelled metadata; authoritative digest,
immutable synthetic version, receive time and verification time come from the server.

Append supplies upload/job/actor, byte offset and at most 1 MB of bytes. Chunks are
persisted transactionally under the upload row lock. Offset must equal the current
length; an exact prior chunk is an idempotent retry. Gaps, overlaps, changed retries,
expired/closed uploads and overflow fail. Status returns only upload state and next
offset using an unlocked read, without consulting shadow signals. A new service instance resumes the same
upload after interruption. No confirmed evidence exists while transfer is pending.

Finalize requires an explicit command id and evidence type. Short transfers stay
pending and resumable. Complete bytes are read again by the existing finaliser,
which validates hash, version, size, content type and media structure before creating
one immutable original. Replays use the existing command registry. Proof stages
use `storageForProof` with the existing `ProofCommandService` and still require finalized evidence; an upload or client hash alone cannot satisfy them.

Photo formats retain the existing rules. Synthetic voice fixtures use canonical
16-bit mono/stereo PCM WAV (8–48 kHz); other native codecs await the native adapter.
The ordinary upload service still refuses audio by default. Audio is never sent to
an AI/transcription service by this slice. Native capture, encrypted local media,
UI states, queued AI, device tests and production transport/retention remain outside
this server slice. No financial or locked-bill records are written.
