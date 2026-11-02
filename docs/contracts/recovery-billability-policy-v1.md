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
3. `approveBillability` requires that review, the same current authorized reviewer,
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

This change adds no database storage or runtime adapter. Durable review/audit
writes and authenticated source resolution remain required before exposing the
workflow. In particular, the merged SV-6 assessment adapter still refuses
`approve_review`; this policy module does not remove that refusal or promote an
assessment into a qualifying persisted source. The M4-1-dependent integration
must persist command/review/approval and audit atomically, recheck authorization
on replay, and read sources under their accepted locks. No model output can be
substituted for those sources. Domain tests do not establish PostgreSQL or
provider guarantees.

No builder-facing list/read response is added. Internal snapshots, proposals,
reviews and policy exclusions contain shadow information and must never be
returned before lock; the existing post-lock disclosure boundary remains in
force. Owner/adviser approval evidence for D01–D03/D13 and G4-S are still required
for production. Stored commercial approval evidence would not enable this leaf:
its environment is restricted to `synthetic_demo` and all results carry
`productionEnabled: false`.
