M4-9 part 2 (RED, money), built on m4-9-s-posting. Reference: 0429 on
m4-9-prod, source-inspected only; that branch is not merged here.

0473 extends the latest 0393 command and 0392 deferred checks. It shares their
source reconstruction in one private helper, adds a per-job posting lock and
an insert guard, and enables exact approved synthetic negative rederivations.
Negative authorization amounts use absolute pence; the signed delta and links
are bound by the statement hash. Multiple original accruals are compensated
with separate immutable, balanced journal pairs, each bounded by its original
outstanding amount. No production policy, provider, collection or refund
execution is enabled. The direct production routine always refuses.

Forward fix only: preserve every existing row. Do not reverse deployed ledger
history or reapply an old migration body. Disabling a future rollout should close
the command entrypoint through a new migration while preserving read/replay and
immutable journals. The upgrade test retains populated predecessor facts and
checks idempotent application; PostgreSQL execution belongs to GitHub CI.

Local validation (30 October 2026):
- Installed core Vitest runner, maxWorkers=2: success-fee-catch-posting.test.ts
  and success-fee-posting.test.ts, 48 tests passed.
- Installed db Vitest runner, maxWorkers=2: success-fee-repository.test.ts and
  migrate-discovery.test.ts, 12 tests passed after building the core dependency.
- Installed TypeScript: core build/typecheck, db typecheck and storage build passed.
- Core purity, money arithmetic, commercial boundary, PL/pgSQL CASE-in-IF lint,
  privilege JSON parsing, exact working-diff lane manifest and git diff --check passed.
- Vitest list collected the eight new PostgreSQL safety/upgrade tests with no hooks
  executed, after building storage. This is discovery evidence, not DB execution.
- Full repository lint reaches the lane gate and refuses the inherited unmerged
  stack. HEAD equals the m4-9-s-posting base; self-comparison is correctly refused.
  Keep the lane paths scoped to this piece; rerun CI after base merge/router commit.
- The pnpm launcher attempted registry version/signature verification and failed
  under restricted network access. Installed local binaries were used instead;
  no package configuration or verification checks were changed.

Still required: GitHub PostgreSQL/migration suites, required CI against current
main, and independent Claude RED review against the final head. No database or
browser server was started locally; no Git mutation, push or PR was performed.


30 October 2026 follow-up (RED, m4-9-prod-sb): compensation linkage

The review now constructs the oldest-first cancellation split before hashing it.
`compensatesDerivationId` names the first cancelled derivation, and `compensations`
binds every original journal, its actual derivation and exact positive pence.
Posting consumes that same split; the deferred derivation check independently
rebuilds the list from the cancelled journals. This removes the duplicate split
calculation and prevents a latest-positive label from misdescribing older credits.
Only branch-own 0473 is edited; it is absent from the local main tree.

The fixture can stage two genuine catch allocations to produce two 4,000p accruals.
The new PostgreSQL case reverses their 8,000p total, checks both links, refuses a
coherently rehashed mismatched saved link, checks replay and zero rederivation,
and preserves both original journals. Core tests reject missing, duplicate,
mismatched and inexact splits. LP-0 and its downstream recorded input update only
the two named routine staticCalls records; all other records and the exact
SERIOUS-B5 union remain unchanged.

Follow-up local checks use installed binaries only (no downloads):
- Core build and db typecheck passed.
- Core Vitest: src/success-fee-catch-posting.test.ts and
  src/success-fee-posting.test.ts, maxWorkers=2: 49 passed.
- DB Vitest: test/lp-0-catalog.test.ts, maxWorkers=2: 27 passed.
- DB Vitest: src/success-fee-repository.test.ts and src/migrate-discovery.test.ts,
  maxWorkers=2: 12 passed.
- PostgreSQL Vitest list discovered all 9 safety/upgrade cases without running hooks.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL lint passed.
- Both named staticCalls records match the source scanner in both inventories;
  every other privilege union fact is unchanged from HEAD.
- git diff --check passed. The lane retains exactly the piece's cumulative paths
  relative to codex/sandbox/m4-9-s-posting (its own lane file is implicit).

Database/migration/browser execution remains for GitHub CI; independent Claude RED
review and required CI on the final head remain pending. No real customer data,
live money, provider action, release, Git mutation or merge was performed.

31 October 2026 NOPR catch-up onto cached main 87b5dd4e:

Resolved all six source conflicts. Kept main's 0406 private source-lock helper
in the branch-own 0473 replacement writer, retained both fixture protocols
(the new two-catch option is sixth), and kept main's FK-valid pending-source
attack test. Shared upgrade expectations retain main's lock helper and this
piece's compensation indexes/routines. LP-0 inventories are the exact semantic
union without duplicate entries, routine identities or trigger records. Main's
migrations and lp-downstream-effects-v1.md are unchanged. No migration renumbering.

Focused installed-runner checks (maxWorkers=2):
- Core success-fee-catch-posting, success-fee-posting and success-fee-posting-fixtures:
  81 tests passed.
- DB lp-0-catalog, success-fee-repository and migrate-discovery: 39 tests passed.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL lint passed.
- Exact lane paths, unique inventory records and git diff --check passed.

Core TypeScript build and DB TypeScript no-emit check were started but stalled
without diagnostics under concurrent Mac load at handoff. Vitest list collected all nine PostgreSQL safety/upgrade cases without running
database hooks; collection is not PostgreSQL execution.
GitHub CI must run full typecheck and PostgreSQL/migration suites, followed by
independent Claude RED review at the final head. READY for the router to stage and
commit the resolved files; the Git index remains unmerged because this sandbox
prohibits Git writes. No PR is opened in this NOPR run.
