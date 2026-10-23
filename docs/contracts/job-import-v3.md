# CH5-C: synthetic v3 import contracts

Status: issued build-ahead pure leaf, 23 October 2026. **Not frozen for consumers,
not independently reviewed or accepted.** CH-1/MON-1 acknowledgement remains held.
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
  snapshot; duplicate source or evidence identities fail.

Descriptions/wording preserve whitespace and are nonblank, NUL-free strings up
to 2,000 UTF-16 units. Every object is strict. Monetary values are nonnegative
integer pence at most `MAX_MONEY_PENCE`; summation uses bigint and must equal the
baseline total exactly. There are no quantity/rate calculations or rounding.
No client tenant, actor, receive/adoption time, generated result IDs, writable
small-job flag, fee, cap, paid status or policy overrides are accepted.
Historical time is labelled metadata, not a backdated server receive/adoption time.

`importActionHashV3` and `importPreviewHashV3` hash the same **entire validated
snapshot** using the existing pure SHA-256 helper. Object keys sort lexically,
arrays retain order, strings retain exact bytes, and finite integer numbers use
JSON decimal encoding. Unknown fields fail before hashing. All source references,
amounts, descriptions, lifecycle, revision bindings, terms, wording and the full
history manifest participate. Do not hash the public intent as a substitute for
this content hash. The future public idempotency hash must additionally cover
the exact public request and path; this leaf implements no replay store.

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
schemas use Zod errors. The checked writer must derive generated IDs from command
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
| Equal, absent, invalid, contradictory or insufficient precision | `timing_unresolved` | false | `held` |

Timing uses explicit offsets and 6–9 fractional digits (microseconds or better),
validated Gregorian dates and bigint nanoseconds. No `Date.now`, browser clock,
millisecond truncation or timezone default is used. Offset-equivalent instants
compare equally. Fewer/more fractional digits, an unknown `-00:00` offset or a
source later than receive time stay unresolved. This conservative precision choice
is a build proposal awaiting source-owner acknowledgement, not a new fee policy.
Receive time may precede adoption for historical originals or follow adoption/lock
for late uploads; neither reclassifies a known earlier source as later work.

A persisted prior permanent exclusion always survives later upload/rediscovery,
changed source metadata or contradictory history. A prior result for a different
evidence/version/hash/tenant/job/adoption instant fails with
`IMPORT_PROVENANCE_BINDING_MISMATCH`. Malformed input fails with
`INVALID_IMPORT_PROVENANCE`. The future repository must supply the authentic prior
record and preserve its original provenance; omitting it cannot be prevented by a
pure function. Unresolved candidates must stay held and must never be mapped to
`after_adoption` merely because the existing shadow evidence enum lacks an unknown
state. No positive result asserts attribution or a fee.

The existing shadow `qualifiesAttribution` predicate remains the exclusion owner:
a `pre_adoption_evidence` exclusion refuses qualification even if all ten positive
facts hold. The new fixture exercises that predicate; no fee formula is copied.

## Integration and holds

Coordinator request only: additive core exports for the schemas/types/hash/result
binding/small-job helpers and provenance schema/classifier/error. No barrel edit
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
