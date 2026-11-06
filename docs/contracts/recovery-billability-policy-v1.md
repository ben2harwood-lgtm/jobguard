# M4-2 dark billability policy and review contract

This is the **domain policy slice** of BUILD_PLAN §11.5 M4-2, using the current
case view rather than the parallel M4-1 transition-table extension. D03 v3 and
D13 remain proposed. Production fee functionality is permanently disabled in
this module, including when a synthetic review is approved. Nothing here posts,
collects, allocates, changes an invoice, creates commercial authorization or
opens an endpoint. No migration or dependency is needed for this slice.

## Sources and authority

`recoveryBillabilitySnapshotV1` is an internal source-owner snapshot, not an HTTP,
AI or worker command. Its case fields correspond to main's `RecoveryCaseView`
(`id`, `jobId`, `revision`, `caseType`, `claimedNetPence`). A source owner must
resolve current immutable evidence, D03 facts, D13 attribution, final-account lock,
and remaining case allocation under its existing source locks. The snapshot
also records completeness and unresolved causation, amount and tax uncertainty.
An unrelated payment, duplicate claim, consumed allocation or unknown outcome
is non-billable even if a supplied principal is positive.

The module reuses `createEligibilityFacts`, `evaluateRecoveryEligibility` and
the D13 attribution predicate. A catch needs every D13 conjunct and the exact
final-account lock. Builder captures and pre-lock disclosures are excluded.
Uncertainty and missing facts/proof stay non-billable. Claimed principal and
remaining allocation bound the exact rational principal; approval cannot round
up a fraction. The existing source owner remains responsible for immutable
capture/disclosure history and allocation uniqueness across cases.

`authority` means an authenticated, currently authorized reviewer supplied by
that source owner; the object is not a credential. JSON validation alone cannot
authenticate it. No feature may expose these functions directly to untrusted
input or infer a persisted approval from a parsed record.

## Review and replay

1. A classifier may produce only a cited proposal. Citations must match exact
   source identities, versions and hashes in the current snapshot. Confidence
   has no effect on eligibility, human review or approval.
2. `reviewBillability` creates an immutable, serializable human review record:
   exact case/evidence/policy binding, category and attribution snapshot,
   deterministic classification/exclusions, claimed eligible principal, reasons,
   and reviewer membership/identity. It can record a non-billable review.
3. `approveBillability` requires that review, a different current authorized reviewer membership,
   exact bindings, and a byte-equivalent canonical snapshot. Every deterministic
   rule must pass and the human amount must be positive and within the exact
   qualifying principal. This is a synthetic policy approval, not fee authority.
4. `requireCurrentBillabilityApproval` repeats these checks before consumption.
   Reversals, source invalidation, claim changes, disclosure, captures, allocation
   changes and locked-bill changes invalidate historical approval even if a
   producer failed to advance its revision counter. Future policy versions and
   revisions fail closed; they cannot silently reprice old approvals.
5. `replayBillabilityApproval` returns the original immutable result only for an
   identical command and authenticated reviewer. It does not grant current
   entitlement; consumers must still use the freshness check. The durable
   command owner must enforce tenant-qualified command uniqueness in its own
   transaction. These pure functions do not claim exactly-once execution.

## Integration boundary

The dark M4-2 integration uses `RecoveryBillabilityRepository` and migration `0565_recovery_billability_integration.sql`.
A review request identifies a case/work/line and expected case revision; it cannot
supply allocation state, capture/disclosure flags, a lock, a snapshot or authority.
The private database resolver reads the current lock, stored case allocation and
D13 source facts through the existing attribution resolver. Non-catch categories
remain on their existing synthetic review paths; this slice does not extend their
stored-fact adapters. Fractional allocations conservatively stay non-billable if
the full exact principal exceeds the whole-penny available amount.

One tenant transaction holds the case and allocator locks, evaluates the pure
policy and saves its immutable result plus audit. A database primary key enforces
`(tenant_id, command_id)` uniqueness across review and approval actions. Replays
reauthenticate and return the first result; different inputs conflict. Approval
re-reads the current sources and rejects a changed snapshot. Review uses the
existing practice principal; second-person approval uses an existing synthetic
identity session joined to a current owner membership of the same tenant, since
practice sessions deliberately map to a single fixed membership. Both the domain
policy and database forbid approval by the requesting membership. Runtime has
no direct table access. Audit contains references and a source hash, never review
reasons or shadow facts. The old `approve_review` attribution seam stays closed.

The new allocation INSERT trigger independently checks tenant/job feed ownership,
line-net capacity, the unique case/work binding and the exact invoice/locked
revision or supplementary descendant. It preserves the existing allocator locks
and constraints. No earlier migration is edited. Fresh and upgrade proofs run in
PostgreSQL CI; local pure tests do not prove these database controls. Migration
`0565_recovery_billability_integration.sql` is additive with no backfill. A forward-fix migration is the recovery strategy;
keep immutable historical commands and approvals, and leave the path disabled
while repairing it. It does not migrate or enable historical fee entitlement.

No builder-facing list/read response is added. Internal snapshots, proposals,
reviews and policy exclusions contain shadow information and must never be
returned before lock; the existing post-lock disclosure boundary remains in
force. Owner/adviser approval evidence for D01–D03/D13 and G4-S are still required
for production. Stored commercial approval evidence would not enable this leaf:
its environment is restricted to `synthetic_demo` and all results carry
`productionEnabled: false`.

## M4-2 synthetic human review surface

The direct URL `/jobs/:jobId/recovery-cases/:caseId/billability` now provides a
human review form and stored-review approval view. It has no main-navigation
link. Its session-only, no-store GET/POST adapter delegates to the existing strict
`recovery-billability-command.v1` repository command; it introduces no command,
policy, classifier, fee consumer or commercial authorization. The server requires
`synthetic_demo`; POST also requires the configured trusted browser origin.
Tenant, reviewer and session digest come from authenticated sessions only.

A practice reviewer selects a stored bound line, enters whole pence and reasons,
and records the existing immutable policy assessment. An independently signed-in
synthetic owner can read that stored review and request approval. Identity access
requires one unambiguous owner membership; no request tenant selector is accepted.
The repository/database still enforce different identities as well as memberships,
current source bindings, expected revisions, reversals and allocation constraints.
Other categories whose stored-fact adapters remain closed are refused; this page
does not create alternate adapters or fixtures to make them qualify. Non-billable
reviews are displayed as non-billable, never described as approved entitlement.

Existing reads expose neither billability reviews nor a second owner's review
projection. Migration `0592_recovery_billability_read.sql` therefore adds one
read-only routine with runtime EXECUTE only. It checks current session/owner,
tenant/job/case, owning practice session where applicable, and final-account lock
before reading bound work/line identities and immutable review results. Unknown,
other-tenant, refused-role and unavailable-session requests share not-found.
The proof and migration note describe fresh/upgrade privilege expectations and
forward-fix recovery. Existing migrations, policy checks and fee writers are
unchanged. Historical simulation approval on the page does not prove current
entitlement; future consumers must still recheck current facts.

The page stores the exact pending command in tab session storage before sending.
Lost, unreadable and 5xx answers retain it across reloads. Once an outcome is
uncertain, a later refusal also keeps that exact request available for replay.
Only a matching confirmed success clears an uncertain attempt. Server refusals
are shown in plain words. All displayed money comes from stored server results;
the client does not calculate eligibility or fees.

Validation receipt: local unit/guard and typecheck results are recorded in the
M4-2 handoff commit message. PostgreSQL route tests and the headless mobile-360 /
desktop spec are authored for CI; transport browser fixtures prove rendering and
retry behavior, not source eligibility. Browser accessibility assertions cover
labels/names, landmarks, language, headings and 44px targets, rather than claiming
a full external accessibility audit. No database or browser was run in this
sandbox. CI must prove fresh/upgrade/catalog/tenancy checks, the real PostgreSQL
route journey and rendered browser behavior. Independent RED review, D01–D03/D13
owner/adviser evidence, G4-S and all live gates remain outstanding.

LATER-SAFETY-18: the repository translates only PostgreSQL `23505` on
`billability_one_line_approval` into `BILLABILITY_LINE_ALREADY_APPROVED`; the
web adapter returns 409 with a reload message. Other database errors keep their
existing mapping, and identical authenticated commands return their stored result.
Named holds for landing: stale approval after evidence changes still blocks
re-approval of that line; a supersession design is required before live use.
