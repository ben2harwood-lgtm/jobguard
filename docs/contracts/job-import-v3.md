# CH5-C: synthetic v3 import contracts

Status: LATER-items working-tree revision of technically accepted head
`ab1f6b30cb9db8dac7693b57b9e5a7cfcc10a15a`, 23 October 2026. The prior
independent PASSes and acceptance apply only to that head; this revision needs
fresh review. **Not frozen for consumers.** CH-1/MON-1 acknowledgement remains held.
No runtime, route, persistence, ingestion, meter admission or external action is enabled.
Practice sandbox — synthetic data; nothing is sent or charged.

This additive contract implements BUILD_PLAN CH-5's pure boundary. Existing
`job-import.ts`, its v1 cap fields, response behavior and tests remain unchanged.
All new exports currently require relative imports; coordinator-owned barrels are untouched.

## Public intent and approved snapshot

`jobPartiesImportV3` accepts exactly:

```ts
{ version: 'job-parties-import.v3', commandId: UUID, expectedBindingId: UUID,
  fixtureId: string, lifecyclePoint: 'live' | 'invoiced', previewHash: SHA256,
  attest: true }
```

The future path `/jobs/:id/parties/import` identifies an already-owned source job
and binding. Fixture IDs are bounded lowercase ASCII identifiers, not file paths.
Only a server-selected fictional snapshot is allowed. Parsing proves shape, not
membership, ownership, fixture existence, approval or freshness.

`adoptJobV3` is a strict server-internal snapshot, version `adopt-job.v3`:

- `fixtureId`, `sourceJobId`, `lifecyclePoint`;
- `parties`: exact binding, customer/site/paying-party revision UUIDs (payer is
  always explicit, even when identical to customer);
- `baseline`: source baseline UUID/hash, exact description, accepted net pence,
  and 1–1,000 ordered source lines with source-line UUID, description and net pence;
- `terms`: fixed `synthetic_demo_import.v3`, existing `reference_fee_policy_v3`
  schema identity and `small_builder` track; these are reference terms, not approval;
- `attestation`: version `import-attestation.v3`, exact server-selected wording,
  and `attest:true`;
- `historyManifest`: mandatory ordered array, empty for no history, otherwise up
  to 1,000 exact source/evidence UUIDs, nullable baseline source-line UUID,
  immutable object version, SHA-256, positive safe byte length and nullable
  attested `sourceOccurredAt`. Non-null line references must belong to this
  snapshot; duplicate evidence identities fail. `sourceId` identifies a historical
  source document/bundle and may repeat for distinct originals (attachments or
  versions). Each original needs its own evidence ID. Repeated
  `(objectVersionId, sha256)` pairs fail even under different evidence IDs: safest
  synthetic choice until CH5-E can compare the complete stored object identity.

Descriptions/wording preserve whitespace and are nonblank, NUL-free strings up
to 2,000 UTF-16 units. Every object is strict. Monetary values are GBP nonnegative
integer pence at most `MAX_MONEY_PENCE`; summation uses bigint and must equal the
baseline total exactly. There are no quantity/rate calculations or rounding.
No client tenant, actor, receive/adoption time, generated result IDs, writable
small-job flag, fee, cap, paid status or policy overrides are accepted.
Historical time is labelled metadata, not a backdated server receive/adoption time.
History time is null or a calendar-valid explicit-offset `instantV1`, at most 200
characters. Unparseable source text must stay in the original evidence; supply
null until resolved, never invent a date. The classifier separately accepts
invalid historical strings so it can hold existing/untrusted history explicitly.
All UUIDs normalize to lowercase before comparison, duplicate detection or hashing;
the nil UUID is refused. This changes hashes for previously uppercase snapshots.

`importActionHashV3` and `importPreviewHashV3` hash the same **entire validated
snapshot** using the existing pure SHA-256 helper. Object keys sort by JavaScript UTF-16 code-unit order (the `<`/`>` comparator),
arrays retain order, strings retain exact bytes, and finite integer numbers use
JSON decimal encoding (`-0` encodes as `0`). The digest input is UTF-8 of this
canonical JSON. SQL consumers must reproduce this algorithm; PostgreSQL jsonb
serialization and locale-aware key sorting are not substitutes. Unknown fields fail before hashing. All source references,
amounts, descriptions, lifecycle, revision bindings, terms, wording and the full
history manifest participate. Do not hash the public intent as a substitute for
this content hash. The future public idempotency hash must additionally cover
the exact public request and path; this leaf implements no replay store.

`assertImportIntentV3(intent,snapshot)` must run before preview/adoption
approval: it binds `fixtureId`, `lifecyclePoint`, `expectedBindingId` to the
snapshot's party binding, and `previewHash` to the entire snapshot hash. Mismatch
throws `IMPORT_INTENT_SNAPSHOT_MISMATCH`. It does not verify session, path/source
job ownership, fixture selection or freshness; CH5-A owns those checks.

## Immutable result and reuse

`jobImportResultV3` (`job-import-result.v3`) contains import/job/terms/baseline
UUIDs, action hash, imported provenance, `builder_attested_weaker`, lifecycle,
unique linked-job UUIDs, and an opaque UUID `meterResultRef`. Even an invoiced
import needs the MON-1 zero-contribution result reference; it has no writable
meter values. Its baseline lists exact source-line/stable scope UUIDs, net pence
and the literal origin `builder_baseline`. Source and scope identities are unique
and line amounts reconcile exactly. No customer acceptance is fabricated.
`environment:'synthetic_demo'` and `realExternalActions:0` are fixed literals.
Schemas clone then deeply freeze parsed results without freezing caller objects.

`assertImportResultV3(snapshot,result)` additionally binds lifecycle, action hash,
source-line membership/count/amounts and total to the approved snapshot. A mismatch
throws `ImportContractError` with `IMPORT_RESULT_SNAPSHOT_MISMATCH`; malformed
helper inputs throw `ImportContractError` with `INVALID_IMPORT_CONTRACT`.
The hash, intent-binding and small-job helpers use that same typed parse error.
Direct schema `.parse` calls still use Zod errors; consumers may use `.safeParse`. The checked writer must derive generated IDs from command
identity, persist their mapping once, and return that original mapping on replay.
Pure validation does not establish immutability in a database.

`importedJobIsSmallV3` delegates to existing `isSmallJobV3(acceptedNetPence,0)`;
zero denotes no outbound quote revision for this imported baseline. It confers
no trial, grace, admission or billing authority. MON-1 owns place grouping,
ordinary start, zero contribution for invoiced imports and all capacity decisions.

## Historical evidence classification

`classifyImportedEvidenceProvenance` accepts strict
`imported-evidence-provenance.v1` with the exact tenant/job/evidence UUIDs, object
version/hash binding, nullable `sourceOccurredAt`, `adoptedAt`, `receivedAt`, an
explicit `historyContradictory` flag and nullable prior result. These inputs must
come from authentic immutable server history; caller JSON is not proof.

It returns a deeply frozen `imported-evidence-provenance-result.v1`, preserving
the original timestamp strings and binding:

| Ordering | Classification | Permanent exclusion | Positive eligibility |
| --- | --- | --- | --- |
| Source strictly before adoption | `pre_adoption_evidence` | true | `not_asserted` |
| Source strictly after adoption | `not_pre_adoption_by_timing` | false | `not_asserted` |
| Equal, absent (including receive time), invalid, contradictory or overlapping precision | `timing_unresolved` | false | `held` |

Timing uses explicit offsets, validated Gregorian dates and bigint nanoseconds.
A timestamp represents a half-open interval `[t, t + unit)`, where `unit` is one
second without fractional digits or 10^-d seconds for d supplied digits (1–9).
Source is before adoption when its upper bound is at most adoption's lower bound;
it is after when its lower bound is at least adoption's upper bound. Intersecting
intervals stay held. Equal lower bounds stay held, even at identical precision.
Thus second/millisecond timestamps far before adoption are permanently excluded,
while a source 500 ns after a microsecond adoption stays held. No fixed `.US`
format is required; producers must preserve known precision and never pad digits
to pretend a coarse timestamp is more precise. No clock or timezone default is used.
Unknown `-00:00`, more than 9 digits or unsupported/invalid representations stay held.

`holdReason` is null for ordered results and mandatory/non-null for a hold:
`prior_metadata_changed`, `contradictory_history`, `missing_time`, `invalid_time`,
`source_after_receipt`, `equal_time`, `precision_overlap` (precedence in that order).
Missing/invalid receive time holds even an otherwise known-before source. Source
lower bound after receive lower bound holds. Receive time can precede adoption
for historical originals or follow adoption/lock for late uploads.

A persisted prior permanent exclusion always survives later upload/rediscovery,
changed source metadata or contradictory history. A non-excluding prior binds
source/receive times and the contradiction flag: drift yields
`prior_metadata_changed`, which stays held on subsequent classifications, including
when the new metadata repeats or is restored. Equivalent offsets at the same
precision are not drift. Changing precision is drift. A different evidence/version/
hash/tenant/job/adoption interval fails with `IMPORT_PROVENANCE_BINDING_MISMATCH`.
Malformed input fails with `INVALID_IMPORT_PROVENANCE`. Prior result v1 now requires
`holdReason`; pre-consumer synthetic fixtures must be regenerated with the authentic
original facts, never silently discard a prior. No persisted runtime is introduced.
The future repository must load authentic prior history and bind byte length/source
identity to the stored original; omitting the prior cannot be prevented by a pure
function. Unresolved candidates must never map to `after_adoption`. No positive
result asserts attribution or a fee. These conservative interval/drift choices are
synthetic practice rules under Ben's 23 October "Use safest choice" answer, changeable
before real customers; they clear no policy or release gate.

The existing shadow `qualifiesAttribution` predicate remains the exclusion owner:
a `pre_adoption_evidence` exclusion refuses qualification even if all ten positive
facts hold. The new fixture exercises that predicate; no fee formula is copied.

## Integration and holds

Coordinator request only: additive core exports for the schemas/types/hash/result
binding/intent-binding/small-job helpers and provenance schema/classifier/error. No barrel edit
was made. Future CH5-P/E/B/A/J own atomic storage, verified originals, source-reader
and imported Final Account/lock compatibility, authenticated preview/adoption,
and the actual £0-catch journey. None is proven by these pure fixtures.

The issue clears H-ISSUE and H-PURE-SPLIT **for this build only** and explicitly
allows this lane's registration file. Formal CH-1/CH-3a/SV-2/MON-1 integration,
source-design/CH-1–MON-1 contract acknowledgement and contract freeze remain held.
H-MON1, H-IMPORT-BASELINE, H-SV5, H-SV6, H-REVIEW and H-LIVE remain. H-CH4,
H-17OCT, H-IDENTITY and H-D11 retain their parent-specific scopes; this leaf does
not resolve them. D01/D03/D09/D11/D12/D13 approval, production import, real data,
customers/providers and applicable G1/G2/G4-S/G5 release gates remain held.
Exact-head independent Claude A/B verdicts, required CI and separate technical
acceptance must follow; Ben alone merges. See the builder receipt for executed
commands and limits. No migration, operational alert or backwards-incompatible
v1 change is introduced; revert these additive files to withdraw the proposal.
