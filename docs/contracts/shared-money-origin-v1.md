# SH-1 shared money and origin v1

SH-1 implements BUILD_PLAN §8, §§9.1.8–9 and §10.3. It introduces arithmetic and provenance foundations only. It does not determine eligibility, approve terms, post journals, issue statements, send documents or collect fees. Existing v1 capped/credited synthetic calculations are unchanged.

## Core contracts

`calculateCumulativeFee` consumes strict `cumulative-fee.v1` and `fee-rate.v1` schemas. Exact pence cross boundaries as canonical integer-string numerator/positive denominator pairs (`exactPenceV1`). The reduced bigint rational remains exact through receipt allocation and aggregation. Public amounts returned by the fee kernel use the existing GBP `Money` representation and 1,000,000,000,000-pence limit. Inputs and results are bounded; bigint intermediates do not lose precision. Rounding is `commercial_half_even.v1`, once on cumulative principal × rate. VAT remains a separate policy.

The prior net posting belongs to the same policy/agreement version. A mismatch is a typed failure. `reference_fee_policy_v3` always means 10%; equivalent exact ratios are accepted. Contractor callers must load the rate from their immutable agreement snapshot, keeping each version's principal and prior postings separate. Minimums, bands and invoice-basis formulas are outside this kernel. A negative posting delta requires a `compensatesDerivationId`; a zero delta implies no journal. A positive delta is arithmetic, never authorization. Eligibility, proof, disputes, uniqueness and journal links are enforced by the consuming persisted domains.

`allocateReceiptToLines` consumes `receipt-allocation.v1`. The input names a complete invoice composition, receipt effective time, source reference, and exact outstanding gross per line at that time. Explicit line allocations take precedence; a separate invoice limits candidates to that invoice; otherwise allocation is proportional to outstanding gross. The line's own invoice net/gross ratio converts gross to exact net. Lines created after the effective time are excluded. No penny rounding occurs here. Overpayment, duplicate/unknown explicit targets, incomplete explicit totals, negative balances and incompatible invoices fail closed. The persisted allocator must quarantine an incomplete composition: the pure function cannot discover omitted lines.

For a refund/credit, use `direction: reversal` with the original settlement's eligible lines, original ratios and remaining settled balances, preserving that receipt's effective-time cutoff and explicit source allocation. Returned gross/net allocations are negative. This input is not a fresh snapshot of today's outstanding invoice. The persisted source links and refund limits belong to M4-8-S.

Money/quantity/rounding primitives already present remain public; v1 fee callers continue to use their historical formula. New SV-1 and ENT-4a fee domains must import `calculateCumulativeFee`; M4-8-S must import `allocateReceiptToLines`. The architecture test checks bigint-only monetary multiplication/division and requires these imports when the dependent fee/allocator modules arrive. Those tasks are absent from this checkout, so their actual integration is still to be verified by their own leaves.

## Job track and origin persistence

Migration `0053_shared_money_origin.sql` creates `app.job_commercial_track`, keyed by tenant/job and uniquely qualified by tenant/job/track. Tracks are `small_builder | contractor`. A binding is immutable; runtime has SELECT only. It is a job snapshot, not the future tenant agreement assignment owned by ENT-1. Its environment is explicit; no production environment is enabled.

The previous supported application is a synthetic small-builder demo. The migration binds its existing jobs accordingly, preserving already recorded pilot activation modes rather than recasting them as charged jobs. Previously captured variations receive `builder_logged`. Existing source text, IDs, revisions, approvals, priced provenance and audit history are untouched. The backfill stores the original capture hash/type and original row time. Missing raising command/user/role/device/evidence are not invented: command/user are null, role is `legacy_unrecorded`, and provenance is `backfilled_synthetic_fixture`. A pricing reviewer is not relabelled as the original raiser. The backfill block is idempotent and executable again only by the migration owner. SV-2 verifies this result and performs no additional backfill.

Existing quote activation and adoption import get small-builder bindings via bounded row triggers inside the existing routines' transaction, before their audit append. An existing binding is retained when an earlier synthetic quote chooses the existing no-charge scenario; a scenario flag never changes its commercial track/environment snapshot. Fresh quoted jobs bind at activation; fresh imported jobs bind at baseline insertion. Earlier direct synthetic live-fixture inserts have a labelled compatibility trigger. These trigger functions have no runtime/PUBLIC EXECUTE permission and do not acquire subsequent business locks. Their tenant context is derived from an already-inserted, RLS-checked row and restored before return. Future contractor work-order import must create its own authorized immutable contractor binding; SH-1 does not implement contractor organisation/import policy.

`variation.job_track` is filled from the binding when absent, then enforced by a composite FK. A forged supplied track fails the FK. A same-row CHECK allows only:

| Job track | Origin kinds |
| --- | --- |
| small_builder | builder_logged, final_review, jobguard_catch |
| contractor | site_user, jobguard_surfaced_confirmed, office_entry, client_instruction |

`extra_origin` has one row per variation, tenant/job/track/kind-qualified FKs and FORCE RLS. A deferred reverse FK requires an exact matching origin at commit. Runtime may SELECT/INSERT but cannot UPDATE/DELETE/TRUNCATE. UPDATE/DELETE triggers also reject privileged ordinary mutations of the origin, binding or variation origin/track.

Command-backed origins reference the existing command receipt. The receipt's actor must equal the raising membership (which identifies the raising user); the role must match the active membership. Its semantic key binds the exact job and variation: `extra-origin:<job UUID>:<variation UUID>`. The command type maps to one origin kind:

| Command type | Kind |
| --- | --- |
| LogBuilderExtra | builder_logged |
| AddFinalReviewExtra | final_review |
| ConfirmJobGuardCatch | jobguard_catch |
| LogSiteExtra | site_user |
| ConfirmPrompt | jobguard_surfaced_confirmed |
| RecordOfficeExtra | office_entry |
| RecordClientInstruction | client_instruction |

The receipt must be processing in the raising transaction. The server replaces caller-supplied server time with the transaction's server time (not a caller-supplied receipt timestamp), and derives capture type/hash from the stored variation. Device ID/capture time remain explicitly labelled metadata. Evidence hashes record provenance, not verified evidence or fee entitlement. Future leaves add their own scoped role-grant, work-order, visit, prompt and approval predicates.

The earlier synthetic builder capture implementation has no raising command receipt. It remains compatible through a trigger-created `legacy_synthetic_capture` origin with unknown actor/role explicitly labelled. A matching `LogBuilderExtra` receipt suppresses this compatibility row so the new command can insert complete provenance itself. Runtime cannot insert fabricated legacy provenance. None of these legacy records proves contractor site origin or qualifies a recovery fee.

RLS protects omitted row filters within an authenticated tenant context. It does not defend against a privileged rewrite or an application selecting an unauthenticated tenant context. No audit claim is upgraded by this migration.
