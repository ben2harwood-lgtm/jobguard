# CH8-A evidence-pack v3 preparation contract

Issued build-only, 23 October 2026; base `dc5721230fd8aedbf2d9d0457789074b66b48765`.
This is an **unbound specimen contract**, not an accepted producer contract,
installed export path, authoritative source chain, fee determination or CH-8 acceptance.
`H-CH8-A-BINDING` remains held on accepted SV-5/SV-6/M4-8 handoffs.

The versioned strict Zod envelopes are `evidence-pack-manifest.v3` and
`evidence-pack-export.v3`. Every manifest requires `binding: unbound-specimen`.
There is no accepted/production mode. All objects reject unknown fields. No DB,
CLI, HTTP, browser, public-barrel or registration integration is installed here.
The only reusable implementation dependency is the existing public v1 SHA-256
and sandbox banner. v1 implementation and tests remain unchanged.

## Declared specimen representation

`buildEvidenceManifestV3(unknown)` validates the preparation input and derives
content hashes. `canonicalManifestV3`, `manifestDigestV3`,
`renderStandalonePackV3` and `verifyStandalonePackV3` operate on that shape.
Invalid syntax or contradictory manifest links throw `EvidencePackV3Error`
with code `EVIDENCE_PACK_V3_INVALID_SPECIMEN`. Content substitutions yield a
nonmatching verification result. Inputs are never silently filtered.

Each source descriptor and link carries the exact tenant/job/case, source ID,
opaque source version, opaque object version and SHA-256. Descriptors also
carry a declared kind and `recordedAt`. Supplied originals are UTF-8 strings;
lone UTF-16 surrogates are rejected to prevent silent UTF-8 replacement. No
Unicode normalization, newline conversion, rational parsing or float
conversion occurs. Specimen object versions are labels, not proof of immutable
storage. Binary original-content representation remains a producer binding hold.

A present section references unique specimen source IDs of its own declared
kind. The eight kinds are `lock`, `capture_snapshot`, `source_observations`,
`reconciliation`, `reveal`, `disposition`, `attribution_revision`, `settlement`.
A post-lock specimen declares each exactly once as present or absent. Absence
requires `not_yet_available`, `unpaid`, `disputed`, `early_disclosed` or
`late_evidence`; it never asserts the missing source exists. A present section
with an unavailable original fails integrity. Source IDs are unique within a
specimen; multiple producer revisions need distinct specimen IDs until the
accepted producer identity mapping is supplied. Duplicate identity/version,
duplicate links, self links, wrong versions/hashes/owners, unsectioned sources
and unmanifested originals fail closed. Corrections append sources and exact
links to the unchanged historical original; no compensating money is calculated.

All declared times use real UTC calendar timestamps with exactly six fractional
digits, retained as strings. Fixed-width lexical comparison preserves
microseconds. `evidenceCutoff <= lockedAt`; declared `source_observations` cannot
be later than cutoff. The meaning of each producer timestamp is still unbound.
These are declared-link checks, not proof of real receipt time, reconciliation,
ten-conjunct attribution, billing, allocation, settlement or reversal provenance.

## Canonical bytes and trust

Canonical JSON recursively sorts object keys by locale-independent UTF-16 code
units, sources by their serialized `(sourceId, sourceVersion)` tuple, sections
by kind, section IDs and declared link arrays by canonical value. Whitespace is
absent; arrays that represent sets are sorted on copies. Input objects remain
unchanged. Source text and IDs/times remain exact. Generation time, random pack
ID and request ID have no envelope field. SHA-256 over UTF-8 canonical manifest
is `manifestHash`; SHA-256 over the exact supplied export text is `artifactHash`.
Renderer bytes are deterministic under input permutations. Verification requires
the supplied text to equal the canonical renderer output byte for byte. Duplicate
JSON keys, reformatting and other noncanonical artifacts raise
`EvidencePackV3Error` before content or checkpoint trust can be reported.

The text/plain JSON export retains the exact practice sandbox banner. It contains
no self-declared trusted digest or trust flag. A caller may optionally supply
`trustedManifestDigest` from an independent trusted channel. A same-file or
alongside-file digest does not establish independence. Without a matching external
digest, findings retain **Checkpoint not independently trusted**. A mismatch or
malformed trusted digest also fails checkpoint trust. The verifier distinguishes:

- `contentMatches`: supplied originals match all declared manifest metadata/hashes.
- `checkpointTrusted`: supplied external digest matches the canonical manifest.
- `specimenIntegrityComplete`: both of those checks pass for the specimen only.
- `producerBindings: held`, `complete: false`: always, including trusted specimens.

The implementation cannot establish that a digest channel is independent. It
cannot certify that work happened or that a debt is valid. A manifest can be
self-consistent without any authentic producer provenance.

## Before lock and disclosure

The pre-lock ordinary preparation shape has no sections or lifecycle lock/cutoff
fields and accepts only `ordinary` source descriptors. No shadow count,
placeholder, classification or candidate metadata field is allowed. These
specimens model only supplied ordinary evidence; they never receive or query a
hidden world. Their equality does **not** prove runtime zero/many noninterference.
Free text is untrusted input; a pure schema cannot establish its disclosure
classification. The accepted source assembler must select authorised ordinary
content and run the accepted worker-owned must-surface request/completion path.

Must-surface disclosure is mandatory, separate from ordinary hidden evidence,
and permanently removes fee eligibility. The `early_disclosed` specimen models
that later declared lifecycle reason; it provides no before-lock worker all-clear
and grants no entitlement. Late evidence, unpaid and disputed specimens similarly
state absence rather than calculating eligibility.

## Acceptance boundary and handoff

`docs/fixtures/evidence-pack-v3.json` is labelled unbound: ordinary pre-lock,
every post-lock section, settled catch, unpaid, disputed, early-disclosed,
late-evidence and appended reversal specimens. They are neither persisted
business records nor DEMO-S seeds. EP-A01–06 tests prove only preparation syntax,
canonicalisation, supplied-content/declared-link integrity, checkpoint separation,
structural ordinary pre-lock shape and unchanged v1 regression behavior.

For **every** section, authoritative payload schema, original representation,
source-version mapping, required producer links and timestamp meaning are
UNRESOLVED under H-CH8-A-BINDING. No placeholder producer payload is frozen here.
Final binding must use exact accepted SV-5/SV-6/M4-8 contracts and retain rational
allocations and original microseconds without rounding. No source-to-settlement
runtime assertion is discharged. CH8-V and H-PACK-CONSUMER cannot consume this
preparation receipt as accepted binding. Worker handoff (H-EP-MUST-SURFACE),
version-aware downstream source validation/latest-pack compatibility
(H-PACK-CONSUMER), source assembly, persistence, access control, UI/CLI agreement
and EP-B/EP-C remain external holds. Coordinator owns additive public exports;
no unauthorised deep imports are offered to consumers. Actual independent
review, CI and separate acceptance remain required; Ben owns merge/enablement.

## CH-8 part 2 draft extension (28 October 2026)

The ch8-rest draft retains unbound specimen compatibility and adds a separate `synthetic-records`
binding. This label describes exact persisted synthetic database records exported by a checked
worker; it never asserts real work, debt validity, fee eligibility or production approval. Its first
trust limitation states that boundary. The remaining limitations are unchanged.

The worker consumes a strict material envelope with server-derived tenant/job/case, lifecycle and
record entries (`kind`, `sourceId`, exact PostgreSQL JSON `content`, microsecond `recordedAt`).
A source's version and `database-record:` object-version label are content hashes of the record text;
actual object versions/original base64 bytes remain inside that record. These labels do not claim
S3 immutability. No section-to-section causality is invented: original producer keys and references
remain in the exact records. Missing sections are declared `not_yet_available`, or `unpaid` when no
settlement allocations exist. Reversal and source-attempt history are retained, never netted away.

Generation requests bind a visible ordinary-source revision and an order-time pre-lock flag. Runtime
can request/read, but cannot read the private material or insert packs/check receipts/approvals. The
worker completes the deterministic must-surface handoff before pre-lock export and the checked writer
rechecks the session, inventory and canonical artifact under serialization. Post-lock material comes
only through that worker path. Approval is also queued and compares exact current material and hashes;
recording it is not a claim of lasting freshness or permission to bypass legacy attachment sinks.

For this binding, the offline verifier's `complete` means matching supplied content and a matching
externally supplied trusted manifest digest. It is an integrity result only. Unbound specimens still
always return `complete: false` and `producerBindings: held`. A digest read from the artifact itself
is not independent trust.

This draft does not satisfy CH-8 acceptance: the public SV-6 attribution assessment producer still
refuses on this base, and the fresh shadow-30000 source-to-settlement/browser journey remains missing.
Do not treat fixture or private-storage rounds as that acceptance. See the CH8-REST builder receipt.

## Router-scoped part 2 activation boundary (28 October 2026)

This supersedes the earlier draft readiness wording: part 2 is preparatory implementation; the
fresh shadow-30000 source-to-settlement/UI/verifier journey belongs to part 3 after the SV-6
runtime hookup. While assessment is unbound, v3 generation and approval refuse with
EVIDENCE_PACK_V3_DEPENDENCY_HELD in the authenticated application, SQL request and SQL writer
boundaries. No runtime pack is created with absent or invented attribution/settlement sections.
Queued work from an older deployment cannot bypass the writer refusal. Pure assembly specimens
and source preparation do not activate runtime creation. v1 behaviour is preserved.

## CH-8 part 3 synthetic activation (28 October 2026)

Migration 0360 activates the queued application/request/writer path after the installed 0340 SV-6
source resolver. This supersedes the part 2 runtime refusal above. Compatibility preparation ports
remain held and are not a fallback writer. Production and external delivery remain disabled.

Post-lock material includes immutable SV-6 attribution history, stored case/line allocations, neutral
fact sources/lines, exact invoice bindings and invoiced lines, settled movements/matches/payments,
credits and payment reversals. Source IDs/versions and rational strings remain exact. The accepted
attribution and allocation writers retain #346 job binding, #356 cumulative caps/distinct lines and
#368 locked original revision versus completed-check supplementary descendant binding. Pack generation
does not allocate money, approve attribution or grant a fee. Earlier artifacts never change.

Commands claim the shared command receipt before any business/audit locks; identical requests replay,
changed payloads and other command families conflict. The worker serializes the case, stored allocation
inventory and job before its final material comparison. Approval refers only to the exact stored pack
and is refused if the current material differs. A newly recorded adjustment makes older content
historical; an old approval never claims continuing freshness.

CI coverage exercises SQL canonical bytes against the TypeScript renderer, fresh synthetic
shadow-30000 source-to-settlement storage/browser/verifier agreement, and completed pre-lock exports
with zero/many hidden signals. These are tests awaiting execution in CI, not independent acceptance.
Pre-lock material exits before hidden SQL; must-surface processing remains worker-owned and completes
before ordinary export. Timing coverage checks statement shape and hidden-query exclusion; it does not
claim wall-clock constancy or production side-channel certification.

## RED repair round 1: export disclosure boundary

0360 projects processing sources and attempts to IDs and input/result hashes only. Neither frozen
processing input nor signal lists are exported. The reconciliation run projection retains only run,
manifest and lock IDs plus manifest/result hashes; its classifications and zero-result flag stay private.
Reveal and disposition records require a `reveal` classification and this case's own catch origin,
traced through its referenced variation revision and a matching final-account line `source_id` and
`commercial_revision_id`. A variation ID alone does not bind a real line. Non-catch cases receive no
reveal/disposition rows. Ordinary catch-origin records also exclude other catches' signal IDs.
The original pre-lock branch still returns before any hidden query. 0306 remains exactly PR #389;
these changes are confined to the not-yet-merged 0360 activation.
