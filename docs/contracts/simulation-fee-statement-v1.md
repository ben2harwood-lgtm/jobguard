# Simulation fee statements — M4-10-S

Synthetic only, RED (money). Migration 0490 adds immutable numbered success-fee
statements in the `app.platform_*` document namespace. Subscription statements
remain separate in `app.platform_statement`; their period constraints, amounts,
0374 issuance routine and collection path are unchanged. No production policy,
VAT decision, provider or collection authority is introduced.

The existing `simulation-fee-statement-document.v1` representation remains
compatible. The persisted/download contract is
`issued-simulation-fee-statement.v1`: it adds the server-selected job,
`success_fee.synthetic.v1` namespace and an immutable source snapshot.
`DEMO-FEE-000001` numbering is tenant-wide, serialized across that tenant's jobs.
The number, exact rational Q, policy v3, cumulative principal, signed documentary
delta, posting history, attribution/allocation/approval references and original
statement identity/hash are included in the document's SHA-256.

Sources come from approved M4-9-S derivations and the existing SV-6 current-source
validator. The statement does not allocate receipts or qualify new positive
principal. It cannot expand the latest posted entitlement. The snapshot also binds immutable payment-reversal, customer-adjustment and
evidence-invalidation IDs, and the latest stored assessment identity. Lost eligibility is
recorded as zero qualifying principal. A reversal can reduce the documentary
balance before M4-9-S's negative journal execution is available; it does not
pretend to have posted that compensation. Original journal history is preserved.
Settlement history explicitly says `integration_unavailable`, dependency
`M4-12-S`; customer receipts are never presented as platform fee settlements.

`simulation-fee-statement-command.v1` accepts only:

- `issue`: version, commandId, action;
- `approve`: those fields plus statementId and the exact statementHash.

No input accepts tenant, actor, amounts, sources, policy or provider facts.
Authentication, current owner membership, synthetic database, job/session, track
and final-account lock are checked before source access or replay. Before lock,
the read response is empty and independent of hidden data. New issue/approval
commands use the existing posting source fence and lock order, plus a tenant
number/replay lock. The receipt and audit event commit atomically with the
statement or exact Decision/resolution/authorization. An exact command replay
returns its original result; changed payloads conflict. Different issue IDs for
the same snapshot return one document. Original documents cannot be updated,
deleted or truncated, and runtime/infrastructure/shadow roles have no table
access. All references are tenant-qualified; the original link also binds job.

Approval is bound to the saved document hash, recipient statement, GBP amount
magnitude, direction, posting revision, policy and session/membership expiry.
Negative documentary deltas use `success_fee.statement_correction_approve` on
both the Decision and authorization; nonnegative deltas use
`success_fee.statement_approve`. This preserves the shared nonnegative amount
invariant while recording direction explicitly. Neither action authorizes
collection, and a correction approval cannot substitute for a positive approval.

After expiry, a fresh `approve` command can create a new Decision, approved
resolution and authorization for the same immutable statement. The original
Decision/authorization remain unchanged. Every new approval command rechecks
current sources and requires the latest document/hash. A still-current approval
is reused; expired or revoked authorizations are never reused. Command replay
returns its historical result, including an expired authorization ID, without
renewing it. Execution must still check current expiry and exact action identity.
Renewals append the normal approval audit event atomically with their new records. Approval of an old hash,
old document or changed source snapshot fails. This is a statement approval
(`success_fee.statement_approve`), never a collection authorization. M4-12-S
must define/check its own exact collection authority and current eligibility.

GET `/jobs/:id/success-fees/statements` (Next prefix `/api`) reads saved records.
POST on that path issues or approves. GET `.../statements/:statementId` returns
versioned JSON bytes and an attachment filename. The repository verifies the
saved digest against the shared canonical encoder before returning a download.
The Next download also supplies `X-Content-SHA256`. Foreign/missing document IDs
within an authorized job return no document (404 on HTTP). No GET, renderer,
download, statement issue or statement approval posts or collects money.

Downloads preserve all inputs and the original number, with the digest supplied
separately to avoid a self-referential hash. Required labels are unchanged:

- Simulation statement — proposed policy, principal only; not a tax invoice or real amount due
- VAT not calculated
- Practice sandbox — synthetic data; nothing is sent or charged

The UI shows cumulative fee principal separately from the document delta. A
£282 original followed by a £32 balance has a −£250 linked documentary correction.
It offers source/approval drill-down, historical postings and a saved download.
There are no base, cap, credit or subscription-offset lines. New positive
non-catch fee qualification, negative journal execution and fee settlement
remain with their own tasks; this statement path does not open those gates.
