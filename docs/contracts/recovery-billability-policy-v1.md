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

The dark M4-2 integration uses `RecoveryBillabilityRepository` and migration 0450.
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
0450 is additive with no backfill. A forward-fix migration is the recovery strategy;
keep immutable historical commands and approvals, and leave the path disabled
while repairing it. It does not migrate or enable historical fee entitlement.

No builder-facing list/read response is added. Internal snapshots, proposals,
reviews and policy exclusions contain shadow information and must never be
returned before lock; the existing post-lock disclosure boundary remains in
force. Owner/adviser approval evidence for D01–D03/D13 and G4-S are still required
for production. Stored commercial approval evidence would not enable this leaf:
its environment is restricted to `synthetic_demo` and all results carry
`productionEnabled: false`.
