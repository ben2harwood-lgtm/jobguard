# 0258 receipt-line source bridge — held build-ahead storage

Round r1 actual base: `acaad61e89401bf3f96c6c5e39b8d7c68d2e602c`
(dispatcher lane assignment after `43412768`, accepted C0 `e55f1c69`).
The latest preceding migration actually present is
`0198_contractor_entitlement_authority.sql`. 0210 belongs to unrelated MON1-A;
it is not a prerequisite. Additive discovery installs 0258 without a runner edit.
Renumbered 0211 -> 0241 on 28 Oct catch-up to main (latest there 0239; 0240 is
PR 335). Renumbered 0241 -> 0258 on the second catch-up (main then held 0243; 0244-0257 claimed). PostgreSQL NOT RUN here.

Five empty append-only tenant/job-qualified tables have FORCE RLS and no runtime
SELECT/INSERT/UPDATE/DELETE/TRUNCATE. Both runtime routines authenticate their
existing synthetic owner/session/job boundary and then raise
`RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED`. The source-design/authority hold remains;
no HTTP/UI, command success, allocation, case landing, fee or audit effect is enabled.

R1 storage defenses (independent of the core parser):

- UUID columns canonicalize IDs to lower-case; the tenant/line UUID primary key
  refuses exact and case-variant duplicates. Tenant/job/source/invoice and
  tenant/job/revision/payment composite FKs bind distributions.
- An AFTER INSERT trigger requires SERIALIZABLE isolation. Exact fraction sums
  are compared by cross-products, reduced by integer gcd, never rounded. Positive
  gross per payment cannot exceed customer_payment.amount_pence; positive gross
  per invoice line cannot exceed its immutable gross. Ratio and original-line
  identity/amounts must match the bound invoiced line.
- Reversals must reference a positive original in the same tenant/job/payment/
  invoice/line. Their cumulative magnitude cannot exceed that original. Reversals
  do not reopen historical positive allocation capacity automatically.
- Stored source, review and result projections cannot advertise saved_distribution
  for any receipt, including pending, unmatched, duplicate_held or reversed cash.
  A claimed settled JSON state cannot substitute for the held source authority.
  The quarantine refuses all saved-distribution projections until a reviewed
  forward migration; runtime reads still refuse altogether.

The SERIALIZABLE requirement is a quarantined storage precondition, not a source
lock-order handoff or actor grant. PostgreSQL SSI must abort concurrent write skew;
the written race test requires exactly one successful 60p commit against 100p.
A future writer must handle serialization failures and unknown outcomes and still
obtain the accepted source serialization/authorization contract. These triggers
are invoker routines with no runtime grants; they do not bypass RLS. PostgreSQL
numeric range overflow rejects a write rather than approximating wide fractions.

Integration tests explicitly seed synthetic predecessor parents with replication
triggers disabled, then restore origin mode before every tested insert. They are
storage tests, not a genuine receipt/source/approval journey. Upgrade proof applies
only 0258 over populated actual predecessors, compares named rows/types/PKs, uses
mutation/retype controls, then runs successors and reruns. No backfill is needed.
All database and browser checks remain NOT RUN in this sandbox.

Forward fix: retain these defenses while adding a reviewed source contract,
authorization, complete read validation, exact Decisions, review consumption and
atomic audit. Never enable writes simply by removing the hold. Application
rollback leaves the additive storage intact. Any SQL removal requires proving the
five tables empty and a migration-owner migration; never drop historical money.
Catalogue additions and exact-head CI/review/acceptance remain dispatcher-owned.
