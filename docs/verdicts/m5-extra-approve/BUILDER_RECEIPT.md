# MON-5 M5-VARIATION — m5-extra-approve (RED)

Issued 29 October 2026; migration 0389; stacked on m5-signin/PR #423.
Synthetic data only. Router owns commit/push/PR, work-list handoff and Claude review.

Customers explicitly approve one current signed variation revision using the
existing sign-in session boundary. The same boundary used by CustomerAuthGuard
runs before the SQL writer, which re-resolves it inside the commercial transaction.
No sign-in/session/guard implementation changes; sign-in UI only adds the extras
navigation link. Next/Nest share exact input validation and generic refusals;
malformed JSON is covered by the existing parser filter and route registries.

0389 expands the existing variation_approval method constraint. Customer approvals
have no membership actor or evidence surrogate: they retain the authenticated
session and canonical command hash. The legacy member methods retain their
requirements. The private trigger refuses runtime customer inserts. The writer
locks current variation state, verifies job revision, priced revision, hash and
signed amount, and inserts the normal approval row. Every replay reauthenticates
and matches the stored session/command. Pricing, customer-session expiry,
revocation, wrong job and cross-tenant attempts are covered in CI tests.

The latest 0282 catch-claim trigger body is restated only to select the new
customer-session reviewer reference. Its claim revision 1 and exact positive
approved amount logic is unchanged. Normal final-account/invoice consumers keep
using variation_approval. Builder history now reports the actual method.
ENT-5 source/link behavior is untouched; no shared link mechanism was introduced.
No hidden source read, new commercial policy, fee, payment, provider or release.

Migration recovery: disable the two new customer route adapters and revoke customer
grants through 0387; retain immutable approvals/audit/claims. Correct defects with
a new forward migration. No deletion or historical migration edit is proposed.
LP-0 routine/privilege/trigger inventory and both populated upgrade expectation
lists are extended by exact identities and nullable columns only. No new tables,
RLS policies or direct identity/runtime table grants are added. Catalogue hashes
for new routines require PostgreSQL CI capture; no independent review is claimed.

Validation results are recorded below after final checks.

Local verification (installed Node 24.17.0 / TypeScript 5.8.3 / Vitest 4.1.12):

- Built config/core/storage/ai/db and API with installed `tsc -p <package>/tsconfig.json`;
  package resolution uses real build outputs. The pnpm shim did not advance to the
  requested command in this sandbox; stopped it and used repository binaries.
- Core, DB, API and web TypeScript checks pass. No new package was installed.
- In apps/api, `vitest run --maxWorkers=2 src/auth/customer-variation.test.ts
  src/auth/customer-signin.test.ts src/watchdog-registry.test.ts`: 164 tests pass.
  This includes real Next adapter imports, middleware admission/refusal, Nest
  parser refusals, origin/session isolation, builder impersonation refusals,
  exact signed inputs and revocation between initial resolve and SQL execution.
- In apps/api, `vitest run --maxWorkers=1 src/variation/variation.application.test.ts`:
  6 tests pass. In packages/core, `vitest run --maxWorkers=1 src/variation.test.ts`:
  6 tests pass. In packages/db, `vitest run --maxWorkers=1 test/lp-0-catalog.test.ts`:
  27 tests pass. Total final executed selected tests: 203.
- `node --import tsx src/generate-openapi.ts` regenerated the committed spec;
  subsequent `--check` passes, without listening on a port.
- Core-purity, money-arithmetic, commercial-boundary and PL/pgSQL CASE-in-IF
  lints pass. `git diff --check` passes. Existing computed-module warnings are
  reported by core-purity without refusal.
- Full `node tools/lint.mjs` stops at main-range lane validation: this checkout is
  still stacked on m5-signin commit 2d9b0f8d / PR #423, so origin/main's range
  contains 19 inherited foundation paths outside this slice. The task-only
  changed-path check using the existing `selectLane`, `trainPathViolations` and
  `migrationOrderViolations` helpers passes for all 30 paths. This is a bounded
  deterministic check, not a full lint pass. Keep the lane exact; router must
  merge #423 and catch up this branch before main-range CI validation.
- `vitest list --maxWorkers=1 test/customer-variation-approval.integration.test.ts
  test/customer-variation-upgrade.integration.test.ts` collects 19 PostgreSQL
  cases. `playwright test --list customer-extra-approval.spec.ts` collects the
  mobile-360 and desktop journeys. Collection is not test execution.

Database/browser execution, full production build and full current-main CI remain
for GitHub CI: the sandbox cannot start PostgreSQL or bind localhost. The real DB
cases cover current/stale exact revisions and amounts, signed omissions, concurrent
replay, changed commands, actual foreign jobs/tenant scope, runtime insert refusal,
revoked/expired sessions, expiry during source-lock contention, positive catch
claim revision 1 at the exact approved amount, and populated predecessor upgrade
plus migration replay. No fixture/mock pass is presented as database evidence.
The customer page has not been visually/browser verified locally.

The loop owner must arrange one independent Claude RED review against the exact
pushed head before merge. G1/D06 v2/D12 v3 and every real-data/provider/release gate
remain separate. No merge, push, release or acceptance was performed here.


31 October catch-up for DEMO-S step 4

Resolved both incoming merge conflicts without removing either side's expectations.
LP-0 recorded routines, RLS, policies and triggers are the exact union of branch
HEAD and current origin/main in byte order. Serious-B5 uses main's existing
catalogueAdditions helper and retains the two new routine identities and nullable
historical approval fields. Tenancy already matches main exactly. The sign-in
successor snapshot now also expects those two nullable fields; its own-migration
snapshot remains unchanged. No product behavior was added during this catch-up.

Renamed this branch's migration to 0410_customer_variation_approval.sql and replaced
only the full filename stem in references. No old stem occurs in MIGRATIONS.md or
this existing receipt. Historical bare-number references above remain historical.
Ran the existing renumber helper's syntax check and read-only planner. It proposed
0401, so its write mode was not used: this order reserves 0410 and forbids Git
writes, while the helper stages changes. The filesystem rename preserves SQL
SHA-256 5d8189bdfc889c92f8f9550b9755a4b904a1c4b3c63a20fc8aca1e870f3a7aa6.
All 164 migrations present on origin/main are byte-for-byte unchanged. The
recreated catch-claim function matches the latest main definition except for the
already-built customer-session reviewer reference.

Confirmed the existing POST /api/customer-portal/variation-approvals Next route,
POST /customer-portal/variation-approvals Nest route, module/export registration,
middleware admission and customer extras screen caller. The companion read route
is /api/customer-portal/variations/read. No missing route was invented.

Catch-up local checks, using installed repository binaries (no downloads):
- tsc -p packages/db/tsconfig.json --noEmit: pass.
- tsc -p apps/api/tsconfig.json --noEmit: pass.
- tsc -p apps/web/tsconfig.json --noEmit: pass.
- apps/api: vitest run --maxWorkers=2 src/auth/customer-variation.test.ts
  src/auth/customer-signin.test.ts src/watchdog-registry.test.ts: 164 tests pass.
- packages/db: vitest run --maxWorkers=1 test/lp-0-catalog.test.ts
  test/upgrade-proof-utils.test.ts: 30 tests pass.
- apps/api: node --import tsx src/generate-openapi.ts --check: pass.
- Core-purity, money-arithmetic, commercial-boundary and PL/pgSQL CASE-in-IF
  lints: pass (existing computed-import warnings from core-purity).
- Exact LP-0 union/byte-order, original SQL hash, latest-main routine body and
  unchanged-main-migration assertions: pass.
- Existing lanePathAllowed and migrationOrderViolations helpers against the
  current-main working-tree delta: pass, 31 changed paths.
- Standard agent-lane-boundary-lint: fails on the in-progress merge's inherited
  main paths and the unstaged old migration path. This is not a full lint pass;
  router must stage resolutions and rename, complete the merge, and run CI.
- Vitest list with one worker collects 44 cases across customer-signin,
  customer-variation-approval and customer-variation-upgrade integration files.
  Collection only; no PostgreSQL or browser test was executed.

The sandbox leaves Git read-only: resolved file contents are ready, but the index
still has two unmerged entries until the router stages them. Router owns staging,
commit, push and PR. PostgreSQL, migration replay, browser journeys, full CI and
an independent RED review of the resulting exact head remain required. The prior
RED PASS at e179592c was supplied in the order; it is not a review of this catch-up.
DEMO-S and ENT-11b end-to-end results have not been established by this local run.


31 October 05:06 order — CI repair 3: preserve fingerprinted approval rows

This entry supersedes the earlier description of widening variation_approval.
Rewrote only this PR's unmerged 0410 migration. It now keeps the exact original
ordered column list and never rewrites historical row values. Customer session
and command-hash provenance live in app.customer_variation_approval, a private
1:1 table keyed by tenant and approval ID with tenant-qualified approval/session
foreign keys, migration ownership, FORCE RLS, no runtime/identity/infrastructure
access, and UPDATE/DELETE/TRUNCATE refusal triggers.

The approval FK is deferred so the writer can insert provenance before inserting
the approval: its existing BEFORE guard and AFTER catch-claim trigger both need
the provenance immediately. Both records, catch claim, state and audit commit in
the same transaction. Orphan provenance cannot commit. Replay still resolves the
current session and compares its stored exact command. The approval guard checks
that the side-table session belongs to the approval's job. No route or public
method changed; the customer method remains customer_authenticated.

Keeping actor_membership_id NOT NULL is incompatible with a customer actor on the
existing approval row: assigning a builder membership would misstate who approved.
The smallest compatible choice retains DROP NOT NULL, with a CHECK requiring a
nonnull member for legacy methods and a NULL member/evidence for the customer
method. This metadata change preserves every old row and its fingerprint; customer
inserts additionally require the migration-owned session/provenance guard.

LP-0 retains all earlier entries and adds the exact side-table policy and immutable
triggers, plus the writer's side-table write metadata. A private same-schema-owner
table derives no new owner/grant fact or non-owner RLS record; tenancy tests assert
its forced RLS and ownership directly. Tenancy, serious-B5, customer-signin and
contractor upgrade expectations add only the new private table (and its index and
policy where catalogued), and stop inventing new columns on historical approvals.
The upgrade test now compares pre/post approval column order and whole-row JSON
fingerprints. Integration cases add orphan-commit refusal, private access, foreign
tenant RLS, duplicate-side-row refusal and immutable provenance checks; the raw
runtime approval INSERT still asserts exact 42501/CUSTOMER_REFUSED.

The browser seed retains repair 1's parties-before-live order. It explicitly binds
the fictional job's commercial track using the existing customer-invoice fixture
pattern, because the legacy AFTER INSERT track trigger does not run on its later
status UPDATE. Its variation copies that bound track and uses builder_logged origin,
matching main's variation fixtures. Browser assertions remain unchanged.

Local validation (installed binaries, no downloads):
- DB and web tsc --noEmit: pass.
- packages/db: vitest run --maxWorkers=2 test/lp-0-catalog.test.ts:
  27 tests pass.
- apps/api: vitest run --maxWorkers=1 --testTimeout=15000
  src/auth/customer-variation.test.ts: 13 tests pass. The initial default-timeout
  run failed on a 5-second dynamic-import timeout, then a shared-mock call count;
  rerunning with a larger CLI timeout passed without any test/code/config change.
- PL/pgSQL CASE-in-IF, money-arithmetic, commercial-boundary lints and standard
  agent-lane-boundary-lint: pass. git diff --check: pass.
- All 166 migrations on origin/main, the fingerprint guard, evidence-pack source
  consumer and approval route are byte-for-byte unchanged. 0410 is not on main.
- LP-0 prior entries preserved exactly; recorded lists remain in byte order.
- Vitest list collects 45 cases in the three customer sign-in/approval/upgrade
  integration files. Playwright list collects the two phone/desktop approval
  cases. Collection is not execution.

No PostgreSQL or browser journey was run in this sandbox. Coordinator must run the
WHOLE PostgreSQL suite, including MIG-ORDER-2, recovery-message-upgrade and
recovery-pursuit-terms-upgrade, plus required CI/browser checks and independent RED
review of this rewritten migration before merge. No previous RED PASS is claimed
for this repair. No push, merge, provider, live-money or release action performed.
