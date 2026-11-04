# 0573 — ENT-3 immutable supervisor questions (RED)

Synthetic only. Creates an initially empty tenant-owned table, forced RLS,
immutable UPDATE/DELETE trigger, a checked record/read routine and one operational
command registry entry. Runtime receives EXECUTE only, with no table or receipt
write grant. LP-5 completion derives its answer from the new row in this transaction
and seals command.succeeded through LP-4. The active-member lifecycle rule is
supplemented by the checked routine's operative assignment and supervisor scope
checks; it grants no new commercial authority. Actor/tenant still rely on the
existing authenticated application context; compromised database credentials are
not proved safe by this migration.

Locks: shared tenant administration, approval-chain job advisory, current-order
pointer SHARE. Order revisions are immutable; the locked pointer cannot move during
the check/write. A stale expected revision refuses before insertion. Retries return
the immutable receipt before checking the historical revision, after current access
and cancellation checks. A changed body or actor conflicts. No extra, variation,
commercial price, fee, notification or sending is created. No close/resolve workflow.

The only recreated routine starts with main's latest lp5_command_result body
(0541 plus the 0566 managed-recovery adapter), adding a table-derived result case. No old migration changes.
The proof contains source-authored explicit LP-0, upgrade and tenancy expectations;
it was never generated from a database. No existing rows are backfilled. The claimed
number is renumbered by the router at landing.

Forward fix: preserve all questions and receipts; add a later migration correcting
the routine or policy. Do not drop history. Roll back application use if needed.
CI must prove fresh/upgrade catalogues, grants/RLS, immutable history, query isolation,
strict raw payload rejection, replay/conflict, stale order and cancelled/unassigned
refusals, LP-5 completion/audit binding and the existing DB regression suites. These
PostgreSQL checks cannot run in the builder sandbox.
