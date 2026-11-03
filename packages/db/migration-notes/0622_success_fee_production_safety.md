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

2 November 2026 NOPR catch-up (supersedes the earlier catch-up implementation notes):

Renamed the branch-only SQL and note by their complete filename stem to
0622_success_fee_production_safety; test and lane lookups use that filename.
No recorded hash or bare numeric string was replaced. The supplied origin/main
is e3e81167 (latest available migration 0517), not a tree containing 0585, 0586 or
0589. No fetch was performed. The router must reconcile the claimed 0590 order
and those other branches before applying/merging this migration.

The replacement writer starts from main's latest 0515 body. It keeps withheld
sources, invalid-proof-only reductions, source fencing, durable replay and main's
compensationLinks. The branch's catch reductions, per-job lock, exact derivation
attribution and insert bounds are retained. Both compensation representations
must agree on journals and amounts. Catch-only splits retain the branch's oldest
first order; withheld-payment splits retain main's newest first order.

Main already supplies signed delta constraints and split journal indexes; 0590
therefore does not drop/recreate them. Its four exact added routines and two
triggers are declared in the new proof's lp0/upgrade sections. Tenancy is explicitly
empty because no relation or RLS posture changes. The protected LP-0 baseline,
SERIOUS-B5 expectations and frozen downstream recorded input are restored to main;
all additions live in the proof. Main migrations, demo journey files and shared
legacy/tenancy lists are unchanged.

Complexity: an additional private deferred rebuild supplements main's existing
checks, preserving their routine identities and historical catalogue contracts.
It independently reconstructs both source kinds. This intentionally retains a
second reconstruction path; a unit check binds it to the writer's source path.
The two compensation formats preserve both branches' existing interfaces.
Fixture options keep main's collection boolean distinct from two-catch/staged
branch fixtures. Existing test assertions are preserved; only fixture invocation
arguments and full migration filenames change.

Actual local validation, installed Vitest 4.1.12, --maxWorkers=1 per run and no
more than three named files per run:
- Core: success-fee-catch-posting, success-fee-posting, success-fee-posting-fixtures:
  83 passed (includes both branches' assertions and a dual-format mismatch test).
- DB units: migration-proof-loader, success-fee-recovery-compensation-catalog,
  success-fee-repository: 37 passed.
- DB units: lp-0-catalog and migrate-discovery: 32 passed.
- DB source/proof consistency: success-fee-production-safety-catalog: 2 passed.
  Total: 154 unit tests across nine files.
- Installed tsc --noEmit: core, db and API passed.
- Vitest list collected nine production safety/upgrade cases and thirteen main
  collection cases; no PostgreSQL hooks ran. Collection is not execution.
- The complete writer/rebuild source paths compare equal after parameter renaming;
  protected files compare byte-for-byte with main; no main migration changed;
  all five conflicted files are resolved in working files; git diff --check
  passed. The lane lists the exact cumulative piece paths, excluding itself.

The pnpm launcher could not verify the pinned release through the restricted
registry route. Installed repository binaries were used, with no package or check
configuration change. No PostgreSQL/browser run, git write, commit, fetch, push,
PR, provider call or production enablement was performed.

READY for router staging/commit. The git index still has unmerged entries because
this sandbox prohibits git writes. Required PostgreSQL/migration suites, CI on
current main, reconciliation with the absent 0585/0586/0589 trees and one independent
Claude RED review against the final head remain pending; production gates stay closed.


3 November 2026 M4-23 NOPR catch-up:

Router-reserved filename stems are now 0621_dark_ais and
0622_success_fee_production_safety. The writer preserves current main's
0537 reversal-netted caps, invalid-proof zero qualification and source-hash
binding. Invalid proof still permits strictly negative compensation only;
the independent input gather and deferred guard enforce the same rule.
Inherited catch compensation splitting, integrity guards and synthetic-only
production refusal remain. Existing audit helpers use main's LP-4 sealer.
No migration present on main was edited.

The four AIS tables are covered explicitly by the 0579 proof's tenancy,
upgrade and privilege entries; the shared exact table tests consume those
proof entries through applyTenancyProofs. PostgreSQL execution and an
independent RED review remain required before landing.
