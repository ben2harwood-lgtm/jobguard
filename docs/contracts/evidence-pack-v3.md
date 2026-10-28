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
