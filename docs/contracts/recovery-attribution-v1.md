# SV6-01 recovery attribution contract v1

Status: synthetic build-ahead contract; no persistence, authentication, review approval, fee permission or production activation. Source-owner acknowledgement and all parent merge dependencies remain held. The issued SV6-01 order of 23 October 2026 amends the draft's build hold only. Ben merges.

The sole implementation is `packages/core/src/recovery-attribution-persistence.ts`. Shared barrel/export registration remains coordinator-owned. Existing `shadowAttributionV1`, `assertAttributionBinding` and `qualifiesAttribution` are reused without changes. Every versioned object rejects unknown keys, with no policy defaults added. Lowercase-only UUIDs (uppercase is refused, never silently normalised), lowercase SHA-256, bounded references, safe revision integers and existing `instantV1` timestamps are validated. Parsing grants no authority, even to schema-valid attacker JSON.

## Public command

`recoveryAttributionCommandV1` is the strict `recovery-attribution-command.v1` union. Both actions require `commandId`, `caseId`, `workId`, `lineId`, `lockId`, `expectedCaseRevision` (positive) and `expectedAttributionRevision` (nonnegative; zero means no assessment). `assess` has no other fields. `approve_review` additionally requires `assessmentId`, `expectedSourceHash`, `reviewArtifactHash`. Job identity is supplied through the authorized route; tenant, session, membership, policy and money are server-resolved.

`parseRecoveryAttributionCommand(unknown)` returns the immutable parsed command or throws `RecoveryAttributionError` with code `INVALID_RECOVERY_ATTRIBUTION_COMMAND`. It returns no target-sensitive validation details. Facts, money, actor, tenant, expiry, policy, mode, qualification flags and all Decision/resolution/authorization IDs are forbidden. In particular the browser never supplies `reviewAuthorizationId`.

## Assessment and sources

`recoveryAttributionRevisionV1` parses the draft's immutable `recovery-attribution-revision.v1` envelope: tenant/job/case/work/line/lock, assessment identity and revision/predecessor, case revision, source watermark/hash, manifest, branded existing facts, remaining exact principal, outcome/reasons, two explicit policy versions and bundle reference, server actor reference and timestamp. First revision has a null predecessor; later revisions require a distinct predecessor. Database linkage must enforce actual predecessor continuity and case/lock/line relationships; UUID syntax cannot prove them.

Every one of the ten existing facts remains mandatory, whether true or false. Facts bind tenant/job/work/line/lock to the outer envelope and their revision ID to `assessmentId`. Each `sourceRef` is the UUID `sourceId` of exactly one manifest entry. Entries carry kind, immutable source version/hash and tenant/job. Duplicate source identities are refused even with a different kind/version. Exclusion/dispute references must also be in the manifest. Fact source kinds follow this map:

| Predicate | Source kind |
| --- | --- |
| evidence received before lock | evidence |
| not disclosed before lock | disclosure |
| absent from accepted scope | baseline_manifest |
| absent from builder captures at lock | capture_manifest |
| absent from locked final account | locked_bill_manifest |
| revealed after lock | reveal |
| builder confirmed genuine extra and completed | disposition |
| billed through revision and invoice | invoice_line |
| customer payment settled and allocated | line_allocation |
| remaining qualifying principal after adjustments | line_allocation, line_reversal, refund or credit |

The source manifest may additionally contain reconciliation, dispute review, variation, settled movement and evidence invalidation records. One coalesced `workId` spans all sources; multiple citations never create principal or additional recoveries.

A conservative extension to the proposed envelope, `completeManifests`, is required. It contains exactly one frozen inventory for each of `baseline_manifest`, `capture_manifest`, `locked_bill_manifest`, bound to its source UUID and the same lock, with `status: 'completed'`, unique `itemIds` and exact `itemCount`. The corresponding absence fact must cite that inventory. A successfully frozen zero-item inventory is valid; missing, pending, failed, duplicate or mismatched inventories are refused. This is serialization consistency, not a proof of completeness: the source owner must reconstruct the accepted lock snapshot and verify the inventory/hash, including captures in every state, matching dispositions, and zero-result sources. Evidence receive-time cutoff, reconciliation completion, reveal, disclosure history and current evidence validity must likewise be reconstructed from authoritative records. A self-declared empty inventory or hash is never proof. Exact accepted source adapters remain upstream merge holds.

`eligible_for_review` requires the existing predicate to qualify and positive remaining principal; it has no reasons. All other assessments use `excluded` with nonempty reasons. False facts are persisted as facts rather than omitted. Excluded assessments may record factual remaining money, but that amount has no qualifying authority. An unresolved/dismissed dispute excludes; confirmed-extra review clears only the dispute. Disclosure, surfaced-early, post-lock and pre-adoption exclusions persist.

Amounts serialize exact rational pence as decimal integer strings `{numerator, denominator}` using the existing exact-pence wire bounds. Numerator is nonnegative, denominator positive; principal may not exceed `MAX_MONEY_PENCE` (1,000,000,000,000 pence). No binary floating point, allocation, rounding, fee derivation, rate, VAT, cap, credit or policy default is introduced. A fraction such as `1/3` remains unchanged.

## Review, current qualification and downstream use

`attributionReviewResultV1` is the server-only `recovery-attribution-review-result.v1` receipt: review/assessment/revision, source watermark/hash, command identity, artifact hash and server-created `reviewAuthorizationId`, effect `review_recorded`. The later SV6-03 owner creates actual authority through the existing dispatcher, not this schema. The exact review binds principal, policy, action and artifact. Owner only, each exact item approved separately; no standing authority or invented expiry duration.

`qualifyingRecoverySourceV1` is the branded internal `qualifying-recovery-source.v1` shape: exact tenant/job/case/work/line/lock, category `missed_variation_final_account`, assessment/review/authorization, current source revision/hash, unique nonempty saved `lineAllocationIds`, positive exact remaining principal and explicit policy bundle. It does not redistribute money, compute entitlement or query sources.

`currentAttributionQualificationV1` is `current-attribution-qualification.v1`, with latest assessment ID/current source revision. `qualified` contains a source bound to both identities and empty reasons. `not_assessed`, `unreviewed`, `held`, `excluded` contain null source and nonempty reasons. Historical assessments and review receipts stay readable; they cannot restore current authority. The server must compare the current watermark/hash and reauthorize under the same transaction/locks as positive downstream use. A parsed or cached API response cannot supply financial authority.

Assessment and qualifying-source envelopes explicitly require `environment: 'synthetic_demo'`, `productionEnabled: false`, `realExternalActions: 0`, `shadow_attribution_policy_v3`, `reference_recovery_eligibility_policy_v3` and an explicit server-resolved `policyBundleRef`. Review/current-result envelopes carry the same synthetic markers. This string does not approve the bundle. No source implementation, active authorization, policy approval or financial effect is implied by a schema brand.

## Handoff and gates

Assessment, explicit human review, neutral saved allocation and fee authorization are four separate stages. SV6-02/03 must verify current owner/membership/session, authoritative sources and source-owner privileges with one released lock order and audit/idempotency contracts. M4-8 owns neutral receipt-line allocations; SV-5 owns lock/reconciliation/catch linkage; CH-7 owns case/terms and pursuit guards. SV6-05/06 and M4-9 consume accepted exact sources; fee posting, statements, collection, tax and providers remain out of scope.

Merge requires accepted SV-5, complete CH-7, M4-8 bridge/F5/F7 proofs and acknowledgement of exact source shapes (including this conservative completeness extension), source authority/policy bundle, two independent exact-commit Claude verdicts, required CI, separate acceptance and Ben's merge. No acceptance or review is recorded by this contract. No migrations, database, network, routing, catalogue or shared barrel changes belong to this leaf.

## SV6-PERSIST-B historical read boundary

`GET /jobs/:id/success-fee-attribution` reads existing synthetic persisted revisions through the shared Next/Nest application. The strict versioned read query permits no fields. Its `recovery-attribution-history.v1` response explicitly carries synthetic, proposed, principal-only, production-disabled and zero-external-action identity; `qualification: 'dependency_bound'` means historical rows cannot grant current entitlement. It provides no fee illustration, rounded display, billed-value inference or executable source navigation. Each source reference remains historical provenance pending the accepted authoritative source resolver.

Each request verifies the current practice session and immutable job ownership; the repository reauthenticates the owner in its tenant transaction and checks the actual synthetic database and job lock before any attribution-table query. An authorized unlocked job returns empty history without consulting any attribution or held shadow table. Unknown, other-session and unauthorized subjects use the same `NOT_FOUND` error. No client tenant or actor is accepted.

`POST` accepts only the existing strict v1 intent schema after authentication. Execution returns `RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND` (503) until the accepted source adapter, review authorization, audit transaction and reassessment execution contract exist. Validity is not approval. No private append routine is exposed, no replay is manufactured, and no fee policy is activated. Read and intent responses use `Cache-Control: no-store`. This is an independently buildable boundary, not acceptance of source-backed runtime assessment, current qualification, source navigation or aggregate SV-6.

## SV-6 runtime hookup (0340, 28 October 2026)

This extension supersedes the assessment-only execution hold above. `assess` now reconstructs the stored SV-5 catch/case and 0335 receipt-allocation chain in the synthetic practice database, then appends the immutable assessment, command receipt and audit event atomically. The HTTP command returns `{ assessment, valueReceipt }`. The versioned `attribution-value-receipt.v1` is a per-catch illustration as of that assessment, explicitly `qualification: 'unreviewed'`, with proposed-policy, principal-only, synthetic, zero-action and VAT-not-calculated labels. It uses the existing exact cumulative-fee kernel at the proposed 10% rate: 80000 pence recovered, 8000 pence illustrated fee, 72000 pence before VAT/tax. Excluded assessments illustrate zero; fractions stay exact. It is not the review-qualified aggregate fee illustration, an authorization, an obligation or a posting.

`approve_review` remains held. GET remains historical and dependency-bound for current qualification. An exact command replay returns its original assessment/illustration, even if later sources changed; consumers must label it as historical. A fresh assessment with the current expected revisions is required for an updated illustration. No historical response can authorize a fee. The writer validates tenant/job/session, approved catch variation, immutable lock inventories and successful reveal, exact supplementary invoice ancestry, one work per line, line-net caps and the movement's job (not merely the 0258 tenant FK). Adjustments and invalid evidence create successor revisions. See migration note 0340 for lock order, forward fix and required CI.

## SV-6 exact synthetic review (0383, 29 October 2026)

This supersedes the `approve_review` execution hold above for synthetic practice only. POST accepts the existing strict intent and returns the existing `recovery-attribution-review-result.v1` receipt, without a value illustration. The checked SQL writer requires current owner/session/job ownership and an immutable lock before hidden reads or replay. It matches the exact latest assessment ID and case/attribution revisions, rereads all source facts through the existing resolver, and refuses a changed source hash, failed conjunct, exclusion or changed remaining principal. `reviewArtifactHash` is `app.final_lock_hash` of the complete immutable assessment document (the existing canonical JSON hash), binding its exact subject, source manifest, rational principal and synthetic policy versions. It is a separate binding from `expectedSourceHash`.

One assessment receives at most one recorded review; a new command for an already reviewed assessment refuses. An exact command replay returns its original historical receipt after reauthentication and creates no second authorization/audit event. Decision, approved resolution, exact review authorization, command result and audit are atomic. The authorization action is only `recovery.attribution_review`; its deadline is bounded by the existing session/membership deadlines without a new duration or standing permission. It cannot authorize a fee, statement or collection. GET remains historical/dependency-bound. Positive downstream use still needs its own current-source/permission and exact action checks; this change does not activate D03 or any production gate. See migration note 0383 for CI evidence and the migration-number collision requiring router reconciliation.
