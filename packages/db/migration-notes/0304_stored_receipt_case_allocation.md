# M4-8-S part 2 — stored receipt-line consumer (RED)

0304 adds a synthetic-only SQL writer and repository for reviewing and approving
allocation of immutable 0258 receipt lines to a recovery case and work item.
Commands carry IDs and expected case revisions; neither amounts nor an artifact
are accepted. Exact signed gross/net fractions, rule, source, movement, lock,
case revision and reference-policy version are reconstructed in SQL. Tax is the
exact difference between gross and net; no deemed amount is rounded. Approval
creates an approved Decision resolution and an authorization bound by the hash
of the exact rational artifact, including GBP. The integer authorization amount
and currency columns remain NULL together; the exact fractions and their
currency are bound in the content hash rather than rounded into integer pence. It is not a fee authorization or entitlement.

The source projection binds the movement to both tenant and job (#346), the
actual and invoiced line to the revision behind the exact lock (#368), and the
invoice binding to its completed lock check. Exact cumulative historical
positive net/gross cannot exceed the line; gross cannot exceed the matched
receipt (#356). A permanent line/work/case binding prevents a second work item
claiming the line. Source facts are consumed once. Receipt, case, command and
line locks precede audit; replay reauthenticates and returns the original result.
Same-ID/different-payload replay fails. Commit/transport ambiguity is left as an
error; retry uses the original command ID. There are no network actions.

Reversals consume stored negative bridge lines linked to their original saved
allocation. A stored payment reversal or invoice credit is required. Reversal
magnitudes are bounded by the original allocation; a credit's total consumption
is also bounded across lines. Original rows and bindings remain immutable;
reversals do not silently replenish historical positive capacity. The legacy
case writer is guarded against reusing a receipt consumed by this path, under
its existing receipt lock. New tables have FORCE RLS, owner-only access and
append-only guards. The sole new runtime capability is the checked command.

The existing 0258 source producer/read routines remain held. This change consumes
stored bridge rows; it does not create or clear source facts, enable the held
producer, change the legacy money projections, issue fees, or expose a new HTTP
or UI route. The DB fixtures explicitly seed made-up predecessor/source rows with
replication triggers disabled, restore origin mode, then execute real runtime
commands. Saved F5/F7 are consumer persistence proofs, not a complete upstream
receipt/lock/invoice journey. F5 uses SH-1's kernel with £29,280 outstanding after
the earlier £12,000 deposit and saves £400 exact catch net (£40 fee illustration).
F7 saves £800 exact (£80 illustration) on the £960 supplementary invoice with
the £40,320 main invoice still unpaid. No fee is posted by either test.

Verification in this sandbox:

- Installed Vitest: 11 boundary tests passed, two workers, one named file;
  26 LP-0 comparator tests passed in a separate one-file run.
- Installed TypeScript: database package typecheck passed; core/storage dependencies built
  to resolve test imports, without downloading packages.
- Vitest collection: 14 new PostgreSQL/upgrade tests discovered; no hooks or DB
  suites executed. They cover F5/F7, all three RED conditions, concurrent alternate
  assignments, replay, refund/credit preservation, deposit exclusion, SQL input
  rejection, private-table denial, approval/session refusal and atomic rollback on audit failure.
- Money arithmetic, commercial boundary and core purity checks passed.
- Additional strict typecheck of integration imports found the existing
  `test/job-work-state-fixtures.ts:45` string/undefined diagnostic; no change to
  that shared helper is included. This is separate from the passing package check.
- Lane JSON/schema and all 10 working-tree paths match exactly. The full lane
  range check refuses self-comparison before the router creates a commit.
- PostgreSQL, migrations and browser execution are CI-only under this sandbox.
  No local PostgreSQL, localhost binding, git writes, providers or releases.

LP-0 records the three routines and sole runtime grant. SERIOUS-B5 records only
0304's named tables, indexes, policies and signatures, preserving predecessor
comparisons. The dedicated populated-predecessor upgrade proof checks rows,
types, keys, mutation controls and replay. No backfill. Application rollback can
stop calling the new command while retaining all history. Forward fixes use a
new migration; no history is dropped. Exact-head RED review and green CI remain
required before merge.
