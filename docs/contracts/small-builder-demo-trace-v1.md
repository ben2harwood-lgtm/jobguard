# DEMO-P2 trace and report v1 — preparation only

Issued 23 October 2026, decision 74. Base `0e517aa291fcc73b3ef0f40cb22e52d2b1b69e7b`, DEMO-P1 build-ahead candidate; integration target main. This is a pure supplied-data schema and consistency validator. No runtime reader, renderer, endpoint, migration, export registration or authoritative report is installed. P1 remains under review; its catalogue structure is consumed under the issuance's limited handoff only.

## Versions and consumers

`packages/core/src/small-builder-demo-trace.ts` exports `demoTraceScopeV1`, `demoTraceValueV1`, `demoTraceSourceV1`, `demoProductReportV1`, `acceptanceTraceV1`, the inferred report/trace types, and `validateDemoProductReport`. Direct owned-module imports only; shared barrels/package exports are coordinator-owned. CH9-B may eventually consume the separately accepted schema. No acceptance of P1 execution or DEMO runtime follows.

The product-report version is `small-builder-demo-product-report.v1`; the separate acceptance index is `small-builder-demo-acceptance-trace.v1`. Every object is strict Zod, with bounded strings and arrays. Syntactic parsing alone does not perform the relational checks: consumers must call the validator for structural consistency. All values remain untrusted supplied claims, including syntactically correct source digests, actor/tenant identifiers and external references. These are data schemas, not public HTTP commands or authorization contexts.

## Product fact vector

A report binds one synthetic tenant, job, session and run, one catalogue family and one viewport project, plus a prelock/postlock phase. Separate jobs, companions, runs and projects require separate reports; company/period aggregate adaptation remains with its future owner. The validator reads only P1's `demoCatalogue` version, `steps` (ID/family/binding IDs) and binding status. It never reads catalogue expected amounts into report output. P1 source base and expected evidence are documentation, never runtime facts.

Every family step is mandatory exactly once, with no unknown rows. A row is `observed`, `not_run`, or `blocked`; the latter two require a reason. Observed rows need at least one metric and cannot reference required HELD/missing bindings. At this exact P1 base all bindings are HELD, so no observed journey is accepted. Partial supplied metrics can accompany a blocked/not-run row as schema specimens; they never advance its execution state. This preparation schema deliberately fixes `executableMap: blocked`. A later accepted executable handoff needs an explicit reviewed version change rather than promoting this specimen to completion.

Metrics have unique per-row IDs and exact typed values: GBP integer pence bounded to ±1,000,000,000,000, safe nonnegative integer counts, or enumerated domain statuses. No rounding or money derivation occurs here. Each metric needs explicit source-ID/key references. Every referenced value must exist and equal the metric in type and value. This v1 supports exact reproduction, not arbitrary formulas or totals; a future authoritative aggregate reader must expose the immutable derived result and its own derivation contract. Negative amounts support correction specimens. Zero is evidence-bearing, never a missing-source default.

Sources carry unique IDs, full matching scope, a subject ID, immutable revision, lowercase SHA-256 claim and unique typed value keys. Source kinds are domain, Final Check, adapter and sentinel. No raw documents, transcripts, hidden table selectors, source queries or arbitrary source-kind strings are accepted. Prelock reports reject all Final Check sources, including unreferenced ones and zero-valued counts. Extra shadow/hidden-count fields are rejected by strict schemas. Truthfulness of a caller's `domain` classification cannot be established by a pure function; runtime authority/visibility adapters remain mandatory and held. This module never queries hidden data or derives a response from its existence.

Commands carry the same exact scope, command identity, canonical-input SHA-256 claim and exact result source IDs. Referenced results must exist. Exact duplicate entries are permitted as replay records; reuse of an identity with different input, scope or ordered result references is a conflict. Hashes are claimed producer fingerprints, not computed or authenticated here. Tenant/job/session/run mismatches fail; UUID possession grants no access. Metadata/domain non-atomic handoff and actual replay/reconciliation remain DEMO-I/producer responsibilities.

The reserved metric `external-actions` is a count and requires matching evidence from both adapter and sentinel source kinds. A fixture zero, hash, or one source alone cannot satisfy it. Even a syntactically coherent adapter/sentinel pair is **unverified** until real CI/runtime provenance is checked. No external action is performed by this module.

## Separate acceptance artifacts and deterministic result

The acceptance trace indexes external Claude, CI, browser and human-observation artifact locators with commit and SHA-256 claims, a report digest and the same scope. Each artifact must say `provenance: unverified`. No PASS, approval, observation content or verification field is accepted, at either root or artifact level. A plausible URL/filename/digest cannot certify authenticity. The schema never fetches a URL, recomputes bytes, appoints an actor or records an observation. Actual exact-commit reviews, CI, browser evidence and separate acceptance stay in their established external workflow. The product report rejects an embedded acceptance trace.

The validator returns deterministic ordered typed issues with paths, a structural-completeness boolean and unconditional `evidenceTrust: unverified`, `executableMap: blocked`, `journey: not_established`. There is no success/PASS/accepted verdict. A complete blocked specimen can be structurally complete while every journey remains unexecuted. Validation does not mutate input. Identical supplied vectors yield identical results; authenticity, authorization and immutable storage must be supplied independently by future accepted adapters.

## Acceptance coverage and holds

`docs/fixtures/small-builder-demo-trace-cases.json` is a versioned adversary recipe matrix, not observed data. Unit tests generate fictional scoped vectors and expand every P1 family for both viewport labels. Neither label is a browser run.

| ID | Pure schema proof |
|---|---|
| DP2-01 | Missing/duplicate/foreign rows, missing references, held observed rows and malformed source records fail. Opaque external artifacts remain unverified. |
| DP2-02 | Same command identity with conflicting inputs/result binding fails; exact replay remains structurally consistent. |
| DP2-03 | Scope and typed amount/count/status mismatches fail; fractional, unsafe, over-limit amounts fail. |
| DP2-04 | Strict public objects reject caller acceptance claims; separate artifact provenance cannot become verified. |
| DP2-05 | Prelock Final Check source/count and extra hidden-field payloads fail; no runtime query exists. |
| DP2-06 | Fixture-only zero lacks the required adapter/sentinel pair; a pair still cannot establish authentic zero attempts. |

Source preflight used `git grep`: `demoCatalogue` exists at the P1 base; `MAX_MONEY_PENCE` exists in money.ts. The four P2 functional paths named by the draft are new targets, absent at HEAD as expected, not missing predecessor capabilities. The P2 card names no existing runtime callable symbol. P1's proposed runtime interfaces are not imported, implemented or inferred accepted. Its documented STOPs are inherited holds for runtime only.

All P1/planning holds persist: H-SV5, H-EP-MUST-SURFACE, H-PACK-CONSUMER, H-CH8-A-BINDING, H-SV6, H-VALUE-SOURCES, H-FOLLOWUP-CLOCK, H-ALLOC, H-MONEY, H-LIFECYCLE, H-COMPANY, H-CUSTOMER, H-TRIAL, H-CORE-CORRECTION, H-DEMO-P1-EXEC, H-OPERATION-READ, H-MON7 and H-REVIEW. P1 is a candidate under review, not an accepted executable map. Runtime rendering/authoritative readers, genuine source authentication, actual zero-attempt sentinels, both-project browser execution, CI, two exact-head independent Claude reviews and separate acceptance remain held/missing. Both human observations remain missing. No release, real-data, provider, commercial or policy gate is opened. No data migration, compatibility change to existing APIs, operational alert or shared composition patch is required.
