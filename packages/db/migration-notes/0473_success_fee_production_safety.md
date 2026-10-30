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
