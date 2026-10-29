# Receipt-line allocation contracts v1 — M48-C0

Current synthetic status: 0335 enables the neutral no-amount producer described
in the final section. Earlier held-status statements below describe 0258 and its
superseded build-ahead command protocol, which remains refused.

Build-only, synthetic contracts at base `dc5721230fd8aedbf2d9d0457789074b66b48765`.
This document is not source-design acceptance, persistence evidence, a policy approval or permission to release. Source-design acceptance and M48-B1 still gate merge under the issued 23 October order. No production route, external action, case landing, fee or posting is introduced.

`packages/core/src/receipt-line-allocation-source.ts` owns the proposed strict runtime schemas. The coordinator owns eventual barrel/export integration. No integration change is requested before the accepted source handoff.

## Saved facts

`receiptLineAllocationSourceV1` parses `receipt-line-allocation-source.v1` server projections only. It binds tenant/job, immutable allocation revision/line identity, payment/movement and hash, invoice and its actual composite binding (invoice, revision, lock, check, final/supplementary kind), scope/commercial revision, source rule/reference, original server settlement and line-existence instants, exact signed gross/net, original integer line ratios, approval reference, version-specific evidence and original-row reversal link. Nested invoice ID equals outer invoice ID. There is no invented invoice-binding row ID.

Receipt gross is positive, net nonnegative and reversal gross negative, net nonpositive. Receipt links are null; reversal links identify an original line fact and cannot refer to themselves. Exact cross-products preserve the original line net/gross ratio and bound magnitude to original line gross. The server/database must additionally enforce same-tenant/job/payment/line ancestry, original source validity, unconsumed cash and reversal availability, uniqueness, completeness and current authority; a standalone parser cannot prove these.

Numerator/denominator integer strings are canonical decimal spelling (including no negative zero); denominator is positive. Values are bounded by `MAX_MONEY_PENCE` through the shared exact parser. Saved allocator outputs use `exactPenceV1`'s output digit bound, rather than the smaller `exactPenceInputV1` input bound, because complete 10,000-line compositions may produce wider denominators. Parsing preserves rational spelling/value without float conversion, reduction or rounding. `instantV1` preserves sub-millisecond server precision. All collections representing composition refuse more than 10,000 entries; no truncation is permitted. A reader must also prove completeness before returning them.

Evidence requires immutable object version, SHA-256 and server receive instant. Examples in tests are fabricated parser fixtures, **not persisted predecessor IDs**. No saved bridge IDs are available here, so a persisted example remains held for B1.

## Public commands and results

`receiptLineAllocationCommandV1` accepts only the issued four strict variants:

- `review`: payment ID and optional remittance evidence ID.
- `approve`: immutable review ID and approval hash.
- `review_reverse`: allocation revision ID, reversal source kind/ID, positive bounded gross pence and optional remittance evidence ID.
- `reverse`: immutable review ID and approval hash.

Every command carries its version, UUID command ID and positive safe-integer expected source revision. Clients cannot supply tenant/actor, invoice binding, ratios, rule, deemed net, source timestamps, settlement, eligibility or expiry. `parseReceiptLineAllocationCommand` reports typed `INVALID_RECEIPT_LINE_COMMAND`. Parsing IDs authenticates nobody. The server chooses and verifies the existing invoice binding and authorizes each exact review. No standing authority, default expiry duration, binding creation or integer case-split workaround is defined here. Reversal selection must be checked against saved source availability and original allocated gross by the future writer.

`receiptLineAllocationCommandResultV1` records immutable effects with paired action/outcome and IDs: review/review_saved/null allocation; approve/distribution_saved/allocation; review_reverse/reversal_review_saved/null allocation; reverse/reversal_saved/allocation. All carry command/job identity, source watermark, synthetic environment and zero real external actions. Replay retains original IDs/outcome/watermark and changes only `replayed` to true. The parser cannot prove a replay matches its durable original; B1 must enforce that.

## Views and reads

`receiptLineAllocationViewV1` separates saved source rows from unsaved review proposals, which have no approval reference. Null movement ID/hash/effective instant travel together; settled receipts require all three. Missing source metadata is never replaced by a client date or zero. An approval-ready review must match the view watermark.

Status precedence, enforced on parse and exposed as `deriveReceiptLineAllocationStatus`: factual holds (all except approval-expired/revoked) → source_held; changed/expired/revoked outstanding review or approval hold → review_stale; ready unconsumed review → review_ready; saved rows → saved_distribution; otherwise no_distribution. Existing rows cannot defeat current holds. The server supplies current expiry/revocation facts; this function invents no clock policy.

`receiptLineAllocationQueryV1` optionally requests one command ID. The server must authenticate job/session scope before lookup/projection and populate `commandResult` only for that exact requested command. A missing result means unresolved transport outcome, not permission to retry. A result and every saved row must match the view job. Cross-session/tenant authorization is exclusively server responsibility.

`receiptLineAllocationSelectorV1` and `receiptLineAllocationSnapshotV1` describe the future server reader selection and watermark/rows/holds. No fee/qualification boolean exists. The future port's standalone `readCurrent` authenticates current context/actor/session; `readCurrentInTransaction` uses the existing caller transaction and released common lock order, rechecks current authority and expected watermark and commits atomically with its consumer. Neither port is implemented here; core imports no database or verified-context implementation.

## Holds and safe choices

The 23 October safest-choice rule is applied by refusing malformed/unknown fields, unverifiable source bindings, incomplete/oversized compositions and stale ready-review watermarks. Require evidence rather than permitting evidence-free saved facts. Reviews supply no approved saved facts and parsers grant no settlement, fee or human authority. No production policy, expiry, role/permission grant or provider behavior is invented.

H-M48-SOURCE-DESIGN/Q2, Q6, deposit-source rebind, SV5, predecessor acceptance and persisted B1/F5/F7 proofs remain with their owners. Shared lock order, actor permissions, exact review expiry/revocation and cross-representation deduplication require an accepted server handoff. Independent Claude A/B exact-head verdicts, separate acceptance and Ben's merge remain outstanding. These pure tests cannot close parent PostgreSQL or browser gates.

## 0335 repair — enabled neutral synthetic producer

The earlier held deployment status above is historical for 0258. Migration 0335
now enables a no-amount protocol, `receipt-line-facts-command.v1`, behind the
existing read/write SQL signatures and `RecoveryLineAllocationRepository`:

- `review`: command ID, expected source revision, payment ID, optional persisted
  remittance evidence ID.
- `approve`: command ID, expected source revision, review ID and approval hash.
- `review_reverse`: command ID, expected source revision, original allocation
  revision ID and reversal source `{kind, sourceId}`. No reversal amount.
- `reverse`: command ID, expected source revision, review ID and approval hash.

The original `receipt-line-allocation-command.v1` build-ahead protocol remains
refused; it cannot be used to supply reversal money. Reads return the existing
strict source snapshot shape. Commands return `receipt-line-facts-result.v1`,
with the immutable review, SH-1 input/proposal and saved revision ID. SQL derives
all money from stored matched settled practice events and issued line snapshots;
SH-1 checks the result again before commit. The source command/authorization,
invoice, line, movement and exact original lock ancestry are independently bound.
Original-bill lines use the locked revision; post-lock catches use an actual
supplementary descendant and cannot also occur on the locked bill. A guessed
JSON source/approval brand or a quarantined storage row does not qualify.

This activates only the synthetic/practice neutral producer and its case
consumer. It does not approve a fee policy, clear fee holds, enable production,
compose an HTTP route or claim an independently verified DB run. See the 0335
migration note for writer-driven F5/F7 and adversarial CI proofs.

The case consumer additionally binds every catch to its own server-originated
catch variation and exact commercial revision in the case's `variation:` and
`revision:` references. The catch must use an actual supplementary binding to
this lock and its completed check. A generic invoice reference cannot borrow
another case's catch or turn an original-bill line into a catch.
